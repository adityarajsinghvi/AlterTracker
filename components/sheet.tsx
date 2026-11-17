"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export function Sheet({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-xl self-end overflow-y-auto rounded-t-2xl bg-card p-0 text-foreground backdrop:bg-black/50 sm:m-auto sm:rounded-2xl">
      {open && (
        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="flex size-11 items-center justify-center rounded-full active:bg-border">
              <X className="size-5" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
