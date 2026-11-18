# Alteration Tracker

Mobile-first PWA for Singhvi Readymades. See `SPEC.md` for the full spec.

## Setup
1. `npm install`
2. `cp .env.example .env.local` and fill in `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_PIN_PEPPER`, `OWNER_PHONE`, `OWNER_PIN`.
3. Apply `supabase/migrations/*` (already applied to the `altertracker` Supabase project).
4. `npm run seed:owner` creates the owner login.
5. `npm run dev`

Test staff login: `npx tsx scripts/create-staff.ts "Ramesh" 9829012345 4821`.

## Notes
- Tokens restart each year and display as `26-101`.
- Status changes only go through the `advance_status` Postgres function.
- Hosting: Cloudflare via OpenNext (`npm run deploy`).

## Deploying
- Normal: `npm run deploy` (needs `npx wrangler login`, then `npx wrangler secret put AUTH_PIN_PEPPER`).
- Fallback: `npm run deploy:embedded` bundles the static files into the worker (`scripts/embed-assets.mjs`,
  `scripts/worker-embedded.js`, `wrangler.embedded.jsonc`) for when the static-assets upload is unavailable.
- Secrets on the worker: `AUTH_PIN_PEPPER` (required), `SUPABASE_SERVICE_ROLE_KEY` (needed for photos on the public page).
- Live: https://altertracker.singhviaditya2.workers.dev
