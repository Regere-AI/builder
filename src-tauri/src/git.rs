//! Git CLI integration: status and repo detection via std::process::Command.

use serde::Serialize;
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusEntry {
    pub path: String,
    /// Legacy 2-char status (e.g. "M ", " M", "??") for backward compatibility.
    pub status: String,
    /// First char of porcelain: index (staged) status. ' ' = none, 'M'/'A'/'D'/'R'/'C' = staged.
    pub index_status: String,
    /// Second char of porcelain: work tree (unstaged) status. ' ' = none, 'M'/'D'/'U'/'?' = unstaged.
    pub work_tree_status: String,
    /// True if there are staged changes (index_status not space and not '?').
    pub staged: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusResult {
    pub entries: Vec<GitStatusEntry>,
    pub is_repo: bool,
}

/// Check if the given path is inside a git repository.
#[tauri::command]
pub fn git_is_repo(path: String) -> Result<bool, String> {
    let output = Command::new("git")
        .args(["rev-parse", "--is-inside-work-tree"])
        .current_dir(&path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Ok(false);
    }
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(stdout == "true")
}

/// Get git status for the given repository path.
/// Returns entries with path and status (e.g. "M", "??", "A").
/// If not a git repo, returns empty entries with is_repo: false.
#[tauri::command]
pub fn git_status(repo_path: String) -> Result<GitStatusResult, String> {
    if !git_is_repo(repo_path.clone())? {
        return Ok(GitStatusResult {
            entries: Vec::new(),
            is_repo: false,
        });
    }

    let output = Command::new("git")
        .args(["status", "--porcelain", "-z"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git status failed: {}", stderr));
    }

    let stdout = output.stdout;
    let mut entries = Vec::new();

    // With -z: each record is "XY PATH\0" (2-char status, space, path, NUL). Renames: "R  from\0to\0"
    // IMPORTANT: Leading spaces are meaningful (e.g. " M" = unstaged modification). Do NOT trim them.
    let parts: Vec<&[u8]> = stdout.split(|&b| b == 0).collect();
    let mut i = 0;
    while i < parts.len() {
        let raw = String::from_utf8_lossy(parts[i]).to_string();
        if raw.len() >= 3 {
            // First 2 chars = XY status, third char should be a space, then path.
            let status_code = raw.chars().take(2).collect::<String>();
            let index_status = raw.chars().next().map(|c| c.to_string()).unwrap_or_default();
            let work_tree_status = raw.chars().nth(1).map(|c| c.to_string()).unwrap_or_default();
            // Path = chars 4+ (skip "XY "). Preserve leading space semantics by only trimming the path itself.
            let path_str = raw.chars().skip(3).collect::<String>();
            let path = path_str.trim().to_string();

            // Staged = something in index (not space, not ?)
            let staged = index_status != " " && index_status != "?";

            // For renames: record is "R  from", path is "from"; next part is "to"
            let (path, step) = if status_code.starts_with('R') && i + 1 < parts.len() {
                let to_path = String::from_utf8_lossy(parts[i + 1]).trim().to_string();
                (to_path, 2)
            } else if !path.is_empty() {
                (path, 1)
            } else {
                i += 1;
                continue;
            };

            if !path.is_empty() {
                entries.push(GitStatusEntry {
                    path,
                    status: status_code,
                    index_status,
                    work_tree_status,
                    staged,
                });
            }
            i += step;
        } else {
            i += 1;
        }
    }

    Ok(GitStatusResult {
        entries,
        is_repo: true,
    })
}

/// Stage all changes and commit with the given message.
#[tauri::command]
pub fn git_commit(repo_path: String, message: String) -> Result<(), String> {
    if !git_is_repo(repo_path.clone())? {
        return Err("Not a git repository".to_string());
    }

    let add_output = Command::new("git")
        .args(["add", "-A"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !add_output.status.success() {
        let stderr = String::from_utf8_lossy(&add_output.stderr);
        return Err(format!("git add failed: {}", stderr));
    }

    let commit_output = Command::new("git")
        .args(["commit", "-m", &message])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !commit_output.status.success() {
        let stderr = String::from_utf8_lossy(&commit_output.stderr);
        return Err(format!("git commit failed: {}", stderr));
    }

    Ok(())
}

/// Stage specific files. If paths is empty, stage all.
#[tauri::command]
pub fn git_add(repo_path: String, paths: Vec<String>) -> Result<(), String> {
    if !git_is_repo(repo_path.clone())? {
        return Err("Not a git repository".to_string());
    }

    let output = if paths.is_empty() {
        Command::new("git")
            .args(["add", "-A"])
            .current_dir(&repo_path)
            .output()
            .map_err(|e| e.to_string())?
    } else {
        Command::new("git")
            .arg("add")
            .arg("--")
            .args(&paths)
            .current_dir(&repo_path)
            .output()
            .map_err(|e| e.to_string())?
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git add failed: {}", stderr));
    }

    Ok(())
}

/// Unstage specific files.
#[tauri::command]
pub fn git_reset(repo_path: String, paths: Vec<String>) -> Result<(), String> {
    if !git_is_repo(repo_path.clone())? {
        return Err("Not a git repository".to_string());
    }

    if paths.is_empty() {
        return Ok(());
    }

    let output = Command::new("git")
        .args(["reset", "HEAD", "--"])
        .args(&paths)
        .current_dir(&repo_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git reset failed: {}", stderr));
    }

    Ok(())
}

/// Commit only staged changes (no add -A).
#[tauri::command]
pub fn git_commit_staged(repo_path: String, message: String) -> Result<(), String> {
    if !git_is_repo(repo_path.clone())? {
        return Err("Not a git repository".to_string());
    }

    // Pre-commit check: verify something is staged before attempting commit
    let diff_output = Command::new("git")
        .args(["diff", "--cached", "--quiet"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| e.to_string())?;
    if diff_output.status.success() {
        return Err("Nothing to commit: no changes are staged. Stage your changes first.".to_string());
    }

    let output = Command::new("git")
        .args(["commit", "-m", &message])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git commit failed: {}", stderr));
    }

    Ok(())
}

/// Amend the last commit with the given message or keep the previous message.
#[tauri::command]
pub fn git_commit_amend(repo_path: String, message: Option<String>) -> Result<(), String> {
    if !git_is_repo(repo_path.clone())? {
        return Err("Not a git repository".to_string());
    }

    let output = if let Some(msg) = message {
        Command::new("git")
            .args(["commit", "--amend", "-m", &msg])
            .current_dir(&repo_path)
            .output()
            .map_err(|e| e.to_string())?
    } else {
        Command::new("git")
            .args(["commit", "--amend", "--no-edit"])
            .current_dir(&repo_path)
            .output()
            .map_err(|e| e.to_string())?
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git commit --amend failed: {}", stderr));
    }

    Ok(())
}

/// Push to upstream.
#[tauri::command]
pub fn git_push(repo_path: String) -> Result<(), String> {
    if !git_is_repo(repo_path.clone())? {
        return Err("Not a git repository".to_string());
    }

    let output = Command::new("git")
        .args(["push"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git push failed: {}", stderr));
    }

    Ok(())
}

/// Discard changes: restore modified/deleted, remove untracked.
#[tauri::command]
pub fn git_discard(repo_path: String, path: String) -> Result<(), String> {
    if !git_is_repo(repo_path.clone())? {
        return Err("Not a git repository".to_string());
    }

    // First unstage if staged
    let _ = Command::new("git")
        .args(["reset", "HEAD", "--", &path])
        .current_dir(&repo_path)
        .output();

    // For tracked files: checkout to discard work tree changes
    let checkout_output = Command::new("git")
        .args(["checkout", "--", &path])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| e.to_string())?;

    if checkout_output.status.success() {
        return Ok(());
    }

    // If checkout failed, might be untracked - use git clean
    let clean_output = Command::new("git")
        .args(["clean", "-fd", "--", &path])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !clean_output.status.success() {
        let stderr = String::from_utf8_lossy(&clean_output.stderr);
        return Err(format!("git discard failed: {}", stderr));
    }

    Ok(())
}

/// Get line ranges of modified/added lines in a file (working tree vs HEAD).
/// Returns Vec of { startLine, endLine } (1-based, inclusive).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffRange {
    pub start_line: u32,
    pub end_line: u32,
}

#[tauri::command]
pub fn git_diff_file(repo_path: String, file_path: String) -> Result<Vec<GitDiffRange>, String> {
    if !git_is_repo(repo_path.clone())? {
        return Ok(Vec::new());
    }

    // Convert absolute path to relative if needed
    let rel_path = if file_path.starts_with(&repo_path) {
        file_path
            .trim_start_matches(&repo_path)
            .trim_start_matches(|c| c == '/' || c == '\\')
            .replace('\\', "/")
    } else {
        file_path.replace('\\', "/")
    };

    if rel_path.is_empty() {
        return Ok(Vec::new());
    }

    let output = Command::new("git")
        .args(["diff", "HEAD", "--no-color", "-U0", "--", &rel_path])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Ok(Vec::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut ranges = Vec::new();

    // Parse hunk headers: @@ -oldStart,oldCount +newStart,newCount @@
    for line in stdout.lines() {
        if let Some(hunk) = line.strip_prefix("@@ ") {
            if let Some(rest) = hunk.strip_suffix(" @@") {
                let parts: Vec<&str> = rest.split_whitespace().collect();
                if parts.len() >= 2 {
                    if let Some(plus) = parts[1].strip_prefix('+') {
                        let nums: Vec<u32> = plus
                            .split(',')
                            .filter_map(|s| s.parse().ok())
                            .collect();
                        if nums.len() >= 2 {
                            let start = nums[0];
                            let count = nums[1];
                            if count > 0 {
                                ranges.push(GitDiffRange {
                                    start_line: start,
                                    end_line: start + count - 1,
                                });
                            }
                        } else if nums.len() == 1 && nums[0] > 0 {
                            ranges.push(GitDiffRange {
                                start_line: nums[0],
                                end_line: nums[0],
                            });
                        }
                    }
                }
            }
        }
    }

    Ok(ranges)
}

/// Get the contents of a file at HEAD (for diff view).
/// If the file does not exist at HEAD, returns empty string.
#[tauri::command]
pub fn git_show_file(repo_path: String, file_path: String) -> Result<String, String> {
    if !git_is_repo(repo_path.clone())? {
        return Ok(String::new());
    }

    // Resolve the actual git repository root so we can build a path relative to it.
    let root_output = Command::new("git")
        .args(["rev-parse", "--show-toplevel"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !root_output.status.success() {
        // If we can't determine the root, fall back to empty (no original contents).
        return Ok(String::new());
    }
    let repo_root = String::from_utf8_lossy(&root_output.stdout)
        .trim()
        .to_string();

    // Make path relative to the git root, not repo_path. This fixes cases where
    // repo_path is a subdirectory (e.g. apps/foo) but the git root is above it.
    let mut rel_path = if file_path.starts_with(&repo_root) {
        file_path
            .trim_start_matches(&repo_root)
            .trim_start_matches(|c| c == '/' || c == '\\')
            .replace('\\', "/")
    } else {
        file_path.replace('\\', "/")
    };

    if rel_path.is_empty() {
        return Ok(String::new());
    }

    // git show HEAD:path expects a path relative to the git root with forward slashes.
    rel_path = rel_path.replace('\\', "/");

    // git show HEAD:path
    let output = Command::new("git")
        .args(["show", &format!("HEAD:{}", rel_path)])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        // If the file didn't exist at HEAD, treat as empty (pure addition).
        return Ok(String::new());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Clone a git repository into the given target path.
/// Returns the cloned path on success.
#[tauri::command]
pub fn git_clone(repo_url: String, target_path: String) -> Result<String, String> {
    let url = repo_url.trim();
    if url.is_empty() {
        return Err("Repository URL is required".to_string());
    }

    let output = Command::new("git")
        .args(["clone", url, &target_path])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git clone failed: {}", stderr));
    }

    Ok(target_path)
}
