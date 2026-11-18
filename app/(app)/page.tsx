import Link from "next/link";
import { Plus } from "lucide-react";
import { PageTitle } from "@/components/page-title";
import { CARD_SELECT, TokenCard, type CardRow } from "@/components/token-card";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/session";
import { getMessageContext } from "@/lib/message-data";
import { todayIST } from "@/lib/format";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "today", label: "Due today" },
  { key: "overdue", label: "Overdue" },
  { key: "tailor", label: "With tailor" },
  { key: "ready", label: "Ready" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const EMPTY: Record<TabKey, string> = {
  today: "Nothing is due today.",
  overdue: "Nothing is overdue. Well done!",
  tailor: "Nothing is with a tailor right now.",
  ready: "No ready items waiting for pickup.",
};

export default async function HomePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: rawTab } = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === rawTab) ? (rawTab as TabKey) : "today";
  const supabase = await createClient();
  // One round trip deep: everything the page needs is asked for at the same time.
  const [me, { templates, shop }, { data, error }] = await Promise.all([
    getMe(),
    getMessageContext(),
    supabase.from("alterations").select(CARD_SELECT).in("status", ["received", "with_tailor", "ready"]).limit(500),
  ]);
  const rows = ((data ?? []) as unknown as CardRow[]);
  const today = todayIST();
  const inWork = (a: CardRow) => a.status === "received" || a.status === "with_tailor";

  const lists: Record<TabKey, CardRow[]> = {
    today: rows.filter((a) => inWork(a) && a.promised_date === today).sort((x, y) => x.token_no - y.token_no),
    overdue: rows.filter((a) => inWork(a) && a.promised_date < today).sort((x, y) => x.promised_date.localeCompare(y.promised_date)),
    tailor: rows.filter((a) => a.status === "with_tailor")
      .sort((x, y) => (x.sent_to_tailor_at ?? "").localeCompare(y.sent_to_tailor_at ?? "")),
    ready: rows.filter((a) => a.status === "ready").sort((x, y) => (x.ready_at ?? "").localeCompare(y.ready_at ?? "")),
  };
  const list = lists[tab];

  return (
    <>
      <PageTitle sub={me.role === "owner" ? "Owner" : "Staff"}>Namaste, {me.name}</PageTitle>

      <nav aria-label="Lists" className="mb-4 grid grid-cols-4 gap-1 rounded-xl bg-border/50 p-1">
        {TABS.map((t) => {
          const n = lists[t.key].length;
          const active = t.key === tab;
          return (
            <Link key={t.key} href={t.key === "today" ? "/" : `/?tab=${t.key}`} aria-current={active ? "page" : undefined}
              className={cn("flex min-h-14 flex-col items-center justify-center rounded-lg px-1 text-center text-xs font-medium leading-tight",
                active ? "bg-card shadow-sm" : "text-muted")}>
              <span className={cn("text-lg font-bold", t.key === "overdue" && n > 0 && "text-danger")}>{n}</span>
              {t.label}
            </Link>
          );
        })}
      </nav>

      {error && <p role="alert" className="mb-3 text-sm text-danger">Could not load the list. Pull down to retry.</p>}
      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">{EMPTY[tab]}</p>
      ) : (
        <ul className="space-y-2">
          {list.map((a) => <TokenCard key={a.id} a={a} templates={templates} shop={shop} />)}
        </ul>
      )}

      <div className="h-16" aria-hidden />
      <Link href="/new" aria-label="New alteration"
        className="fixed bottom-24 right-4 z-30 flex h-14 items-center gap-2 rounded-full bg-primary px-5 font-semibold text-primary-foreground shadow-lg active:opacity-80">
        <Plus className="size-5" aria-hidden /> New
      </Link>
    </>
  );
}
