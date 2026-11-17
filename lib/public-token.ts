import "server-only";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export type PublicToken = {
  shop_name: string; shop_phone: string; address: string | null; base_url: string;
  token_year: number; token_no: number; status: string; promised_date: string;
  delivered_at: string | null; collected_by: string | null; phone_last4: string;
  pieces: { item_type: string; work_notes: string; photo_paths: string[] }[];
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

/** Short-lived (1 hour) signed URLs for the photos. Needs the service-role key; without it, photos are skipped. */
export async function signPhotos(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!paths.length || !process.env.SUPABASE_SERVICE_ROLE_KEY) return out;
  const { data } = await createAdminClient().storage.from("item-photos").createSignedUrls(paths, 3600);
  data?.forEach((s) => { if (s.path && s.signedUrl) out.set(s.path, s.signedUrl); });
  return out;
}
