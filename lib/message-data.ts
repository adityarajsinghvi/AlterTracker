import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Shop, Template } from "@/lib/messages";

export const getMessageContext = cache(async (): Promise<{ templates: Template[]; shop: Shop }> => {
  const supabase = await createClient();
  const [{ data: templates }, { data: shop }] = await Promise.all([
    supabase.from("message_templates").select("key,label,body,active"),
    supabase.from("shop_settings").select("shop_name,shop_phone,public_base_url,reminder_after_days").eq("id", 1).single(),
  ]);
  return {
    templates: (templates ?? []) as Template[],
    shop: (shop ?? { shop_name: "Singhvi Readymades", shop_phone: "", public_base_url: "", reminder_after_days: 3 }) as Shop,
  };
});
