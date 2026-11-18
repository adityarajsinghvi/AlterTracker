"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { uploadPhoto } from "@/lib/upload";
import { compressImage } from "@/lib/image";
import { Sheet } from "@/components/sheet";
import { attachVisitPhotos } from "./actions";

/** Photos belong to the whole visit: one picture can show every item. */
export function VisitPhotos({ alterationId, urls, pending, closed }: { alterationId: string; urls: string[]; pending: boolean; closed: boolean }) {
  const router = useRouter();
  const [zoom, setZoom] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true); setMsg(null);
    try {
      const paths: string[] = [];
      for (const [n, f] of Array.from(files).entries()) {
        const blob = await compressImage(f);
        const path = `${alterationId}/visit-${Date.now()}-${n}.jpg`;
        if (!(await uploadPhoto(path, blob))) throw new Error("upload failed");
        paths.push(path);
      }
      const r = await attachVisitPhotos(alterationId, paths, false);
      if (!r.ok) throw new Error(r.error);
      startRefresh(() => router.refresh());
    } catch {
      setMsg("Photo did not upload. Check your internet and try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (closed && urls.length === 0) return null;
  return (
    <section aria-label="Photos" className="space-y-2">
      <h2 className="text-lg font-semibold">Photos</h2>
      <div className="flex flex-wrap items-center gap-2">
        {urls.map((u, n) => (
          <button key={u} type="button" onClick={() => setZoom(u)} aria-label={`Enlarge photo ${n + 1}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt={`Visit photo ${n + 1}`} loading="lazy" className="size-24 rounded-lg border border-border object-cover" />
          </button>
        ))}
        {!closed && (
          <label className="flex h-24 min-w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border px-3 text-xs font-medium text-primary">
            <Camera className="size-5" aria-hidden />
            {uploading ? "Uploading…" : refreshing ? "Updating…" : urls.length ? "Add photo" : pending ? "Add photo (pending)" : "Add photo"}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" disabled={uploading} onChange={(e) => add(e.target.files)} />
          </label>
        )}
      </div>
      {pending && !uploading && !closed && <p className="text-xs text-amber-700 dark:text-amber-300">A photo did not upload when this was saved. Please add it again.</p>}
      {msg && <p role="alert" className="text-sm text-danger">{msg}</p>}
      <Sheet open={!!zoom} onClose={() => setZoom(null)} title="Photo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {zoom && <img src={zoom} alt="Visit photo, enlarged" className="max-h-[70dvh] w-full rounded-lg object-contain" />}
      </Sheet>
    </section>
  );
}
