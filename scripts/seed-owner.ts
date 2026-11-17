// Creates (or re-creates the profile of) the owner account. Run once:
//   npm run seed:owner      (reads .env.local)
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { isValidPhone, isValidPin, normalizePhone, phoneToEmail, pinToPassword } from "../lib/auth";

config({ path: ".env.local" });

async function main() {
  const name = process.env.OWNER_NAME || "Owner";
  const phone = normalizePhone(process.env.OWNER_PHONE ?? "");
  const pin = process.env.OWNER_PIN ?? "";
  if (!isValidPhone(phone)) throw new Error("OWNER_PHONE must be a valid 10-digit mobile number");
  if (!isValidPin(pin)) throw new Error("OWNER_PIN must be 4 digits");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const email = phoneToEmail(phone);
  const password = pinToPassword(pin);
  let userId: string | undefined;

  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) {
    const list = await admin.auth.admin.listUsers({ perPage: 1000 });
    userId = list.data.users.find((u) => u.email === email)?.id;
    if (!userId) throw created.error;
    await admin.auth.admin.updateUserById(userId, { password });
  } else {
    userId = created.data.user.id;
  }

  const { error } = await admin.from("profiles").upsert({ id: userId, name, phone, role: "owner", active: true });
  if (error) throw error;
  console.log(`Owner ready: ${name} (${phone})`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
