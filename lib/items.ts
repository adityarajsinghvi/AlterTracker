export type ItemLite = { status: string; tailor: string | null };

/** "10 items: 2 received · 5 with Mohan · 2 with Salim · 1 ready" */
export function summarizeItems(items: ItemLite[]): string {
  const active = items.filter((i) => i.status !== "cancelled");
  const parts: string[] = [];
  const count = (s: string) => active.filter((i) => i.status === s).length;
  if (count("received")) parts.push(`${count("received")} received`);
  const byTailor = new Map<string, number>();
  active.filter((i) => i.status === "with_tailor").forEach((i) => byTailor.set(i.tailor ?? "tailor", (byTailor.get(i.tailor ?? "tailor") ?? 0) + 1));
  byTailor.forEach((n, name) => parts.push(`${n} with ${name}`));
  if (count("ready")) parts.push(`${count("ready")} ready`);
  if (count("delivered")) parts.push(`${count("delivered")} delivered`);
  const cancelled = items.length - active.length;
  if (cancelled) parts.push(`${cancelled} cancelled`);
  return `${items.length} item${items.length === 1 ? "" : "s"}: ${parts.join(" · ")}`;
}
