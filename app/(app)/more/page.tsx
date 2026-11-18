import type { Metadata } from "next";
import Link from "next/link";
import { PageTitle } from "@/components/page-title";
import { getMe } from "@/lib/session";
import { logout } from "@/app/login/actions";

export const metadata: Metadata = { title: "More" };

const adminLinks = [
  { href: "/more/staff", label: "Staff" },
  { href: "/more/tailors", label: "Tailors" },
  { href: "/more/templates", label: "Message templates" },
  { href: "/more/settings", label: "Shop settings" },
  { href: "/more/activity", label: "Activity" },
];

export default async function MorePage() {
  const me = await getMe();
  return (
    <>
      <PageTitle sub={`${me.name} · ${me.phone} · ${me.role}`}>More</PageTitle>
      {me.role === "owner" && (
        <ul className="mb-6 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {adminLinks.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="flex h-14 items-center px-4 font-medium">{l.label}</Link>
            </li>
          ))}
        </ul>
      )}
      {me.role === "staff" && (
        <ul className="mb-6 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          <li><Link href="/more/activity" className="flex h-14 items-center px-4 font-medium">My activity</Link></li>
        </ul>
      )}
      <form action={logout}>
        <button type="submit" className="h-12 w-full rounded-xl border border-border bg-card font-medium text-danger active:opacity-80">
          Log out
        </button>
      </form>
    </>
  );
}
