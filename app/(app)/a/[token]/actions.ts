"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/session";
import { isValidPhone, normalizePhone } from "@/lib/auth";
import { normalizeItem } from "@/lib/format";
import type { ActionResult, Status } from "@/lib/types";

function fail(message: string): { ok: false; error: string } {
  return { ok: false, error: message };
}

export async function advance(input: {
  id: string; to: Status; note?: string; tailorId?: string | null; photoPath?: string | null;
  collectedBy?: string | null; rack?: string | null; expectedFrom: Status; markPaid?: boolean;
}): Promise<ActionResult> {
  const supabase = await createClient();
  if (input.markPaid) {
    const { error } = await supabase.from("alterations").update({ paid: true }).eq("id", input.id);
    if (error) return fail(error.message);
  }
  const { error } = await supabase.rpc("advance_status", {
    p_id: input.id, p_to: input.to, p_note: input.note ?? null, p_tailor_id: input.tailorId ?? null,
    p_photo_path: input.photoPath ?? null, p_collected_by: input.collectedBy ?? null,
    p_rack_label: input.rack ?? null, p_expected_from: input.expectedFrom,
  });
  if (error) return fail(error.message);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveAlteration(input: {
  id: string; promised: string; tailorId: string | null; charge: number | null; paid: boolean; rack: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("alterations").update({
    promised_date: input.promised, tailor_id: input.tailorId, charge: input.charge, paid: input.paid,
    rack_label: input.rack.trim() || null,
  }).eq("id", input.id);
  if (error) return fail(error.message);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function savePiece(input: { id: string; itemType: string; description: string; workNotes: string }): Promise<ActionResult> {
  if (!input.workNotes.trim()) return fail("Work notes cannot be empty.");
  const itemType = normalizeItem(input.itemType);
  if (!itemType || itemType.length > 40) return fail("Write what the item is (up to 40 letters).");
  const supabase = await createClient();
  const { error } = await supabase.from("alteration_pieces").update({
    item_type: itemType, description: input.description.trim() || null, work_notes: input.workNotes.trim(),
  }).eq("id", input.id);
  if (error) return fail(error.message);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function attachPhotos(pieceId: string, paths: string[], pending: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_piece_photos", { p_piece: pieceId, p_paths: paths, p_pending: pending });
  if (error) return fail(error.message);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function editCustomer(input: { id: string; name: string; phone: string }): Promise<ActionResult> {
  const me = await getMe();
  if (me.role !== "owner") return fail("Only the owner can edit customer details.");
  const phone = normalizePhone(input.phone);
  if (!isValidPhone(phone)) return fail("Enter a valid 10-digit mobile number.");
  if (!input.name.trim()) return fail("Name cannot be empty.");
  const supabase = await createClient();
  const { error } = await supabase.from("customers").update({ name: input.name.trim(), phone }).eq("id", input.id);
  if (error) return fail(error.code === "23505" ? "Another customer already has this number." : error.message);
  revalidatePath("/", "layout");
  return { ok: true };
}
