import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/session";
import { STATUS_LABEL, fmtDate, fmtDateTime, isOverdue, parseToken, rupees, tokenLabel, daysSince } from "@/lib/format";
import type { Status, Tailor } from "@/lib/types";
import { StatusBadge } from "@/components/ui";
import { PieceCard, type PieceView } from "./piece-card";
import { WaButton } from "@/components/wa-button";
import { getMessageContext } from "@/lib/message-data";
import { messageButtons } from "@/lib/messages";
import { TokenActions } from "./token-actions";

type Params = { token: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { token } = await params;
  return { title: `Token #${decodeURIComponent(token)}` };
}

type EventRow = {
  id: number; kind: string; from_status: Status | null; to_status: Status | null; note: string | null;
  photo_path: string | null; created_at: string; actor: { name: string } | null;
};

export default async function TokenPage({ params }: { params: Promise<Params> }) {
  const { token } = await params;
  const parsed = parseToken(token);
  if (!parsed) notFound();
  const supabase = await createClient();
  // Ask for everything at once (one round trip deep), then sign photo links.
  const [me, { data: a }, { data: tailors }, { templates, shop }] = await Promise.all([
    getMe(),
    supabase
    .from("alterations")
    .select(`*, customer:customers(id,name,phone), tailor:tailors(name),
      creator:profiles!alterations_created_by_fkey(name), deliverer:profiles!alterations_delivered_by_fkey(name),
      pieces:alteration_pieces(*), events:alteration_events(*, actor:profiles(name)),
      messages:message_log(id, template_key, opened_at, who:profiles(name))`)
    .eq("token_year", parsed.year).eq("token_no", parsed.no).maybeSingle(),
    supabase.from("tailors").select("id,name,is_in_house").eq("active", true)
      .order("is_in_house", { ascending: false }).order("name"),
    getMessageContext(),
  ]);
  if (!a) notFound();

  const pieces = [...(a.pieces as (PieceView & { sort: number; photo_paths: string[] })[])].sort((x, y) => x.sort - y.sort);
  const events = [...(a.events as EventRow[])].sort((x, y) => y.id - x.id);

  const paths = [...pieces.flatMap((p) => p.photo_paths), ...events.map((e) => e.photo_path).filter((x): x is string => !!x)];
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await supabase.storage.from("item-photos").createSignedUrls(paths, 3600);
    data?.forEach((s) => { if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl); });
  }

  const msgs = [...(a.messages as { id: number; template_key: string; opened_at: string; who: { name: string } | null }[])]
    .sort((x, y) => y.id - x.id);
  const buttons = messageButtons({
    token_year: a.token_year, token_no: a.token_no, status: a.status, public_slug: a.public_slug,
    promised_date: a.promised_date, ready_at: a.ready_at, delivered_at: a.delivered_at,
    collected_by_name: a.collected_by_name, customerName: a.customer.name, customerPhone: a.customer.phone,
    itemTypes: pieces.map((p) => p.item_type),
  }, templates, shop);
  const timeline = [
    ...events.map((e) => ({ at: e.created_at, sort: e.id, kind: "event" as const, e })),
    ...msgs.map((m) => ({ at: m.opened_at, sort: m.id, kind: "msg" as const, m })),
  ].sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : y.sort - x.sort));

  const label = tokenLabel(a.token_year, a.token_no);
  const overdue = isOverdue(a.promised_date, a.status);
  const closed = a.status === "delivered" || a.status === "cancelled";
  const days = daysSince(a.status === "with_tailor" ? a.sent_to_tailor_at : a.status === "ready" ? a.ready_at : a.created_at);

  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-3xl font-bold tracking-tight">#{label}</h1>
          <StatusBadge status={a.status} />
        </div>
        <p className="flex items-center gap-2 text-lg font-medium">
          {a.customer.name}
          <a href={`tel:+91${a.customer.phone}`} aria-label={`Call ${a.customer.name}`}
            className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Phone className="size-5" aria-hidden />
          </a>
          <span className="text-sm font-normal text-muted">{a.customer.phone}</span>
        </p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Promised</dt>
          <dd className={overdue ? "font-semibold text-danger" : "font-medium"}>{fmtDate(a.promised_date)}{overdue && " · overdue"}</dd>
          {!closed && <><dt className="text-muted">{STATUS_LABEL[a.status]} for</dt><dd className="font-medium">{days === 0 ? "today" : `${days} day${days > 1 ? "s" : ""}`}</dd></>}
          {a.tailor?.name && <><dt className="text-muted">Tailor</dt><dd className="font-medium">{a.tailor.name}</dd></>}
          {a.rack_label && <><dt className="text-muted">Rack</dt><dd className="font-medium">{a.rack_label}</dd></>}
          <dt className="text-muted">Charge</dt>
          <dd className="font-medium">{rupees(a.charge)}{a.charge != null && (a.paid ? " · paid" : " · unpaid")}</dd>
          {a.redo_count > 0 && <><dt className="text-muted">Redos</dt><dd className="font-medium">{a.redo_count}</dd></>}
          {a.status === "delivered" && <><dt className="text-muted">Collected by</dt><dd className="font-medium">{a.collected_by_name}</dd></>}
          {a.status === "cancelled" && <><dt className="text-muted">Cancelled</dt><dd className="font-medium">{a.cancel_reason}</dd></>}
        </dl>
      </header>

      <section aria-label="Pieces" className="space-y-3">
        {pieces.map((p) => (
          <PieceCard key={p.id} piece={p} alterationId={a.id} closed={closed}
            photoUrls={p.photo_paths.map((x) => signed.get(x)).filter((x): x is string => !!x)} />
        ))}
      </section>

      <TokenActions
        alteration={{
          id: a.id, status: a.status, promised: a.promised_date, tailorId: a.tailor_id, charge: a.charge, paid: a.paid,
          rack: a.rack_label ?? "", customerId: a.customer.id, customerName: a.customer.name, customerPhone: a.customer.phone,
          label,
        }}
        tailors={(tailors ?? []) as Tailor[]} role={me.role}
      />

      {a.status !== "cancelled" && buttons.length > 0 && (
        <section aria-label="WhatsApp" className="space-y-3">
          <h2 className="text-lg font-semibold">WhatsApp</h2>
          {buttons.map((b) => {
            const last = msgs.find((m) => m.template_key === b.key);
            return (
              <WaButton key={b.key} alterationId={a.id} templateKey={b.key} label={b.label} href={b.href}
                disabledReason={b.disabledReason}
                lastSent={last ? { by: last.who?.name ?? "—", at: fmtDateTime(last.opened_at) } : null} />
            );
          })}
          <a href={`/t/${a.public_slug}`} target="_blank" rel="noreferrer"
            className="block text-center text-sm text-primary underline">Preview customer page</a>
        </section>
      )}

      <section aria-label="History">
        <h2 className="mb-2 text-lg font-semibold">History</h2>
        <ol className="space-y-3 border-l-2 border-border pl-4">
          {timeline.map((t) => t.kind === "msg" ? (
            <li key={`m${t.m.id}`} className="relative">
              <span className="absolute -left-[1.4rem] top-1.5 size-2.5 rounded-full bg-[#128c4a]" aria-hidden />
              <p className="text-sm font-medium">Opened WhatsApp: {templates.find((x) => x.key === t.m.template_key)?.label ?? t.m.template_key}</p>
              <p className="text-xs text-muted">{t.m.who?.name ?? "—"} · {fmtDateTime(t.m.opened_at)}</p>
            </li>
          ) : (() => { const e = t.e; return (
            <li key={`e${e.id}`} className="relative">
              <span className="absolute -left-[1.4rem] top-1.5 size-2.5 rounded-full bg-primary" aria-hidden />
              <p className="text-sm font-medium">
                {e.kind === "status" && e.to_status
                  ? e.from_status ? `${STATUS_LABEL[e.from_status]} → ${STATUS_LABEL[e.to_status]}` : STATUS_LABEL[e.to_status]
                  : e.note}
              </p>
              {e.kind === "status" && e.note && <p className="text-sm">{e.note}</p>}
              {e.photo_path && signed.get(e.photo_path) && (
                <a href={signed.get(e.photo_path)} target="_blank" rel="noreferrer" className="text-sm text-primary underline">Handover photo</a>
              )}
              <p className="text-xs text-muted">{e.actor?.name ?? "—"} · {fmtDateTime(e.created_at)}</p>
            </li>); })())}
          <li className="relative">
            <span className="absolute -left-[1.4rem] top-1.5 size-2.5 rounded-full bg-muted" aria-hidden />
            <p className="text-sm font-medium">Entry created</p>
            <p className="text-xs text-muted">{a.creator?.name ?? "—"} · {fmtDateTime(a.created_at)}</p>
          </li>
        </ol>
      </section>
    </article>
  );
}
