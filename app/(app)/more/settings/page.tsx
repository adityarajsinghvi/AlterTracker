import type { Metadata } from "next";
import { PageTitle } from "@/components/page-title";
import { ComingSoon } from "@/components/coming-soon";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Shop settings" };

export default async function Page() {
  await requireOwner();
  return (
    <>
      <PageTitle>Shop settings</PageTitle>
      <ComingSoon phase="Phase 4" />
    </>
  );
}
