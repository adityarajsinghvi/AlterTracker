"use client";
import { useState } from "react";
import { Btn, Field, inputCls } from "@/components/ui";
import { useAction } from "@/lib/use-action";
import { saveSettings } from "../actions";

type S = { shop_name: string; shop_phone: string; address: string | null; public_base_url: string; reminder_after_days: number };

export function SettingsForm({ s }: { s: S }) {
  const [name, setName] = useState(s.shop_name);
  const [phone, setPhone] = useState(s.shop_phone === "0000000000" ? "" : s.shop_phone);
  const [address, setAddress] = useState(s.address ?? "");
  const [url, setUrl] = useState(s.public_base_url);
  const [days, setDays] = useState(String(s.reminder_after_days));
  const [saved, setSaved] = useState(false);
  const a = useAction();
  const touch = <T,>(set: (v: T) => void) => (v: T) => { set(v); setSaved(false); };

  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); a.run(() => saveSettings({ shopName: name, shopPhone: phone, address, baseUrl: url, reminderDays: Number(days) }), () => setSaved(true)); }} className="space-y-4">
      <Field label="Shop name" htmlFor="st-name"><input id="st-name" value={name} onChange={(e) => touch(setName)(e.target.value)} className={inputCls} /></Field>
      <Field label="Shop mobile number" htmlFor="st-phone" hint="Shown on the customer page and in messages. Customers tap it to call.">
        <input id="st-phone" type="tel" inputMode="numeric" value={phone} onChange={(e) => touch(setPhone)(e.target.value)} className={inputCls} />
      </Field>
      <Field label="Address" htmlFor="st-addr"><textarea id="st-addr" rows={2} value={address} onChange={(e) => touch(setAddress)(e.target.value)} className={`${inputCls} h-auto py-3`} /></Field>
      <Field label="Web address of this app" htmlFor="st-url" hint="Used for the customer link in messages, for example https://alter.singhvireadymades.in">
        <input id="st-url" type="url" inputMode="url" value={url} onChange={(e) => touch(setUrl)(e.target.value)} className={inputCls} />
      </Field>
      <Field label="Send pickup reminder after (days)" htmlFor="st-days" hint="A ready item gets a reminder button after this many days.">
        <input id="st-days" type="number" inputMode="numeric" min={1} max={60} value={days} onChange={(e) => touch(setDays)(e.target.value)} className={inputCls} />
      </Field>
      {a.err && <p role="alert" className="rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger">{a.err}</p>}
      <Btn type="submit" disabled={a.busy}>{a.busy ? "Saving…" : saved ? "Saved ✓" : "Save"}</Btn>
    </form>
  );
}
