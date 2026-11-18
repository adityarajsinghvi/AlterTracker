"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isValidPin, pinToPassword } from "@/lib/auth";

export type LoginState = { error?: string; name?: string };

const WRONG = "Wrong name or PIN.";

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  const pin = String(formData.get("pin") ?? "");
  if (!name) return { error: "Enter your name.", name };
  if (!isValidPin(pin)) return { error: "PIN must be 4 digits.", name };

  const h = await headers();
  const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";

  const supabase = await createClient();
  // Find this name's sign-in address, unless too many wrong PINs were tried recently.
  const { data: gate, error: gateErr } = await supabase.rpc("login_begin", { p_name: name, p_ip: ip });
  if (gateErr || !gate) return { error: "Could not reach the server. Check your internet and try again.", name };
  if (gate.locked_seconds > 0) {
    const mins = Math.max(1, Math.ceil(gate.locked_seconds / 60));
    return { error: `Too many wrong PINs. Please wait ${mins} minute${mins === 1 ? "" : "s"} and try again.`, name };
  }
  if (!gate.email) {
    await supabase.rpc("login_finish", { p_name: name, p_ip: ip, p_ok: false });
    return { error: WRONG, name };
  }

  const { error } = await supabase.auth.signInWithPassword({ email: gate.email, password: pinToPassword(pin) });
  await supabase.rpc("login_finish", { p_name: name, p_ip: ip, p_ok: !error });
  if (error) return { error: WRONG, name };
  // A switched-off account is turned away by the app layout, which signs it out and explains why.
  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
