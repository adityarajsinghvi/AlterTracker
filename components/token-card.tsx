import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { WaButton } from "@/components/wa-button";
import { daysSince, fmtDate, fmtDateTime, todayIST, tokenLabel } from "@/lib/format";
import { summarizeItems } from "@/lib/items";
import { currentTap, itemsText, messageButtons, type Shop, type Template } from "@/lib/messages";
import { cn } from "@/lib/utils";

export type CardPiece = {
  item_type: string; status: string; status_at: string; ready_at: string | null; sent_to_tailor_at: string | null;
  delivered_at: string | null; collected_by_name: string | null; tailor: { name: string } | null;
};
export type CardRow = {
  id: string; token_year: number; token_no: number; status: string; promised_date: string; public_slug: string; created_at: string;
  customer: { name: string; phone: string };
  alteration_pieces: CardPiece[];
  messages: { id: number; template_key: string; opened_at: string; who: { name: string } | null }[];
};

export const CARD_SELECT =
  "id,token_year,token_no,status,promised_date,public_slug,created_at," +
  "customer:customers(name,phone)," +
  "alteration_pieces(item_type,status,status_at,ready_at,sent_to_tailor_at,delivered_at,collected_by_name,tailor:tailors(name))," +
  "messages:message_log(id,template_key,opened_at,who:profiles(name))";

const STALE_DAYS = 30;
export type Tab = "today" | "overdue" | "received" | "tailor" | "ready";

export function TokenCard({ a, templates, shop, tab }: { a: CardRow; templates: Template[]; shop: Shop; tab: Tab }) {
  const label = tokenLabel(a.token_year, a.token_no);
  const pieces = a.alteration_pieces;
  const live = pieces.filter((p) => p.status !== "cancelled");
  const of = (s: string) => pieces.filter((p) => p.status === s);
  const pending = [...of("received"), ...of("with_tailor")];
  const overdue = pending.length > 0 && a.promised_date < todayIST();
  const oldest = (list: CardPiece[], f: (p: CardPiece) => string | null) => list.map(f).filter((x): x is string => !!x).sort()[0] ?? null;
  const readyDays = daysSince(oldest(of("ready"), (p) => p.ready_at));
  const outDays = daysSince(oldest(of("with_tailor"), (p) => p.sent_to_tailor_at));
  const shopDays = daysSince(oldest(of("received"), (p) => p.status_at));
  const stale = of("ready").length > 0 && readyDays >= STALE_DAYS;
  const when = tab === "ready" ? `Ready ${readyDays === 0 ? "today" : `${readyDays}d`}`
    : tab === "tailor" ? `Out ${outDays === 0 ? "today" : `${outDays}d`}`
    : tab === "received" ? `In shop ${shopDays === 0 ? "today" : `${shopDays}d`}` : null;

  const msgs = [...a.messages].sort((x, y) => y.id - x.id);
  const buttons = messageButtons({
    token_year: a.token_year, token_no: a.token_no, public_slug: a.public_slug, promised_date: a.promised_date,
    customerName: a.customer.name, customerPhone: a.customer.phone,
    items: pieces.map((p) => ({ name: p.item_type, status: p.status, ready_at: p.ready_at, delivered_at: p.delivered_at, collected_by: p.collected_by_name })),
  }, templates, shop);
  // One helpful button per card: on the Ready tab the "ready"/reminder message, elsewhere the delay notice.
  const ready = buttons.find((b) => b.key === "ready");
  const reminder = buttons.find((b) => b.key === "reminder");
  const btn = tab === "ready"
    ? (ready && !currentTap(msgs, ready) ? ready : reminder ?? ready)
    : buttons.find((b) => b.key === "delay");
  const last = btn ? currentTap(msgs, btn) : undefined;

  return (
    <li className={cn("rounded-xl border bg-card", stale ? "border-amber-500 ring-1 ring-amber-500" : overdue ? "border-danger/50" : "border-border")}>
      <Link href={`/a/${label}`} prefetch={false} className="block p-3 active:opacity-80">
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold">#{label}</span>
          {when && <span className="text-sm text-muted">{when}</span>}
        </div>
        <p className="mt-1 font-medium">{a.customer.name}</p>
        <p className="text-sm text-muted">{itemsText(live.map((p) => p.item_type))}</p>
        <p className="mt-1 text-sm font-medium">{summarizeItems(pieces.map((p) => ({ status: p.status, tailor: p.tailor?.name ?? null })))}</p>
        <p className={overdue ? "text-sm font-semibold text-danger" : "text-sm text-muted"}>
          Due {fmtDate(a.promised_date)}{overdue && " · overdue"}
        </p>
        {stale && (
          <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-amber-700 dark:text-amber-300">
            <AlertTriangle className="size-4" aria-hidden /> Waiting {readyDays} days. Not collected
          </p>
        )}
      </Link>
      {btn && (
        <div className="px-3 pb-3">
          <WaButton compact alterationId={a.id} templateKey={btn.key} label={btn.label} href={btn.href}
            disabledReason={btn.disabledReason}
            lastSent={last ? { by: last.who?.name ?? "—", at: fmtDateTime(last.opened_at) } : null} />
        </div>
      )}
    </li>
  );
}
