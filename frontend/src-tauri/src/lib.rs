use std::fmt;
use std::fs;
use std::io;
use std::path::PathBuf;
use std::process::Command as StdCommand;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
#[cfg(unix)]
use std::os::unix::process::CommandExt;

use tauri::{Manager, RunEvent, WindowEvent};
mod updater;

#[derive(Debug)]
struct AppError(String);

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for AppError {}

macro_rules! app_err {
    ($($arg:tt)*) => { AppError(format!($($arg)*)) };
}

struct BackendProcess {
    child: Mutex<Option<std::process::Child>>,
    data_dir: PathBuf,
    executable_path: PathBuf,
    backend_dir: PathBuf,
    sony_bridge: Option<PathBuf>,
    app_version: String,
    debug_backend: bool,
    api_token: String,
}

fn new_api_token() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes)
        .map_err(|error| format!("Gagal membuat sesi aplikasi: {}", error))?;
    Ok(bytes.iter().map(|byte| format!("{:02x}", byte)).collect())
}

#[tauri::command]
fn backend_api_token(state: tauri::State<BackendProcess>) -> String {
    state.api_token.clone()
}

fn merge_dir_missing(source: &PathBuf, destination: &PathBuf) -> io::Result<()> {
    if !source.exists() {
        return Ok(());
    }

    fs::create_dir_all(destination)?;

    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());

        if source_path.is_dir() {
            merge_dir_missing(&source_path, &destination_path)?;
        } else if !destination_path.exists() {
            fs::copy(&source_path, &destination_path)?;
        }
    }

    Ok(())
}

fn write_update_state(data_dir: &PathBuf, version: &str) -> io::Result<()> {
    let state_path = data_dir.join("database/app_update_state.json");
    let temporary_path = data_dir.join("database/app_update_state.json.tmp");
    let contents = serde_json::to_string_pretty(&serde_json::json!({
        "last_successful_version": version,
        "data_strategy": "merge-missing-v1"
    }))
    .map_err(io::Error::other)?;

    fs::write(&temporary_path, format!("{}\n", contents))?;

    if state_path.exists() {
        fs::remove_file(&state_path)?;
    }

    fs::rename(temporary_path, state_path)
}

fn secure_backend_auth_data(data_dir: &PathBuf) -> io::Result<()> {
    let auth_dir = data_dir.join("auth");
    fs::create_dir_all(&auth_dir)?;

    #[cfg(unix)]
    {
        fs::set_permissions(&auth_dir, fs::Permissions::from_mode(0o700))?;

        for filename in ["client_secrets.json", "token.json", "token.pickle"] {
            let path = auth_dir.join(filename);
            if path.exists() {
                fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
            }
        }
    }

    Ok(())
}

fn prepare_backend_data(app: &tauri::App) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Gagal membaca folder data aplikasi: {}", error))?
        .join("backend");

    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| format!("Gagal membaca resource aplikasi: {}", error))?;

    let seed_dir = resource_dir.join("backend-seed");
    merge_dir_missing(&seed_dir, &data_dir).map_err(|error| {
        format!(
            "Gagal menggabungkan data update tanpa menimpa data pengguna: {}",
            error
        )
    })?;

    // Create necessary subdirs
    for dir in [
        "auth",
        "database",
        "manual_uploads",
        "output",
        "photobooth_strips",
        "processed",
        "watermark",
    ] {
        fs::create_dir_all(data_dir.join(dir))
            .map_err(|error| format!("Gagal membuat folder backend {}: {}", dir, error))?;
    }

    write_update_state(&data_dir, &app.package_info().version.to_string())
        .map_err(|error| format!("Gagal mencatat status update aplikasi: {}", error))?;
    secure_backend_auth_data(&data_dir)
        .map_err(|error| format!("Gagal mengamankan data autentikasi: {}", error))?;

    clear_backend_lock(&data_dir);

    Ok(data_dir)
}

