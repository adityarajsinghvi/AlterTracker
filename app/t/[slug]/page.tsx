import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Phone } from "lucide-react";
import { getPublicToken, signPhotos } from "@/lib/public-token";
import { fmtDate, fmtDateTime, tokenLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

// The journey of every item is three steps. "Ready for pickup" is a green tag on an item that is at the shop.
// The names never reveal who does the work.
const STEPS = [
  { key: "received", label: "At shop" },
  { key: "with_tailor", label: "At alter" },
  { key: "delivered", label: "Delivered" },
];
const STEP_OF: Record<string, number> = { received: 0, ready: 0, with_tailor: 1, delivered: 2 };
const BAR: Record<string, string> = {
  received: "bg-amber-500", ready: "bg-emerald-500", with_tailor: "bg-sky-500", delivered: "bg-primary", cancelled: "bg-red-400",
};

const ITEM_STATUS: Record<string, { label: string; cls: string }> = {
  received: { label: "At shop", cls: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" },
  with_tailor: { label: "At alter", cls: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100" },
  ready: { label: "Ready for pickup", cls: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100" },
  delivered: { label: "Delivered", cls: "bg-stone-200 text-stone-800 dark:bg-stone-700 dark:text-stone-100" },
  cancelled: { label: "Cancelled", cls: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100" },
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const t = await getPublicToken(slug);
  if (!t) return { title: "Token not found", robots: { index: false, follow: false } };
  const title = `Token #${tokenLabel(t.token_year, t.token_no)} · ${t.shop_name}`;
  let metadataBase: URL | undefined;
  try { metadataBase = new URL(t.base_url); } catch { /* placeholder URL */ }
  return {
    title,
    description: `Alteration status from ${t.shop_name}`,
    robots: { index: false, follow: false },
    metadataBase,
    openGraph: { title, description: `Alteration status from ${t.shop_name}`, siteName: t.shop_name, type: "website", images: ["/icons/icon-512.png"] },
  };
}

export default async function PublicTokenPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await getPublicToken(slug);
  if (!t) notFound();

  const photos = await signPhotos([...(t.photos ?? []), ...t.pieces.flatMap((p) => p.photo_paths ?? [])]);
  const visitPhotos = (t.photos ?? []).map((p) => photos.get(p)).filter((x): x is string => !!x);
  const cancelled = t.status === "cancelled";
  const callable = /^\d{10}$/.test(t.shop_phone) && t.shop_phone !== "0000000000";

  const live = t.pieces.filter((p) => p.status !== "cancelled");
  const n = (s: string) => live.filter((p) => p.status === s).length;
  const pending = n("received") + n("with_tailor");
  const summary = [
    n("delivered") ? `${n("delivered")} delivered` : "",
    n("ready") ? `${n("ready")} ready for pickup` : "",
    n("with_tailor") ? `${n("with_tailor")} at alter` : "",
    n("received") ? `${n("received")} at shop` : "",
  ].filter(Boolean).join(" · ");

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md space-y-6 px-4 py-8">
      <header className="text-center">
        <h1 className="text-2xl font-bold">{t.shop_name}</h1>
        {t.address && <p className="mt-1 text-sm text-muted">{t.address}</p>}
        {callable && (
          <a href={`tel:+91${t.shop_phone}`} className="mt-3 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 font-semibold text-primary-foreground">
            <Phone className="size-4" aria-hidden /> Call {t.shop_phone}
          </a>
        )}
      </header>

      <section className="rounded-2xl border border-border bg-card p-5 text-center">
        <p className="text-sm text-muted">Your alteration token</p>
        <p className="mt-1 whitespace-nowrap text-4xl font-bold tracking-tight text-primary">#{tokenLabel(t.token_year, t.token_no)}</p>
        <p className="mt-1 text-sm text-muted">Phone ending {t.phone_last4}</p>

        {cancelled ? (
          <p className="mt-5 rounded-lg bg-red-100 px-3 py-2 text-sm font-medium text-red-900 dark:bg-red-900/40 dark:text-red-100">
            This token was cancelled. Please contact the shop.
          </p>
        ) : (
          <div className="mt-5 flex gap-1" role="img" aria-label={summary || "Progress"}>
            {t.pieces.map((p, i) => <span key={i} className={cn("h-2.5 flex-1 rounded-full", BAR[p.status] ?? "bg-border")} />)}
          </div>
        )}
        {!cancelled && summary && <p className="mt-3 text-sm font-medium">{summary}</p>}

        <dl className="mt-5 space-y-1 text-sm">
          {pending > 0 && !cancelled && (
            <div className="flex justify-between"><dt className="text-muted">Ready by</dt><dd className="font-semibold">{fmtDate(t.promised_date)}</dd></div>
          )}
          {t.status === "delivered" && t.delivered_at && (
            <>
              <div className="flex justify-between"><dt className="text-muted">Last delivered on</dt><dd className="font-semibold">{fmtDateTime(t.delivered_at)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Received by</dt><dd className="font-semibold">{t.collected_by}</dd></div>
            </>
          )}
        </dl>
      </section>

      {visitPhotos.length > 0 && (
        <section aria-label="Photos" className="flex flex-wrap justify-center gap-2">
          {visitPhotos.map((u, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={u} src={u} alt={`Your items, photo ${i + 1}`} loading="lazy" className="max-h-64 w-full rounded-xl border border-border object-cover" />
          ))}
        </section>
      )}

      <section aria-label="Items" className="space-y-3">
        <h2 className="text-lg font-semibold">Items</h2>
        {t.pieces.map((p, i) => {
          const st = ITEM_STATUS[p.status] ?? ITEM_STATUS.received;
          return (
            <div key={i} className="rounded-2xl border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{p.item_type}</p>
                <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", st.cls)}>{st.label}</span>
              </div>
              {p.work_notes && <p className="mt-1 whitespace-pre-wrap text-sm">{p.work_notes}</p>}
              {p.status !== "cancelled" && (
                <ol className="mt-3 grid grid-cols-3 gap-1" aria-label={`${p.item_type}: ${st.label}`}>
                  {STEPS.map((step, k) => {
                    const at = STEP_OF[p.status] ?? 0;
                    return (
                      <li key={step.key} aria-current={k === at ? "step" : undefined} className="space-y-1">
                        <span className={cn("block h-1.5 rounded-full", k <= at ? BAR[p.status] : "bg-border")} />
                        <span className={cn("block text-[11px] leading-tight", k === at ? "font-semibold text-foreground" : "text-muted")}>{step.label}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
              {p.status === "delivered" && p.delivered_at && (
                <p className="mt-1 text-xs text-muted">Delivered {fmtDateTime(p.delivered_at)}{p.collected_by ? ` to ${p.collected_by}` : ""}</p>
              )}
              {(p.photo_paths ?? []).some((x) => photos.get(x)) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {p.photo_paths.map((path) => photos.get(path) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={path} src={photos.get(path)} alt={p.item_type} loading="lazy" className="size-24 rounded-lg border border-border object-cover" />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>
    </main>
  );
}
