export function buildWaLink(phone10: string, text: string) {
  const digits = phone10.replace(/\D/g, "").slice(-10);
  return `https://wa.me/91${digits}?text=${encodeURIComponent(text)}`;
}

export function fillTemplate(body: string, vars: Record<string, string>) {
  return body.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}