fn bundled_backend_path(app: &tauri::App) -> Result<PathBuf, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| format!("Gagal membaca resource aplikasi: {}", error))?;

    #[cfg(unix)]
    let backend_binary = resource_dir.join("backend-bin/event-booth-backend");
    #[cfg(windows)]
    let backend_binary = resource_dir.join("backend-bin/event-booth-backend.exe");

    if !backend_binary.exists() {
        return Err(format!(
            "Backend binary tidak ditemukan di bundle: {}",
            backend_binary.display()
        ));
    }

    Ok(backend_binary)
}

fn stop_backend(child: &mut std::process::Child) {
    #[cfg(unix)]
    {
        let pid = child.id();
        let pg = format!("-{}", pid);

        let _ = StdCommand::new("kill").arg("-TERM").arg(&pg).status();

        for _ in 0..30 {
            match child.try_wait() {
                Ok(Some(_)) => return,
                Ok(None) => thread::sleep(Duration::from_millis(100)),
                Err(_) => return,
            }
        }

        let _ = StdCommand::new("kill").arg("-KILL").arg(&pg).status();
    }

    #[cfg(windows)]
    {
        let _ = StdCommand::new("taskkill")
            .arg("/F")
            .arg("/T")
            .arg("/PID")
            .arg(child.id().to_string())
            .status();

        for _ in 0..30 {
            match child.try_wait() {
                Ok(Some(_)) => return,
                Ok(None) => thread::sleep(Duration::from_millis(100)),
                Err(_) => return,
            }
        }
    }

    let _ = child.kill();
    let _ = child.wait();
}

fn stop_managed_backend(state: tauri::State<BackendProcess>) {
    if let Ok(mut backend) = state.child.lock() {
        if let Some(mut child) = backend.take() {
            stop_backend(&mut child);
            println!("✅ Backend Killed");
        }
    }

    let lock_path = state.data_dir.join("database/backend.lock");
    let _ = fs::remove_file(&lock_path);
}

fn clear_backend_lock(data_dir: &PathBuf) {
    // Hapus backend.lock dari run sebelumnya (mencegah false positive PID recycle)
    let lock_path = data_dir.join("database/backend.lock");
    let _ = fs::remove_file(&lock_path);
}

fn configure_backend_process(command: &mut StdCommand) {
    #[cfg(unix)]
    command.process_group(0);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW);
        // Supply valid standard handles even when the GUI has no console.
        command
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
    }
}

fn spawn_backend(state: &BackendProcess) -> Result<std::process::Child, String> {
    let mut command = StdCommand::new(&state.executable_path);
    if state.debug_backend {
        command.arg("main.py");
    }

    command
        .current_dir(&state.backend_dir)
        .env("EVENT_BOOTH_BACKEND_DATA_DIR", &state.data_dir)
        .env("EVENT_BOOTH_APP_VERSION", &state.app_version)
        .env("EVENT_BOOTH_API_TOKEN", &state.api_token)
        .env("PHOTOBOOTH_CAMERA_INDEX", "auto");

    if let Some(sony_bridge) = &state.sony_bridge {
        if sony_bridge.exists() {
            command.env("EVENT_BOOTH_SONY_CRSDK_BRIDGE", sony_bridge);
        }
    }

    configure_backend_process(&mut command);

    command
        .spawn()
        .map_err(|error| format!("Gagal menjalankan backend: {}", error))
}

#[tauri::command]
fn start_backend(app: tauri::AppHandle, state: tauri::State<BackendProcess>) -> Result<(), String> {
    if app
        .state::<updater::UpdateState>()
        .installing
        .load(std::sync::atomic::Ordering::SeqCst)
    {
        return Err("Aplikasi sedang memasang update".into());
    }
    let mut backend = state
        .child
        .lock()
        .map_err(|_| "Gagal mengunci state backend".to_string())?;

    if let Some(child) = backend.as_mut() {
        match child.try_wait() {
            Ok(Some(_)) => {
                *backend = None;
            }
            Ok(None) => {
                return Ok(());
            }
            Err(error) => {
                return Err(format!("Gagal memeriksa proses backend: {}", error));
            }
        }
    }

    clear_backend_lock(&state.data_dir);
    let child = spawn_backend(&state)?;
    *backend = Some(child);

    println!("✅ Backend Started");
    Ok(())
}

