import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/session";
import { parseToken, tokenLabel } from "@/lib/format";
import { buildVCard } from "@/lib/vcard";

export const dynamic = "force-dynamic";

// Serves the customer's name and number as a contact card, so staff can save it to the phone in one tap.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  await getMe();
  const parsed = parseToken((await params).token);
  if (!parsed) return new Response("Not found", { status: 404 });
  const supabase = await createClient();
  const [{ data: a }, { data: shop }] = await Promise.all([
    supabase.from("alterations").select("token_year,token_no,customer:customers(name,phone)")
      .eq("token_year", parsed.year).eq("token_no", parsed.no).maybeSingle(),
    supabase.from("shop_settings").select("shop_name").eq("id", 1).single(),
  ]);
  const customer = a?.customer as unknown as { name: string; phone: string } | undefined;
  if (!a || !customer || !/^\d{10}$/.test(customer.phone)) return new Response("Not found", { status: 404 });

  const label = tokenLabel(a.token_year, a.token_no);
  return new Response(buildVCard({ name: customer.name, phone10: customer.phone, shop: shop?.shop_name ?? "Singhvi Readymades", token: label }), {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `inline; filename="customer-${label}.vcf"`,
      "Cache-Control": "no-store",
    },
  });
}
