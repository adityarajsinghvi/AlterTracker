"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Pencil, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image";
import { STATUS_LABEL, rupees } from "@/lib/format";
import type { Status, Tailor } from "@/lib/types";
import { Sheet } from "@/components/sheet";
import { ItemInput } from "@/components/item-input";
import { Btn, Field, StatusBadge, inputCls } from "@/components/ui";
import { cn } from "@/lib/utils";
import { addItem, moveItems, saveItem } from "./actions";

export type ItemView = {
  id: string; name: string; note: string | null; status: Status; tailorId: string | null; tailorName: string | null;
  days: number; collectedBy: string | null; deliveredAt: string | null; redo: number; cancelReason: string | null;
};
type SheetName = "tailor" | "ready" | "redo" | "handover" | "owner" | "add" | null;
type ReadyFor = { ids: string[]; title: string; blurb: string };
const OPEN: Status[] = ["received", "with_tailor", "ready"];

function detail(i: ItemView): string {
  const d = i.days === 0 ? "today" : `${i.days}d`;
  switch (i.status) {
    case "received": return `At shop · ${d}`;
    case "with_tailor": return `At alter${i.tailorName ? ` (${i.tailorName})` : ""} · ${d}`;
    case "ready": return `Ready for pickup · ${d}`;
    case "delivered": return `Delivered to ${i.collectedBy ?? "customer"}${i.deliveredAt ? `, ${i.deliveredAt}` : ""}`;
    default: return `Cancelled${i.cancelReason ? `: ${i.cancelReason}` : ""}`;
  }
}

