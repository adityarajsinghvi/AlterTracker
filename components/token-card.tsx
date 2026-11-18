import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { StatusBadge } from "@/components/ui";
import { WaButton } from "@/components/wa-button";
import { daysSince, fmtDate, fmtDateTime, isOverdue, tokenLabel } from "@/lib/format";
import { itemsText, messageButtons, type Shop, type Template } from "@/lib/messages";
import { cn } from "@/lib/utils";

export type CardRow = {
  id: string; token_year: number; token_no: number; status: string; promised_date: string; public_slug: string;
  ready_at: string | null; sent_to_tailor_at: string | null; created_at: string;
  customer: { name: string; phone: string };
  tailor: { name: string } | null;
  alteration_pieces: { item_type: string }[];
  messages: { id: number; template_key: string; opened_at: string; who: { name: string } | null }[];
};

export const CARD_SELECT =
  "id,token_year,token_no,status,promised_date,public_slug,ready_at,sent_to_tailor_at,created_at," +
  "customer:customers(name,phone),tailor:tailors(name),alteration_pieces(item_type)," +
  "messages:message_log(id,template_key,opened_at,who:profiles(name))";

const STALE_DAYS = 30;

export function TokenCard({ a, templates, shop }: { a: CardRow; templates: Template[]; shop: Shop }) {
  const label = tokenLabel(a.token_year, a.token_no);
  const types = a.alteration_pieces.map((p) => p.item_type);
  const overdue = isOverdue(a.promised_date, a.status);
  const sinceIso = a.status === "ready" ? a.ready_at : a.status === "with_tailor" ? a.sent_to_tailor_at : a.created_at;
  const days = daysSince(sinceIso);
  const stale = a.status === "ready" && days >= STALE_DAYS;
  const msgs = [...a.messages].sort((x, y) => y.id - x.id);
  const btn = messageButtons({
    token_year: a.token_year, token_no: a.token_no, status: a.status, public_slug: a.public_slug,
    promised_date: a.promised_date, ready_at: a.ready_at, delivered_at: null, collected_by_name: null,
    customerName: a.customer.name, customerPhone: a.customer.phone, itemTypes: types,
  }, templates, shop).find((b) => b.key === "reminder" || b.key === "delay");
  const last = btn ? msgs.find((m) => m.template_key === btn.key) : undefined;

  return (
    <li className={cn("rounded-xl border bg-card", stale ? "border-amber-500 ring-1 ring-amber-500" : overdue ? "border-danger/50" : "border-border")}>
      <Link href={`/a/${label}`} className="block p-3 active:opacity-80">
        <div className="flex items-center justify-between">
          <span className="font-bold">#{label}</span>
          <StatusBadge status={a.status} />
        </div>
        <p className="mt-1 font-medium">{a.customer.name}</p>
        <p className="text-sm text-muted">{itemsText(types)}</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 text-sm">
          <span className={overdue ? "font-semibold text-danger" : "text-muted"}>
            Due {fmtDate(a.promised_date)}{overdue && " · overdue"}
          </span>
          <span className="text-muted">
            {a.tailor?.name && a.status === "with_tailor" ? `${a.tailor.name} · ` : ""}
            {a.status === "ready" ? "Ready" : a.status === "with_tailor" ? "Out" : "In"} {days === 0 ? "today" : `${days}d`}
          </span>
        </div>
        {stale && (
          <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-amber-700 dark:text-amber-300">
            <AlertTriangle className="size-4" aria-hidden /> Waiting {days} days. Not collected
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
