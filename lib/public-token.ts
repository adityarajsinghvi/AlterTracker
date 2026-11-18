import "server-only";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export type PublicToken = {
  shop_name: string; shop_phone: string; address: string | null; base_url: string;
  token_year: number; token_no: number; status: string; promised_date: string;
  delivered_at: string | null; collected_by: string | null; phone_last4: string;
  photos: string[];
  pieces: { item_type: string; work_notes: string | null; status: string; delivered_at: string | null; collected_by: string | null; photo_paths: string[] }[];
};

// No session needed: the public_token() function returns only customer-safe fields.
function anonClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const getPublicToken = cache(async (slug: string): Promise<PublicToken | null> => {
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(slug)) return null;
  const { data } = await anonClient().rpc("public_token", { p_slug: slug });
  return (data as PublicToken | null) ?? null;
});

// Photo links are made by a dedicated photo-only account (it has no profile, so it can read no data and may only
// read files in the photo bucket). If SUPABASE_SERVICE_ROLE_KEY is set it is used instead.
const SIGNER_EMAIL = "photo-signer@staff.singhvi.local";
let signerSession: { token: string; expiresAt: number } | null = null;

async function signerClient() {
  const password = process.env.PHOTO_SIGNER_PASSWORD;
  if (!password) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const plain = { auth: { persistSession: false, autoRefreshToken: false } };
  if (!signerSession || signerSession.expiresAt < Date.now() + 60_000) {
    const { data, error } = await createClient(url, key, plain).auth.signInWithPassword({ email: SIGNER_EMAIL, password });
    if (error || !data.session) { console.error("photo signer sign-in failed:", error?.message); return null; }
    signerSession = { token: data.session.access_token, expiresAt: (data.session.expires_at ?? 0) * 1000 };
  }
  return createClient(url, key, { ...plain, global: { headers: { Authorization: `Bearer ${signerSession.token}` } } });
}

/** Short-lived (1 hour) signed URLs for the photos. Without a signing account or key, photos are skipped. */
export async function signPhotos(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!paths.length) return out;
  const client = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : await signerClient();
  if (!client) return out;
  const { data, error } = await client.storage.from("item-photos").createSignedUrls(paths, 3600);
  if (error) console.error("photo signing failed:", error.message);
  data?.forEach((x) => { if (x.path && x.signedUrl) out.set(x.path, x.signedUrl); });
  return out;
}
