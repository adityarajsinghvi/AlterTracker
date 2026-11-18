"use client";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { buildVCard } from "@/lib/vcard";
import { cn } from "@/lib/utils";

/**
 * Saves the customer to the phone's contacts. On a phone this opens the share sheet with the contact card
 * (choose Contacts); where sharing is not available the card is downloaded instead.
 */
export function SaveContact({ name, phone, token, shop, variant }: {
  name: string; phone: string; token: string; shop: string; variant: "button" | "icon";
}) {
  const [hint, setHint] = useState<string | null>(null);

  async function save() {
    setHint(null);
    const card = buildVCard({ name, phone10: phone, shop, token });
    const file = new File([card], `customer-${token}.vcf`, { type: "text/vcard" });
    try {
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
        return;
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return; // the person closed the share sheet
    }
    // Fallback: download the card, then open it to add the contact.
    const url = URL.createObjectURL(new Blob([card], { type: "text/vcard" }));
    const a = document.createElement("a");
    a.href = url; a.download = `customer-${token}.vcf`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
    setHint("The contact card was downloaded. Open it to add the contact.");
  }

  if (variant === "icon") {
    return (
      <>
        <button type="button" onClick={save} aria-label={`Save ${name} to phone contacts`}
          className="flex size-11 items-center justify-center rounded-full border border-border bg-card active:opacity-80">
          <UserPlus className="size-5" aria-hidden />
        </button>
        {hint && <span role="status" className="basis-full text-xs font-normal text-muted">{hint}</span>}
      </>
    );
  }
  return (
    <div className="space-y-1">
      <button type="button" onClick={save}
        className={cn("flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card font-semibold active:opacity-80")}>
        <UserPlus className="size-5" aria-hidden /> Save {name} to phone contacts
      </button>
      {hint && <p role="status" className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
