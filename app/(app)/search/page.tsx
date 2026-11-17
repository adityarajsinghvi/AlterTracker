import type { Metadata } from "next";
import { PageTitle } from "@/components/page-title";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Search" };

export default function Page() {
  return (
    <>
      <PageTitle>Search</PageTitle>
      <ComingSoon phase="Phase 4" />
    </>
  );
}
