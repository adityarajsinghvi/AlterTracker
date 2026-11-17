import type { Metadata } from "next";
import { PageTitle } from "@/components/page-title";
import { ComingSoon } from "@/components/coming-soon";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Activity" };

export default async function Page() {
  await requireOwner();
  return (
    <>
      <PageTitle>Activity</PageTitle>
      <ComingSoon phase="Phase 4" />
    </>
  );
}
