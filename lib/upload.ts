/** Uploads one compressed photo. The database client is loaded only now, so pages stay light until a photo is added. */
export async function uploadPhoto(path: string, blob: Blob): Promise<boolean> {
  const { createClient } = await import("@/lib/supabase/client");
  const { error } = await createClient().storage.from("item-photos").upload(path, blob, { contentType: "image/jpeg" });
  return !error;
}
