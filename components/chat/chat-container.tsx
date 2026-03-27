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
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./message-bubble";
import { TypingIndicator } from "./typing-indicator";
import { SuggestionChips } from "./suggestion-chips";
import { HistorySidebar } from "./history-sidebar";

const INITIAL_SUGGESTIONS = [
  { text: "Show me SUVs under $45K", icon: "truck" },
  { text: "Compare RAV4 vs CR-V", icon: "compare" },
  { text: "Best car for Canadian winters", icon: "snow" },
  { text: "Family car with 7+ seats", icon: "family" },
  { text: "Electric vehicles available", icon: "ev" },
  { text: "Book a test drive", icon: "calendar" },
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
  return stored.map((m) => ({
    id: `history-${m.timestamp}-${m.role}`,
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
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

  const { messages, sendMessage, setMessages, status, error } = useChat({
    id: sessionId,
    transport,
    onError: (err) => {
      console.error("Chat error:", err);
    },
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

  // Focus input on mount
  useEffect(() => {
    if (loaded) inputRef.current?.focus();
  }, [loaded]);

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

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  // Auto-resize textarea
  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="block h-2 w-2 rounded-full bg-primary/50"
              style={{
                animation: "typing-dot 1.4s infinite",
                animationDelay: `${i * 200}ms`,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto w-full">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border/50 px-5 py-4 backdrop-blur-sm bg-background/80 sticky top-0 z-10">
        <HistorySidebar
          userId={userId}
          currentSessionId={sessionId}
          onSelectSession={onSelectSession}
          onNewChat={onNewChat}
        />
        <div className="relative">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-base">
            AA
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-background" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold tracking-tight">Auto Advisor</h1>
          <p className="text-xs text-muted-foreground">AI Vehicle Consultant</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 text-sm text-muted-foreground"
          onClick={onNewChat}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Chat
        </Button>
      </header>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-4" ref={scrollRef}>
        {messages.length === 0 ? (
          <WelcomeScreen onSelect={handleSuggestion} suggestions={INITIAL_SUGGESTIONS} />
        ) : (
          <div className="space-y-1">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} onSendMessage={handleSuggestion} />
            ))}
          </div>
        )}
        {isLoading && <TypingIndicator />}
      </ScrollArea>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mb-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs px-3 py-2 flex items-center gap-2 animate-fade-in-up">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Something went wrong. Please try again.
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border/50 p-4 bg-background/80 backdrop-blur-sm">
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask about vehicles, pricing, test drives..."
              className="w-full resize-none rounded-xl border border-border bg-muted/50 px-4 py-3 text-base placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary/50 transition-all min-h-[46px] max-h-[120px]"
              rows={1}
              disabled={isLoading}
            />
          </div>
          <Button
            type="submit"
            size="icon"
            disabled={isLoading || !input.trim()}
            className="h-[46px] w-[46px] rounded-xl shrink-0 transition-all"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12 7-7 7 7" />
              <path d="M12 19V5" />
            </svg>
          </Button>
        </form>
        <p className="text-xs text-muted-foreground/50 text-center mt-2">
          Auto Advisor may make mistakes. Verify pricing at the dealership.
        </p>
      </div>
    </div>
  );
}

// ── Welcome screen ────────────────────────────────────────────────
function WelcomeScreen({
  onSelect,
  suggestions,
}: {
  onSelect: (text: string) => void;
  suggestions: { text: string; icon: string }[];
}) {
  const icons: Record<string, React.ReactNode> = {
    truck: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18h2"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>
    ),
    compare: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
    ),
    snow: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/><line x1="20" y1="16" x2="4" y2="8"/><line x1="20" y1="8" x2="4" y2="16"/></svg>
    ),
    family: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    ),
    ev: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>
    ),
    calendar: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
    ),
  };

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 animate-fade-in-up">
      {/* Logo */}
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-bold text-2xl mb-4 shadow-lg shadow-primary/20">
        AA
      </div>
      <h2 className="text-2xl font-semibold tracking-tight mb-2">Welcome to Auto Advisor</h2>
      <p className="text-base text-muted-foreground mb-8 text-center max-w-sm">
        Your AI-powered vehicle consultant. I can help you find, compare, and learn about vehicles in our Canadian inventory.
      </p>

      {/* Suggestion grid */}
      <div className="grid grid-cols-2 gap-2.5 w-full max-w-md">
        {suggestions.map((s) => (
          <button
            key={s.text}
            onClick={() => onSelect(s.text)}
            className="group flex items-start gap-3 rounded-xl border border-border/60 bg-card/50 hover:bg-accent hover:border-primary/30 px-3.5 py-3 text-left transition-all duration-200"
          >
            <span className="shrink-0 mt-0.5 text-muted-foreground group-hover:text-primary transition-colors">
              {icons[s.icon]}
            </span>
            <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors leading-relaxed">
              {s.text}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
