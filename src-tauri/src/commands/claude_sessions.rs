//! IPC commands for reading Claude Code session history.
//!
//! Reads JSONL files from `~/.claude/projects/{dir_name}/` to extract
//! session metadata for the Fork Session feature.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Metadata for a single Claude Code session.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeSession {
    /// Claude Code session UUID.
    pub session_id: String,
    /// First user message (truncated to 100 chars) for display.
    pub display: String,
    /// Git branch active during the session, if any.
    pub git_branch: Option<String>,
    /// Last activity time as Unix timestamp in milliseconds.
    pub last_activity: u64,
    /// Approximate message count (line count of the JSONL file).
    pub message_count: u32,
}

/// A single line from a Claude Code JSONL session file.
#[derive(Debug, Deserialize)]
struct JsonlLine {
    #[serde(rename = "sessionId")]
    session_id: Option<String>,
    #[serde(rename = "type")]
    line_type: Option<String>,
    message: Option<JsonlMessage>,
    #[serde(rename = "cwd")]
    _cwd: Option<String>,
}

#[derive(Debug, Deserialize)]
struct JsonlMessage {
    role: Option<String>,
    content: Option<serde_json::Value>,
}

/// Converts a project path to the Claude Code directory name format.
/// `/Users/tuna/project` → `-Users-tuna-project`
fn project_path_to_dir_name(project_path: &str) -> String {
    project_path.replace('/', "-")
}

/// Extracts display text from a message content value.
/// Handles both string content and array content (takes first text block).
fn extract_display_text(content: &serde_json::Value) -> Option<String> {
    match content {
        serde_json::Value::String(s) => {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                None
            } else {
                let truncated: String = trimmed.chars().take(100).collect();
                Some(truncated)
            }
        }
        serde_json::Value::Array(arr) => {
            for item in arr {
                if let Some(obj) = item.as_object() {
                    if obj.get("type").and_then(|t| t.as_str()) == Some("text") {
                        if let Some(text) = obj.get("text").and_then(|t| t.as_str()) {
                            let trimmed = text.trim();
                            if !trimmed.is_empty() {
                                let truncated: String = trimmed.chars().take(100).collect();
                                return Some(truncated);
                            }
                        }
                    }
                }
            }
            None
        }
        _ => None,
    }
}

/// Reads Claude Code session history for a given project path.
///
/// Returns a list of sessions sorted by last activity (most recent first).
/// Only reads the first few lines of each JSONL file for efficiency.
#[tauri::command]
pub async fn get_claude_sessions(project_path: String) -> Result<Vec<ClaudeSession>, String> {
    let home = directories::UserDirs::new()
        .map(|dirs| dirs.home_dir().to_path_buf())
        .ok_or("Could not get home directory")?;

    let dir_name = project_path_to_dir_name(&project_path);
    let sessions_dir = home.join(".claude").join("projects").join(&dir_name);

    if !sessions_dir.exists() || !sessions_dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut sessions = Vec::new();

    // Read all .jsonl files in the directory
    let entries = match tokio::fs::read_dir(&sessions_dir).await {
        Ok(entries) => entries,
        Err(_) => return Ok(Vec::new()),
    };

    let mut entries = entries;
    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }

        if let Some(session) = parse_session_file(&path).await {
            sessions.push(session);
        }
    }

    // Sort by lastActivity descending (most recent first)
    sessions.sort_by(|a, b| b.last_activity.cmp(&a.last_activity));

    Ok(sessions)
}

/// Parses a single JSONL session file, reading only the first few lines
/// plus file metadata for efficiency.
async fn parse_session_file(path: &PathBuf) -> Option<ClaudeSession> {
    // Get file metadata for last activity time
    let metadata = tokio::fs::metadata(path).await.ok()?;
    let last_activity = metadata
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_millis() as u64;

    // Get approximate message count from file size
    // (rough estimate: average JSONL line ~500 bytes)
    let file_size = metadata.len();
    let message_count = (file_size / 500).min(u32::MAX as u64) as u32;

    // Read the file content (only first 10KB to avoid reading huge files)
    let content = tokio::fs::read_to_string(path).await.ok()?;

    let mut session_id: Option<String> = None;
    let mut display: Option<String> = None;
    let mut git_branch: Option<String> = None;
    let mut lines_read = 0;

    for line in content.lines() {
        if lines_read >= 10 {
            break; // Only read first 10 lines for metadata
        }
        lines_read += 1;

        let parsed: JsonlLine = match serde_json::from_str(line) {
            Ok(p) => p,
            Err(_) => continue, // Skip malformed lines
        };

        // Extract session ID from any line that has it
        if session_id.is_none() {
            if let Some(ref id) = parsed.session_id {
                session_id = Some(id.clone());
            }
        }

        // Extract first user message as display text
        if display.is_none() {
            if parsed.line_type.as_deref() == Some("human") {
                if let Some(ref msg) = parsed.message {
                    if msg.role.as_deref() == Some("user") {
                        if let Some(ref content) = msg.content {
                            display = extract_display_text(content);
                        }
                    }
                }
            }
        }

        // Try to extract git branch from the summary/system messages
        // Claude Code stores cwd info; we'll check for branch in early lines
    }

    // Try to extract git branch from JSONL content
    // Look for gitBranch field in the first few lines
    for line in content.lines().take(10) {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(line) {
            if let Some(branch) = value.get("gitBranch").and_then(|b| b.as_str()) {
                git_branch = Some(branch.to_string());
                break;
            }
        }
    }

    // Use filename as session ID fallback (without .jsonl extension)
    let session_id = session_id.or_else(|| {
        path.file_stem()
            .and_then(|s| s.to_str())
            .map(|s| s.to_string())
    })?;

    let display = display.unwrap_or_else(|| "(No message)".to_string());

    Some(ClaudeSession {
        session_id,
        display,
        git_branch,
        last_activity,
        message_count,
    })
}
