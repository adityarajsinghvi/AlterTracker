"use client";
import { useState } from "react";
import { Btn } from "@/components/ui";
import { fillTemplate } from "@/lib/whatsapp";
import { useAction } from "@/lib/use-action";
import { publicLink, type Shop } from "@/lib/messages";
import { saveTemplate } from "../actions";

const PLACEHOLDERS = ["customer_name", "token", "items", "promised_date", "link", "delivered_at", "collected_by", "shop_name", "shop_phone"];

export function TemplateEditor({ t, shop }: { t: { key: string; label: string; body: string; active: boolean }; shop: Shop }) {
  const [body, setBody] = useState(t.body);
  const [active, setActive] = useState(t.active);
  const a = useAction();
  const [saved, setSaved] = useState(false);

  const sample = {
    customer_name: "Anita Sharma", token: "26-142", items: "Blazer + 2 Trouser", promised_date: "Fri, 20 Nov",
    link: publicLink(shop, "k3x9a7bq2m"), delivered_at: "18 Nov, 4:12 pm", collected_by: "Anita Sharma",
    shop_name: shop.shop_name, shop_phone: shop.shop_phone,
  };
  const unknown = [...body.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((k) => !PLACEHOLDERS.includes(k));

  return (
    <section aria-label={t.label} className="space-y-3 rounded-2xl border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t.label}</h2>
        <label className="flex h-11 items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={active} onChange={(e) => { setActive(e.target.checked); setSaved(false); }} className="size-6 accent-[var(--primary)]" /> On
        </label>
      </div>
      <textarea aria-label={`${t.label} message`} rows={5} value={body} onChange={(e) => { setBody(e.target.value); setSaved(false); }}
        className="w-full rounded-xl border border-border bg-background p-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary" />
      <p className="text-xs text-muted">Placeholders: {PLACEHOLDERS.map((p) => `{${p}}`).join(" ")}</p>
      {unknown.length > 0 && <p role="alert" className="text-sm text-danger">Unknown placeholder: {unknown.map((u) => `{${u}}`).join(", ")}. It will be left blank.</p>}
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Preview</p>
        <p className="whitespace-pre-wrap rounded-xl bg-[#dcf8c6] p-3 text-sm text-black">{fillTemplate(body, sample)}</p>
      </div>
      {a.err && <p role="alert" className="text-sm text-danger">{a.err}</p>}
      <Btn disabled={a.busy} onClick={() => a.run(() => saveTemplate({ key: t.key, body, active }), () => setSaved(true))}>
        {a.busy ? "Saving…" : saved ? "Saved ✓" : "Save"}
      </Btn>
    </section>
  );
}
