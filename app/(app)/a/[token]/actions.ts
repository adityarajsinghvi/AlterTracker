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
const ok = (): { ok: true } => { revalidatePath("/", "layout"); return { ok: true }; };

/** Moves the chosen items (and only them) to a new stage. The database function does the checking and the logging. */
export async function moveItems(input: {
  alterationId: string; pieceIds: string[]; to: Status; seen: Record<string, Status>;
  note?: string; tailorId?: string | null; photoPath?: string | null; collectedBy?: string | null;
  rack?: string | null; markPaid?: boolean;
}): Promise<ActionResult> {
  if (!input.pieceIds.length) return fail("Choose at least one item.");
  const supabase = await createClient();

  // If someone else changed these items since this screen loaded, stop and say so.
  const { data: now } = await supabase.from("alteration_pieces").select("id,status").in("id", input.pieceIds);
  if ((now ?? []).some((p) => input.seen[p.id] !== p.status)) {
    revalidatePath("/", "layout");
    return fail("Someone just updated these items. The screen has been refreshed. Please check and try again.");
  }

  if (input.markPaid) {
    const { error } = await supabase.from("alterations").update({ paid: true }).eq("id", input.alterationId);
    if (error) return fail(error.message);
  }
  const { error } = await supabase.rpc("advance_items", {
    p_alteration: input.alterationId, p_pieces: input.pieceIds, p_to: input.to, p_note: input.note ?? null,
    p_tailor: input.tailorId || null, p_photo_path: input.photoPath ?? null, p_collected_by: input.collectedBy ?? null,
    p_rack: input.rack ?? null, p_expected_from: null,
  });
  return error ? fail(error.message) : ok();
}

export async function addItem(input: { alterationId: string; name: string; note: string }): Promise<ActionResult> {
  const name = normalizeItem(input.name);
  if (!name || name.length > 40) return fail("Write what the item is (up to 40 letters).");
  const supabase = await createClient();
  const { data: last } = await supabase.from("alteration_pieces").select("sort")
    .eq("alteration_id", input.alterationId).order("sort", { ascending: false }).limit(1);
  const { error } = await supabase.from("alteration_pieces").insert({
    alteration_id: input.alterationId, item_type: name, work_notes: input.note.trim() || null, sort: (last?.[0]?.sort ?? -1) + 1,
  });
  return error ? fail(error.message) : ok();
}

export async function saveItem(input: { id: string; name: string; note: string }): Promise<ActionResult> {
  const name = normalizeItem(input.name);
  if (!name || name.length > 40) return fail("Write what the item is (up to 40 letters).");
  const supabase = await createClient();
  const { error } = await supabase.from("alteration_pieces").update({ item_type: name, work_notes: input.note.trim() || null }).eq("id", input.id);
  return error ? fail(error.message) : ok();
}

export async function saveAlteration(input: {
  id: string; promised: string; charge: number | null; paid: boolean; rack: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("alterations").update({
    promised_date: input.promised, charge: input.charge, paid: input.paid, rack_label: input.rack.trim() || null,
  }).eq("id", input.id);
  return error ? fail(error.message) : ok();
}

export async function attachVisitPhotos(alterationId: string, paths: string[], pending: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_alteration_photos", { p_alteration: alterationId, p_paths: paths, p_pending: pending });
  return error ? fail(error.message) : ok();
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
  return ok();
}
