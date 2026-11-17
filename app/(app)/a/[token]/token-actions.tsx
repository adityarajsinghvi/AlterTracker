"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image";
import { STATUS_LABEL, rupees, todayIST } from "@/lib/format";
import type { Status, Tailor } from "@/lib/types";
import { Sheet } from "@/components/sheet";
import { Btn, Field, inputCls } from "@/components/ui";
import { advance, editCustomer, saveAlteration } from "./actions";

type Alt = {
  id: string; status: Status; promised: string; tailorId: string | null; charge: number | null; paid: boolean;
  rack: string; customerId: string; customerName: string; customerPhone: string; label: string;
};
type SheetName = "tailor" | "ready" | "redo" | "handover" | "edit" | "owner" | null;

const RANK: Record<string, number> = { received: 0, with_tailor: 1, ready: 2, delivered: 3 };

export function TokenActions({ alteration: a, tailors, role }: { alteration: Alt; tailors: Tailor[]; role: "owner" | "staff" }) {
  const router = useRouter();
  const [sheet, setSheet] = useState<SheetName>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [tailorId, setTailorId] = useState(a.tailorId ?? "");
  const [rack, setRack] = useState(a.rack);
  const [reason, setReason] = useState("");
  const [who, setWho] = useState<"customer" | "other">("customer");
  const [otherName, setOtherName] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [receivedNow, setReceivedNow] = useState(true);
  const [target, setTarget] = useState<Status | "">("");

  const open = (s: SheetName) => { setErr(null); setSheet(s); };
  const close = () => setSheet(null);

  async function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBusy(true); setErr(null);
    try {
      const r = await fn();
      if (!r.ok) { setErr(r.error); router.refresh(); return; }
      close(); setReason(""); setPhoto(null);
      router.refresh();
    } catch {
      setErr("No internet connection. Nothing was changed. Please try again.");
    } finally { setBusy(false); }
  }

  const move = (to: Status, extra: Partial<Parameters<typeof advance>[0]> = {}) =>
    run(() => advance({ id: a.id, to, expectedFrom: a.status, ...extra }));

  const unpaid = a.charge != null && !a.paid;
  const isOpen = a.status !== "delivered" && a.status !== "cancelled";
  const backTargets = (["received", "with_tailor", "ready"] as Status[]).filter(
    (s) => RANK[s] < RANK[a.status] && !(a.status === "ready" && s === "with_tailor"));

  const tailorSelect = (
    <Field label="Tailor" htmlFor="tailor-pick">
      <select id="tailor-pick" value={tailorId} onChange={(e) => setTailorId(e.target.value)} className={inputCls}>
        <option value="">Choose a tailor…</option>
        {tailors.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </Field>
  );
  const errorLine = err && <p role="alert" className="rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger">{err}</p>;

  async function handOver() {
    if (who === "other" && !otherName.trim()) { setErr("Enter the name of the person collecting."); return; }
    await run(async () => {
      let photoPath: string | null = null;
      if (photo) {
        try {
          const blob = await compressImage(photo);
          const path = `${a.id}/handover-${Date.now()}.jpg`;
          const { error } = await createClient().storage.from("item-photos").upload(path, blob, { contentType: "image/jpeg" });
          if (!error) photoPath = path;
        } catch { /* photo is optional; hand over without it */ }
      }
      return advance({
        id: a.id, to: "delivered", expectedFrom: a.status, photoPath,
        collectedBy: who === "other" ? otherName.trim() : a.customerName, markPaid: unpaid && receivedNow,
      });
    });
  }

  return (
    <section aria-label="Actions" className="space-y-3">
      {a.status === "received" && (
        <>
          <Btn onClick={() => open("tailor")}>Send to tailor</Btn>
          <Btn variant="secondary" onClick={() => open("ready")}>Mark ready (done in-house)</Btn>
        </>
      )}
      {a.status === "with_tailor" && <Btn onClick={() => open("ready")}>Mark ready</Btn>}
      {a.status === "ready" && (
        <>
          <Btn onClick={() => open("handover")}>Hand over</Btn>
          <Btn variant="secondary" onClick={() => { setTailorId(a.tailorId ?? ""); open("redo"); }}>Needs redo</Btn>
        </>
      )}
      {isOpen && <Btn variant="secondary" onClick={() => open("edit")}>Edit details</Btn>}
      {role === "owner" && a.status !== "cancelled" && <Btn variant="secondary" onClick={() => open("owner")}>Owner actions</Btn>}

      <Sheet open={sheet === "tailor"} onClose={close} title="Send to tailor">
        <div className="space-y-3">
          {tailorSelect}{errorLine}
          <Btn disabled={busy || !tailorId} onClick={() => move("with_tailor", { tailorId })}>{busy ? "Saving…" : "Send to tailor"}</Btn>
        </div>
      </Sheet>

      <Sheet open={sheet === "ready"} onClose={close} title="Mark ready">
        <div className="space-y-3">
          <p className="text-sm text-muted">Confirm every piece is back and on the pickup shelf.</p>
          <Field label="Rack / shelf label (optional)" htmlFor="rack-ready">
            <input id="rack-ready" value={rack} onChange={(e) => setRack(e.target.value)} className={inputCls} />
          </Field>
          {errorLine}
          <Btn disabled={busy} onClick={() => move("ready", { rack })}>{busy ? "Saving…" : "Mark ready"}</Btn>
        </div>
      </Sheet>

      <Sheet open={sheet === "redo"} onClose={close} title="Needs redo">
        <div className="space-y-3">
          <Field label="What is wrong?" htmlFor="redo-reason">
            <input id="redo-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. waist still loose" className={inputCls} />
          </Field>
          {tailorSelect}{errorLine}
          <Btn disabled={busy || !reason.trim() || !tailorId} onClick={() => move("with_tailor", { note: reason, tailorId })}>
            {busy ? "Saving…" : "Send back to tailor"}
          </Btn>
        </div>
      </Sheet>

      <Sheet open={sheet === "handover"} onClose={close} title="Hand over">
        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">Who is collecting?</legend>
            <label className="flex h-11 items-center gap-3"><input type="radio" name="who" checked={who === "customer"} onChange={() => setWho("customer")} className="size-5 accent-[var(--primary)]" /> {a.customerName}</label>
            <label className="flex h-11 items-center gap-3"><input type="radio" name="who" checked={who === "other"} onChange={() => setWho("other")} className="size-5 accent-[var(--primary)]" /> Someone else</label>
            {who === "other" && <input aria-label="Name of person collecting" value={otherName} onChange={(e) => setOtherName(e.target.value)} placeholder="Their name" className={inputCls} />}
          </fieldset>
          {unpaid && (
            <div className="rounded-xl border border-amber-400/60 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
              <p className="font-semibold">Charge {rupees(a.charge)} is unpaid.</p>
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

      <EditSheet key={[a.promised, a.tailorId, a.charge, a.paid, a.rack, a.customerName, a.customerPhone].join("|")} open={sheet === "edit"} onClose={close} alt={a} tailors={tailors} role={role} />

      <Sheet open={sheet === "owner"} onClose={close} title="Owner actions">
        <div className="space-y-5">
          {backTargets.length > 0 || a.status === "delivered" ? (
            <div className="space-y-2">
              <h3 className="font-semibold">Move back</h3>
              <select aria-label="Move back to" value={target} onChange={(e) => setTarget(e.target.value as Status)} className={inputCls}>
                <option value="">Move back to…</option>
                {(a.status === "delivered" ? (["received", "with_tailor", "ready"] as Status[]) : backTargets).map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            </div>
          ) : null}
          <Field label="Reason (required)" htmlFor="owner-reason">
            <input id="owner-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} />
          </Field>
          {errorLine}
          {(backTargets.length > 0 || a.status === "delivered") && (
            <Btn variant="secondary" disabled={busy || !target || !reason.trim()}
              onClick={() => move(target as Status, { note: reason, tailorId: tailorId || a.tailorId })}>Move back</Btn>
          )}
          {isOpen && <Btn variant="danger" disabled={busy || !reason.trim()} onClick={() => {
            if (confirm(`Cancel token #${a.label}? It will leave all lists.`)) move("cancelled", { note: reason });
          }}>Cancel this token</Btn>}
        </div>
      </Sheet>
    </section>
  );
}

function EditSheet({ open, onClose, alt: a, tailors, role }: { open: boolean; onClose: () => void; alt: Alt; tailors: Tailor[]; role: "owner" | "staff" }) {
  const router = useRouter();
  const [promised, setPromised] = useState(a.promised);
  const [tailorId, setTailorId] = useState(a.tailorId ?? "");
  const [charge, setCharge] = useState(a.charge == null ? "" : String(a.charge));
  const [paid, setPaid] = useState(a.paid);
  const [rack, setRack] = useState(a.rack);
  const [cName, setCName] = useState(a.customerName);
  const [cPhone, setCPhone] = useState(a.customerPhone);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBusy(true); setErr(null);
    try {
      const r = await fn();
      if (!r.ok) { setErr(r.error); return; }
      onClose(); router.refresh();
    } catch { setErr("No internet connection. Please try again."); } finally { setBusy(false); }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Edit details">
      <div className="space-y-3">
        <Field label="Promised date" htmlFor="e-date"><input id="e-date" type="date" min={todayIST()} value={promised} onChange={(e) => setPromised(e.target.value)} className={inputCls} /></Field>
        <Field label="Tailor" htmlFor="e-tailor">
          <select id="e-tailor" value={tailorId} onChange={(e) => setTailorId(e.target.value)} className={inputCls}>
            <option value="">None</option>
            {tailors.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="Charge (₹)" htmlFor="e-charge"><input id="e-charge" type="number" inputMode="decimal" min={0} value={charge} onChange={(e) => setCharge(e.target.value)} className={inputCls} /></Field>
        <label className="flex h-11 items-center gap-3 font-medium"><input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="size-6 accent-[var(--primary)]" /> Paid</label>
        <Field label="Rack / shelf label" htmlFor="e-rack"><input id="e-rack" value={rack} onChange={(e) => setRack(e.target.value)} className={inputCls} /></Field>
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <Btn disabled={busy} onClick={() => go(() => saveAlteration({
          id: a.id, promised, tailorId: tailorId || null, charge: charge.trim() === "" ? null : Number(charge), paid, rack,
        }))}>{busy ? "Saving…" : "Save"}</Btn>

        {role === "owner" && (
          <div className="space-y-3 border-t border-border pt-4">
            <h3 className="font-semibold">Customer (owner only)</h3>
            <Field label="Name" htmlFor="c-name"><input id="c-name" value={cName} onChange={(e) => setCName(e.target.value)} className={inputCls} /></Field>
            <Field label="Mobile number" htmlFor="c-phone"><input id="c-phone" type="tel" inputMode="numeric" value={cPhone} onChange={(e) => setCPhone(e.target.value)} className={inputCls} /></Field>
            <Btn variant="secondary" disabled={busy} onClick={() => go(() => editCustomer({ id: a.customerId, name: cName, phone: cPhone }))}>Save customer</Btn>
          </div>
        )}
      </div>
    </Sheet>
  );
}
