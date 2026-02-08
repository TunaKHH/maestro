/**
 * IPC wrapper for reading Claude Code session history.
 *
 * Used by the Fork Session feature to display a list of previous sessions
 * that can be forked from.
 */

import { invoke } from "@tauri-apps/api/core";

/** Metadata for a single Claude Code session. */
export interface ClaudeSession {
  /** Claude Code session UUID. */
  sessionId: string;
  /** First user message (truncated to 100 chars) for display. */
  display: string;
  /** Git branch active during the session, if any. */
  gitBranch: string | null;
  /** Last activity time as Unix timestamp in milliseconds. */
  lastActivity: number;
  /** Approximate message count. */
  messageCount: number;
}

/**
 * Fetches Claude Code session history for the given project path.
 * Returns sessions sorted by last activity (most recent first).
 */
export async function getClaudeSessions(projectPath: string): Promise<ClaudeSession[]> {
  return invoke<ClaudeSession[]>("get_claude_sessions", { projectPath });
}
