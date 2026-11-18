"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { todayIST } from "@/lib/format";
import { Sheet } from "@/components/sheet";
import { Btn, Field, inputCls } from "@/components/ui";
import { editCustomer, saveAlteration } from "./actions";

type Alt = { id: string; promised: string; charge: number | null; paid: boolean; rack: string; customerId: string; customerName: string; customerPhone: string };

export function EditDetails({ alt: a, role }: { alt: Alt; role: "owner" | "staff" }) {
  const key = [a.promised, a.charge, a.paid, a.rack, a.customerName, a.customerPhone].join("|");
  return <EditInner key={key} a={a} role={role} />;
}

function EditInner({ a, role }: { a: Alt; role: "owner" | "staff" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [promised, setPromised] = useState(a.promised);
  const [charge, setCharge] = useState(a.charge == null ? "" : String(a.charge));
  const [paid, setPaid] = useState(a.paid);
  const [rack, setRack] = useState(a.rack);
  const [cName, setCName] = useState(a.customerName);
  const [cPhone, setCPhone] = useState(a.customerPhone);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (saved && !refreshing) { setOpen(false); setSaved(false); } }, [saved, refreshing]);

  async function go(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBusy(true); setErr(null);
    try {
      const r = await fn();
      if (!r.ok) { setErr(r.error); return; }
      setSaved(true); startRefresh(() => router.refresh());
    } catch { setErr("No internet connection. Please try again."); } finally { setBusy(false); }
  }

  return (
    <>
      <Btn variant="secondary" onClick={() => { setErr(null); setOpen(true); }}>Edit details</Btn>
      <Sheet open={open} onClose={() => setOpen(false)} title="Edit details">
        <div className="space-y-3">
          <Field label="Promised date" htmlFor="e-date"><input id="e-date" type="date" min={todayIST()} value={promised} onChange={(e) => setPromised(e.target.value)} className={inputCls} /></Field>
          <Field label="Charge (₹)" htmlFor="e-charge"><input id="e-charge" type="number" inputMode="decimal" min={0} value={charge} onChange={(e) => setCharge(e.target.value)} className={inputCls} /></Field>
          <label className="flex h-11 items-center gap-3 font-medium"><input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="size-6 accent-[var(--primary)]" /> Paid</label>
          <Field label="Rack / shelf label" htmlFor="e-rack"><input id="e-rack" value={rack} onChange={(e) => setRack(e.target.value)} className={inputCls} /></Field>
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <Btn disabled={busy} onClick={() => go(() => saveAlteration({ id: a.id, promised, charge: charge.trim() === "" ? null : Number(charge), paid, rack }))}>{busy || refreshing ? "Saving…" : "Save"}</Btn>

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
    </>
  );
}
