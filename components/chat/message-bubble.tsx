"use client";

import type { UIMessage } from "ai";
import { isToolUIPart } from "ai";
import { cn } from "@/lib/utils";
import {
  VehicleCardGrid,
  ComparisonTable,
  type VehicleData,
} from "./vehicle-card";

interface MessageBubbleProps {
  message: UIMessage;
  onSendMessage?: (text: string) => void;
}

function getTextContent(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function renderMarkdown(text: string) {
  // Split into paragraphs by double newline, then render each paragraph
  const paragraphs = text.split(/\n{2,}/);
  return paragraphs.map((para, pi) => {
    const lines = para.split("\n");
    const rendered = lines.map((line, li) => {
      // Headings
      if (/^#{1,3}\s/.test(line)) {
        const level = line.match(/^(#+)/)?.[1].length ?? 1;
        const text = line.replace(/^#+\s/, "");
        const Tag = level === 1 ? "h3" : level === 2 ? "h4" : "h5";
        return <Tag key={`${pi}-${li}`} className="font-semibold mt-2 mb-1" dangerouslySetInnerHTML={{ __html: formatInline(text) }} />;
      }
      // List items
      if (/^[-*]\s/.test(line)) {
        return <li key={`${pi}-${li}`} className="ml-4 list-disc" dangerouslySetInnerHTML={{ __html: formatInline(line.slice(2)) }} />;
      }
      if (/^\d+\.\s/.test(line)) {
        return <li key={`${pi}-${li}`} className="ml-4 list-decimal" dangerouslySetInnerHTML={{ __html: formatInline(line.replace(/^\d+\.\s/, "")) }} />;
      }
      // Regular line
      return <span key={`${pi}-${li}`} dangerouslySetInnerHTML={{ __html: formatInline(line) + (li < lines.length - 1 ? "<br/>" : "") }} />;
    });
    return <p key={pi} className="mb-2 last:mb-0">{rendered}</p>;
  });
}

function formatInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, '<code class="text-xs bg-muted/80 px-1 py-0.5 rounded">$1</code>');
}

interface ToolResult {
  toolName: string;
  data: unknown;
}

/** Extract tool results from message parts (AI SDK v6 format) */
function getToolResults(message: UIMessage): ToolResult[] {
  const results: ToolResult[] = [];

  for (const part of message.parts) {
    try {
      if (
        isToolUIPart(part) &&
        "state" in part &&
        part.state === "output-available" &&
        "output" in part
      ) {
        const toolName = part.type.startsWith("tool-")
          ? part.type.slice(5)
          : ("toolName" in part ? (part as { toolName: string }).toolName : "");
        results.push({ toolName, data: part.output });
      }
    } catch {
      // Skip malformed tool parts
    }
  }

  return results;
}

function isVehicleArray(data: unknown): data is VehicleData[] {
  return (
    Array.isArray(data) &&
    data.length > 0 &&
    typeof data[0] === "object" &&
    data[0] !== null &&
    "make" in data[0] &&
    "msrp" in data[0]
  );
}

function isComparisonResult(
  data: unknown,
): data is { vehicles: VehicleData[]; differences: string[] } {
  return (
    typeof data === "object" &&
    data !== null &&
    "vehicles" in data &&
    "differences" in data &&
    Array.isArray((data as { vehicles: unknown }).vehicles)
  );
}

function isVehicleDetail(data: unknown): data is VehicleData {
  return (
    typeof data === "object" &&
    data !== null &&
    "make" in data &&
    "msrp" in data &&
    !Array.isArray(data)
  );
}

export function MessageBubble({ message, onSendMessage }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const content = getTextContent(message);
  const toolResults = !isUser ? getToolResults(message) : [];

  const handleAskAbout = (vehicle: VehicleData) => {
    onSendMessage?.(`Tell me more about the ${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.variant}`);
  };

  const handleCompare = (vehicle: VehicleData) => {
    onSendMessage?.(`Compare the ${vehicle.make} ${vehicle.model} with similar vehicles`);
  };

  if (isUser) {
    return (
      <div className="flex justify-end mb-3 animate-fade-in-up">
        <div className="max-w-[75%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-4 py-2.5 text-base leading-relaxed shadow-sm">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2.5 mb-4 animate-fade-in-up">
      {/* Avatar */}
      <div className="shrink-0 mt-1">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary text-[10px] font-bold">
          AA
        </div>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 space-y-2">
        {/* Text content */}
        {content.trim() && (
          <div className="text-base leading-relaxed text-foreground/90">
            {renderMarkdown(content)}
          </div>
        )}

        {/* Tool results as cards */}
        {toolResults.map((tr, idx) => {
          if (
            tr.toolName === "search_vehicles" ||
            tr.toolName === "get_similar_vehicles"
          ) {
            if (isVehicleArray(tr.data)) {
              return (
                <VehicleCardGrid
                  key={idx}
                  vehicles={tr.data}
                  onAskAbout={onSendMessage ? handleAskAbout : undefined}
                  onCompare={onSendMessage ? handleCompare : undefined}
                />
              );
            }
          }

          if (tr.toolName === "compare_vehicles") {
            if (isComparisonResult(tr.data)) {
              return (
                <ComparisonTable
                  key={idx}
                  vehicles={tr.data.vehicles}
                  differences={tr.data.differences}
                />
              );
            }
          }

          if (tr.toolName === "get_vehicle_details") {
            if (isVehicleDetail(tr.data)) {
              return (
                <VehicleCardGrid
                  key={idx}
                  vehicles={[tr.data]}
                  onAskAbout={onSendMessage ? handleAskAbout : undefined}
                  onCompare={onSendMessage ? handleCompare : undefined}
                />
              );
            }
          }

          return null;
        })}
      </div>
    </div>
  );
}
