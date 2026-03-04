//! File system watching via notify crate with debouncing.
//! Emits "file-changed" events to the frontend when files change.

use notify::{RecursiveMode, RecommendedWatcher};
use notify_debouncer_mini::{new_debouncer, DebounceEventResult};
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

/// Holds the active debouncer so it stays alive. Replacing it stops the previous watcher.
pub struct WatcherState(pub Mutex<Option<notify_debouncer_mini::Debouncer<RecommendedWatcher>>>);

/// Start watching a directory. Replaces any existing watcher.
/// Emits "file-changed" with `{ paths: string[] }` when files change (debounced ~300ms).
#[tauri::command]
pub fn watch_directory(app: AppHandle, path: String) -> Result<(), String> {
    let path_buf = std::path::PathBuf::from(&path);
    if !path_buf.exists() || !path_buf.is_dir() {
        return Err(format!("Path is not an existing directory: {}", path));
    }

    let app_emit = app.clone();
    let mut debouncer = new_debouncer(
        Duration::from_millis(300),
        move |res: DebounceEventResult| {
            match res {
                Ok(events) => {
                    let paths: Vec<String> = events
                        .into_iter()
                        .filter_map(|e| e.path.to_str().map(String::from))
                        .collect();
                    if !paths.is_empty() {
                        let _ = app_emit.emit("file-changed", paths);
                    }
                }
                Err(e) => {
                    eprintln!("[file_watcher] error: {:?}", e);
                }
            }
        },
    )
    .map_err(|e| e.to_string())?;

    debouncer
        .watcher()
        .watch(Path::new(&path), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    let state = app.state::<WatcherState>();
    let mut guard = match state.0.lock() {
        Ok(g) => g,
        Err(e) => return Err(e.to_string()),
    };
    *guard = Some(debouncer);
    Ok(())
}

/// Stop watching. Clears the active watcher.
#[tauri::command]
pub fn stop_watching(app: AppHandle) -> Result<(), String> {
    let state = app.state::<WatcherState>();
    let mut guard = match state.0.lock() {
        Ok(g) => g,
        Err(e) => return Err(e.to_string()),
    };
    *guard = None;
    Ok(())
}
