import { buildWaLink, fillTemplate } from "@/lib/whatsapp";
import { daysSince, fmtDate, fmtDateTime, isOverdue, tokenLabel } from "@/lib/format";

export type Template = { key: string; label: string; body: string; active: boolean };
export type Shop = { shop_name: string; shop_phone: string; public_base_url: string; reminder_after_days: number };

export type MsgAlteration = {
  token_year: number; token_no: number; status: string; public_slug: string; promised_date: string;
  ready_at: string | null; delivered_at: string | null; collected_by_name: string | null;
  customerName: string; customerPhone: string; itemTypes: string[];
};

/** "Blazer + 2 Trouser" */
export function itemsText(types: string[]): string {
  const counts = new Map<string, number>();
  types.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1));
  return [...counts].map(([t, n]) => (n > 1 ? `${n} ${t}` : t)).join(" + ");
}

export function publicLink(shop: Pick<Shop, "public_base_url">, slug: string): string {
  return `${shop.public_base_url.replace(/\/+$/, "")}/t/${slug}`;
}

export type MsgButton = {
  key: string; label: string; href: string | null; disabledReason: string | null;
};

const BUTTON_LABEL: Record<string, string> = {
  receipt: "Send receipt on WhatsApp",
  ready: "Tell customer it is ready",
  reminder: "Send pickup reminder",
  delay: "Send delay notice",
  delivered: "Send collection confirmation",
};

/** Which message buttons make sense for this token right now, with prebuilt wa.me links. */
export function messageButtons(a: MsgAlteration, templates: Template[], shop: Shop): MsgButton[] {
  const keys: string[] = [];
  if (a.status === "received" || a.status === "with_tailor") {
    keys.push("receipt");
    if (isOverdue(a.promised_date, a.status)) keys.push("delay");
  } else if (a.status === "ready") {
    keys.push("ready");
    if (daysSince(a.ready_at) >= shop.reminder_after_days) keys.push("reminder");
  } else if (a.status === "delivered") {
    keys.push("delivered");
  }

  const vars: Record<string, string> = {
    customer_name: a.customerName,
    token: tokenLabel(a.token_year, a.token_no),
    items: itemsText(a.itemTypes),
    promised_date: fmtDate(a.promised_date),
    link: publicLink(shop, a.public_slug),
    delivered_at: a.delivered_at ? fmtDateTime(a.delivered_at) : "",
    collected_by: a.collected_by_name ?? a.customerName,
    shop_name: shop.shop_name,
    shop_phone: shop.shop_phone,
  };
  const phoneOk = /^\d{10}$/.test(a.customerPhone);

  return keys.flatMap((key) => {
    const t = templates.find((x) => x.key === key && x.active);
    if (!t) return [];
    return [{
      key,
      label: BUTTON_LABEL[key] ?? t.label,
      href: phoneOk ? buildWaLink(a.customerPhone, fillTemplate(t.body, vars)) : null,
      disabledReason: phoneOk ? null : "This customer's phone number is missing or invalid. Ask the owner to fix it.",
    }];
  });
}

/** Build the receipt message (used right after saving a new entry). */
export function receiptButton(a: MsgAlteration, templates: Template[], shop: Shop): MsgButton | null {
  return messageButtons({ ...a, status: "received" }, templates, shop).find((b) => b.key === "receipt") ?? null;
}
