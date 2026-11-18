// Creates the photo-only account used by the customer page (fresh projects only).
//   SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/create-photo-signer.ts
// Prints the generated password once: store it as the PHOTO_SIGNER_PASSWORD secret on the web host.
// Then replace the uuid in supabase/migrations/20261118000015_photo_signer.sql with the printed user id before applying it.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

config({ path: ".env.local" });

async function main() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const password = randomBytes(32).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({ email: "photo-signer@staff.singhvi.local", password, email_confirm: true });
  if (error) throw error;
  console.log(`user id: ${data.user.id}\nPHOTO_SIGNER_PASSWORD=${password}`);
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
