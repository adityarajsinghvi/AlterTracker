import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Me = { id: string; name: string; phone: string; role: "owner" | "staff" };

// Reads the caller's profile. RLS hides it when the account is deactivated, which logs them out.
export const getMe = cache(async (): Promise<Me> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("id,name,phone,role").eq("id", id).maybeSingle();
  if (!profile) redirect("/auth/disabled");
  return profile as Me;
});

export async function requireOwner(): Promise<Me> {
  const me = await getMe();
  if (me.role !== "owner") redirect("/");
  return me;
}
