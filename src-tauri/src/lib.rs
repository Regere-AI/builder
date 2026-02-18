#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::fs;
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

/// Fallback: some .env parsers skip keys with hyphens; set REGERE-API-KEY from file if missing.
fn ensure_regere_api_key(env_path: &std::path::Path) {
    if std::env::var("REGERE-API-KEY").is_ok() {
        return;
    }
    let Ok(content) = fs::read_to_string(env_path) else {
        return;
    };
    for line in content.lines() {
        let line = line.trim();
        if line.starts_with("REGERE-API-KEY=") && !line.starts_with("REGERE-API-KEY=#") {
            let value = line.strip_prefix("REGERE-API-KEY=").unwrap_or("").trim().trim_matches('"');
            if !value.is_empty() {
                std::env::set_var("REGERE-API-KEY", value);
            }
            break;
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
            ensure_regere_api_key(&env_path);
        }
    }
    let _ = dotenvy::dotenv(); // then CWD so it can override

    if let Err(e) = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![get_env, open_file, save_file])
        .run(tauri::generate_context!())
    {
        eprintln!("Tauri application error: {}", e);
        std::process::exit(1);
    }
}
