import type { Metadata } from "next";
import { PageTitle } from "@/components/page-title";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/session";
import { StaffManager } from "./staff-manager";

export const metadata: Metadata = { title: "Staff" };

export default async function Page() {
  const me = await requireOwner();
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id,name,phone,role,active").order("role").order("name");
  return (
    <>
      <PageTitle sub="Add staff, reset a PIN, or switch someone off">Staff</PageTitle>
      <StaffManager staff={data ?? []} meId={me.id} />
    </>
  );
}
