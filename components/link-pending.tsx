"use client";
import { useLinkStatus } from "next/link";

/** Put inside a <Link className="relative …">: gives an instant on-screen reaction the moment it is tapped. */
export function LinkPending() {
  const { pending } = useLinkStatus();
  return (
    <span aria-hidden data-pending={pending || undefined}
      className={pending ? "pointer-events-none absolute inset-0 animate-pulse rounded-xl bg-primary/15" : "hidden"} />
  );
}
