import type { Metadata } from "next";
import { PageTitle } from "@/components/page-title";
import { createClient } from "@/lib/supabase/server";
import { todayIST } from "@/lib/format";
import { NewEntryForm } from "./new-entry-form";

export const metadata: Metadata = { title: "New alteration" };

export default async function NewPage() {
  const supabase = await createClient();
  const { data: tailors } = await supabase
    .from("tailors").select("id,name,is_in_house").eq("active", true).order("is_in_house", { ascending: false }).order("name");
  return (
    <>
      <PageTitle>New alteration</PageTitle>
      <NewEntryForm tailors={tailors ?? []} today={todayIST()} />
    </>
  );
}
