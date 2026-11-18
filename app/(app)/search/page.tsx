import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { PageTitle } from "@/components/page-title";
import { StatusBadge, inputCls } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtDateTime, tokenLabel } from "@/lib/format";
import { itemsText } from "@/lib/messages";
import { summarizeItems } from "@/lib/items";
import { LinkPending } from "@/components/link-pending";

export const metadata: Metadata = { title: "Search" };

type Piece = {
  item_type: string; status: string; delivered_at: string | null; collected_by_name: string | null; tailor: { name: string } | null;
};
type Tok = {
  id: string; token_year: number; token_no: number; status: string; promised_date: string; created_at: string;
  delivered_at: string | null; collected_by_name: string | null; cancel_reason: string | null;
  alteration_pieces: Piece[];
};

/** "Shirt + Trouser delivered to Papa on 18 Nov, 4:12 pm" — one line per handover. */
function handovers(pieces: Piece[]): string[] {
  const groups = new Map<string, Piece[]>();
  pieces.filter((p) => p.status === "delivered" && p.delivered_at).forEach((p) => {
    const k = `${p.delivered_at}|${p.collected_by_name}`;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  });
  return [...groups.values()].sort((x, y) => (x[0].delivered_at! < y[0].delivered_at! ? -1 : 1))
    .map((g) => `${itemsText(g.map((p) => p.item_type))} delivered to ${g[0].collected_by_name} on ${fmtDateTime(g[0].delivered_at!)}`);
}
type Cust = { id: string; name: string; phone: string; alterations: Tok[] };

const TOKEN_FIELDS =
  "id,token_year,token_no,status,promised_date,created_at,delivered_at,collected_by_name,cancel_reason,alteration_pieces(item_type,status,delivered_at,collected_by_name,tailor:tailors(name))";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q: raw = "" } = await searchParams;
  const q = raw.trim().slice(0, 60);
  let customers: Cust[] = [];
  let mode = "";

  if (q) {
    const supabase = await createClient();
    const customerSelect = `id,name,phone,alterations(${TOKEN_FIELDS})`;
    const tokenWithYear = q.match(/^#?(\d{2})-(\d{1,6})$/);
    const digits = q.replace(/\D/g, "");
    const digitsOnly = /^[\d\s+-]+$/.test(q) && !tokenWithYear;

    let ids: string[] = [];
    if (tokenWithYear || (digitsOnly && digits.length <= 4)) {
      mode = "token";
      let query = supabase.from("alterations").select("customer_id").eq("token_no", Number(tokenWithYear ? tokenWithYear[2] : digits));
      if (tokenWithYear) query = query.eq("token_year", 2000 + Number(tokenWithYear[1]));
      const { data } = await query.limit(20);
      ids = [...new Set((data ?? []).map((r) => r.customer_id as string))];
    }
    let cq = supabase.from("customers").select(customerSelect).order("name").limit(20)
      .order("created_at", { referencedTable: "alterations", ascending: false });
    if (mode === "token") {
      cq = cq.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    } else if (digitsOnly) {
      mode = "phone";
      cq = cq.ilike("phone", `%${digits}%`);
    } else {
      mode = "name";
      // Every word must appear in the name, in any order ("rajesh jain" finds "Rajesh kumar Jain").
      // Honorifics such as "ji" are ignored so "Rajesh ji Jain" still finds the customer.
      const words = q.replace(/[%_,()\\]/g, " ").split(/\s+/).filter((w) => w && !/^(ji|sir|bhai|shri|mr|mrs)$/i.test(w));
      for (const w of words.length ? words : [q]) cq = cq.ilike("name", `%${w}%`);
    }
    const { data } = await cq;
    customers = (data ?? []) as unknown as Cust[];
  }

  return (
    <>
      <PageTitle sub="Phone number, customer name or token number">Search</PageTitle>
      <form action="/search" method="get" role="search" className="mb-5 flex gap-2">
        <input name="q" defaultValue={q} type="search" inputMode="search" autoComplete="off" aria-label="Search"
          placeholder="98290…  or  Anita  or  26-101" className={inputCls} />
        <button type="submit" aria-label="Search" className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground active:opacity-80">
          <Search className="size-5" />
        </button>
      </form>

      {!q && <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
        Type at least part of a phone number, a name, or a token number. You will see every token for that customer, including delivered ones.</p>}
      {q && customers.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">No customer or token found for “{q}”.</p>
      )}

      <div className="space-y-5">
        {customers.map((c) => (
          <section key={c.id} aria-label={c.name}>
            <h2 className="font-semibold">{c.name} <span className="font-normal text-muted">· {c.phone}</span></h2>
            <ul className="mt-2 space-y-2">
              {c.alterations.map((t) => (
                <li key={t.id}>
                  <Link href={`/a/${tokenLabel(t.token_year, t.token_no)}`} className="relative block rounded-xl border border-border bg-card p-3 active:opacity-80">
                    <LinkPending />
                    <div className="flex items-center justify-between">
                      <span className="font-bold">#{tokenLabel(t.token_year, t.token_no)}</span>
                      <StatusBadge status={t.status} />
                    </div>
                    <p className="text-sm">{itemsText(t.alteration_pieces.filter((p) => p.status !== "cancelled").map((p) => p.item_type))}</p>
                    <p className="text-sm font-medium">{summarizeItems(t.alteration_pieces.map((p) => ({ status: p.status, tailor: p.tailor?.name ?? null })))}</p>
                    <p className="text-sm text-muted">Promised {fmtDate(t.promised_date)}</p>
                    {handovers(t.alteration_pieces).map((h) => <p key={h} className="text-sm font-medium">{h}</p>)}
                    {t.status === "cancelled" && <p className="text-sm text-muted">Cancelled: {t.cancel_reason}</p>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
