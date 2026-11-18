import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_ITEMS, normalizeItem } from "@/lib/format";

/** Items already used in the shop (most used first), then the default list. */
export const getItemSuggestions = cache(async (): Promise<string[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("alteration_pieces").select("item_type").limit(2000);
  const counts = new Map<string, number>();
  (data ?? []).forEach((r) => {
    const t = normalizeItem(r.item_type);
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  });
  const used = [...counts].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  const seen = new Set(used.map((t) => t.toLowerCase()));
  return [...used, ...DEFAULT_ITEMS.filter((d) => !seen.has(d.toLowerCase()))];
});
