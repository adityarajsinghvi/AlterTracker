import { buildWaLink, fillTemplate } from "@/lib/whatsapp";
import { daysSince, fmtDate, fmtDateTime, todayIST, tokenLabel } from "@/lib/format";

export type Template = { key: string; label: string; body: string; active: boolean };
export type Shop = { shop_name: string; shop_phone: string; public_base_url: string; reminder_after_days: number };

export type MsgItem = {
  name: string; status: string; ready_at: string | null; delivered_at: string | null; collected_by: string | null;
};
export type MsgAlteration = {
  token_year: number; token_no: number; public_slug: string; promised_date: string;
  customerName: string; customerPhone: string; items: MsgItem[];
};

/** "Blazer + 2 Trouser" */
export function itemsText(types: string[]): string {
  const counts = new Map<string, { name: string; n: number }>();
  types.forEach((t) => {
    const k = t.trim().toLowerCase();
    const c = counts.get(k);
    if (c) c.n++; else counts.set(k, { name: t.trim(), n: 1 });
  });
  return [...counts.values()].map(({ name, n }) => (n > 1 ? `${n} ${name}` : name)).join(" + ");
}

export function publicLink(shop: Pick<Shop, "public_base_url">, slug: string): string {
  return `${shop.public_base_url.replace(/\/+$/, "")}/t/${slug}`;
}

export type MsgButton = {
  key: string; label: string; href: string | null; disabledReason: string | null;
  /** Taps before this time no longer count as "sent" (new items became ready / were handed over since). */
  since: string | null;
};

const LABEL: Record<string, string> = {
  receipt: "Send receipt on WhatsApp",
  ready: "Tell customer items are ready",
  reminder: "Send pickup reminder",
  delay: "Send delay notice",
  delivered: "Send collection confirmation",
};

const max = (xs: (string | null)[]) => xs.filter((x): x is string => !!x).sort().at(-1) ?? null;
const min = (xs: (string | null)[]) => xs.filter((x): x is string => !!x).sort().at(0) ?? null;

/** Which messages make sense right now, each naming only the items it is about. */
export function messageButtons(a: MsgAlteration, templates: Template[], shop: Shop): MsgButton[] {
  const live = a.items.filter((i) => i.status !== "cancelled");
  const pending = live.filter((i) => i.status === "received" || i.status === "with_tailor");
  const ready = live.filter((i) => i.status === "ready");
  const delivered = live.filter((i) => i.status === "delivered");
  const lastHandover = max(delivered.map((i) => i.delivered_at));
  const lastBatch = delivered.filter((i) => i.delivered_at === lastHandover);
  const overdue = pending.length > 0 && a.promised_date < todayIST();
  const oldestReady = min(ready.map((i) => i.ready_at));

  const keys: string[] = [];
  if (pending.length + ready.length > 0) keys.push("receipt"); // the receipt lists every item, and stays available until the visit is closed
  if (overdue) keys.push("delay");
  if (ready.length > 0) {
    keys.push("ready");
    if (daysSince(oldestReady) >= shop.reminder_after_days) keys.push("reminder");
  }
  if (delivered.length > 0) keys.push("delivered");

  const vars = (key: string): Record<string, string> => {
    const which = key === "receipt" ? live : key === "ready" || key === "reminder" ? ready : key === "delay" ? pending : lastBatch;
    const remaining = key === "delivered" ? live.filter((i) => i.status !== "delivered") : pending;
    return {
      customer_name: a.customerName,
      token: tokenLabel(a.token_year, a.token_no),
      items: itemsText(which.map((i) => i.name)),
      promised_date: fmtDate(a.promised_date),
      link: publicLink(shop, a.public_slug),
      delivered_at: lastHandover ? fmtDateTime(lastHandover) : "",
      collected_by: lastBatch[0]?.collected_by ?? a.customerName,
      shop_name: shop.shop_name,
      shop_phone: shop.shop_phone,
      more: key === "ready" ? (remaining.length ? " The rest will follow." : "")
        : key === "delivered" ? (remaining.length ? " The remaining items are still with us." : "") : "",
    };
  };
  const since = (key: string) => (key === "ready" ? max(ready.map((i) => i.ready_at)) : key === "delivered" ? lastHandover : null);
  const phoneOk = /^\d{10}$/.test(a.customerPhone);

  return [...new Set(keys)].flatMap((key) => {
    const t = templates.find((x) => x.key === key && x.active);
    if (!t) return [];
    return [{
      key,
      label: key === "ready" && ready.length > 0 ? `Tell customer ${ready.length === 1 ? "1 item is" : `${ready.length} items are`} ready` : LABEL[key] ?? t.label,
      href: phoneOk ? buildWaLink(a.customerPhone, fillTemplate(t.body, vars(key))) : null,
      disabledReason: phoneOk ? null : "This customer's phone number is missing or invalid. Ask the owner to fix it.",
      since: since(key),
    }];
  });
}

/** The receipt message for a freshly saved visit (every item is still at the shop). */
export function receiptButton(a: MsgAlteration, templates: Template[], shop: Shop): MsgButton | null {
  return messageButtons(a, templates, shop).find((b) => b.key === "receipt") ?? null;
}

/** The latest tap for this message that is still current (taps from before new items became ready don't count). */
export function currentTap<T extends { template_key: string; opened_at: string }>(msgs: T[], b: MsgButton): T | undefined {
  return msgs.find((m) => m.template_key === b.key && (!b.since || m.opened_at >= b.since));
}
