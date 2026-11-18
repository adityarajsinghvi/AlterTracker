"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/session";
import { isValidPhone, isValidPin, normalizePhone, pinToPassword } from "@/lib/auth";
import type { ActionResult } from "@/lib/types";

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const done = (): { ok: true } => { revalidatePath("/", "layout"); return { ok: true }; };

export async function addStaff(input: { name: string; phone: string; pin: string }): Promise<ActionResult> {
  await requireOwner();
  const name = input.name.trim().replace(/\s+/g, " ");
  const phone = input.phone.trim() ? normalizePhone(input.phone) : "";
  if (!name) return fail("Enter the staff member's name.");
  if (name.length > 40) return fail("The name is too long (40 letters at most).");
  if (phone && !isValidPhone(phone)) return fail("Enter a valid 10-digit mobile number, or leave it empty.");
  if (!isValidPin(input.pin)) return fail("PIN must be exactly 4 digits.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("owner_create_staff", {
    p_name: name, p_phone: phone || null, p_password: pinToPassword(input.pin),
  });
  return error ? fail(error.message) : done();
}

export async function resetPin(input: { userId: string; pin: string }): Promise<ActionResult> {
  await requireOwner();
  if (!isValidPin(input.pin)) return fail("PIN must be exactly 4 digits.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("owner_set_pin", { p_user: input.userId, p_password: pinToPassword(input.pin) });
  return error ? fail(error.message) : done();
}

export async function setStaffActive(userId: string, active: boolean): Promise<ActionResult> {
  await requireOwner();
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ active }).eq("id", userId);
  return error ? fail(error.message) : done();
}

export async function saveTailor(input: { id?: string; name: string; phone: string }): Promise<ActionResult> {
  await requireOwner();
  const name = input.name.trim();
  const phone = input.phone.trim() ? normalizePhone(input.phone) : null;
  if (!name) return fail("Enter the tailor's name.");
  if (phone && !isValidPhone(phone)) return fail("Enter a valid 10-digit mobile number, or leave it empty.");
  const supabase = await createClient();
  const { error } = input.id
    ? await supabase.from("tailors").update({ name, phone }).eq("id", input.id)
    : await supabase.from("tailors").insert({ name, phone });
  return error ? fail(error.message) : done();
}

export async function setTailorActive(id: string, active: boolean): Promise<ActionResult> {
  await requireOwner();
  const supabase = await createClient();
  const { error } = await supabase.from("tailors").update({ active }).eq("id", id).eq("is_in_house", false);
  return error ? fail(error.message) : done();
}

export async function saveTemplate(input: { key: string; body: string; active: boolean }): Promise<ActionResult> {
  await requireOwner();
  if (!input.body.trim()) return fail("The message cannot be empty.");
  if (input.body.length > 1000) return fail("The message is too long (1000 characters at most).");
  const supabase = await createClient();
  const { error } = await supabase.from("message_templates").update({ body: input.body.trim(), active: input.active }).eq("key", input.key);
  return error ? fail(error.message) : done();
}

export async function saveSettings(input: {
  shopName: string; shopPhone: string; address: string; baseUrl: string; reminderDays: number;
}): Promise<ActionResult> {
  await requireOwner();
  const phone = normalizePhone(input.shopPhone);
  if (!input.shopName.trim()) return fail("Enter the shop name.");
  if (!isValidPhone(phone)) return fail("Enter the shop's 10-digit mobile number.");
  let base = input.baseUrl.trim().replace(/\/+$/, "");
  try { const u = new URL(base); if (!/^https?:$/.test(u.protocol)) throw new Error(); base = u.origin + (u.pathname === "/" ? "" : u.pathname.replace(/\/+$/, "")); }
  catch { return fail("The web address must start with https:// (for example https://alter.singhvireadymades.in)."); }
  if (!Number.isInteger(input.reminderDays) || input.reminderDays < 1 || input.reminderDays > 60) return fail("Reminder days must be between 1 and 60.");
  const supabase = await createClient();
  const { error } = await supabase.from("shop_settings").update({
    shop_name: input.shopName.trim(), shop_phone: phone, address: input.address.trim() || null,
    public_base_url: base, reminder_after_days: input.reminderDays,
  }).eq("id", 1);
  return error ? fail(error.message) : done();
}
