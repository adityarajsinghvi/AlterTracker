"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Sheet } from "@/components/sheet";
import { Btn, Field, inputCls } from "@/components/ui";
import { deleteEntry } from "./actions";

/** Owner only. Removes the whole entry for good; a short record of the deletion is kept. */
export function DeleteEntry({ alterationId, label, customerName, itemCount }: {
  alterationId: string; label: string; customerName: string; itemCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setBusy(true); setErr(null);
    try {
      const r = await deleteEntry({ alterationId, reason });
      if (!r.ok) { setErr(r.error); return; }
      router.replace("/");
      router.refresh();
    } catch { setErr("No internet connection. Nothing was deleted. Please try again."); } finally { setBusy(false); }
  }

  return (
    <section aria-label="Delete entry" className="border-t border-border pt-5">
      <Btn variant="danger" onClick={() => { setTyped(""); setReason(""); setErr(null); setOpen(true); }}>
        <span className="inline-flex items-center gap-2"><Trash2 className="size-5" aria-hidden /> Delete this entry</span>
      </Btn>
      <Sheet open={open} onClose={() => setOpen(false)} title={`Delete #${label}?`}>
        <div className="space-y-3">
          <p className="rounded-xl border border-danger/40 p-3 text-sm">
            This permanently removes <b>#{label}</b> for <b>{customerName}</b> with its {itemCount} item{itemCount === 1 ? "" : "s"}, photos, history and WhatsApp
            record. It cannot be undone. The token number will not be used again. To keep a record without deleting, cancel the items instead.
          </p>
          <Field label="Reason (optional)" htmlFor="del-reason"><input id="del-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. entered by mistake" className={inputCls} /></Field>
          <Field label={`Type ${label} to confirm`} htmlFor="del-confirm">
            <input id="del-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className={inputCls} />
          </Field>
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <Btn variant="danger" disabled={busy || typed.trim() !== label} onClick={go}>{busy ? "Deleting…" : "Delete permanently"}</Btn>
        </div>
      </Sheet>
    </section>
  );
}
