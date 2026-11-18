import type { Metadata } from "next";
import { PageTitle } from "@/components/page-title";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/session";
import { TailorManager } from "./tailor-manager";

export const metadata: Metadata = { title: "Manage tailors" };

export default async function Page() {
  await requireOwner();
  const supabase = await createClient();
  const { data } = await supabase.from("tailors").select("id,name,phone,is_in_house,active")
    .order("is_in_house", { ascending: false }).order("name");
  return (
    <>
      <PageTitle sub="The list staff pick from when sending work out">Tailors</PageTitle>
      <TailorManager tailors={data ?? []} />
    </>
  );
}
