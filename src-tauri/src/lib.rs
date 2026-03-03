#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod api;
mod file_watcher;
mod git;

use serde::Serialize;
use std::fs;
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenFileResult {
    canceled: bool,
    success: bool,
    file_path: Option<String>,
    content: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveFileResult {
    canceled: bool,
    success: bool,
    file_path: Option<String>,
    error: Option<String>,
}

#[tauri::command]
fn get_env(key: String) -> Option<String> {
    std::env::var(key).ok()
}

#[tauri::command]
async fn open_file(app: tauri::AppHandle) -> OpenFileResult {
    let file_path = app
        .dialog()
        .file()
        .add_filter("All Files", &["*"])
        .add_filter("JSON Files", &["json"])
        .add_filter("Text Files", &["txt"])
        .blocking_pick_file();

    let Some(file_path) = file_path else {
        return OpenFileResult {
            canceled: true,
            success: false,
            file_path: None,
            content: None,
            error: None,
        };
    };

    let path_buf = match file_path.into_path() {
        Ok(p) => p,
        Err(e) => {
            return OpenFileResult {
                canceled: false,
                success: false,
                file_path: None,
                content: None,
                error: Some(e.to_string()),
            };
        }
    };

    match fs::read_to_string(&path_buf) {
        Ok(content) => OpenFileResult {
            canceled: false,
            success: true,
            file_path: Some(path_buf.to_string_lossy().into_owned()),
            content: Some(content),
            error: None,
        },
        Err(e) => OpenFileResult {
            canceled: false,
            success: false,
            file_path: Some(path_buf.to_string_lossy().into_owned()),
            content: None,
            error: Some(e.to_string()),
        },
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenAppFolderResult {
    canceled: bool,
    path: Option<String>,
    error: Option<String>,
}

#[tauri::command]
async fn open_app_folder(app: tauri::AppHandle) -> OpenAppFolderResult {
    let folder_path = app.dialog().file().blocking_pick_folder();
    let Some(folder_path) = folder_path else {
        return OpenAppFolderResult {
            canceled: true,
            path: None,
            error: None,
        };
    };
    match folder_path.into_path() {
        Ok(p) => OpenAppFolderResult {
            canceled: false,
            path: Some(p.to_string_lossy().into_owned()),
            error: None,
        },
        Err(e) => OpenAppFolderResult {
            canceled: false,
            path: None,
            error: Some(e.to_string()),
        },
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DirEntry {
    name: String,
    is_dir: bool,
}

#[tauri::command]
fn app_read_dir(dir_path: String) -> Result<Vec<DirEntry>, String> {
    let path = std::path::Path::new(&dir_path);
    let entries = fs::read_dir(path).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        // Hide .git so it cannot be deleted from the UI
        if name == ".git" {
            continue;
        }
        result.push(DirEntry { name, is_dir });
    }
    result.sort_by(|a, b| {
        // folders first, then by name
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });
    Ok(result)
}

#[tauri::command]
fn app_read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn app_write_text_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn app_create_dir(path: String, recursive: bool) -> Result<(), String> {
    let path_buf = std::path::Path::new(&path).to_path_buf();
    if path_buf.exists() {
        if path_buf.is_file() {
            return Err(format!(
                "Cannot create directory: a file already exists at {}",
                path_buf.display()
            ));
        }
        return Ok(());
    }
    let res = if recursive {
        fs::create_dir_all(&path_buf).map_err(|e| e.to_string())
    } else {
        if let Some(parent) = path_buf.parent() {
            if !parent.exists() {
                return Err(format!(
                    "Parent directory does not exist: {}",
                    parent.display()
                ));
            }
        }
        fs::create_dir(&path_buf).map_err(|e| e.to_string())
    };
    res
}

/// Rename a file or directory to a new name in the same parent directory.
#[tauri::command]
fn app_rename(old_path: String, new_name: String) -> Result<(), String> {
    let new_name = new_name.trim();
    if new_name.is_empty() {
        return Err("Name cannot be empty".to_string());
    }
    if new_name.contains(std::path::MAIN_SEPARATOR) || new_name.contains('/') {
        return Err("Name cannot contain path separators".to_string());
    }
    let old = std::path::Path::new(&old_path);
    if !old.exists() {
        return Err(format!("Path does not exist: {}", old_path));
    }
    let parent = old
        .parent()
        .ok_or_else(|| "Invalid path (no parent)".to_string())?;
    let new_path = parent.join(new_name);
    fs::rename(old, &new_path).map_err(|e| e.to_string())
}

/// Move a file or directory into another directory.
#[tauri::command]
fn app_move(from_path: String, to_dir_path: String) -> Result<(), String> {
    let from = std::path::Path::new(&from_path);
    let to_dir = std::path::Path::new(&to_dir_path);
    if !from.exists() {
        return Err(format!("Source does not exist: {}", from_path));
    }
    if !to_dir.is_dir() {
        return Err(format!("Destination is not a directory: {}", to_dir_path));
    }
    let name = from
        .file_name()
        .ok_or_else(|| "Invalid source path".to_string())?;
    let dest = to_dir.join(name);
    if dest.exists() {
        return Err(format!("Destination already exists: {}", dest.display()));
    }
    // Prevent moving a directory into itself or a descendant
    if from.is_dir() {
        let from_canon = from.canonicalize().map_err(|e| e.to_string())?;
        if let Ok(to_canon) = to_dir.canonicalize() {
            if to_canon.starts_with(&from_canon) {
                return Err("Cannot move a directory into itself or a descendant".to_string());
            }
        }
    }
    fs::rename(from, &dest).map_err(|e| e.to_string())
}

/// Delete a file or directory. For directories, recursive must be true to remove non-empty dirs.
#[tauri::command]
fn app_delete(path: String, recursive: bool) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    if p.is_file() {
        fs::remove_file(p).map_err(|e| e.to_string())
    } else if p.is_dir() {
        if recursive {
            fs::remove_dir_all(p).map_err(|e| e.to_string())
        } else {
            fs::remove_dir(p).map_err(|e| e.to_string())
        }
    } else {
        Err("Path is neither a file nor a directory".to_string())
    }
}

/// Returns the default workspace root in app data (e.g. sample-project/tenant-a).
/// Uses the app data directory so it is always writable (avoids "Access is denied" when
/// the app is installed in Program Files or the project is in a protected location).
#[tauri::command]
fn get_default_workspace_root(app: tauri::AppHandle) -> Result<String, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let workspace = app_data.join("sample-project").join("tenant-a");
    if !workspace.exists() {
        fs::create_dir_all(&workspace).map_err(|e| e.to_string())?;
    }
    Ok(workspace.to_string_lossy().into_owned())
}

/// Creates app folder under workspace_root with uiConfigs, workflows, and app.manifest.json if missing.
/// Returns the app root path.
#[tauri::command]
fn ensure_app_folder(
    workspace_root: String,
    app_folder_name: String,
    display_name: String,
) -> Result<String, String> {
    let app_root = std::path::Path::new(&workspace_root).join(&app_folder_name);
    fs::create_dir_all(&app_root).map_err(|e| e.to_string())?;

    let ui_configs = app_root.join("uiConfigs");
    let workflows = app_root.join("workflows");
    fs::create_dir_all(&ui_configs).map_err(|e| e.to_string())?;
    fs::create_dir_all(&workflows).map_err(|e| e.to_string())?;

    let manifest_path = app_root.join("app.manifest.json");
    if !manifest_path.exists() {
        let manifest = serde_json::json!({
            "id": app_folder_name,
            "name": display_name,
            "version": "1.0.0"
        });
        let content = serde_json::to_string_pretty(&manifest).unwrap_or_else(|_| "{}".to_string());
        fs::write(&manifest_path, content).map_err(|e| e.to_string())?;
    }

    Ok(app_root.to_string_lossy().into_owned())
}

#[tauri::command]
async fn save_file(
    app: tauri::AppHandle,
    content: String,
    default_path: Option<String>,
) -> SaveFileResult {
    let builder = app
        .dialog()
        .file()
        .add_filter("JSON Files", &["json"])
        .add_filter("Text Files", &["txt"])
        .add_filter("All Files", &["*"]);

    let builder = if let Some(ref path) = default_path {
        if path.is_empty() {
            builder
        } else {
            let p = std::path::Path::new(path);
            if let Some(name) = p.file_name() {
                builder.set_file_name(name.to_string_lossy().into_owned())
            } else {
                builder
            }
        }
    } else {
        builder
    };

    let file_path = builder.blocking_save_file();

    let Some(file_path) = file_path else {
        return SaveFileResult {
            canceled: true,
            success: false,
            file_path: None,
            error: None,
        };
    };

    let path_buf = match file_path.into_path() {
        Ok(p) => p,
        Err(e) => {
            return SaveFileResult {
                canceled: false,
                success: false,
                file_path: None,
                error: Some(e.to_string()),
            };
        }
    };

    match fs::write(&path_buf, content) {
        Ok(()) => SaveFileResult {
            canceled: false,
            success: true,
            file_path: Some(path_buf.to_string_lossy().into_owned()),
            error: None,
        },
        Err(e) => SaveFileResult {
            canceled: false,
            success: false,
            file_path: Some(path_buf.to_string_lossy().into_owned()),
            error: Some(e.to_string()),
        },
    }
}

/// Fallback: .env keys with hyphens (e.g. REGERE-API-KEY, STACK_GUARD_API_BASE_URL) may not
/// be loaded by dotenvy; read them manually from the file if missing.
fn ensure_env_from_file(env_path: &std::path::Path) {
    let Ok(content) = fs::read_to_string(env_path) else {
        return;
    };
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((key, value)) = line.split_once('=') {
            let key = key.trim();
            let value = value.trim().trim_matches('"').to_string();
            if value.is_empty() {
                continue;
            }
            match key {
                "REGERE-API-KEY" if std::env::var("REGERE-API-KEY").is_err() => {
                    std::env::set_var("REGERE-API-KEY", value);
                }
                "STACK_GUARD_API_BASE_URL"
                    if std::env::var("STACK_GUARD_API_BASE_URL").is_err() =>
                {
                    std::env::set_var("STACK_GUARD_API_BASE_URL", value);
                }
                "AGENT_URL" if std::env::var("AGENT_URL").is_err() => {
                    std::env::set_var("AGENT_URL", value);
                }
                _ => {}
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load .env from project root when present (dev or when running from project dir).
    // When running from a built .app bundle, project root may not exist; skip without failing.
    if let Some(root) = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent() {
        let env_path = root.join(".env");
        if env_path.exists() {
            let _ = dotenvy::from_path(&env_path);
            ensure_env_from_file(&env_path);
        }
    }
    let _ = dotenvy::dotenv(); // then CWD so it can override
                               // Ensure hyphenated keys are set from project root .env if still missing
    if let Some(root) = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent() {
        let env_path = root.join(".env");
        if env_path.exists() {
            ensure_env_from_file(&env_path);
        }
    }

    if let Err(e) = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .manage(file_watcher::WatcherState(std::sync::Mutex::new(None)))
        .setup(|app| {
            #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
            {
                use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};
                let handle = app.handle().clone();
                // On Windows/Linux use Ctrl; on macOS use Cmd (META). Avoid registering both
                // so we don't conflict with the native menu's CmdOrCtrl (e.g. SUPER+N on Windows).
                #[cfg(target_os = "macos")]
                let (mod_n, mod_o, mod_s, mod_shift_s, mod_l) = (
                    Shortcut::new(Some(Modifiers::META), Code::KeyN),
                    Shortcut::new(Some(Modifiers::META), Code::KeyO),
                    Shortcut::new(Some(Modifiers::META), Code::KeyS),
                    Shortcut::new(Some(Modifiers::META | Modifiers::SHIFT), Code::KeyS),
                    Shortcut::new(Some(Modifiers::META), Code::KeyL),
                );
                #[cfg(not(target_os = "macos"))]
                let (mod_n, mod_o, mod_s, mod_shift_s, mod_l) = (
                    Shortcut::new(Some(Modifiers::CONTROL), Code::KeyN),
                    Shortcut::new(Some(Modifiers::CONTROL), Code::KeyO),
                    Shortcut::new(Some(Modifiers::CONTROL), Code::KeyS),
                    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyS),
                    Shortcut::new(Some(Modifiers::CONTROL), Code::KeyL),
                );
                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(move |_app, shortcut, _event| {
                            let event_name: Option<&str> = if shortcut == &mod_n {
                                Some("menu:new-file")
                            } else if shortcut == &mod_o {
                                Some("menu:open-file")
                            } else if shortcut == &mod_s {
                                Some("menu:save")
                            } else if shortcut == &mod_shift_s {
                                Some("menu:save-as")
                            } else if shortcut == &mod_l {
                                Some("app:add-selection-to-chat")
                            } else {
                                None
                            };
                            if let Some(name) = event_name {
                                let _ = handle.emit(name, ());
                            }
                        })
                        .build(),
                )?;
                let gs = app.global_shortcut();
                #[cfg(target_os = "macos")]
                {
                    gs.register(Shortcut::new(Some(Modifiers::META), Code::KeyN))?;
                    gs.register(Shortcut::new(Some(Modifiers::META), Code::KeyO))?;
                    gs.register(Shortcut::new(Some(Modifiers::META), Code::KeyS))?;
                    gs.register(Shortcut::new(
                        Some(Modifiers::META | Modifiers::SHIFT),
                        Code::KeyS,
                    ))?;
                    gs.register(Shortcut::new(Some(Modifiers::META), Code::KeyL))?;
                }
                #[cfg(not(target_os = "macos"))]
                {
                    gs.register(Shortcut::new(Some(Modifiers::CONTROL), Code::KeyN))?;
                    gs.register(Shortcut::new(Some(Modifiers::CONTROL), Code::KeyO))?;
                    gs.register(Shortcut::new(Some(Modifiers::CONTROL), Code::KeyS))?;
                    gs.register(Shortcut::new(
                        Some(Modifiers::CONTROL | Modifiers::SHIFT),
                        Code::KeyS,
                    ))?;
                    gs.register(Shortcut::new(Some(Modifiers::CONTROL), Code::KeyL))?;
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_env,
            open_file,
            save_file,
            open_app_folder,
            app_read_dir,
            app_read_text_file,
            app_write_text_file,
            app_create_dir,
            app_rename,
            app_move,
            app_delete,
            get_default_workspace_root,
            ensure_app_folder,
            git::git_status,
            git::git_is_repo,
            git::git_commit,
            git::git_commit_staged,
            git::git_commit_amend,
            git::git_add,
            git::git_reset,
            git::git_push,
            git::git_discard,
            git::git_diff_file,
            git::git_show_file,
            git::git_clone,
            file_watcher::watch_directory,
            file_watcher::stop_watching,
            api::api_signup,
            api::api_send_otp,
            api::api_verify_otp,
            api::api_signin,
            api::api_verify_2fa,
            api::api_validate_license,
            api::api_chat,
            api::api_generate,
            api::api_modify,
            api::api_goal,
            api::api_agent_health,
        ])
        .run(tauri::generate_context!())
    {
        eprintln!("Tauri application error: {}", e);
        std::process::exit(1);
    }
}
