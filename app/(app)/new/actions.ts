"use server";
import { createClient } from "@/lib/supabase/server";
import { isValidPhone, normalizePhone } from "@/lib/auth";
import { normalizeItem, tokenLabel } from "@/lib/format";
import type { ActionResult } from "@/lib/types";

export type CustomerLookup = {
  name: string | null;
  open: { label: string; status: string; items: string; promised: string }[];
};

export async function lookupCustomer(rawPhone: string): Promise<CustomerLookup> {
  const phone = normalizePhone(rawPhone);
  if (!isValidPhone(phone)) return { name: null, open: [] };
  const supabase = await createClient();
  const { data: c } = await supabase.from("customers").select("id,name").eq("phone", phone).maybeSingle();
  if (!c) return { name: null, open: [] };
  const { data: alts } = await supabase
    .from("alterations")
    .select("token_year,token_no,status,promised_date,alteration_pieces(item_type)")
    .eq("customer_id", c.id)
    .in("status", ["received", "with_tailor", "ready"])
    .order("created_at", { ascending: false });
  return {
    name: c.name,
    open: (alts ?? []).map((a) => ({
      label: tokenLabel(a.token_year, a.token_no),
      status: a.status,
      items: (a.alteration_pieces as { item_type: string }[]).map((p) => p.item_type).join(" + "),
      promised: a.promised_date,
    })),
  };
}

export type NewEntryInput = {
  phone: string;
  name: string;
  promised: string;
  pieces: { item_type: string; work_notes: string; description?: string; has_photo: boolean }[];
  tailorId: string | null;
  charge: number | null;
  paid: boolean;
  rack: string;
};

export type NewEntryResult = ActionResult<{
  id: string; label: string; slug: string; customerName: string; pieceIds: string[]; tokenYear: number; tokenNo: number;
}>;

export async function createEntry(input: NewEntryInput): Promise<NewEntryResult> {
  const phone = normalizePhone(input.phone);
  if (!isValidPhone(phone)) return { ok: false, error: "Enter a valid 10-digit mobile number." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_alteration", {
    p_phone: phone,
    p_name: input.name,
    p_promised: input.promised,
    p_pieces: input.pieces.map((p) => ({ ...p, item_type: normalizeItem(p.item_type) })),
    p_tailor: input.tailorId,
    p_charge: input.charge,
    p_paid: input.paid,
    p_rack: input.rack || null,
  });
  if (error) return { ok: false, error: error.message };
  const r = data as { id: string; token_year: number; token_no: number; slug: string; customer_name: string; piece_ids: string[] };
  return {
    ok: true, id: r.id, label: tokenLabel(r.token_year, r.token_no), slug: r.slug,
    customerName: r.customer_name, pieceIds: r.piece_ids, tokenYear: r.token_year, tokenNo: r.token_no,
  };
}

export async function savePiecePhotos(pieceId: string, paths: string[], pending: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_piece_photos", { p_piece: pieceId, p_paths: paths, p_pending: pending });
  return error ? { ok: false, error: error.message } : { ok: true };
}
