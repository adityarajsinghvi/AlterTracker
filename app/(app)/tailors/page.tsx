import type { Metadata } from "next";
import Link from "next/link";
import { PageTitle } from "@/components/page-title";
import { createClient } from "@/lib/supabase/server";
import { daysSince, fmtDate, isOverdue, tokenLabel } from "@/lib/format";
import { itemsText } from "@/lib/messages";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Tailors" };

type Row = {
  id: string; token_year: number; token_no: number; status: string; promised_date: string; sent_to_tailor_at: string | null;
  tailor_id: string; customer: { name: string }; alteration_pieces: { item_type: string }[];
};

export default async function TailorsPage() {
  const supabase = await createClient();
  const [{ data: tailors }, { data: out }] = await Promise.all([
    supabase.from("tailors").select("id,name,is_in_house,active").order("is_in_house", { ascending: false }).order("name"),
    supabase.from("alterations")
      .select("id,token_year,token_no,status,promised_date,sent_to_tailor_at,tailor_id,customer:customers(name),alteration_pieces(item_type)")
      .eq("status", "with_tailor").order("sent_to_tailor_at", { ascending: true }).limit(500),
  ]);
  const rows = (out ?? []) as unknown as Row[];
  const shown = (tailors ?? []).filter((t) => t.active || rows.some((r) => r.tailor_id === t.id));

  return (
    <>
      <PageTitle sub="What is with each tailor, and for how long">Tailors</PageTitle>
      <div className="space-y-4">
        {shown.map((t) => {
          const mine = rows.filter((r) => r.tailor_id === t.id);
          return (
            <section key={t.id} aria-label={t.name} className="rounded-2xl border border-border bg-card p-3">
              <h2 className="flex items-center justify-between font-semibold">
                <span>{t.name}{!t.active && <span className="ml-2 text-xs font-normal text-muted">(inactive)</span>}</span>
                <span className="rounded-full bg-border px-2.5 py-0.5 text-sm">{mine.length}</span>
              </h2>
              {mine.length === 0 ? (
                <p className="mt-2 text-sm text-muted">Nothing with them right now.</p>
              ) : (
                <ul className="mt-2 divide-y divide-border">
                  {mine.map((r) => {
                    const d = daysSince(r.sent_to_tailor_at);
                    const late = isOverdue(r.promised_date, r.status);
                    return (
                      <li key={r.id}>
                        <Link href={`/a/${tokenLabel(r.token_year, r.token_no)}`} className="flex items-center justify-between gap-3 py-2.5 active:opacity-80">
                          <span className="min-w-0">
                            <span className="font-bold">#{tokenLabel(r.token_year, r.token_no)}</span>{" "}
                            <span className="font-medium">{r.customer.name}</span>
                            <span className="block truncate text-sm text-muted">{itemsText(r.alteration_pieces.map((p) => p.item_type))}</span>
                            <span className={cn("block text-xs", late ? "font-semibold text-danger" : "text-muted")}>Due {fmtDate(r.promised_date)}{late && " · overdue"}</span>
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
