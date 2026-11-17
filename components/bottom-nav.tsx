"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Plus, Search, Scissors, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/new", label: "New", Icon: Plus },
  { href: "/search", label: "Search", Icon: Search },
  { href: "/tailors", label: "Tailors", Icon: Scissors },
  { href: "/more", label: "More", Icon: Menu },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-xl">
        {items.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link href={href} aria-current={active ? "page" : undefined}
                className={cn("flex h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors",
                  active ? "text-primary" : "text-muted")}>
                <Icon className="size-6" strokeWidth={active ? 2.5 : 2} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
