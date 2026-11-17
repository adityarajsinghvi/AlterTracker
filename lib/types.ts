export type Status = "received" | "with_tailor" | "ready" | "delivered" | "cancelled";
export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };
export type Tailor = { id: string; name: string; is_in_house: boolean };
