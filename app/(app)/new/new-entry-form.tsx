"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, Plus, Trash2, TriangleAlert, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image";
import { STATUS_LABEL, addDaysISO, fmtDate, normalizeItem } from "@/lib/format";
import { ItemInput } from "@/components/item-input";
import { normalizePhone, isValidPhone } from "@/lib/auth";
import type { Tailor } from "@/lib/types";
import { Btn, Field, inputCls } from "@/components/ui";
import { WaButton } from "@/components/wa-button";
import { receiptButton, type Shop, type Template } from "@/lib/messages";
import { cn } from "@/lib/utils";
import { createEntry, lookupCustomer, savePiecePhotos, type CustomerLookup, type NewEntryResult } from "./actions";

type PieceDraft = { key: string; type: string; notes: string; description: string; photos: { file: File; url: string }[] };
let pieceCounter = 0;
const newPiece = (): PieceDraft => ({ key: `p${pieceCounter++}`, type: "", notes: "", description: "", photos: [] });

export function NewEntryForm({ tailors, today, templates, shop, itemSuggestions }: { tailors: Tailor[]; today: string; templates: Template[]; shop: Shop; itemSuggestions: string[] }) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [lookup, setLookup] = useState<CustomerLookup | null>(null);
  const [pieces, setPieces] = useState<PieceDraft[]>(() => [{ key: "p-first", type: "", notes: "", description: "", photos: [] }]);
  const [promised, setPromised] = useState(addDaysISO(today, 3));
  const [tailorId, setTailorId] = useState("");
  const [charge, setCharge] = useState("");
  const [paid, setPaid] = useState(false);
  const [rack, setRack] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ result: Extract<NewEntryResult, { ok: true }>; photoIssue: boolean } | null>(null);
  const lookupSeq = useRef(0);

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

  const existing = lookup?.name != null;
  const updatePiece = (key: string, patch: Partial<PieceDraft>) =>
    setPieces((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  async function addPhotos(key: string, files: FileList | null) {
    if (!files?.length) return;
    const added = Array.from(files).map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPieces((ps) => ps.map((p) => (p.key === key ? { ...p, photos: [...p.photos, ...added] } : p)));
  }

  function validate(): string | null {
    if (!isValidPhone(phone10)) return "Enter a valid 10-digit mobile number.";
    if (!existing && !name.trim()) return "Enter the customer's name.";
    for (const [i, p] of pieces.entries()) {
      if (!p.type.trim()) return `Piece ${i + 1}: write what it is (Suit, Shirt…).`;
      if (!p.notes.trim()) return `Piece ${i + 1}: write the work to be done.`;
    }
    if (!promised) return "Choose a promised date.";
    return null;
  }

  async function save() {
    const v = validate();
    if (v) { setError(v); return; }
    setError(null);
    setBusy("Saving…");
    try {
      const res = await createEntry({
        phone: phone10, name: name.trim(), promised,
        pieces: pieces.map((p) => ({ item_type: normalizeItem(p.type), work_notes: p.notes.trim(), description: p.description.trim() || undefined, has_photo: p.photos.length > 0 })),
        tailorId: tailorId || null,
        charge: charge.trim() === "" ? null : Number(charge),
        paid, rack: rack.trim(),
      });
      if (!res.ok) { setError(res.error); setBusy(null); return; }

      // Entry is saved. Upload photos in parallel; a failure only marks the piece "photo pending".
      let photoIssue = false;
      const supabase = createClient();
      const withPhotos = pieces.map((p, i) => ({ p, id: res.pieceIds[i] })).filter((x) => x.p.photos.length);
      if (withPhotos.length) {
        setBusy("Uploading photos…");
        await Promise.all(withPhotos.map(async ({ p, id }) => {
          const results = await Promise.all(p.photos.map(async (ph, n) => {
            try {
              const blob = await compressImage(ph.file);
              const path = `${res.id}/${id}-${Date.now()}-${n}.jpg`;
              const { error: upErr } = await supabase.storage.from("item-photos").upload(path, blob, { contentType: "image/jpeg" });
              return upErr ? null : path;
            } catch { return null; }
          }));
          const paths = results.filter((x): x is string => !!x);
          const failed = paths.length < p.photos.length;
          if (failed) photoIssue = true;
          try { await savePiecePhotos(id, paths, failed); } catch { photoIssue = true; }
        }));
      }
      setDone({ result: res, photoIssue });
    } catch {
      setError("No internet connection. Your entry is still filled in. Please try Save again.");
    } finally {
      setBusy(null);
    }
  }

  if (done) {
    const { result, photoIssue } = done;
    const receipt = receiptButton({
      token_year: result.tokenYear, token_no: result.tokenNo, status: "received", public_slug: result.slug,
      promised_date: promised, ready_at: null, delivered_at: null, collected_by_name: null,
      customerName: result.customerName, customerPhone: phone10, itemTypes: pieces.map((p) => normalizeItem(p.type)),
    }, templates, shop);
    return (
      <section className="space-y-5 text-center" aria-live="polite">
        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="text-sm text-muted">Saved for {result.customerName}</p>
          <p className="mt-1 whitespace-nowrap text-4xl font-bold tracking-tight text-primary">Token #{result.label}</p>
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
          <WaButton alterationId={result.id} templateKey="receipt" label={receipt.label} href={receipt.href}
            disabledReason={receipt.disabledReason} />
        )}
        <Link href={`/a/${result.label}`} className="flex h-12 items-center justify-center rounded-xl border border-border bg-card font-semibold">
          Open token
        </Link>
        <Link href="/" className="flex h-12 items-center justify-center rounded-xl border border-border bg-card font-semibold">
          Back to Home
        </Link>
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
              {lookup.open.length} {lookup.open.length === 1 ? "item" : "items"} already in for alteration
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

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Pieces</h2>
        {pieces.map((p, i) => (
          <div key={p.key} className="space-y-3 rounded-2xl border border-border bg-card p-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">Piece {i + 1}</span>
              {pieces.length > 1 && (
                <button type="button" aria-label={`Remove piece ${i + 1}`} onClick={() => setPieces((ps) => ps.filter((x) => x.key !== p.key))}
                  className="flex size-11 items-center justify-center rounded-full text-danger active:bg-border">
                  <Trash2 className="size-5" />
                </button>
              )}
            </div>
            <ItemInput id={`type-${p.key}`} label={`What is piece ${i + 1}?`} value={p.type} onChange={(v) => updatePiece(p.key, { type: v })} suggestions={itemSuggestions} />
            <Field label="Work to be done" htmlFor={`notes-${p.key}`}>
              <textarea id={`notes-${p.key}`} rows={2} value={p.notes} onChange={(e) => updatePiece(p.key, { notes: e.target.value })}
                placeholder="e.g. Sleeves short 1 inch, taper waist" className={cn(inputCls, "h-auto py-3")} />
            </Field>
            <Field label="Description (optional)" htmlFor={`desc-${p.key}`}>
              <input id={`desc-${p.key}`} value={p.description} onChange={(e) => updatePiece(p.key, { description: e.target.value })}
                placeholder="e.g. Navy blazer, bought here" className={inputCls} />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              {p.photos.map((ph) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={ph.url} src={ph.url} alt="" className="size-16 rounded-lg border border-border object-cover" />
              ))}
              <label className="flex h-16 min-w-16 cursor-pointer items-center justify-center gap-1 rounded-lg border border-dashed border-border px-3 text-sm font-medium text-primary">
                <Camera className="size-5" aria-hidden /> Photo
                <input type="file" accept="image/*" capture="environment" className="sr-only"
                  onChange={(e) => { addPhotos(p.key, e.target.files); e.target.value = ""; }} />
              </label>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setPieces((ps) => [...ps, newPiece()])}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary font-semibold text-primary">
          <Plus className="size-5" aria-hidden /> Add another piece
        </button>
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
          <Field label="Send to tailor now" htmlFor="tailor">
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
