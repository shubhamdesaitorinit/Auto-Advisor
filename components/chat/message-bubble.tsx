"use client";

import type { UIMessage } from "ai";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  message: UIMessage;
}

function getTextContent(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function renderMarkdown(text: string) {
  return text.split("\n").map((line, i, arr) => {
    let html = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
    if (/^[-•]\s/.test(html)) {
      html = `<li class="ml-4 list-disc">${html.slice(2)}</li>`;
    }
    if (/^\d+\.\s/.test(html)) {
      html = `<li class="ml-4 list-decimal">${html.replace(/^\d+\.\s/, "")}</li>`;
    }
    return (
      <span
        key={i}
        dangerouslySetInnerHTML={{
          __html: html + (i < arr.length - 1 ? "<br/>" : ""),
        }}
      />
    );
  });
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const content = getTextContent(message);

  return (
    <div
      className={cn(
        "flex gap-2 mb-4",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      {!isUser && (
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs">
            AA
          </AvatarFallback>
        </Avatar>
      )}
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted rounded-bl-md",
        )}
      >
        {isUser ? (
          content
        ) : (
          <div className="prose prose-sm max-w-none">
            {renderMarkdown(content)}
          </div>
        )}
      </div>
    </div>
  );
}
