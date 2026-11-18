import type { Metadata } from "next";
import Link from "next/link";
import { PageTitle } from "@/components/page-title";
import { Btn, inputCls } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/session";
import { STATUS_LABEL, addDaysISO, fmtDateTime, todayIST, tokenLabel } from "@/lib/format";
import { itemsText } from "@/lib/messages";

export const metadata: Metadata = { title: "Activity" };

type Tok = { token_year: number; token_no: number; customer: { name: string } | null; alteration_pieces?: { id: string; item_type: string }[] } | null;
type Item = { at: string; who: string; text: string; tok: Tok; kind: "status" | "edit" | "whatsapp" | "new" | "deleted" };

const LIMIT = 200;
const MSG_LABEL: Record<string, string> = { receipt: "Receipt", ready: "Ready", reminder: "Reminder", delay: "Delay", delivered: "Delivered" };

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ staff?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  const supabase = await createClient();
  const today = todayIST();
  const dateOk = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined);
  const from = dateOk(sp.from) ?? addDaysISO(today, -6);
  const to = dateOk(sp.to) ?? today;
  const staffId = me.role === "owner" ? (sp.staff || "") : me.id; // staff only ever see their own actions
  const lo = `${from}T00:00:00+05:30`;
  const hi = `${to}T23:59:59.999+05:30`;

  const tokSel = "alteration:alterations(token_year,token_no,customer:customers(name),alteration_pieces(id,item_type))";
  let ev = supabase.from("alteration_events").select(`id,kind,from_status,to_status,note,piece_ids,created_at,actor_id,actor:profiles(name),${tokSel}`)
    .gte("created_at", lo).lte("created_at", hi).order("created_at", { ascending: false }).limit(LIMIT);
  let ml = supabase.from("message_log").select(`id,template_key,opened_at,opened_by,who:profiles(name),${tokSel}`)
    .gte("opened_at", lo).lte("opened_at", hi).order("opened_at", { ascending: false }).limit(LIMIT);
  let nw = supabase.from("alterations").select("id,token_year,token_no,created_at,created_by,who:profiles!alterations_created_by_fkey(name),customer:customers(name)")
    .gte("created_at", lo).lte("created_at", hi).order("created_at", { ascending: false }).limit(LIMIT);
  if (staffId) { ev = ev.eq("actor_id", staffId); ml = ml.eq("opened_by", staffId); nw = nw.eq("created_by", staffId); }

  let dl = supabase.from("deletion_log").select("id,deleted_at,token_label,customer_name,items,reason,deleted_by,who:profiles(name)")
    .gte("deleted_at", lo).lte("deleted_at", hi).order("deleted_at", { ascending: false }).limit(LIMIT);
  if (staffId) dl = dl.eq("deleted_by", staffId);
  const [{ data: events }, { data: msgs }, { data: news }, { data: people }, { data: dels }] = await Promise.all([
    ev, ml, nw, me.role === "owner" ? supabase.from("profiles").select("id,name").order("name") : Promise.resolve({ data: [] }), dl,
  ]);

  const items: Item[] = [
    ...(events ?? []).map((e: any): Item => ({
      at: e.created_at, who: e.actor?.name ?? "—", tok: e.alteration, kind: e.kind === "status" ? "status" : "edit",
      text: e.kind === "status"
        ? `${e.from_status ? STATUS_LABEL[e.from_status] + " → " : ""}${STATUS_LABEL[e.to_status]}${e.piece_ids?.length ? `: ${itemsText(e.piece_ids.map((id: string) => e.alteration?.alteration_pieces?.find((p: { id: string }) => p.id === id)?.item_type ?? "item"))}` : ""}${e.note ? ` (${e.note})` : ""}`
        : e.note ?? "Edited",
    })),
    ...(msgs ?? []).map((m: any): Item => ({ at: m.opened_at, who: m.who?.name ?? "—", tok: m.alteration, kind: "whatsapp", text: `Opened WhatsApp: ${MSG_LABEL[m.template_key] ?? m.template_key}` })),
    ...(news ?? []).map((n: any): Item => ({
      at: n.created_at, who: n.who?.name ?? "—", kind: "new", text: "Created token",
      tok: { token_year: n.token_year, token_no: n.token_no, customer: n.customer },
    })),
    ...(dels ?? []).map((d: any): Item => ({
      at: d.deleted_at, who: d.who?.name ?? "—", tok: null, kind: "deleted",
      text: `Deleted entry #${d.token_label} (${d.customer_name}, ${d.items ?? "no items"})${d.reason ? `: ${d.reason}` : ""}`,
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, LIMIT);

  const dot: Record<Item["kind"], string> = { status: "bg-primary", edit: "bg-muted", whatsapp: "bg-[#128c4a]", new: "bg-amber-500", deleted: "bg-red-500" };

  return (
    <>
      <PageTitle sub={me.role === "owner" ? "Everything staff did, newest first" : "Your own actions, newest first"}>Activity</PageTitle>
      <form method="get" action="/more/activity" className="mb-5 space-y-2 rounded-xl border border-border bg-card p-3">
        {me.role === "owner" && (
          <select name="staff" defaultValue={staffId} aria-label="Staff member" className={inputCls}>
            <option value="">All staff</option>
            {(people ?? []).map((p: { id: string; name: string }) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-muted">From<input type="date" name="from" defaultValue={from} max={today} className={inputCls} /></label>
          <label className="text-xs text-muted">To<input type="date" name="to" defaultValue={to} max={today} className={inputCls} /></label>
        </div>
        <Btn type="submit" variant="secondary">Show</Btn>
      </form>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">No activity in this period.</p>
      ) : (
        <ol className="space-y-3 border-l-2 border-border pl-4">
          {items.map((i, n) => (
            <li key={n} className="relative">
              <span className={`absolute -left-[1.4rem] top-1.5 size-2.5 rounded-full ${dot[i.kind]}`} aria-hidden />
              <p className="text-sm font-medium">
                {i.tok && <Link href={`/a/${tokenLabel(i.tok.token_year, i.tok.token_no)}`} className="font-bold text-primary underline">#{tokenLabel(i.tok.token_year, i.tok.token_no)}</Link>}{" "}
                {i.text}
              </p>
              {i.tok?.customer && <p className="text-xs text-muted">{i.tok.customer.name}</p>}
              <p className="text-xs text-muted">{i.who} · {fmtDateTime(i.at)}</p>
            </li>
          ))}
        </ol>
      )}
      {items.length >= LIMIT && <p className="mt-4 text-center text-xs text-muted">Showing the latest {LIMIT}. Narrow the dates to see older entries.</p>}
    </>
  );
}
