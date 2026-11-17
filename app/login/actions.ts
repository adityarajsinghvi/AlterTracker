"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isValidPhone, isValidPin, normalizePhone, phoneToEmail, pinToPassword } from "@/lib/auth";

export type LoginState = { error?: string; phone?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const pin = String(formData.get("pin") ?? "");

  if (!isValidPhone(phone)) return { error: "Enter a valid 10-digit mobile number.", phone };
  if (!isValidPin(pin)) return { error: "PIN must be 4 digits.", phone };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: phoneToEmail(phone),
    password: pinToPassword(pin),
  });
  if (error || !data.user) return { error: "Wrong phone number or PIN.", phone };

  // Deactivated users cannot read their profile (RLS), so they are turned away here.
  const { data: profile } = await supabase.from("profiles").select("id").eq("id", data.user.id).maybeSingle();
  if (!profile) {
    await supabase.auth.signOut();
    return { error: "This account is switched off. Please ask the owner.", phone };
  }
  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
