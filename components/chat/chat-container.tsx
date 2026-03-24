"use client";

import {
  useRef,
  useEffect,
  useMemo,
  useState,
  useCallback,
  type FormEvent,
} from "react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./message-bubble";
import { TypingIndicator } from "./typing-indicator";
import { SuggestionChips } from "./suggestion-chips";
import { HistorySidebar } from "./history-sidebar";

const INITIAL_SUGGESTIONS = [
  "Show me SUVs under 15L",
  "Compare Creta vs Seltos",
  "Book a test drive",
  "Best car for a family of 5",
];

interface ChatContainerProps {
  sessionId: string;
  userId: string;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
}

/** Convert stored session messages to UIMessage format for the chat hook. */
function toUIMessages(
  stored: Array<{ role: "user" | "assistant"; content: string; timestamp: number }>,
): UIMessage[] {
  return stored.map((m, i) => ({
    id: `history-${i}`,
    role: m.role,
    parts: [{ type: "text" as const, text: m.content }],
  }));
}

export function ChatContainer({
  sessionId,
  userId,
  onSelectSession,
  onNewChat,
}: ChatContainerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [loaded, setLoaded] = useState(false);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        headers: { "x-session-id": sessionId, "x-user-id": userId },
      }),
    [sessionId, userId],
  );

  const { messages, sendMessage, setMessages, status } = useChat({
    id: sessionId,
    transport,
  });

  const isLoading = status === "streaming" || status === "submitted";

  // Load existing session messages from the server
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sessions?id=${sessionId}`, {
          headers: { "x-user-id": userId },
        });
        if (res.ok) {
          const session = await res.json();
          if (!cancelled && session.messages?.length > 0) {
            setMessages(toUIMessages(session.messages));
          }
        }
      } catch {
        // no history to load
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, userId, setMessages]);

  // Auto-scroll on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSuggestion = useCallback(
    (text: string) => sendMessage({ text }),
    [sendMessage],
  );

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput("");
  }

  if (!loaded) return null;

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <HistorySidebar
          userId={userId}
          currentSessionId={sessionId}
          onSelectSession={onSelectSession}
          onNewChat={onNewChat}
        />
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm">
          AA
        </div>
        <div className="flex-1">
          <h1 className="text-sm font-semibold">Auto Advisor</h1>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
            Online
          </p>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-4" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="text-center py-12 space-y-4">
            <p className="text-muted-foreground text-sm">
              Welcome! I&apos;m your AI vehicle advisor. How can I help you
              today?
            </p>
            <SuggestionChips
              suggestions={INITIAL_SUGGESTIONS}
              onSelect={handleSuggestion}
            />
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {isLoading && <TypingIndicator />}
      </ScrollArea>

      {/* Input */}
      <div className="border-t p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about vehicles, pricing, test drives..."
            className="flex-1"
            disabled={isLoading}
          />
          <Button type="submit" disabled={isLoading || !input.trim()}>
            Send
          </Button>
        </form>
      </div>
    </div>
  );
}
