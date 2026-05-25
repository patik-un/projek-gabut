use std::fmt;
use std::fs;
use std::io;
use std::path::PathBuf;
use std::process::Command as StdCommand;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

#[cfg(unix)]
use std::os::unix::process::CommandExt;

use tauri::{Manager, RunEvent, WindowEvent};

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

struct BackendProcess(Mutex<Option<std::process::Child>>);

fn copy_dir_if_missing(source: &PathBuf, destination: &PathBuf) -> io::Result<()> {
    if destination.exists() || !source.exists() {
        return Ok(());
    }

    copy_dir_recursive(source, destination)
}

fn copy_dir_recursive(source: &PathBuf, destination: &PathBuf) -> io::Result<()> {
    fs::create_dir_all(destination)?;

    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());

        if source_path.is_dir() {
            copy_dir_recursive(&source_path, &destination_path)?;
        } else {
            fs::copy(&source_path, &destination_path)?;
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
    copy_dir_if_missing(&seed_dir, &data_dir)
        .map_err(|error| format!("Gagal menyiapkan seed data: {}", error))?;

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
    if let Ok(mut backend) = state.0.lock() {
        if let Some(mut child) = backend.take() {
            stop_backend(&mut child);
            println!("✅ Backend Killed");
        }
    }
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
        .setup(|app| {
            let (python_path, backend_dir, data_dir) = if cfg!(debug_assertions) {
                dev_backend_paths().map_err(|e| app_err!("Dev path: {}", e))?
            } else {
                let data_dir = prepare_backend_data(app)?;
                let backend_binary = bundled_backend_path(app)?;
                let backend_dir = data_dir.clone();
                (backend_binary, backend_dir, data_dir)
            };

            let mut command = StdCommand::new(&python_path);
            if cfg!(debug_assertions) {
                command.arg("main.py");
            }

            command
                .current_dir(&backend_dir)
                .env("EVENT_BOOTH_BACKEND_DATA_DIR", &data_dir)
                .env("PHOTOBOOTH_CAMERA_INDEX", "auto");

            #[cfg(unix)]
            command.process_group(0);

            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
                command.creation_flags(CREATE_NEW_PROCESS_GROUP);
            }

            let child = command
                .spawn()
                .map_err(|e| app_err!("Gagal menjalankan backend: {}", e))?;

            app.manage(BackendProcess(Mutex::new(Some(child))));

            println!("✅ Backend Started");

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
        .invoke_handler(tauri::generate_handler![pick_folder_path])
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
