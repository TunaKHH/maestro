import { GitBranch, Loader2, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { getClaudeSessions, type ClaudeSession } from "@/lib/claudeSessions";

interface ForkSessionPickerProps {
  projectPath: string;
  onSelect: (session: ClaudeSession) => void;
  onClose: () => void;
}

/** Formats a timestamp as a relative time string (e.g., "2h ago", "3d ago"). */
function formatRelativeTime(timestampMs: number): string {
  const now = Date.now();
  const diffMs = now - timestampMs;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffDay > 0) return `${diffDay}d ago`;
  if (diffHour > 0) return `${diffHour}h ago`;
  if (diffMin > 0) return `${diffMin}m ago`;
  return "just now";
}

export function ForkSessionPicker({ projectPath, onSelect, onClose }: ForkSessionPickerProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [sessions, setSessions] = useState<ClaudeSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Fetch sessions on mount
  useEffect(() => {
    setIsLoading(true);
    setError(null);
    getClaudeSessions(projectPath)
      .then((data) => {
        setSessions(data);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch Claude sessions:", err);
        setError(typeof err === "string" ? err : "Failed to load sessions");
        setIsLoading(false);
      });
  }, [projectPath]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Filter sessions by search query
  const filteredSessions = sessions.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.display.toLowerCase().includes(q) ||
      (s.gitBranch && s.gitBranch.toLowerCase().includes(q))
    );
  });

  const selectedSession = sessions.find((s) => s.sessionId === selectedId);

  const handleConfirm = () => {
    if (selectedSession) {
      onSelect(selectedSession);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="flex w-full max-w-lg flex-col rounded-lg border border-maestro-border bg-maestro-bg shadow-2xl"
        style={{ maxHeight: "70vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-maestro-border px-4 py-3">
          <h2 className="text-sm font-semibold text-maestro-text">Fork Session</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-maestro-muted transition-colors hover:bg-maestro-card hover:text-maestro-text"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-maestro-border px-4 py-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-maestro-muted" />
            <input
              type="text"
              placeholder="Search sessions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded border border-maestro-border bg-maestro-surface py-2 pl-8 pr-3 text-sm text-maestro-text placeholder:text-maestro-muted focus:border-maestro-accent focus:outline-none"
              autoFocus
            />
          </div>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 px-4 py-8 text-maestro-muted">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Loading sessions...</span>
            </div>
          )}

          {error && (
            <div className="px-4 py-8 text-center text-sm text-maestro-red">
              {error}
            </div>
          )}

          {!isLoading && !error && filteredSessions.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-maestro-muted">
              {searchQuery ? `No sessions match "${searchQuery}"` : "No Claude Code sessions found for this project"}
            </div>
          )}

          {!isLoading && !error && filteredSessions.map((session) => {
            const isSelected = session.sessionId === selectedId;
            return (
              <button
                key={session.sessionId}
                type="button"
                onClick={() => setSelectedId(isSelected ? null : session.sessionId)}
                onDoubleClick={() => onSelect(session)}
                className={`flex w-full flex-col gap-1 border-b border-maestro-border/50 px-4 py-3 text-left transition-colors ${
                  isSelected
                    ? "bg-maestro-accent/10"
                    : "hover:bg-maestro-surface"
                }`}
              >
                <span className={`text-sm leading-snug ${isSelected ? "text-maestro-text font-medium" : "text-maestro-text"}`}>
                  "{session.display}"
                </span>
                <div className="flex items-center gap-2 text-xs text-maestro-muted">
                  {session.gitBranch && (
                    <span className="flex items-center gap-1">
                      <GitBranch size={11} />
                      {session.gitBranch}
                    </span>
                  )}
                  <span>{formatRelativeTime(session.lastActivity)}</span>
                  <span>~{session.messageCount} messages</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-maestro-border px-4 py-3">
          <span className="text-xs text-maestro-muted">
            {!isLoading && !error && (
              searchQuery
                ? `Showing ${filteredSessions.length} of ${sessions.length} sessions`
                : `${sessions.length} sessions`
            )}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-maestro-border px-3 py-1.5 text-xs text-maestro-muted transition-colors hover:bg-maestro-card hover:text-maestro-text"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!selectedSession}
              className="rounded bg-maestro-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-maestro-accent/80 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Fork
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
