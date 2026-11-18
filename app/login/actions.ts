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

  // Deactivated accounts are turned away by the app layout (it signs them out and explains why).
  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
