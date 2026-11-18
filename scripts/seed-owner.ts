// Creates the owner account. Run once:  npm run seed:owner   (reads .env.local)
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { isValidPin, pinToPassword } from "../lib/auth";

config({ path: ".env.local" });

async function main() {
  const name = (process.env.OWNER_NAME || "").trim();
  const pin = process.env.OWNER_PIN ?? "";
  if (!name) throw new Error("OWNER_NAME is required");
  if (!isValidPin(pin)) throw new Error("OWNER_PIN must be 4 digits");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });

  // Sign-in is by name + PIN; the email is just an internal id-based address.
  const { data, error } = await admin.auth.admin.createUser({
    email: `${randomUUID()}@staff.singhvi.local`, password: pinToPassword(pin), email_confirm: true,
  });
  if (error) throw error;
  const { error: pErr } = await admin.from("profiles").insert({ id: data.user.id, name, role: "owner", active: true });
  if (pErr) throw pErr;
  console.log(`Owner ready: log in with the name "${name}" and your PIN`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
