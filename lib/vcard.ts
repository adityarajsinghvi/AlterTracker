// A contact card (vCard 3.0). Opening it on a phone offers "Add to Contacts".
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

export function buildVCard(opts: { name: string; phone10: string; shop: string; token: string }): string {
  const parts = opts.name.trim().split(/\s+/);
  const family = parts.length > 1 ? parts[parts.length - 1] : "";
  const given = parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0];
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${esc(family)};${esc(given)};;;`,
    `FN:${esc(opts.name.trim())}`,
    `TEL;TYPE=CELL:+91${opts.phone10}`,
    `ORG:${esc(opts.shop)}`,
    `NOTE:${esc(`Customer of ${opts.shop}. Alteration token #${opts.token}.`)}`,
    "END:VCARD",
  ].join("\r\n") + "\r\n";
}
