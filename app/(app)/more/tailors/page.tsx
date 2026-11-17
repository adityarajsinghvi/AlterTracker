import type { Metadata } from "next";
import { PageTitle } from "@/components/page-title";
import { ComingSoon } from "@/components/coming-soon";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Tailors" };

export default async function Page() {
  await requireOwner();
  return (
    <>
      <PageTitle>Tailors</PageTitle>
      <ComingSoon phase="Phase 4" />
    </>
  );
}
