#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod api;

use serde::Serialize;
use std::fs;
use tauri::Emitter;
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

#[tauri::command]
async fn save_file(
    app: tauri::AppHandle,
    content: String,
    default_path: Option<String>,
) -> SaveFileResult {
    let builder = app.dialog().file()
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
                "STACK_GUARD_API_BASE_URL" if std::env::var("STACK_GUARD_API_BASE_URL").is_err() => {
                    std::env::set_var("STACK_GUARD_API_BASE_URL", value);
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
            {
                use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};
                let handle = app.handle().clone();
                // On Windows/Linux use Ctrl; on macOS use Cmd (META). Avoid registering both
                // so we don't conflict with the native menu's CmdOrCtrl (e.g. SUPER+N on Windows).
                #[cfg(target_os = "macos")]
                let (mod_n, mod_o, mod_s, mod_shift_s) = (
                    Shortcut::new(Some(Modifiers::META), Code::KeyN),
                    Shortcut::new(Some(Modifiers::META), Code::KeyO),
                    Shortcut::new(Some(Modifiers::META), Code::KeyS),
                    Shortcut::new(Some(Modifiers::META | Modifiers::SHIFT), Code::KeyS),
                );
                #[cfg(not(target_os = "macos"))]
                let (mod_n, mod_o, mod_s, mod_shift_s) = (
                    Shortcut::new(Some(Modifiers::CONTROL), Code::KeyN),
                    Shortcut::new(Some(Modifiers::CONTROL), Code::KeyO),
                    Shortcut::new(Some(Modifiers::CONTROL), Code::KeyS),
                    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyS),
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
                    gs.register(Shortcut::new(Some(Modifiers::META | Modifiers::SHIFT), Code::KeyS))?;
                }
                #[cfg(not(target_os = "macos"))]
                {
                    gs.register(Shortcut::new(Some(Modifiers::CONTROL), Code::KeyN))?;
                    gs.register(Shortcut::new(Some(Modifiers::CONTROL), Code::KeyO))?;
                    gs.register(Shortcut::new(Some(Modifiers::CONTROL), Code::KeyS))?;
                    gs.register(Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyS))?;
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_env,
            open_file,
            save_file,
            api::api_signup,
            api::api_send_otp,
            api::api_verify_otp,
            api::api_signin,
            api::api_verify_2fa,
            api::api_validate_license,
        ])
        .run(tauri::generate_context!())
    {
        eprintln!("Tauri application error: {}", e);
        std::process::exit(1);
    }
}
