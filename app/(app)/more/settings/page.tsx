import type { Metadata } from "next";
import { PageTitle } from "@/components/page-title";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/session";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Shop settings" };

export default async function Page() {
  await requireOwner();
  const supabase = await createClient();
  const { data } = await supabase.from("shop_settings").select("shop_name,shop_phone,address,public_base_url,reminder_after_days").eq("id", 1).single();
  return (
    <>
      <PageTitle sub="Used in WhatsApp messages and the customer page">Shop settings</PageTitle>
      {data && <SettingsForm s={data} />}
    </>
  );
}
