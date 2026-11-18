import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/session";
import { toCsv } from "@/lib/csv";
import { todayIST, tokenLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

const TZ = "Asia/Kolkata";
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("sv-SE", { timeZone: TZ }).slice(0, 16) : ""; // 2026-11-18 17:59
const STAGE: Record<string, string> = {
  received: "At shop", with_tailor: "At alter", ready: "Ready (at shop)", delivered: "Delivered", cancelled: "Cancelled",
};
const MSG: Record<string, string> = { receipt: "Receipt", ready: "Ready", reminder: "Reminder", delay: "Delay notice", delivered: "Delivered" };
const tok = (a: { token_year: number; token_no: number }) => tokenLabel(a.token_year, a.token_no);

/** Reads a whole table, 1000 rows at a time. */
async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const me = await getMe();
  if (me.role !== "owner") return new Response("Only the owner can export data.", { status: 403 });
  const { kind } = await params;
  const supabase = await createClient();
  let header: string[]; let rows: unknown[][];

  try {
    if (kind === "items") {
      const data = await all<any>((a, b) => supabase.from("alteration_pieces")
        .select(`id,item_type,work_notes,status,sent_to_tailor_at,ready_at,delivered_at,collected_by_name,redo_count,cancel_reason,sort,
          tailor:tailors(name),
          alteration:alterations(token_year,token_no,created_at,promised_date,charge,paid,rack_label,customer:customers(name,phone),creator:profiles!alterations_created_by_fkey(name))`)
        .order("id").range(a, b));
      data.sort((x, y) => x.alteration.token_year - y.alteration.token_year || x.alteration.token_no - y.alteration.token_no || x.sort - y.sort);
      header = ["Token", "Entry created", "Customer", "Phone", "Item", "Work to do", "Status", "Tailor", "Sent to alter", "Ready at", "Delivered at",
        "Delivered to", "Redos", "Promised date", "Charge", "Paid", "Rack", "Entered by", "Cancel reason"];
      rows = data.map((p) => [tok(p.alteration), when(p.alteration.created_at), p.alteration.customer.name, p.alteration.customer.phone, p.item_type,
        p.work_notes, STAGE[p.status] ?? p.status, p.tailor?.name, when(p.sent_to_tailor_at), when(p.ready_at), when(p.delivered_at),
        p.collected_by_name, p.redo_count, p.alteration.promised_date, p.alteration.charge, p.alteration.charge == null ? "" : p.alteration.paid ? "Yes" : "No",
        p.alteration.rack_label, p.alteration.creator?.name, p.cancel_reason]);
    } else if (kind === "history") {
      const data = await all<any>((a, b) => supabase.from("alteration_events")
        .select("id,created_at,kind,from_status,to_status,note,piece_ids,actor:profiles(name),alteration:alterations(token_year,token_no,customer:customers(name),alteration_pieces(id,item_type))")
        .order("id").range(a, b));
      header = ["Time", "Token", "Customer", "Who", "What", "From", "To", "Items", "Note"];
      rows = data.map((e) => [when(e.created_at), tok(e.alteration), e.alteration.customer.name, e.actor?.name, e.kind === "status" ? "Status change" : "Edit",
        e.from_status ? STAGE[e.from_status] : "", e.to_status ? STAGE[e.to_status] : "",
        (e.piece_ids ?? []).map((id: string) => e.alteration.alteration_pieces.find((p: any) => p.id === id)?.item_type ?? "").filter(Boolean).join(" + "), e.note]);
    } else if (kind === "customers") {
      const data = await all<any>((a, b) => supabase.from("customers").select("id,name,phone,notes,created_at,alterations(count)").order("created_at").range(a, b));
      header = ["Name", "Phone", "First seen", "Visits", "Notes"];
      rows = data.map((c) => [c.name, c.phone, when(c.created_at), c.alterations?.[0]?.count ?? 0, c.notes]);
    } else if (kind === "whatsapp") {
      const data = await all<any>((a, b) => supabase.from("message_log")
        .select("id,opened_at,template_key,who:profiles(name),alteration:alterations(token_year,token_no,customer:customers(name))").order("id").range(a, b));
      header = ["Time", "Token", "Customer", "Message", "Opened by"];
      rows = data.map((m) => [when(m.opened_at), tok(m.alteration), m.alteration.customer.name, MSG[m.template_key] ?? m.template_key, m.who?.name]);
    } else {
      return new Response("Unknown export.", { status: 404 });
    }
  } catch (e) {
    return new Response(`Export failed: ${(e as Error).message}`, { status: 500 });
  }

  return new Response(toCsv(header, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="altertracker-${kind}-${todayIST()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