export function ItemsPanel({ alterationId, label, customerName, items, tailors, role, charge, paid, suggestions, tokenClosed }: {
  alterationId: string; label: string; customerName: string; items: ItemView[]; tailors: Tailor[];
  role: "owner" | "staff"; charge: number | null; paid: boolean; suggestions: string[]; tokenClosed: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<SheetName>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [tailorId, setTailorId] = useState("");
  const [rack, setRack] = useState("");
  const [reason, setReason] = useState("");
  const [who, setWho] = useState<"customer" | "other">("customer");
  const [otherName, setOtherName] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [receivedNow, setReceivedNow] = useState(true);
  const [target, setTarget] = useState<Status | "">("");
  const [newName, setNewName] = useState("");
  const [newNote, setNewNote] = useState("");
  const [editing, setEditing] = useState<ItemView | null>(null);
  const [readyFor, setReadyFor] = useState<ReadyFor | null>(null);

  const open = (s: SheetName) => { setErr(null); setSheet(s); };
  const close = () => { setSheet(null); setEditing(null); };
  const selectable = (i: ItemView) => OPEN.includes(i.status) || (role === "owner" && i.status === "delivered");
  const sel = items.filter((i) => selected.has(i.id) && selectable(i));
  const ids = (f: (i: ItemView) => boolean) => sel.filter(f).map((i) => i.id);
  const sendIds = ids((i) => i.status === "received");                          // at shop, not yet ready -> send to alter
  const backIds = ids((i) => i.status === "with_tailor");                       // at alter -> back from alter (becomes Ready)
  const markIds = sendIds;                                                      // at shop -> mark ready (done in the shop)
  const handIds = ids((i) => i.status === "received" || i.status === "ready");  // anything at the shop can be delivered
  const redoIds = ids((i) => i.status === "ready");                             // ready but not right -> send back
  const unpaid = charge != null && !paid;
  const seen = Object.fromEntries(items.map((i) => [i.id, i.status])) as Record<string, Status>;
  const count = (s: Status) => items.filter((i) => i.status === s).length;

  const toggle = (id: string) => setSelected((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pick = (f: (i: ItemView) => boolean) => setSelected(new Set(items.filter((i) => selectable(i) && f(i)).map((i) => i.id)));

  async function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBusy(true); setErr(null);
    try {
      const r = await fn();
      if (!r.ok) { setErr(r.error); router.refresh(); return false; }
      close(); setSelected(new Set()); setReason(""); setPhoto(null); setNewName(""); setNewNote("");
      router.refresh();
      return true;
    } catch {
      setErr("No internet connection. Nothing was changed. Please try again.");
      return false;
    } finally { setBusy(false); }
  }

  const move = (to: Status, idList: string[], extra: Partial<Parameters<typeof moveItems>[0]> = {}) =>
    run(() => moveItems({ alterationId, pieceIds: idList, to, seen, ...extra }));

  async function handOver() {
    if (who === "other" && !otherName.trim()) { setErr("Enter the name of the person collecting."); return; }
    await run(async () => {
      let photoPath: string | null = null;
      if (photo) {
        try {
          const blob = await compressImage(photo);
          const path = `${alterationId}/handover-${Date.now()}.jpg`;
          const { error } = await createClient().storage.from("item-photos").upload(path, blob, { contentType: "image/jpeg" });
          if (!error) photoPath = path;
        } catch { /* the photo is optional */ }
      }
      return moveItems({
        alterationId, pieceIds: handIds, to: "delivered", seen, photoPath,
        collectedBy: who === "other" ? otherName.trim() : customerName, markPaid: unpaid && receivedNow,
      });
    });
  }

  const tailorSelect = (opts: { sameOption?: boolean } = {}) => (
    <Field label="Tailor" htmlFor="tailor-pick">
      <select id="tailor-pick" value={tailorId} onChange={(e) => setTailorId(e.target.value)} className={inputCls}>
        <option value="">{opts.sameOption ? "Same tailor as before" : "Choose a tailor…"}</option>
        {tailors.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </Field>
  );
  const errorLine = err && <p role="alert" className="rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger">{err}</p>;
  const names = (l: string[]) => items.filter((i) => l.includes(i.id)).map((i) => i.name).join(", ");

  return (
    <section aria-label="Items" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Items</h2>
        {!tokenClosed && (
          <button type="button" onClick={() => { setNewName(""); setNewNote(""); open("add"); }}
            className="flex h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-primary active:bg-border">
            <Plus className="size-4" aria-hidden /> Add item
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick select">
        <button type="button" onClick={() => pick(() => true)} className="h-9 rounded-full border border-border px-3 text-sm font-medium">All</button>
        {[
          { label: "At shop", n: count("received") + count("ready"), f: (i: ItemView) => i.status === "received" || i.status === "ready" },
          { label: "At alter", n: count("with_tailor"), f: (i: ItemView) => i.status === "with_tailor" },
          { label: "Ready", n: count("ready"), f: (i: ItemView) => i.status === "ready" },
        ].filter((c) => c.n > 0).map((c) => (
          <button key={c.label} type="button" onClick={() => pick(c.f)} className="h-9 rounded-full border border-border px-3 text-sm font-medium">
            {c.label} ({c.n})
          </button>
        ))}
        {selected.size > 0 && <button type="button" onClick={() => setSelected(new Set())} className="h-9 rounded-full px-3 text-sm font-medium text-muted">Clear</button>}
      </div>

      <ul className="space-y-2">
        {items.map((i) => {
          const can = selectable(i);
          const on = selected.has(i.id) && can;
          return (
            <li key={i.id} className={cn("flex items-start gap-3 rounded-xl border bg-card p-3", on ? "border-primary ring-1 ring-primary" : "border-border", !OPEN.includes(i.status) && "opacity-80")}>
              <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
                <input type="checkbox" checked={on} disabled={!can} onChange={() => toggle(i.id)} aria-label={`Select ${i.name}`}
                  className="size-6 accent-[var(--primary)] disabled:opacity-30" />
              </label>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{i.name}</span>
                  <StatusBadge status={i.status} />
                </div>
                {i.note && <p className="text-sm">{i.note}</p>}
                <p className="text-xs text-muted">{detail(i)}{i.redo > 0 && ` · redo ×${i.redo}`}</p>
              </div>
              {OPEN.includes(i.status) && (
                <button type="button" aria-label={`Edit ${i.name}`} onClick={() => { setEditing(i); setNewName(i.name); setNewNote(i.note ?? ""); open("add"); }}
                  className="flex size-11 shrink-0 items-center justify-center rounded-full active:bg-border">
                  <Pencil className="size-5" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {sel.length > 0 && <div className="h-28" aria-hidden />}

      {sel.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 px-4">
          <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-3 shadow-xl">
            <p className="mb-2 text-sm font-semibold">{sel.length} selected</p>
            <div className="grid grid-cols-2 gap-2">
              {sendIds.length > 0 && <Btn className="h-11 text-sm" onClick={() => { setTailorId(""); open("tailor"); }}>Send to alter ({sendIds.length})</Btn>}
              {backIds.length > 0 && <Btn className="h-11 text-sm" onClick={() => { setReadyFor({ ids: backIds, title: `${backIds.length} back from alter`, blurb: "Confirm they are back from the tailor. They will show as Ready for pickup." }); open("ready"); }}>Back from alter ({backIds.length})</Btn>}
              {markIds.length > 0 && <Btn className="h-11 text-sm" variant="secondary" onClick={() => { setReadyFor({ ids: markIds, title: `Mark ${markIds.length} ready`, blurb: "Use this when the work was done in the shop and the item is waiting for the customer." }); open("ready"); }}>Mark ready ({markIds.length})</Btn>}
              {handIds.length > 0 && <Btn className="h-11 text-sm" onClick={() => { setWho("customer"); setReceivedNow(true); open("handover"); }}>Hand over ({handIds.length})</Btn>}
              {redoIds.length > 0 && <Btn className="h-11 text-sm" variant="secondary" onClick={() => { setTailorId(""); setReason(""); open("redo"); }}>Needs redo ({redoIds.length})</Btn>}
              {role === "owner" && <Btn className="h-11 text-sm" variant="secondary" onClick={() => { setReason(""); setTarget(""); setTailorId(""); open("owner"); }}>Owner actions</Btn>}
            </div>
          </div>
        </div>
      )}

      <Sheet open={sheet === "tailor"} onClose={close} title={`Send ${sendIds.length} to alter`}>
        <div className="space-y-3">
          <p className="text-sm text-muted">{names(sendIds)}</p>
          {tailorSelect()}{errorLine}
          <Btn disabled={busy || !tailorId} onClick={() => move("with_tailor", sendIds, { tailorId })}>{busy ? "Saving…" : "Send to alter"}</Btn>
        </div>
      </Sheet>

      <Sheet open={sheet === "ready"} onClose={close} title={readyFor?.title ?? "Mark ready"}>
        <div className="space-y-3">
          <p className="text-sm text-muted">{names(readyFor?.ids ?? [])}</p>
          <p className="text-sm text-muted">{readyFor?.blurb}</p>
          <Field label="Rack / shelf label (optional)" htmlFor="rack-ready"><input id="rack-ready" value={rack} onChange={(e) => setRack(e.target.value)} className={inputCls} /></Field>
          {errorLine}
          <Btn disabled={busy} onClick={() => move("ready", readyFor?.ids ?? [], { rack })}>{busy ? "Saving…" : "Confirm"}</Btn>
        </div>
      </Sheet>

      <Sheet open={sheet === "redo"} onClose={close} title={`Redo ${redoIds.length} item${redoIds.length === 1 ? "" : "s"}`}>
        <div className="space-y-3">
          <p className="text-sm text-muted">{names(redoIds)}</p>
          <Field label="What is wrong?" htmlFor="redo-reason"><input id="redo-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. waist still loose" className={inputCls} /></Field>
          {tailorSelect({ sameOption: true })}{errorLine}
          <Btn disabled={busy || !reason.trim()} onClick={() => move("with_tailor", redoIds, { note: reason, tailorId })}>{busy ? "Saving…" : "Send back to alter"}</Btn>
        </div>
      </Sheet>

      <Sheet open={sheet === "handover"} onClose={close} title={`Hand over ${handIds.length}`}>
        <div className="space-y-4">
          <p className="text-sm text-muted">{names(handIds)}</p>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">Who is collecting?</legend>
            <label className="flex h-11 items-center gap-3"><input type="radio" name="who" checked={who === "customer"} onChange={() => setWho("customer")} className="size-5 accent-[var(--primary)]" /> {customerName}</label>
            <label className="flex h-11 items-center gap-3"><input type="radio" name="who" checked={who === "other"} onChange={() => setWho("other")} className="size-5 accent-[var(--primary)]" /> Someone else</label>
            {who === "other" && <input aria-label="Name of person collecting" value={otherName} onChange={(e) => setOtherName(e.target.value)} placeholder="Their name" className={inputCls} />}
          </fieldset>
          {unpaid && (
            <div className="rounded-xl border border-amber-400/60 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
              <p className="font-semibold">Charge {rupees(charge)} is unpaid.</p>
              <label className="mt-1 flex h-11 items-center gap-3 font-medium">
                <input type="checkbox" checked={receivedNow} onChange={(e) => setReceivedNow(e.target.checked)} className="size-6 accent-[var(--primary)]" /> Payment received now
              </label>
            </div>
          )}
          <label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border font-medium text-primary">
            <Camera className="size-5" aria-hidden /> {photo ? "Photo added ✓" : "Handover photo (optional)"}
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </label>
          {errorLine}
          <Btn disabled={busy} onClick={handOver}>{busy ? "Saving…" : "Confirm handover"}</Btn>
        </div>
      </Sheet>

      <Sheet open={sheet === "owner"} onClose={close} title="Owner actions">
        <div className="space-y-4">
          <p className="text-sm text-muted">{sel.length} selected: {names(sel.map((i) => i.id))}</p>
          <Field label="Move back to" htmlFor="owner-target">
            <select id="owner-target" value={target} onChange={(e) => setTarget(e.target.value as Status)} className={inputCls}>
              <option value="">Choose…</option>
              <option value="received">At shop</option><option value="with_tailor">At alter</option><option value="ready">At shop · Ready</option>
            </select>
          </Field>
          {target === "with_tailor" && tailorSelect({ sameOption: true })}
          <Field label="Reason (required)" htmlFor="owner-reason"><input id="owner-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} /></Field>
          {errorLine}
          <Btn variant="secondary" disabled={busy || !target || !reason.trim()}
            onClick={() => move(target as Status, sel.map((i) => i.id), { note: reason, tailorId })}>Move back</Btn>
          {sel.some((i) => OPEN.includes(i.status)) && (
            <Btn variant="danger" disabled={busy || !reason.trim()} onClick={() => {
              if (confirm(`Cancel ${sel.filter((i) => OPEN.includes(i.status)).length} item(s)? They will leave all lists.`)) move("cancelled", sel.filter((i) => OPEN.includes(i.status)).map((i) => i.id), { note: reason });
            }}>Cancel selected items</Btn>
          )}
        </div>
      </Sheet>

      <Sheet open={sheet === "add"} onClose={close} title={editing ? "Edit item" : "Add item"}>
        <div className="space-y-3">
          <ItemInput id="add-name" label="What is it?" value={newName} onChange={setNewName} suggestions={suggestions} />
          <Field label="Work to do (optional)" htmlFor="add-note"><input id="add-note" value={newNote} onChange={(e) => setNewNote(e.target.value)} className={inputCls} /></Field>
          {errorLine}
          <Btn disabled={busy || !newName.trim()} onClick={() => run(() => editing ? saveItem({ id: editing.id, name: newName, note: newNote }) : addItem({ alterationId, name: newName, note: newNote }))}>
            {busy ? "Saving…" : editing ? "Save" : "Add item"}
          </Btn>
        </div>
      </Sheet>
      <span className="sr-only">Token {label}</span>
    </section>
  );
}
