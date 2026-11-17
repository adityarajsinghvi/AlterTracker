// Creates a staff account for testing until the owner screen exists (Phase 4):
//   npx tsx scripts/create-staff.ts "Ramesh" 9829012345 4821
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { isValidPhone, isValidPin, normalizePhone, phoneToEmail, pinToPassword } from "../lib/auth";

config({ path: ".env.local" });

async function main() {
  const [name, rawPhone, pin] = process.argv.slice(2);
  const phone = normalizePhone(rawPhone ?? "");
  if (!name || !isValidPhone(phone) || !isValidPin(pin ?? "")) {
    throw new Error('Usage: npx tsx scripts/create-staff.ts "Name" 10-digit-phone 4-digit-pin');
  }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await admin.auth.admin.createUser({
    email: phoneToEmail(phone), password: pinToPassword(pin), email_confirm: true,
  });
  if (error) throw error;
  const { error: pErr } = await admin.from("profiles").insert({ id: data.user.id, name, phone, role: "staff" });
  if (pErr) throw pErr;
  console.log(`Staff created: ${name} (${phone})`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
