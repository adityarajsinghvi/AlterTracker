// Adds a staff account from the command line (the owner can also do this in More > Staff):
//   npx tsx scripts/create-staff.ts "Ramesh" 4821
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { isValidPin, pinToPassword } from "../lib/auth";

config({ path: ".env.local" });

async function main() {
  const [name, pin] = process.argv.slice(2);
  if (!name || !isValidPin(pin ?? "")) throw new Error('Usage: npx tsx scripts/create-staff.ts "Name" 4-digit-pin');
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.admin.createUser({
    email: `${randomUUID()}@staff.singhvi.local`, password: pinToPassword(pin), email_confirm: true,
  });
  if (error) throw error;
  const { error: pErr } = await admin.from("profiles").insert({ id: data.user.id, name, role: "staff" });
  if (pErr) throw pErr;
  console.log(`Staff created: log in with the name "${name}" and the PIN`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
