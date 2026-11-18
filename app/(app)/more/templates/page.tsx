import type { Metadata } from "next";
import { PageTitle } from "@/components/page-title";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/session";
import { getMessageContext } from "@/lib/message-data";
import { TemplateEditor } from "./template-editor";

export const metadata: Metadata = { title: "Message templates" };

const ORDER = ["receipt", "ready", "reminder", "delay", "delivered"];

export default async function Page() {
  await requireOwner();
  const supabase = await createClient();
  const { data } = await supabase.from("message_templates").select("key,label,body,active");
  const { shop } = await getMessageContext();
  const list = (data ?? []).sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
  return (
    <>
      <PageTitle sub="The text WhatsApp opens with. Staff still press Send.">Message templates</PageTitle>
      <div className="space-y-5">
        {list.map((t) => <TemplateEditor key={t.key + t.body + t.active} t={t} shop={shop} />)}
      </div>
    </>
  );
}
