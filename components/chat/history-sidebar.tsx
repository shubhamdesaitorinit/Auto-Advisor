"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SessionSummary {
  id: string;
  createdAt: number;
  lastActiveAt: number;
  messageCount: number;
  preview: string;
}

interface HistorySidebarProps {
  userId: string;
  currentSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
}

export function HistorySidebar({
  userId,
  currentSessionId,
  onSelectSession,
  onNewChat,
}: HistorySidebarProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [open, setOpen] = useState(false);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions", {
        headers: { "x-user-id": userId },
      });
      if (res.ok) {
        setSessions(await res.json());
      }
    } catch {
      // silently fail
    }
  }, [userId]);

  useEffect(() => {
    if (open) fetchSessions();
  }, [open, fetchSessions]);

  function handleSelect(id: string) {
    onSelectSession(id);
    setOpen(false);
  }

  function handleNewChat() {
    onNewChat();
    setOpen(false);
  }

  function formatTime(ts: number) {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-CA", { day: "numeric", month: "short" });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center rounded-lg h-8 w-8 hover:bg-accent transition-colors"
        title="Chat history"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-80 p-0 flex flex-col">
          <SheetHeader className="px-4 py-4 border-b border-border/50">
            <SheetTitle className="text-base font-semibold">Conversations</SheetTitle>
          </SheetHeader>
          <div className="px-3 py-3">
            <Button
              variant="outline"
              className="w-full text-sm h-9 rounded-lg border-dashed"
              onClick={handleNewChat}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New Conversation
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="px-2 pb-4">
              {sessions.length === 0 && (
                <div className="text-center py-12 px-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted mx-auto mb-3">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <p className="text-sm text-muted-foreground">No conversations yet</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Start chatting to see your history here
                  </p>
                </div>
              )}
              {sessions.map((s) => {
                const isActive = s.id === currentSessionId;
                return (
                  <button
                    key={s.id}
                    onClick={() => handleSelect(s.id)}
                    className={`w-full text-left rounded-lg px-3 py-2.5 mb-0.5 transition-all duration-150 ${
                      isActive
                        ? "bg-primary/10 border border-primary/20"
                        : "hover:bg-muted border border-transparent"
                    }`}
                  >
                    <p className={`text-sm font-medium truncate ${isActive ? "text-primary" : ""}`}>
                      {s.preview}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-xs text-muted-foreground">
                        {s.messageCount} msgs
                      </span>
                      <span className="text-xs text-muted-foreground/40">\u00B7</span>
                      <span className="text-xs text-muted-foreground">
                        {formatTime(s.lastActiveAt)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
}
