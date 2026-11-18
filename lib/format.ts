// All dates are shown in Asia/Kolkata.
const TZ = "Asia/Kolkata";

export function tokenLabel(year: number, no: number): string {
  return `${String(year % 100).padStart(2, "0")}-${no}`;
}

/** "26-142" -> {year: 2026, no: 142}; a bare "142" means the current year. */
export function parseToken(raw: string): { year: number; no: number } | null {
  const m = decodeURIComponent(raw).trim().match(/^(?:(\d{2})-)?(\d{1,6})$/);
  if (!m) return null;
  const year = m[1] ? 2000 + Number(m[1]) : Number(todayIST().slice(0, 4));
  return { year, no: Number(m[2]) };
}

export function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function fmtDate(iso: string): string {
  const d = new Date(iso.length === 10 ? iso + "T00:00:00+05:30" : iso);
  return d.toLocaleDateString("en-IN", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: TZ, day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
  });
}

export function daysSince(iso: string | null): number {
  if (!iso) return 0;
  const a = new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
  return Math.max(0, Math.round((Date.parse(todayIST()) - Date.parse(a)) / 86400000));
}

export function isOverdue(promised: string, status: string): boolean {
  return (status === "received" || status === "with_tailor") && promised < todayIST();
}

/** The 3 steps: At shop -> At alter -> Delivered. "ready" is not a step: it is the green "Ready" tag on an item that is at the shop. */
export const STATUS_LABEL: Record<string, string> = {
  received: "At shop",
  with_tailor: "At alter",
  ready: "Ready",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/** Starting suggestions; items the shop has used before are added automatically. */
export const DEFAULT_ITEMS = [
  "Suit", "Blazer", "Sherwani", "Jodhpuri", "Kurta", "Trouser", "Shirt", "Waistcoat", "Coat", "Pant", "Jeans",
  "Pajama", "Pathani", "Nehru Jacket", "Indo-Western", "Tuxedo", "Overcoat", "T-Shirt", "Safari Suit", "Achkan",
];

/** "nehru  JACKET" -> "Nehru Jacket" */
export function normalizeItem(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

export function itemsSummary(types: string[]): string {
  return types.join(" + ");
}

export function rupees(n: number | string | null): string {
  if (n === null || n === undefined || n === "") return "Free";
  return "₹" + Number(n).toLocaleString("en-IN");
}
