import type { Metadata } from "next";
import Link from "next/link";
import { PageTitle } from "@/components/page-title";
import { createClient } from "@/lib/supabase/server";
import { daysSince, fmtDate, todayIST, tokenLabel } from "@/lib/format";
import { itemsText } from "@/lib/messages";
import { cn } from "@/lib/utils";
import { LinkPending } from "@/components/link-pending";

export const metadata: Metadata = { title: "Tailors" };

type Row = {
  id: string; item_type: string; tailor_id: string; sent_to_tailor_at: string | null;
  alteration: { id: string; token_year: number; token_no: number; promised_date: string; customer: { name: string } };
};

export default async function TailorsPage() {
  const supabase = await createClient();
  const [{ data: tailors }, { data: out }] = await Promise.all([
    supabase.from("tailors").select("id,name,is_in_house,active").order("is_in_house", { ascending: false }).order("name"),
    supabase.from("alteration_pieces")
      .select("id,item_type,tailor_id,sent_to_tailor_at,alteration:alterations(id,token_year,token_no,promised_date,customer:customers(name))")
      .eq("status", "with_tailor").order("sent_to_tailor_at", { ascending: true }).limit(1000),
  ]);
  const rows = (out ?? []) as unknown as Row[];
  const shown = (tailors ?? []).filter((t) => t.active || rows.some((r) => r.tailor_id === t.id));
  const today = todayIST();

  return (
    <>
      <PageTitle sub="What is with each tailor, and for how long">Tailors</PageTitle>
      <div className="space-y-4">
        {shown.map((t) => {
          const mine = rows.filter((r) => r.tailor_id === t.id);
          // One line per customer visit; the number is how long the oldest of its items has been out.
          const groups = new Map<string, { alt: Row["alteration"]; items: string[]; since: string | null }>();
          mine.forEach((r) => {
            const g = groups.get(r.alteration.id) ?? { alt: r.alteration, items: [], since: r.sent_to_tailor_at };
            g.items.push(r.item_type);
            if (r.sent_to_tailor_at && (!g.since || r.sent_to_tailor_at < g.since)) g.since = r.sent_to_tailor_at;
            groups.set(r.alteration.id, g);
          });
          const list = [...groups.values()].sort((x, y) => (x.since ?? "").localeCompare(y.since ?? ""));
          return (
            <section key={t.id} aria-label={t.name} className="rounded-2xl border border-border bg-card p-3">
              <h2 className="flex items-center justify-between font-semibold">
                <span>{t.name}{!t.active && <span className="ml-2 text-xs font-normal text-muted">(inactive)</span>}</span>
                <span className="rounded-full bg-border px-2.5 py-0.5 text-sm" title="Items with this tailor">{mine.length} item{mine.length === 1 ? "" : "s"}</span>
              </h2>
              {list.length === 0 ? (
                <p className="mt-2 text-sm text-muted">Nothing with them right now.</p>
              ) : (
                <ul className="mt-2 divide-y divide-border">
                  {list.map((g) => {
                    const d = daysSince(g.since);
                    const late = g.alt.promised_date < today;
                    const label = tokenLabel(g.alt.token_year, g.alt.token_no);
                    return (
                      <li key={g.alt.id}>
                        <Link href={`/a/${label}`} className="relative flex items-center justify-between gap-3 py-2.5 active:opacity-80">
                          <LinkPending />
                          <span className="min-w-0">
                            <span className="font-bold">#{label}</span> <span className="font-medium">{g.alt.customer.name}</span>
                            <span className="block truncate text-sm text-muted">{itemsText(g.items)}</span>
                            <span className={cn("block text-xs", late ? "font-semibold text-danger" : "text-muted")}>Due {fmtDate(g.alt.promised_date)}{late && " · overdue"}</span>
                          </span>
                          <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold", d >= 7 ? "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100" : "bg-border")}>
                            {d === 0 ? "today" : `${d} day${d > 1 ? "s" : ""}`}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
