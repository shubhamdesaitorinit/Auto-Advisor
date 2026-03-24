"use client";

import { useEffect, useState, useCallback } from "react";
import { ChatContainer } from "@/components/chat/chat-container";

export default function Home() {
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    // Stable user ID across all tabs/sessions
    let uid = localStorage.getItem("auto-advisor-user-id");
    if (!uid) {
      uid = crypto.randomUUID();
      localStorage.setItem("auto-advisor-user-id", uid);
    }
    (() => setUserId(uid))()

    // Current session ID (per tab)
    let sid = sessionStorage.getItem("auto-advisor-session-id");
    if (!sid) {
      sid = crypto.randomUUID();
      sessionStorage.setItem("auto-advisor-session-id", sid);
    }
    (() => setSessionId(sid))()
  }, []);

  const handleSelectSession = useCallback((id: string) => {
    sessionStorage.setItem("auto-advisor-session-id", id);
    setSessionId(id);
  }, []);

  const handleNewChat = useCallback(() => {
    const id = crypto.randomUUID();
    sessionStorage.setItem("auto-advisor-session-id", id);
    setSessionId(id);
  }, []);

  if (!userId || !sessionId) return null;

  return (
    <main className="h-screen">
      <ChatContainer
        key={sessionId}
        sessionId={sessionId}
        userId={userId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
      />
    </main>
  );
}
