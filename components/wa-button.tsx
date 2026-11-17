"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, MessageCircle } from "lucide-react";
import { logMessage } from "@/lib/message-actions";
import { cn } from "@/lib/utils";

export type WaButtonProps = {
  alterationId: string;
  templateKey: string;
  label: string;
  href: string | null;
  disabledReason: string | null;
  /** Latest "Opened WhatsApp" for this template, from message_log. */
  lastSent?: { by: string; at: string } | null;
  compact?: boolean;
};

export function WaButton({ alterationId, templateKey, label, href, disabledReason, lastSent, compact }: WaButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [justOpened, setJustOpened] = useState(false);

  // Refresh when staff come back from WhatsApp so the "Opened" line appears.
  useEffect(() => {
    const onShow = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [router]);

  async function open() {
    if (!href) return;
    setBusy(true); setErr(null);
    try {
      const r = await logMessage(alterationId, templateKey);
      if (!r.ok) { setErr("Could not record this. Check your internet and try again."); setBusy(false); return; }
      setJustOpened(true);
      setBusy(false);
      window.location.href = href; // same-tab hand-off: opens the WhatsApp app from the installed PWA
    } catch {
      setErr("No internet connection. Please try again.");
    }
  }

  const sent = !!lastSent || justOpened;
  return (
    <div className="space-y-1">
      <button type="button" onClick={open} disabled={busy || !href} aria-disabled={!href}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-xl font-semibold transition-opacity active:opacity-80 disabled:opacity-50",
          compact ? "h-11 text-sm" : "h-12 text-base",
          sent ? "border border-border bg-card" : "bg-[#128c4a] text-white",
        )}>
        {sent ? <Check className="size-5" aria-hidden /> : <MessageCircle className="size-5" aria-hidden />}
        {busy ? "Opening WhatsApp…" : sent ? "Resend" : label}
      </button>
      {sent && <p className="text-xs text-muted">Opened WhatsApp ✓ {lastSent ? `by ${lastSent.by}, ${lastSent.at}` : "just now"}</p>}
      {disabledReason && <p role="alert" className="text-xs text-danger">{disabledReason}</p>}
      {err && <p role="alert" className="text-xs text-danger">{err}</p>}
    </div>
  );
}
