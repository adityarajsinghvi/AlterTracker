"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Sheet } from "@/components/sheet";
import { Btn, Field, inputCls } from "@/components/ui";
import { useAction } from "@/lib/use-action";
import { saveTailor, setTailorActive } from "../actions";

type T = { id: string; name: string; phone: string | null; is_in_house: boolean; active: boolean };

export function TailorManager({ tailors }: { tailors: T[] }) {
  const [edit, setEdit] = useState<T | "new" | null>(null);
  const [name, setName] = useState(""); const [phone, setPhone] = useState("");
  const save = useAction(); const toggle = useAction();

  const open = (t: T | "new") => { setName(t === "new" ? "" : t.name); setPhone(t === "new" ? "" : t.phone ?? ""); save.setErr(null); setEdit(t); };

  return (
    <div className="space-y-4">
      <Btn onClick={() => open("new")}><span className="inline-flex items-center gap-2"><Plus className="size-5" aria-hidden /> Add tailor</span></Btn>
      {toggle.err && <p role="alert" className="text-sm text-danger">{toggle.err}</p>}
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {tailors.map((t) => (
          <li key={t.id} className="space-y-2 p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{t.name}</p>
                <p className="text-sm text-muted">{t.is_in_house ? "Work done at the shop" : t.phone || "No phone"}</p>
              </div>
              {!t.active && <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-900 dark:bg-red-900/40 dark:text-red-100">Inactive</span>}
            </div>
            <div className="flex gap-2">
              <Btn variant="secondary" className="h-11 text-sm" onClick={() => open(t)}>Edit</Btn>
              {!t.is_in_house && (
                <Btn variant={t.active ? "danger" : "secondary"} className="h-11 text-sm" disabled={toggle.busy}
                  onClick={() => toggle.run(() => setTailorActive(t.id, !t.active))}>
                  {t.active ? "Deactivate" : "Reactivate"}
                </Btn>
              )}
            </div>
          </li>
        ))}
      </ul>

      <Sheet open={edit !== null} onClose={() => setEdit(null)} title={edit === "new" ? "Add tailor" : "Edit tailor"}>
        <div className="space-y-3">
          <Field label="Name" htmlFor="t-name"><input id="t-name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></Field>
          <Field label="Mobile number (optional)" htmlFor="t-phone"><input id="t-phone" type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} /></Field>
          {save.err && <p role="alert" className="text-sm text-danger">{save.err}</p>}
          <Btn disabled={save.busy} onClick={() => save.run(() => saveTailor({ id: edit && edit !== "new" ? edit.id : undefined, name, phone }), () => setEdit(null))}>
            {save.busy ? "Saving…" : "Save"}
          </Btn>
        </div>
      </Sheet>
    </div>
  );
}
