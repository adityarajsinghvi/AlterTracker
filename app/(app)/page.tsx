import { PageTitle } from "@/components/page-title";
import { ComingSoon } from "@/components/coming-soon";
import { getMe } from "@/lib/session";

export default async function HomePage() {
  const me = await getMe();
  return (
    <>
      <PageTitle sub={me.role === "owner" ? "Owner" : "Staff"}>Namaste, {me.name}</PageTitle>
      <ComingSoon phase="Phase 4 (Due today, Overdue, With tailor, Ready lists)" />
    </>
  );
}
