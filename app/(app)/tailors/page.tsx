import type { Metadata } from "next";
import { PageTitle } from "@/components/page-title";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Tailors" };

export default function Page() {
  return (
    <>
      <PageTitle>Tailors</PageTitle>
      <ComingSoon phase="Phase 4" />
    </>
  );
}
