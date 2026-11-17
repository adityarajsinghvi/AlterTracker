import Link from "next/link";
import { PageTitle } from "@/components/page-title";
import { StatusBadge } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/session";
import { fmtDate, isOverdue, tokenLabel } from "@/lib/format";

export default async function HomePage() {
  const me = await getMe();
  const supabase = await createClient();
  // Temporary list until the four Home tabs arrive in Phase 4.
  const { data } = await supabase
    .from("alterations")
    .select("id,token_year,token_no,status,promised_date,customer:customers(name),alteration_pieces(item_type)")
    .in("status", ["received", "with_tailor", "ready"])
    .order("promised_date").limit(50);

  return (
    <>
      <PageTitle sub={me.role === "owner" ? "Owner" : "Staff"}>Namaste, {me.name}</PageTitle>
      <h2 className="mb-2 text-lg font-semibold">Open tokens</h2>
      {!data?.length ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">Nothing in for alteration. Tap New to add an entry.</p>
      ) : (
        <ul className="space-y-2">
          {data.map((a) => {
            const label = tokenLabel(a.token_year, a.token_no);
            const customer = a.customer as unknown as { name: string };
            const items = (a.alteration_pieces as { item_type: string }[]).map((p) => p.item_type).join(" + ");
            const over = isOverdue(a.promised_date, a.status);
            return (
              <li key={a.id}>
                <Link href={`/a/${label}`} className="block rounded-xl border border-border bg-card p-3 active:opacity-80">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">#{label}</span><StatusBadge status={a.status} />
                  </div>
                  <p className="mt-1 font-medium">{customer.name}</p>
                  <p className="text-sm text-muted">{items}</p>
                  <p className={over ? "text-sm font-semibold text-danger" : "text-sm text-muted"}>Due {fmtDate(a.promised_date)}{over && " · overdue"}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
