import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/session";
import { STATUS_LABEL, fmtDate, fmtDateTime, isOverdue, parseToken, rupees, tokenLabel, daysSince } from "@/lib/format";
import type { Status, Tailor } from "@/lib/types";
import { StatusBadge } from "@/components/ui";
import { PieceCard, type PieceView } from "./piece-card";
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
  const me = await getMe();
  const supabase = await createClient();

  const { data: a } = await supabase
    .from("alterations")
    .select(`*, customer:customers(id,name,phone), tailor:tailors(name),
      creator:profiles!alterations_created_by_fkey(name), deliverer:profiles!alterations_delivered_by_fkey(name),
      pieces:alteration_pieces(*), events:alteration_events(*, actor:profiles(name))`)
    .eq("token_year", parsed.year).eq("token_no", parsed.no).maybeSingle();
  if (!a) notFound();

  const { data: tailors } = await supabase.from("tailors").select("id,name,is_in_house").eq("active", true)
    .order("is_in_house", { ascending: false }).order("name");

  const pieces = [...(a.pieces as (PieceView & { sort: number; photo_paths: string[] })[])].sort((x, y) => x.sort - y.sort);
  const events = [...(a.events as EventRow[])].sort((x, y) => y.id - x.id);

  const paths = [...pieces.flatMap((p) => p.photo_paths), ...events.map((e) => e.photo_path).filter((x): x is string => !!x)];
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await supabase.storage.from("item-photos").createSignedUrls(paths, 3600);
    data?.forEach((s) => { if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl); });
  }

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

      <section aria-label="History">
        <h2 className="mb-2 text-lg font-semibold">History</h2>
        <ol className="space-y-3 border-l-2 border-border pl-4">
          {events.map((e) => (
            <li key={e.id} className="relative">
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
            </li>
          ))}
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
