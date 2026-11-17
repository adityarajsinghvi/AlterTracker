"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image";
import { ITEM_TYPES } from "@/lib/format";
import { Sheet } from "@/components/sheet";
import { Btn, Field, inputCls } from "@/components/ui";
import { attachPhotos, savePiece } from "./actions";

export type PieceView = {
  id: string; item_type: string; description: string | null; work_notes: string; photo_pending: boolean; photo_paths: string[];
};

export function PieceCard({ piece, alterationId, closed, photoUrls }: {
  piece: PieceView; alterationId: string; closed: boolean; photoUrls: string[];
}) {
  const router = useRouter();
  const [zoom, setZoom] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function addPhoto(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true); setMsg(null);
    try {
      const supabase = createClient();
      const paths: string[] = [];
      for (const [n, f] of Array.from(files).entries()) {
        const blob = await compressImage(f);
        const path = `${alterationId}/${piece.id}-${Date.now()}-${n}.jpg`;
        const { error } = await supabase.storage.from("item-photos").upload(path, blob, { contentType: "image/jpeg" });
        if (error) throw error;
        paths.push(path);
      }
      const r = await attachPhotos(piece.id, paths, false);
      if (!r.ok) throw new Error(r.error);
      router.refresh();
    } catch {
      setMsg("Photo did not upload. Check your internet and try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{piece.item_type}</p>
          {piece.description && <p className="text-sm text-muted">{piece.description}</p>}
        </div>
        {!closed && (
          <button type="button" onClick={() => setEditing(true)} aria-label={`Edit ${piece.item_type} notes`}
            className="flex size-11 shrink-0 items-center justify-center rounded-full active:bg-border">
            <Pencil className="size-5" />
          </button>
        )}
      </div>
      <p className="mt-1 whitespace-pre-wrap">{piece.work_notes}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {photoUrls.map((u) => (
          <button key={u} type="button" onClick={() => setZoom(u)} aria-label="Enlarge photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt={`${piece.item_type} photo`} className="size-20 rounded-lg border border-border object-cover" loading="lazy" />
          </button>
        ))}
        {!closed && (
          <label className="flex h-20 min-w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border px-3 text-xs font-medium text-primary">
            <Camera className="size-5" aria-hidden />
            {uploading ? "Uploading…" : piece.photo_pending ? "Add photo (pending)" : "Add photo"}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" disabled={uploading}
              onChange={(e) => addPhoto(e.target.files)} />
          </label>
        )}
      </div>
      {piece.photo_pending && !uploading && !closed && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Photo pending: it did not upload when saved.</p>
      )}
      {msg && <p role="alert" className="mt-2 text-sm text-danger">{msg}</p>}

      <Sheet open={!!zoom} onClose={() => setZoom(null)} title="Photo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {zoom && <img src={zoom} alt={`${piece.item_type} photo, enlarged`} className="max-h-[70dvh] w-full rounded-lg object-contain" />}
      </Sheet>
      <EditPiece key={piece.item_type + piece.description + piece.work_notes} piece={piece} open={editing} onClose={() => setEditing(false)} />
    </div>
  );
}

function EditPiece({ piece, open, onClose }: { piece: PieceView; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [type, setType] = useState(piece.item_type);
  const [desc, setDesc] = useState(piece.description ?? "");
  const [notes, setNotes] = useState(piece.work_notes);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true); setErr(null);
    try {
      const r = await savePiece({ id: piece.id, itemType: type, description: desc, workNotes: notes });
      if (!r.ok) { setErr(r.error); return; }
      onClose(); router.refresh();
    } catch { setErr("No internet connection. Please try again."); } finally { setBusy(false); }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Edit piece">
      <div className="space-y-3">
        <Field label="Type" htmlFor="pt">
          <select id="pt" value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
            {ITEM_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Description" htmlFor="pd"><input id="pd" value={desc} onChange={(e) => setDesc(e.target.value)} className={inputCls} /></Field>
        <Field label="Work to be done" htmlFor="pn">
          <textarea id="pn" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputCls} h-auto py-3`} />
        </Field>
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <Btn onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Btn>
      </div>
    </Sheet>
  );
}
