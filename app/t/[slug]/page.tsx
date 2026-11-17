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

  const photos = await signPhotos(t.pieces.flatMap((p) => p.photo_paths));
  const step = STEPS.findIndex((s) => s.key === t.status);
  const cancelled = t.status === "cancelled";
  const callable = /^\d{10}$/.test(t.shop_phone) && t.shop_phone !== "0000000000";

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

        <dl className="mt-6 space-y-1 text-sm">
          {t.status !== "delivered" && !cancelled && (
            <div className="flex justify-between"><dt className="text-muted">Ready by</dt><dd className="font-semibold">{fmtDate(t.promised_date)}</dd></div>
          )}
          {t.status === "delivered" && t.delivered_at && (
            <>
              <div className="flex justify-between"><dt className="text-muted">Collected on</dt><dd className="font-semibold">{fmtDateTime(t.delivered_at)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Collected by</dt><dd className="font-semibold">{t.collected_by}</dd></div>
            </>
          )}
        </dl>
      </section>

      <section aria-label="Items" className="space-y-3">
        <h2 className="text-lg font-semibold">Items</h2>
        {t.pieces.map((p, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-3">
            <p className="font-semibold">{p.item_type}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{p.work_notes}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {p.photo_paths.map((path) => photos.get(path) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={path} src={photos.get(path)} alt={`${p.item_type}`} loading="lazy" className="size-24 rounded-lg border border-border object-cover" />
              ))}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
