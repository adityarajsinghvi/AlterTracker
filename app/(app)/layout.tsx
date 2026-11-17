import { BottomNav } from "@/components/bottom-nav";
import { getMe } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await getMe(); // redirects to /login if signed out or deactivated
  return (
    <div className="mx-auto min-h-dvh w-full max-w-xl px-4 pb-28 pt-6">
      {children}
      <BottomNav />
    </div>
  );
}
