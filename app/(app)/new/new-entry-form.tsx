"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, Check, Plus, Trash2, TriangleAlert, X } from "lucide-react";
import { SaveContact } from "@/components/save-contact";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image";
import { STATUS_LABEL, addDaysISO, fmtDate, normalizeItem } from "@/lib/format";
import { normalizePhone, isValidPhone } from "@/lib/auth";
import type { Tailor } from "@/lib/types";
import { Btn, Field, inputCls } from "@/components/ui";
import { ItemInput } from "@/components/item-input";
import { WaButton } from "@/components/wa-button";
import { receiptButton, itemsText, type Shop, type Template } from "@/lib/messages";
import { cn } from "@/lib/utils";
import { createEntry, lookupCustomer, saveVisitPhotos, type CustomerLookup, type NewEntryResult } from "./actions";

type Row = { key: string; name: string; note: string; qty: string };
let rowCounter = 0;
const newRow = (): Row => ({ key: `r${++rowCounter}`, name: "", note: "", qty: "1" });
const MAX_ITEMS = 60;

export function NewEntryForm({ tailors, today, templates, shop, itemSuggestions }: {
  tailors: Tailor[]; today: string; templates: Template[]; shop: Shop; itemSuggestions: string[];
}) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [lookup, setLookup] = useState<CustomerLookup | null>(null);
  const [rows, setRows] = useState<Row[]>(() => [{ key: "r-first", name: "", note: "", qty: "1" }]);
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [promised, setPromised] = useState(addDaysISO(today, 3));
  const [tailorId, setTailorId] = useState("");
  const [charge, setCharge] = useState("");
  const [paid, setPaid] = useState(false);
  const [rack, setRack] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ result: Extract<NewEntryResult, { ok: true }>; photoIssue: boolean; itemNames: string[] } | null>(null);
  const lookupSeq = useRef(0);
  const focusKey = useRef<string | null>(null);

  const phone10 = normalizePhone(phone);
  useEffect(() => {
    if (!isValidPhone(phone10)) { setLookup(null); return; }
    const seq = ++lookupSeq.current;
    lookupCustomer(phone10).then((r) => {
      if (seq !== lookupSeq.current) return;
      setLookup(r);
      if (r.name) setName(r.name);
    }).catch(() => {});
  }, [phone10]);

  // After "add a row", move the cursor into it.
  useEffect(() => {
    if (!focusKey.current) return;
    document.getElementById(`item-${focusKey.current}`)?.focus();
    focusKey.current = null;
  }, [rows.length]);

  const existing = lookup?.name != null;
  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRowAfter = (key: string) => {
    const nr = newRow();
    focusKey.current = nr.key;
    setRows((rs) => { const i = rs.findIndex((r) => r.key === key); const next = [...rs]; next.splice(i + 1, 0, nr); return next; });
  };
  const qtyOf = (r: Row) => Math.min(20, Math.max(1, parseInt(r.qty, 10) || 1));
  const filled = rows.filter((r) => r.name.trim() || r.note.trim());
  const totalItems = filled.reduce((n, r) => n + qtyOf(r), 0);

  function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    // Copy the files NOW: the input is cleared right after this call, which empties the live FileList.
    const added = Array.from(files).map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPhotos((ps) => [...ps, ...added]);
  }

  function validate(): string | null {
    if (!isValidPhone(phone10)) return "Enter a valid 10-digit mobile number.";
    if (!existing && !name.trim()) return "Enter the customer's name.";
    if (filled.length === 0) return "Add at least one item.";
    for (const r of filled) if (!r.name.trim()) return "Every item needs a name. Write what it is (Suit, Shirt…).";
    if (totalItems > MAX_ITEMS) return `That is more than ${MAX_ITEMS} items. Please split it into two tokens.`;
    if (!promised) return "Choose a promised date.";
    return null;
  }

  async function save() {
    const v = validate();
    if (v) { setError(v); return; }
    setError(null);
    setBusy("Saving…");
    // A row with quantity 3 becomes three separate items, so each can move on its own.
    const items = filled.flatMap((r) => Array.from({ length: qtyOf(r) }, () => ({ name: normalizeItem(r.name), note: r.note.trim() || undefined })));
    try {
      const res = await createEntry({
        phone: phone10, name: name.trim(), promised, items, hasPhoto: photos.length > 0,
        tailorId: tailorId || null, charge: charge.trim() === "" ? null : Number(charge), paid, rack: rack.trim(),
      });
      if (!res.ok) { setError(res.error); setBusy(null); return; }

      // The entry is saved. Photos upload next; a failure only marks the visit "photo pending".
      let photoIssue = false;
      if (photos.length) {
        setBusy("Uploading photos…");
        const supabase = createClient();
        const results = await Promise.all(photos.map(async (ph, n) => {
          try {
            const blob = await compressImage(ph.file);
            const path = `${res.id}/visit-${Date.now()}-${n}.jpg`;
            const { error: upErr } = await supabase.storage.from("item-photos").upload(path, blob, { contentType: "image/jpeg" });
            return upErr ? null : path;
          } catch { return null; }
        }));
        const paths = results.filter((x): x is string => !!x);
        const failed = paths.length < photos.length;
        if (failed) photoIssue = true;
        try { await saveVisitPhotos(res.id, paths, failed); } catch { photoIssue = true; }
      }
      setDone({ result: res, photoIssue, itemNames: items.map((i) => i.name) });
    } catch {
      setError("No internet connection. Your entry is still filled in. Please try Save again.");
    } finally {
      setBusy(null);
    }
  }

  if (done) {
    const { result, photoIssue, itemNames } = done;
    const receipt = receiptButton({
      token_year: result.tokenYear, token_no: result.tokenNo, public_slug: result.slug, promised_date: promised,
      customerName: result.customerName, customerPhone: phone10,
      items: itemNames.map((name) => ({ name, status: "received", ready_at: null, delivered_at: null, collected_by: null })),
    }, templates, shop);
    return (
      <section className="space-y-5 text-center" aria-live="polite">
        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="text-sm text-muted">Saved for {result.customerName}</p>
          <p className="mt-1 whitespace-nowrap text-4xl font-bold tracking-tight text-primary">Token #{result.label}</p>
          <p className="mt-2 text-sm text-muted">{itemNames.length} item{itemNames.length === 1 ? "" : "s"}: {itemsText(itemNames)}</p>
          <p className="mt-4 rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
            Write <b>#{result.label}</b> on the tag
          </p>
        </div>
        {photoIssue && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-border p-3 text-left text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
            Some photos did not upload. The entry is saved; open the token and add the photo from there.
          </p>
        )}
        {receipt && (
          <WaButton alterationId={result.id} templateKey="receipt" label={receipt.label} href={receipt.href} disabledReason={receipt.disabledReason} />
        )}
        <SaveContact variant="button" name={result.customerName} phone={phone10} token={result.label} shop={shop.shop_name} />
        <Link href={`/a/${result.label}`} className="flex h-12 items-center justify-center rounded-xl border border-border bg-card font-semibold">Open token</Link>
        <Link href="/" className="flex h-12 items-center justify-center rounded-xl border border-border bg-card font-semibold">Back to Home</Link>
        <button type="button" onClick={() => location.assign("/new")} className="h-12 w-full font-medium text-primary">+ Another entry</button>
      </section>
    );
  }

  const dateChips = [
    { label: "Tomorrow", d: addDaysISO(today, 1) },
    { label: "2 days", d: addDaysISO(today, 2) },
    { label: "3 days", d: addDaysISO(today, 3) },
    { label: "1 week", d: addDaysISO(today, 7) },
  ];

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-6" noValidate>
      <section className="space-y-3">
        <Field label="Customer mobile number" htmlFor="phone">
          <input id="phone" type="tel" inputMode="numeric" autoComplete="off" value={phone}
            onChange={(e) => setPhone(e.target.value)} placeholder="98290 12345" className={inputCls} />
        </Field>
        {lookup && lookup.open.length > 0 && (
          <div role="status" className="rounded-xl border border-amber-400/60 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
            <p className="flex items-center gap-2 font-semibold">
              <TriangleAlert className="size-4" aria-hidden />
              {lookup.open.length} {lookup.open.length === 1 ? "visit" : "visits"} already in for alteration
            </p>
            <ul className="mt-1 space-y-0.5">
              {lookup.open.map((o) => (
                <li key={o.label}>#{o.label} · {o.items} · {STATUS_LABEL[o.status]} · due {fmtDate(o.promised)}</li>
              ))}
            </ul>
          </div>
        )}
        <Field label="Customer name" htmlFor="name" hint={existing ? "Existing customer" : undefined}>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} readOnly={existing}
            autoComplete="off" className={cn(inputCls, existing && "bg-border/40")} placeholder="Full name" />
        </Field>
      </section>

      <section className="space-y-3" aria-label="Items">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Items</h2>
          {totalItems > 0 && <span className="text-sm text-muted">{totalItems} in total</span>}
        </div>
        {rows.map((r, i) => (
          <div key={r.key} className="space-y-2 rounded-2xl border border-border bg-card p-3">
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <ItemInput id={`item-${r.key}`} label={`Item ${i + 1}`} value={r.name} onChange={(v) => update(r.key, { name: v })}
                  suggestions={itemSuggestions} onEnter={() => r.name.trim() && addRowAfter(r.key)} />
              </div>
              <div className="w-16 shrink-0">
                <label htmlFor={`qty-${r.key}`} className="mb-1 block text-sm font-medium">Qty</label>
                <input id={`qty-${r.key}`} inputMode="numeric" maxLength={2} value={r.qty}
                  onChange={(e) => update(r.key, { qty: e.target.value.replace(/\D/g, "") })} onBlur={() => update(r.key, { qty: String(qtyOf(r)) })}
                  className={cn(inputCls, "px-2 text-center")} />
              </div>
              {rows.length > 1 && (
                <button type="button" aria-label={`Remove item ${i + 1}`} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  className="flex size-12 shrink-0 items-center justify-center rounded-xl text-danger active:bg-border">
                  <Trash2 className="size-5" />
                </button>
              )}
            </div>
            <input aria-label={`Work for item ${i + 1} (optional)`} value={r.note} onChange={(e) => update(r.key, { note: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (r.name.trim()) addRowAfter(r.key); } }}
              placeholder="Work to do (optional): e.g. sleeves short 1 inch" className={inputCls} enterKeyHint="next" />
          </div>
        ))}
        <button type="button" onClick={() => addRowAfter(rows[rows.length - 1].key)}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary font-semibold text-primary">
          <Plus className="size-5" aria-hidden /> Add another item
        </button>
      </section>

      <section className="space-y-3" aria-label="Photos">
        <h2 className="text-lg font-semibold">Photos <span className="text-sm font-normal text-muted">(optional, one picture can show everything)</span></h2>
        <div className="flex flex-wrap items-center gap-2">
          {photos.map((ph, n) => (
            <div key={ph.url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ph.url} alt={`Photo ${n + 1}`} className="size-20 rounded-lg border border-border object-cover" />
              <button type="button" aria-label={`Remove photo ${n + 1}`} onClick={() => setPhotos((ps) => ps.filter((x) => x.url !== ph.url))}
                className="absolute -right-2 -top-2 flex size-7 items-center justify-center rounded-full bg-foreground text-background">
                <X className="size-4" />
              </button>
            </div>
          ))}
          <label className="flex h-20 min-w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border px-3 text-sm font-medium text-primary">
            <Camera className="size-5" aria-hidden /> {photos.length ? "Add more" : "Take photo"}
            <input type="file" accept="image/*" capture="environment" className="sr-only"
              onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
          </label>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Promised date</h2>
        <div className="flex flex-wrap gap-2">
          {dateChips.map((c) => (
            <button key={c.label} type="button" onClick={() => setPromised(c.d)}
              className={cn("h-11 rounded-full border px-4 text-sm font-medium", promised === c.d ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
              {c.label}
            </button>
          ))}
        </div>
        <input type="date" aria-label="Promised date" min={today} value={promised} onChange={(e) => setPromised(e.target.value)} className={inputCls} />
        <p className="text-sm text-muted">Ready by {promised ? fmtDate(promised) : "—"}</p>
      </section>

      <details className="rounded-2xl border border-border bg-card p-3">
        <summary className="flex h-11 cursor-pointer items-center font-semibold">More options (tailor, charge, rack)</summary>
        <div className="mt-2 space-y-3">
          <Field label="Send everything to a tailor now" htmlFor="tailor" hint="You can also send items one by one later, to different tailors.">
            <select id="tailor" value={tailorId} onChange={(e) => setTailorId(e.target.value)} className={inputCls}>
              <option value="">Not yet</option>
              {tailors.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Charge (₹)" htmlFor="charge" hint="Leave empty for a free alteration">
            <input id="charge" type="number" inputMode="decimal" min={0} value={charge} onChange={(e) => setCharge(e.target.value)} className={inputCls} />
          </Field>
          <label className="flex h-11 items-center gap-3 font-medium">
            <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="size-6 accent-[var(--primary)]" /> Paid
          </label>
          <Field label="Rack / shelf label" htmlFor="rack">
            <input id="rack" value={rack} onChange={(e) => setRack(e.target.value)} className={inputCls} />
          </Field>
        </div>
      </details>

      {error && <p role="alert" className="rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger">{error}</p>}
      <Btn type="submit" disabled={!!busy}>
        {busy ? busy : <span className="inline-flex items-center gap-2"><Check className="size-5" aria-hidden /> Save and get token</span>}
      </Btn>
    </form>
  );
}
