// Name + PIN -> Supabase password. Server-side only (uses the pepper).
export function normalizePhone(input: string): string {
  return input.replace(/\D/g, "").slice(-10);
}

export function isValidPhone(phone10: string): boolean {
  return /^[6-9]\d{9}$/.test(phone10);
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export function pinToPassword(pin: string): string {
  const pepper = process.env.AUTH_PIN_PEPPER;
  if (!pepper) throw new Error("AUTH_PIN_PEPPER is not set");
  return `${pin}-${pepper}`;
}
