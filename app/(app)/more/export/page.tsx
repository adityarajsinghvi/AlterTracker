import type { Metadata } from "next";
import { Download } from "lucide-react";
import { PageTitle } from "@/components/page-title";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Export data" };

const FILES = [
  { kind: "items", title: "All items", note: "One row per item: customer, status, tailor, dates, charge. The main backup." },
  { kind: "history", title: "History", note: "Every status change and edit: who did it, when, and to which items." },
  { kind: "customers", title: "Customers", note: "Names, phone numbers and how many visits each has made." },
  { kind: "whatsapp", title: "WhatsApp log", note: "Every time a staff member opened a WhatsApp message." },
];

export default async function Page() {
  await requireOwner();
  return (
    <>
      <PageTitle sub="Download your records as spreadsheets (CSV, opens in Excel or Google Sheets)">Export data</PageTitle>
      <ul className="space-y-3">
        {FILES.map((f) => (
          <li key={f.kind} className="rounded-2xl border border-border bg-card p-3">
            <p className="font-semibold">{f.title}</p>
            <p className="mb-3 text-sm text-muted">{f.note}</p>
            <a href={`/more/export/${f.kind}`} download
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground active:opacity-80">
              <Download className="size-5" aria-hidden /> Download
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-5 rounded-xl border border-dashed border-border p-3 text-sm text-muted">
        Tip: download &ldquo;All items&rdquo; and &ldquo;Customers&rdquo; once a week and keep them in Google Drive. This is your backup if anything ever goes wrong.
      </p>
    </>
  );
}
