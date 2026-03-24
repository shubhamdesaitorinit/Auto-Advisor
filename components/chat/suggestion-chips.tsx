"use client";

import { Button } from "@/components/ui/button";

interface SuggestionChipsProps {
  suggestions: string[];
  onSelect: (text: string) => void;
}

export function SuggestionChips({ suggestions, onSelect }: SuggestionChipsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 px-1 scrollbar-none">
      {suggestions.map((text) => (
        <Button
          key={text}
          variant="outline"
          size="sm"
          className="shrink-0 rounded-full text-xs"
          onClick={() => onSelect(text)}
        >
          {text}
        </Button>
      ))}
    </div>
  );
}
