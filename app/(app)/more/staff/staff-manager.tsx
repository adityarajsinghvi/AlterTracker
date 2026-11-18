"use client";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Sheet } from "@/components/sheet";
import { Btn, Field, inputCls } from "@/components/ui";
import { useAction } from "@/lib/use-action";
import { addStaff, resetPin, setStaffActive } from "../actions";

type Person = { id: string; name: string; phone: string | null; role: string; active: boolean };

export function StaffManager({ staff, meId }: { staff: Person[]; meId: string }) {
  const [adding, setAdding] = useState(false);
  const [target, setTarget] = useState<Person | null>(null);
  const [created, setCreated] = useState<{ name: string; pin: string } | null>(null);
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [pin, setPin] = useState("");
  const add = useAction(); const reset = useAction(); const toggle = useAction();
  const [newPin, setNewPin] = useState("");

  return (
    <div className="space-y-4">
      <Btn onClick={() => { setName(""); setPhone(""); setPin(""); add.setErr(null); setAdding(true); }}>
        <span className="inline-flex items-center gap-2"><UserPlus className="size-5" aria-hidden /> Add staff</span>
      </Btn>
      {toggle.err && <p role="alert" className="rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger">{toggle.err}</p>}

      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {staff.map((p) => (
          <li key={p.id} className="space-y-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{p.name} {p.id === meId && <span className="text-xs font-normal text-muted">(you)</span>}</p>
                <p className="text-sm text-muted">{p.role}{p.phone ? ` · ${p.phone}` : ""}</p>
              </div>
              <span className={p.active ? "rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100"
                : "rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-900 dark:bg-red-900/40 dark:text-red-100"}>
                {p.active ? "Active" : "Switched off"}
              </span>
            </div>
            <div className="flex gap-2">
              <Btn variant="secondary" className="h-11 text-sm" onClick={() => { setNewPin(""); reset.setErr(null); setTarget(p); }}>Reset PIN</Btn>
              {p.id !== meId && (
                <Btn variant={p.active ? "danger" : "secondary"} className="h-11 text-sm" disabled={toggle.busy}
                  onClick={() => {
                    if (p.active && !confirm(`Switch off ${p.name}? They will be logged out and locked out immediately.`)) return;
                    toggle.run(() => setStaffActive(p.id, !p.active));
                  }}>
                  {p.active ? "Switch off" : "Switch on"}
                </Btn>
              )}
            </div>
          </li>
        ))}
      </ul>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add staff">
        <div className="space-y-3">
          <Field label="Name" htmlFor="s-name"><input id="s-name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></Field>
          <Field label="4-digit PIN" htmlFor="s-pin" hint="They log in with their name and this PIN. Each person needs a different name.">
            <input id="s-pin" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className={inputCls} />
          </Field>
          <Field label="Mobile number (optional)" htmlFor="s-phone"><input id="s-phone" type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} /></Field>
          {add.err && <p role="alert" className="text-sm text-danger">{add.err}</p>}
          <Btn disabled={add.busy} onClick={() => add.run(() => addStaff({ name, phone, pin }), () => { setAdding(false); setCreated({ name: name.trim(), pin }); })}>
            {add.busy ? "Adding…" : "Add staff"}
          </Btn>
        </div>
      </Sheet>

      <Sheet open={!!target} onClose={() => setTarget(null)} title={`Reset PIN: ${target?.name ?? ""}`}>
        <div className="space-y-3">
          <Field label="New 4-digit PIN" htmlFor="r-pin" hint="They will need to log in again with the new PIN.">
            <input id="r-pin" inputMode="numeric" maxLength={4} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} className={inputCls} />
          </Field>
          {reset.err && <p role="alert" className="text-sm text-danger">{reset.err}</p>}
          <Btn disabled={reset.busy || newPin.length !== 4}
            onClick={() => reset.run(() => resetPin({ userId: target!.id, pin: newPin }), () => { const t = target!; setTarget(null); setCreated({ name: t.name, pin: newPin }); })}>
            {reset.busy ? "Saving…" : "Save new PIN"}
          </Btn>
        </div>
      </Sheet>

      <Sheet open={!!created} onClose={() => setCreated(null)} title="Done">
        {created && (
          <div className="space-y-3">
            <p>Tell <b>{created.name}</b> to log in with:</p>
            <p className="rounded-xl border border-border p-3 text-lg">Name <b>{created.name}</b><br />PIN <b>{created.pin}</b></p>
            <p className="text-sm text-muted">This PIN is not shown again.</p>
            <Btn onClick={() => setCreated(null)}>OK</Btn>
          </div>
        )}
      </Sheet>
    </div>
  );
}
