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
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center rounded-md h-8 w-8 hover:bg-accent hover:text-accent-foreground transition-colors"
        title="Chat history"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 8v4l3 3" />
          <circle cx="12" cy="12" r="10" />
        </svg>
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="left" className="w-80 p-0">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle className="text-sm">Chat History</SheetTitle>
        </SheetHeader>
        <div className="px-4 py-2">
          <Button
            variant="outline"
            className="w-full text-sm"
            onClick={handleNewChat}
          >
            + New Chat
          </Button>
        </div>
        <ScrollArea className="flex-1 h-[calc(100vh-120px)]">
          <div className="px-2 py-1">
            {sessions.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">
                No conversations yet
              </p>
            )}
            {sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => handleSelect(s.id)}
                className={`w-full text-left rounded-lg px-3 py-2.5 mb-1 transition-colors hover:bg-muted ${
                  s.id === currentSessionId
                    ? "bg-muted border border-border"
                    : ""
                }`}
              >
                <p className="text-sm font-medium truncate">
                  {s.preview}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {s.messageCount} messages · {formatTime(s.lastActiveAt)}
                </p>
              </button>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
      </Sheet>
    </>
  );
}
