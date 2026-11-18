"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Result = { ok: true } | { ok: false; error: string };

/** Runs a server action with busy/error state and refreshes the page on success. */
export function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function run(fn: () => Promise<Result>, onOk?: () => void) {
    setBusy(true); setErr(null);
    try {
      const r = await fn();
      if (!r.ok) { setErr(r.error); return false; }
      onOk?.(); router.refresh(); return true;
    } catch {
      setErr("No internet connection. Nothing was changed. Please try again.");
      return false;
    } finally { setBusy(false); }
  }
  return { busy, err, setErr, run };
}
