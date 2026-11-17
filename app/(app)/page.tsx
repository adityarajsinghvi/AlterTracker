import Link from "next/link";
import { PageTitle } from "@/components/page-title";
import { StatusBadge } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/session";
import { fmtDate, fmtDateTime, isOverdue, tokenLabel } from "@/lib/format";
import { WaButton } from "@/components/wa-button";
import { getMessageContext } from "@/lib/message-data";
import { itemsText, messageButtons } from "@/lib/messages";

export default async function HomePage() {
  const me = await getMe();
  const supabase = await createClient();
  // Temporary list until the four Home tabs arrive in Phase 4.
  const { data } = await supabase
    .from("alterations")
    .select("id,token_year,token_no,status,promised_date,public_slug,ready_at,customer:customers(name,phone),alteration_pieces(item_type),messages:message_log(id,template_key,opened_at,who:profiles(name))")
    .in("status", ["received", "with_tailor", "ready"])
    .order("promised_date").limit(50);

  const { templates, shop } = await getMessageContext();
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
            const customer = a.customer as unknown as { name: string; phone: string };
            const types = (a.alteration_pieces as { item_type: string }[]).map((p) => p.item_type);
            const msgs = (a.messages as unknown as { id: number; template_key: string; opened_at: string; who: { name: string } | null }[]).sort((x, y) => y.id - x.id);
            const reminder = messageButtons({
              token_year: a.token_year, token_no: a.token_no, status: a.status, public_slug: a.public_slug,
              promised_date: a.promised_date, ready_at: a.ready_at, delivered_at: null, collected_by_name: null,
              customerName: customer.name, customerPhone: customer.phone, itemTypes: types,
            }, templates, shop).find((b) => b.key === "reminder" || (b.key === "delay"));
            const items = itemsText((a.alteration_pieces as { item_type: string }[]).map((p) => p.item_type));
            const over = isOverdue(a.promised_date, a.status);
            return (
              <li key={a.id} className="rounded-xl border border-border bg-card">
                <Link href={`/a/${label}`} className="block p-3 active:opacity-80">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">#{label}</span><StatusBadge status={a.status} />
                  </div>
                  <p className="mt-1 font-medium">{customer.name}</p>
                  <p className="text-sm text-muted">{items}</p>
                  <p className={over ? "text-sm font-semibold text-danger" : "text-sm text-muted"}>Due {fmtDate(a.promised_date)}{over && " · overdue"}</p>
                </Link>
                {reminder && (
                  <div className="px-3 pb-3">
                    {(() => { const last = msgs.find((m) => m.template_key === reminder.key); return (
                      <WaButton compact alterationId={a.id} templateKey={reminder.key} label={reminder.label} href={reminder.href}
                        disabledReason={reminder.disabledReason}
                        lastSent={last ? { by: last.who?.name ?? "—", at: fmtDateTime(last.opened_at) } : null} />
                    ); })()}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
