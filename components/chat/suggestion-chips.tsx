"use client";

interface SuggestionChipsProps {
  suggestions: string[];
  onSelect: (text: string) => void;
}

export function SuggestionChips({ suggestions, onSelect }: SuggestionChipsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 px-1 scrollbar-none">
      {suggestions.map((text) => (
        <button
          key={text}
          className="shrink-0 rounded-full border border-border/60 bg-card/50 hover:bg-accent hover:border-primary/30 px-3.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-all duration-200"
          onClick={() => onSelect(text)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
