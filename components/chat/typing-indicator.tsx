"use client";

export function TypingIndicator() {
  return (
    <div className="flex gap-2.5 mb-4 animate-fade-in-up">
      <div className="shrink-0 mt-1">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary text-[10px] font-bold">
          AA
        </div>
      </div>
      <div className="flex items-center gap-1.5 py-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="block h-1.5 w-1.5 rounded-full bg-muted-foreground/40"
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
