"use server";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/session";

const KEYS = ["receipt", "ready", "reminder", "delay", "delivered"];

/** Records that a staff member tapped a WhatsApp button (not that the message was sent). */
export async function logMessage(alterationId: string, templateKey: string): Promise<{ ok: boolean }> {
  if (!KEYS.includes(templateKey)) return { ok: false };
  const me = await getMe();
  const supabase = await createClient();
  const { error } = await supabase.from("message_log").insert({
    alteration_id: alterationId, template_key: templateKey, opened_by: me.id,
  });
  return { ok: !error };
}
