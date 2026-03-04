//! Git CLI integration: status and repo detection via std::process::Command.
//! All commands run blocking git operations in spawn_blocking to avoid freezing the UI.

use serde::Serialize;
use std::process::Command;

async fn run_blocking<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())
        .and_then(std::convert::identity)
}

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

fn git_is_repo_sync(path: String) -> Result<bool, String> {
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

/// Check if the given path is inside a git repository.
#[tauri::command]
pub async fn git_is_repo(path: String) -> Result<bool, String> {
    run_blocking(move || git_is_repo_sync(path)).await
}

/// Get git status for the given repository path.
/// Returns entries with path and status (e.g. "M", "??", "A").
/// If not a git repo, returns empty entries with is_repo: false.
fn git_status_sync(repo_path: String) -> Result<GitStatusResult, String> {
    if !git_is_repo_sync(repo_path.clone())? {
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

#[tauri::command]
pub async fn git_status(repo_path: String) -> Result<GitStatusResult, String> {
    run_blocking(move || git_status_sync(repo_path)).await
}

/// Stage all changes and commit with the given message.
fn git_commit_sync(repo_path: String, message: String) -> Result<(), String> {
    if !git_is_repo_sync(repo_path.clone())? {
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

#[tauri::command]
pub async fn git_commit(repo_path: String, message: String) -> Result<(), String> {
    run_blocking(move || git_commit_sync(repo_path, message)).await
}

/// Stage specific files. If paths is empty, stage all.
fn git_add_sync(repo_path: String, paths: Vec<String>) -> Result<(), String> {
    if !git_is_repo_sync(repo_path.clone())? {
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

#[tauri::command]
pub async fn git_add(repo_path: String, paths: Vec<String>) -> Result<(), String> {
    run_blocking(move || git_add_sync(repo_path, paths)).await
}

/// Unstage specific files.
fn git_reset_sync(repo_path: String, paths: Vec<String>) -> Result<(), String> {
    if !git_is_repo_sync(repo_path.clone())? {
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

#[tauri::command]
pub async fn git_reset(repo_path: String, paths: Vec<String>) -> Result<(), String> {
    run_blocking(move || git_reset_sync(repo_path, paths)).await
}

/// Commit only staged changes (no add -A).
fn git_commit_staged_sync(repo_path: String, message: String) -> Result<(), String> {
    if !git_is_repo_sync(repo_path.clone())? {
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

#[tauri::command]
pub async fn git_commit_staged(repo_path: String, message: String) -> Result<(), String> {
    run_blocking(move || git_commit_staged_sync(repo_path, message)).await
}

/// Amend the last commit with the given message or keep the previous message.
fn git_commit_amend_sync(repo_path: String, message: Option<String>) -> Result<(), String> {
    if !git_is_repo_sync(repo_path.clone())? {
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

#[tauri::command]
pub async fn git_commit_amend(repo_path: String, message: Option<String>) -> Result<(), String> {
    run_blocking(move || git_commit_amend_sync(repo_path, message)).await
}

/// Get the current branch name, or None if detached HEAD or not a repo.
fn git_current_branch_sync(repo_path: String) -> Result<Option<String>, String> {
    if !git_is_repo_sync(repo_path.clone())? {
        return Ok(None);
    }

    let output = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Ok(None);
    }

    let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if name.is_empty() || name == "HEAD" {
        Ok(None)
    } else {
        Ok(Some(name))
    }
}

/// Push to upstream.
fn git_push_sync(repo_path: String) -> Result<(), String> {
    if !git_is_repo_sync(repo_path.clone())? {
        return Err("Not a git repository".to_string());
    }

    // If current branch has no upstream, use -u so the first push creates it on the remote.
    let has_upstream = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "@{u}"])
        .current_dir(&repo_path)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    let output = if has_upstream {
        Command::new("git")
            .args(["push"])
            .current_dir(&repo_path)
            .output()
            .map_err(|e| e.to_string())?
    } else {
        // No upstream: push and set upstream in one go.
        let branch = match git_current_branch_sync(repo_path.clone()) {
            Ok(Some(b)) if !b.is_empty() => b,
            _ => return Err("Could not determine current branch name.".to_string()),
        };
        Command::new("git")
            .args(["push", "--set-upstream", "origin", &branch])
            .current_dir(&repo_path)
            .output()
            .map_err(|e| e.to_string())?
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git push failed: {}", stderr));
    }

    Ok(())
}

#[tauri::command]
pub async fn git_push(repo_path: String) -> Result<(), String> {
    run_blocking(move || git_push_sync(repo_path)).await
}

/// Discard changes: restore modified/deleted, remove untracked.
fn git_discard_sync(repo_path: String, path: String) -> Result<(), String> {
    if !git_is_repo_sync(repo_path.clone())? {
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

#[tauri::command]
pub async fn git_discard(repo_path: String, path: String) -> Result<(), String> {
    run_blocking(move || git_discard_sync(repo_path, path)).await
}

/// Returns true if the current branch has an upstream tracking branch configured.
fn git_has_upstream_sync(repo_path: String) -> Result<bool, String> {
    if !git_is_repo_sync(repo_path.clone())? {
        return Ok(false);
    }

    let output = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "@{u}"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Ok(false);
    }
    let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(!name.is_empty() && name != "HEAD")
}

#[tauri::command]
pub async fn git_has_upstream(repo_path: String) -> Result<bool, String> {
    run_blocking(move || git_has_upstream_sync(repo_path)).await
}

/// Get the number of commits that are ahead of the upstream tracking branch.
/// Returns 0 if there is no upstream or if the count cannot be determined.
fn git_ahead_count_sync(repo_path: String) -> Result<u32, String> {
    if !git_is_repo_sync(repo_path.clone())? {
        return Ok(0);
    }

    let output = Command::new("git")
        .args(["rev-list", "--count", "@{u}..HEAD"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        // No upstream configured or other error; treat as nothing to push.
        return Ok(0);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let count: u32 = stdout.trim().parse().unwrap_or(0);
    Ok(count)
}

#[tauri::command]
pub async fn git_ahead_count(repo_path: String) -> Result<u32, String> {
    run_blocking(move || git_ahead_count_sync(repo_path)).await
}

/// Pull from the configured upstream.
fn git_pull_sync(repo_path: String) -> Result<(), String> {
    if !git_is_repo_sync(repo_path.clone())? {
        return Err("Not a git repository".to_string());
    }

    let output = Command::new("git")
        .args(["pull"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git pull failed: {}", stderr));
    }

    Ok(())
}

#[tauri::command]
pub async fn git_pull(repo_path: String) -> Result<(), String> {
    run_blocking(move || git_pull_sync(repo_path)).await
}

#[tauri::command]
pub async fn git_current_branch(repo_path: String) -> Result<Option<String>, String> {
    run_blocking(move || git_current_branch_sync(repo_path)).await
}

/// List local branches.
fn git_list_branches_sync(repo_path: String) -> Result<Vec<String>, String> {
    if !git_is_repo_sync(repo_path.clone())? {
        return Ok(Vec::new());
    }

    let output = Command::new("git")
        .args([
            "for-each-ref",
            "refs/heads",
            "--format=%(refname:short)",
        ])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git list branches failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let branches = stdout
        .lines()
        .map(|line| line.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    Ok(branches)
}

#[tauri::command]
pub async fn git_list_branches(repo_path: String) -> Result<Vec<String>, String> {
    run_blocking(move || git_list_branches_sync(repo_path)).await
}

/// Checkout an existing branch.
fn git_checkout_branch_sync(repo_path: String, branch: String) -> Result<(), String> {
    if !git_is_repo_sync(repo_path.clone())? {
        return Err("Not a git repository".to_string());
    }

    let output = Command::new("git")
        .args(["checkout", &branch])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git checkout failed: {}", stderr));
    }

    Ok(())
}

#[tauri::command]
pub async fn git_checkout_branch(repo_path: String, branch: String) -> Result<(), String> {
    run_blocking(move || git_checkout_branch_sync(repo_path, branch)).await
}

/// Create a new branch and check it out.
fn git_create_branch_sync(repo_path: String, name: String) -> Result<(), String> {
    if !git_is_repo_sync(repo_path.clone())? {
        return Err("Not a git repository".to_string());
    }

    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Branch name is required".to_string());
    }

    let output = Command::new("git")
        .args(["checkout", "-b", trimmed])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git create branch failed: {}", stderr));
    }

    Ok(())
}

#[tauri::command]
pub async fn git_create_branch(repo_path: String, name: String) -> Result<(), String> {
    run_blocking(move || git_create_branch_sync(repo_path, name)).await
}

/// Get line ranges of modified/added lines in a file (working tree vs HEAD).
/// Returns Vec of { startLine, endLine } (1-based, inclusive).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffRange {
    pub start_line: u32,
    pub end_line: u32,
}

/// Get line ranges of modified/added lines in a file (working tree vs HEAD).
/// Returns Vec of { startLine, endLine } (1-based, inclusive).
fn git_diff_file_sync(repo_path: String, file_path: String) -> Result<Vec<GitDiffRange>, String> {
    if !git_is_repo_sync(repo_path.clone())? {
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

#[tauri::command]
pub async fn git_diff_file(repo_path: String, file_path: String) -> Result<Vec<GitDiffRange>, String> {
    run_blocking(move || git_diff_file_sync(repo_path, file_path)).await
}

/// Get the contents of a file at HEAD (for diff view).
/// If the file does not exist at HEAD, returns empty string.
fn git_show_file_sync(repo_path: String, file_path: String) -> Result<String, String> {
    if !git_is_repo_sync(repo_path.clone())? {
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

#[tauri::command]
pub async fn git_show_file(repo_path: String, file_path: String) -> Result<String, String> {
    run_blocking(move || git_show_file_sync(repo_path, file_path)).await
}

/// Clone a git repository into the given target path.
/// Returns the cloned path on success.
fn git_clone_sync(repo_url: String, target_path: String) -> Result<String, String> {
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

#[tauri::command]
pub async fn git_clone(repo_url: String, target_path: String) -> Result<String, String> {
    run_blocking(move || git_clone_sync(repo_url, target_path)).await
}
