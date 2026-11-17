import type { Metadata } from "next";
import { PageTitle } from "@/components/page-title";
import { ComingSoon } from "@/components/coming-soon";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Staff" };

export default async function Page() {
  await requireOwner();
  return (
    <>
      <PageTitle>Staff</PageTitle>
      <ComingSoon phase="Phase 4" />
    </>
  );
}
