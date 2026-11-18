// Daily call from the web host to the database. Supabase's free plan pauses a project after a week with no activity;
// this prevents that, even if the shop is closed for a holiday.
export async function keepAlive(env, fetchFn = fetch) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("keep-alive: SUPABASE_URL and SUPABASE_ANON_KEY must be set");
  const res = await fetchFn(`${url}/rest/v1/rpc/keep_alive`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) throw new Error(`keep-alive failed: HTTP ${res.status} ${await res.text()}`);
  return res.text();
}