#[tauri::command]
fn pick_folder_path() -> Result<String, String> {
    #[cfg(unix)]
    {
        pick_folder_path_unix()
    }
    #[cfg(windows)]
    {
        pick_folder_path_windows()
    }
}

#[cfg(unix)]
fn pick_folder_path_unix() -> Result<String, String> {
    let output = StdCommand::new("osascript")
        .arg("-e")
        .arg("POSIX path of (choose folder with prompt \"Pilih folder untuk Auto Upload\")")
        .output()
        .map_err(|error| format!("Gagal membuka dialog folder: {}", error))?;

    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();

        if message.contains("User canceled") {
            return Err("Pemilihan folder dibatalkan".to_string());
        }

        return Err(if message.is_empty() {
            "Gagal memilih folder".to_string()
        } else {
            message
        });
    }

    let folder_path = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if folder_path.is_empty() {
        return Err("Folder path kosong".to_string());
    }

    Ok(folder_path)
}

#[cfg(windows)]
fn pick_folder_path_windows() -> Result<String, String> {
    let ps_script = r#"
Add-Type -AssemblyName System.Windows.Forms
$folder = New-Object System.Windows.Forms.FolderBrowserDialog
$folder.Description = "Pilih folder untuk Auto Upload"
$folder.ShowNewFolderButton = $false
if ($folder.ShowDialog() -eq "OK") {
    Write-Output $folder.SelectedPath
} else {
    Write-Output "CANCELED"
}
"#;
    let output = StdCommand::new("powershell")
        .arg("-NoProfile")
        .arg("-NonInteractive")
        .arg("-Command")
        .arg(ps_script)
        .output()
        .map_err(|error| format!("Gagal membuka dialog folder: {}", error))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if stdout.is_empty() || stdout == "CANCELED" {
        return Err("Pemilihan folder dibatalkan".to_string());
    }

    Ok(stdout)
}

fn dev_backend_paths() -> Result<(PathBuf, PathBuf, PathBuf), String> {
    let project_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|path| path.parent())
        .map(PathBuf::from)
        .ok_or_else(|| "Gagal membaca folder proyek".to_string())?;

    let backend_dir = project_root.join("backend");

    #[cfg(unix)]
    let python_path = backend_dir.join(".venv/bin/python");
    #[cfg(windows)]
    let python_path = backend_dir.join(".venv/Scripts/python.exe");

    Ok((python_path, backend_dir.clone(), backend_dir))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(updater::UpdateState::default())
        .setup(|app| {
            let (python_path, backend_dir, data_dir) = if cfg!(debug_assertions) {
                dev_backend_paths().map_err(|e| app_err!("Dev path: {}", e))?
            } else {
                let data_dir = prepare_backend_data(app)?;
                let backend_binary = bundled_backend_path(app)?;
                let backend_dir = data_dir.clone();
                (backend_binary, backend_dir, data_dir)
            };

            let sony_bridge = if cfg!(debug_assertions) {
                backend_dir.join("camera/native/sony/build/event-booth-sony-crsdk-bridge")
            } else {
                app.path()
                    .resource_dir()
                    .map_err(|error| app_err!("Resource path: {}", error))?
                    .join("camera-bridges/sony/event-booth-sony-crsdk-bridge")
            };

            clear_backend_lock(&data_dir);

            app.manage(BackendProcess {
                child: Mutex::new(None),
                data_dir: data_dir.clone(),
                executable_path: python_path,
                backend_dir,
                sony_bridge: Some(sony_bridge),
                app_version: app.package_info().version.to_string(),
                debug_backend: cfg!(debug_assertions),
                api_token: new_api_token()?,
            });

            println!("Backend ready to start after login");

            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { .. } => {
                println!("🛑 Closing App...");

                if let Some(state) = window.try_state::<BackendProcess>() {
                    stop_managed_backend(state);
                }
            }

            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            pick_folder_path,
            start_backend,
            backend_api_token,
            updater::check_app_update,
            updater::download_app_update,
            updater::install_app_update,
            updater::cancel_app_update
        ])
        .build(tauri::generate_context!())
        .expect("❌ Error while building tauri application")
        .run(|app, event| match event {
            RunEvent::ExitRequested { .. } | RunEvent::Exit => {
                println!("🛑 Exiting App...");

                if let Some(state) = app.try_state::<BackendProcess>() {
                    stop_managed_backend(state);
                }
            }

            _ => {}
        });
}

