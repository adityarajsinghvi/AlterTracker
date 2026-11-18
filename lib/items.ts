export type ItemLite = { status: string; tailor: string | null };

/** "10 items: 2 at shop · 3 ready · 4 at alter (Mohan Tailor 3, Salim Tailor 1) · 1 delivered" */
export function summarizeItems(items: ItemLite[]): string {
  const active = items.filter((i) => i.status !== "cancelled");
  const parts: string[] = [];
  const count = (s: string) => active.filter((i) => i.status === s).length;
  if (count("received")) parts.push(`${count("received")} at shop`);
  if (count("ready")) parts.push(`${count("ready")} ready`);
  const atAlter = active.filter((i) => i.status === "with_tailor");
  if (atAlter.length) {
    const by = new Map<string, number>();
    atAlter.forEach((i) => by.set(i.tailor ?? "tailor", (by.get(i.tailor ?? "tailor") ?? 0) + 1));
    parts.push(`${atAlter.length} at alter (${[...by].map(([name, n]) => (by.size > 1 ? `${name} ${n}` : name)).join(", ")})`);
  }
  if (count("delivered")) parts.push(`${count("delivered")} delivered`);
  const cancelled = items.length - active.length;
  if (cancelled) parts.push(`${cancelled} cancelled`);
  return `${items.length} item${items.length === 1 ? "" : "s"}: ${parts.join(" · ")}`;
}
