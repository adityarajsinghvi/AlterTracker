import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, Phone } from "lucide-react";
import { getPublicToken, signPhotos } from "@/lib/public-token";
import { fmtDate, fmtDateTime, tokenLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STEPS = [
  { key: "received", label: "Received" },
  { key: "with_tailor", label: "With tailor" },
  { key: "ready", label: "Ready" },
  { key: "delivered", label: "Delivered" },
];

// What the customer sees per item. Never the tailor's name.
const ITEM_STATUS: Record<string, { label: string; cls: string }> = {
  received: { label: "At the shop", cls: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" },
  with_tailor: { label: "Being altered", cls: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100" },
  ready: { label: "Ready for pickup", cls: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100" },
  delivered: { label: "Collected", cls: "bg-stone-200 text-stone-800 dark:bg-stone-700 dark:text-stone-100" },
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
  const step = STEPS.findIndex((s) => s.key === t.status);
  const cancelled = t.status === "cancelled";
  const callable = /^\d{10}$/.test(t.shop_phone) && t.shop_phone !== "0000000000";

  const live = t.pieces.filter((p) => p.status !== "cancelled");
  const n = (s: string) => live.filter((p) => p.status === s).length;
  const pending = n("received") + n("with_tailor");
  const summary = [
    n("delivered") ? `${n("delivered")} collected` : "",
    n("ready") ? `${n("ready")} ready for pickup` : "",
    pending ? `${pending} still being worked on` : "",
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
          <ol className="mt-6 grid grid-cols-4 gap-1" aria-label="Progress">
            {STEPS.map((s, i) => {
              const done = i <= step;
              return (
                <li key={s.key} className="flex flex-col items-center gap-2 text-xs" aria-current={i === step ? "step" : undefined}>
                  <span className={cn("flex size-8 items-center justify-center rounded-full border-2 text-sm font-bold",
                    done ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted")}>
                    {done ? <Check className="size-4" aria-hidden /> : i + 1}
                  </span>
                  <span className={cn("font-medium", i === step ? "text-foreground" : "text-muted")}>{s.label}</span>
                </li>
              );
            })}
          </ol>
        )}
        {!cancelled && summary && live.length > 1 && <p className="mt-4 text-sm font-medium">{summary}</p>}

        <dl className="mt-5 space-y-1 text-sm">
          {pending > 0 && !cancelled && (
            <div className="flex justify-between"><dt className="text-muted">Ready by</dt><dd className="font-semibold">{fmtDate(t.promised_date)}</dd></div>
          )}
          {t.status === "delivered" && t.delivered_at && (
            <>
              <div className="flex justify-between"><dt className="text-muted">Last collected on</dt><dd className="font-semibold">{fmtDateTime(t.delivered_at)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Collected by</dt><dd className="font-semibold">{t.collected_by}</dd></div>
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
              {p.status === "delivered" && p.delivered_at && (
                <p className="mt-1 text-xs text-muted">Collected {fmtDateTime(p.delivered_at)}{p.collected_by ? ` by ${p.collected_by}` : ""}</p>
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