#[cfg(test)]
mod tests {
    use super::{merge_dir_missing, secure_backend_auth_data};
    use std::fs;
    #[cfg(unix)]
    use std::os::unix::fs::PermissionsExt;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[cfg(windows)]
    #[test]
    fn backend_launch_does_not_create_a_console_window() {
        use std::os::windows::process::CommandExt;
        use std::process::Command;

        const PROBE: &str = "EVENT_BOOTH_TEST_CONSOLE_PROBE";
        if std::env::var_os(PROBE).is_some() {
            #[link(name = "kernel32")]
            extern "system" {
                fn GetConsoleWindow() -> *mut std::ffi::c_void;
            }
            assert!(
                unsafe { GetConsoleWindow().is_null() },
                "Backend created a console window"
            );
            return;
        }

        let make_probe = || {
            let mut command = Command::new(std::env::current_exe().unwrap());
            command.args([
                "--exact",
                "tests::backend_launch_does_not_create_a_console_window",
                "--nocapture",
            ]);
            command.env(PROBE, "1");
            command
        };

        // CI may have no inherited console. Explicitly create one to verify the
        // probe detects a console, then check the real background-launch policy.
        const CREATE_NEW_CONSOLE: u32 = 0x00000010;
        let visible_console = make_probe()
            .creation_flags(CREATE_NEW_CONSOLE)
            .output()
            .unwrap();
        assert!(
            !visible_console.status.success(),
            "Console probe did not detect an explicitly created console"
        );
        let mut hidden_backend = make_probe();
        super::configure_backend_process(&mut hidden_backend);
        let result = hidden_backend.output().unwrap();
        assert!(
            result.status.success(),
            "Hidden backend probe failed: {}{}",
            String::from_utf8_lossy(&result.stdout),
            String::from_utf8_lossy(&result.stderr)
        );
    }

    #[test]
    fn update_seed_adds_missing_files_without_overwriting_user_data() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("event-booth-update-test-{}", unique));
        let seed = root.join("seed");
        let data = root.join("data");

        fs::create_dir_all(seed.join("database")).unwrap();
        fs::create_dir_all(data.join("database")).unwrap();
        fs::write(seed.join("database/settings.json"), "new default").unwrap();
        fs::write(seed.join("database/new-feature.json"), "new feature").unwrap();
        fs::write(data.join("database/settings.json"), "user value").unwrap();

        merge_dir_missing(&seed, &data).unwrap();

        assert_eq!(
            fs::read_to_string(data.join("database/settings.json")).unwrap(),
            "user value"
        );
        assert_eq!(
            fs::read_to_string(data.join("database/new-feature.json")).unwrap(),
            "new feature"
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn auth_data_permissions_are_restricted() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("event-booth-auth-test-{}", unique));
        let auth_dir = root.join("auth");
        let token_path = auth_dir.join("token.json");
        fs::create_dir_all(&auth_dir).unwrap();
        fs::write(&token_path, "{}").unwrap();

        secure_backend_auth_data(&root).unwrap();

        assert_eq!(
            fs::metadata(&auth_dir).unwrap().permissions().mode() & 0o777,
            0o700
        );
        assert_eq!(
            fs::metadata(&token_path).unwrap().permissions().mode() & 0o777,
            0o600
        );

        fs::remove_dir_all(root).unwrap();
    }
}
