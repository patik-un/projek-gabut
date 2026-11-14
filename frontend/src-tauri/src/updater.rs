use crate::{spawn_backend, BackendProcess};
use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use std::time::{Duration, Instant};
use tauri::{ipc::Channel, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct UpdateState {
    operation: AtomicBool,
    pub installing: AtomicBool,
    pending: Mutex<Option<Update>>,
    bytes: Mutex<Option<Vec<u8>>>,
    resume_backend: AtomicBool,
    paused_backend: AtomicBool,
}

struct Operation<'a>(&'a AtomicBool);
impl Drop for Operation<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}
fn begin(flag: &AtomicBool) -> Result<Operation<'_>, String> {
    flag.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .map(|_| Operation(flag))
        .map_err(|_| "Proses update lain masih berjalan".into())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    current_version: String,
    supported: bool,
    version: Option<String>,
    notes: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct Progress {
    event: String,
    downloaded: u64,
    total: Option<u64>,
}
fn progress(channel: &Channel<Progress>, event: &str, downloaded: u64, total: Option<u64>) {
    let _ = channel.send(Progress {
        event: event.into(),
        downloaded,
        total,
    });
}

#[tauri::command]
pub async fn check_app_update(
    app: tauri::AppHandle,
    state: tauri::State<'_, UpdateState>,
) -> Result<UpdateInfo, String> {
    let _operation = begin(&state.operation)?;
    let mut info = UpdateInfo {
        current_version: app.package_info().version.to_string(),
        supported: cfg!(all(windows, target_arch = "x86_64")) && !cfg!(debug_assertions),
        version: None,
        notes: None,
    };
    if !info.supported {
        return Ok(info);
    }
    let cleanup_app = app.clone();
    let update = app
        .updater_builder()
        .timeout(Duration::from_secs(20))
        .on_before_exit(move || {
            let _ = stop_for_update(&cleanup_app);
        })
        .build()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    if let Some(ref update) = update {
        info.version = Some(update.version.clone());
        info.notes = update.body.clone();
    }
    *state.pending.lock().map_err(|e| e.to_string())? = update;
    *state.bytes.lock().map_err(|e| e.to_string())? = None;
    Ok(info)
}

#[tauri::command]
pub async fn download_app_update(
    state: tauri::State<'_, UpdateState>,
    progress: Channel<Progress>,
) -> Result<(), String> {
    let _operation = begin(&state.operation)?;
    let mut update = state
        .pending
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or("Periksa update terlebih dahulu")?;
    update.timeout = Some(Duration::from_secs(1800));
    *state.bytes.lock().map_err(|e| e.to_string())? = None;
    let mut downloaded = 0;
    let bytes = update
        .download(
            |chunk, total| {
                downloaded += chunk as u64;
                self::progress(&progress, "Progress", downloaded, total);
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;
    *state.bytes.lock().map_err(|e| e.to_string())? = Some(bytes);
    self::progress(&progress, "Verified", downloaded, Some(downloaded));
    Ok(())
}

fn backend_alive(app: &tauri::AppHandle) -> Result<bool, String> {
    let backend = app.state::<BackendProcess>();
    let mut child = backend.child.lock().map_err(|e| e.to_string())?;
    match child.as_mut() {
        Some(child) => child
            .try_wait()
            .map(|exit| exit.is_none())
            .map_err(|e| e.to_string()),
        None => Ok(false),
    }
}

fn backend_request(app: &tauri::AppHandle, action: &str) -> Result<serde_json::Value, String> {
    let backend = app.state::<BackendProcess>();
    reqwest::blocking::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?
        .post(format!("http://127.0.0.1:8000/system/update/{action}"))
        .header("x-event-booth-token", &backend.api_token)
        .json(&serde_json::json!({}))
        .send()
        .and_then(|response| response.error_for_status())
        .and_then(|response| response.json())
        .map_err(|e| format!("Gagal menyiapkan backend untuk update: {e}"))
}

fn stop_for_update(app: &tauri::AppHandle) -> Result<(), String> {
    let backend = app.state::<BackendProcess>();
    let mut slot = backend.child.lock().map_err(|e| e.to_string())?;
    if let Some(child) = slot.as_mut() {
        if child.try_wait().map_err(|e| e.to_string())?.is_none() {
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                let result = std::process::Command::new("taskkill")
                    .args(["/F", "/T", "/PID", &child.id().to_string()])
                    .creation_flags(0x08000000)
                    .output()
                    .map_err(|e| e.to_string())?;
                if !result.status.success()
                    && child.try_wait().map_err(|e| e.to_string())?.is_none()
                {
                    return Err(
                        "Backend belum bisa dihentikan. Tutup aplikasi dan coba lagi.".into(),
                    );
                }
            }
            #[cfg(not(windows))]
            crate::stop_backend(child);
        }
        child.wait().map_err(|e| e.to_string())?;
    }
    *slot = None;
    crate::clear_backend_lock(&backend.data_dir);
    Ok(())
}

fn install(app: tauri::AppHandle, progress: Channel<Progress>) -> Result<(), String> {
    let state = app.state::<UpdateState>();
    let _operation = begin(&state.operation)?;
    let _installing = begin(&state.installing)?;
    let update = state
        .pending
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or("Periksa update terlebih dahulu")?;
    let bytes = state
        .bytes
        .lock()
        .map_err(|e| e.to_string())?
        .take()
        .ok_or("Unduhan update belum terverifikasi")?;
    let alive = backend_alive(&app)?;
    state.resume_backend.store(alive, Ordering::SeqCst);
    if alive {
        state.paused_backend.store(true, Ordering::SeqCst);
        let started = Instant::now();
        loop {
            self::progress(&progress, "Waiting", 0, None);
            let response = backend_request(&app, "prepare")?;
            if response.get("ready").and_then(|v| v.as_bool()) == Some(true) {
                break;
            }
            if started.elapsed() > Duration::from_secs(120) {
                return Err(
                    "Pekerjaan backend masih berjalan. Coba lagi setelah pekerjaan selesai.".into(),
                );
            }
            std::thread::sleep(Duration::from_secs(1));
        }
        stop_for_update(&app)?;
    }
    self::progress(&progress, "Installing", 0, None);
    update.install(bytes).map_err(|e| e.to_string())?;
    // Windows exits inside install; other platforms are currently unsupported.
    Ok(())
}

#[tauri::command]
pub async fn install_app_update(
    app: tauri::AppHandle,
    progress: Channel<Progress>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || install(app, progress))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn cancel_app_update(app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<UpdateState>();
        let _operation = begin(&state.operation)?;
        if backend_alive(&app)? {
            if state.paused_backend.load(Ordering::SeqCst) {
                backend_request(&app, "cancel")?;
            }
            state.resume_backend.store(false, Ordering::SeqCst);
        } else if state.resume_backend.swap(false, Ordering::SeqCst) {
            let backend = app.state::<BackendProcess>();
            let mut child = backend.child.lock().map_err(|e| e.to_string())?;
            *child = Some(spawn_backend(&backend)?);
        }
        state.paused_backend.store(false, Ordering::SeqCst);
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn concurrent_update_is_rejected_and_failure_releases_operation() {
        let flag = AtomicBool::new(false);
        let guard = begin(&flag).unwrap();
        assert!(begin(&flag).is_err());
        drop(guard);
        assert!(begin(&flag).is_ok());
    }
}
