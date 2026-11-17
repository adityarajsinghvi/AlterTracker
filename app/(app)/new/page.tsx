import type { Metadata } from "next";
import { PageTitle } from "@/components/page-title";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "New alteration" };

export default function Page() {
  return (
    <>
      <PageTitle>New alteration</PageTitle>
      <ComingSoon phase="Phase 2" />
    </>
  );
}
