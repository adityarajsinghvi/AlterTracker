"use client";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { inputCls } from "@/components/ui";

/** Type what the item is; matching suggestions appear underneath and can be tapped. */
export function ItemInput({ id, value, onChange, suggestions, label = "Item" }: {
  id: string; value: string; onChange: (v: string) => void; suggestions: string[]; label?: string;
}) {
  const [focused, setFocused] = useState(false);
  const q = value.trim().toLowerCase();

  const matches = useMemo(() => {
    const rest = suggestions.filter((s) => s.toLowerCase() !== q);
    if (!q) return rest.slice(0, 8);
    const starts = rest.filter((s) => s.toLowerCase().startsWith(q));
    const words = rest.filter((s) => !s.toLowerCase().startsWith(q) && s.toLowerCase().includes(q));
    return [...starts, ...words].slice(0, 6);
  }, [q, suggestions]);

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
      <input
        id={id} value={value} maxLength={40} autoComplete="off" autoCapitalize="words" enterKeyHint="next"
        placeholder="Type: Suit, Blazer, Nehru Jacket…" className={inputCls}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 150)}
        aria-describedby={`${id}-hint`}
      />
      <div id={`${id}-hint`} className={cn("mt-2 flex flex-wrap gap-2", !(focused && matches.length) && "hidden")} role="listbox" aria-label="Suggestions">
        {matches.map((m) => (
          <button key={m} type="button" role="option" aria-selected={false}
            onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(m); setFocused(false); }}
            className="h-11 rounded-full border border-border bg-card px-4 text-sm font-medium active:bg-border">
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}
