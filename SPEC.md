# Alteration Tracker — Build Spec

Nov 17, 2026 · @Aditya Raj Singhvi

## Overview

Build a mobile-first PWA for Singhvi Readymades that tracks every garment taken in for alteration, from counter to tailor and back to the customer, with one-tap WhatsApp updates sent from the staff member's own phone.

**Problem today**

- No single record of which items are in for alteration, for whom, and with which tailor.
- Customers come back asking for items they have already collected, and there is no proof either way.
- Promised dates slip because nobody sees what is due today or overdue.

**Goals for v1**

- Each customer visit gets one token number, however many items they hand over (5 pieces = 1 token). The token is tracked through four statuses until delivered.
- Each status change logs who did it and when.
- One tap opens WhatsApp with the customer's chat and a pre-written update; staff just press Send.
- The home screen shows due today, overdue, with tailor, and ready but not collected.

**Users**

- Owner (1): full access, history, staff management, edits and cancellations.
- Staff (2–3): create entries, update statuses, send WhatsApp updates.
- Customers: never log in. They receive WhatsApp messages and can open a public token page.

**Non-goals for v1**

- No WhatsApp Business API, bot or automated sending. Every message is sent by a person tapping Send.
- No billing, POS or inventory. Alteration charges are recorded as a number only.
- No tailor login. Tailors are a list of names that staff pick from.

**How to use this doc with Claude Code:** paste the kickoff prompt from the last section, attach this doc exported as Markdown (save it as `SPEC.md` in the repo root), and build phase by phase.

## Tech stack and architecture

A single Next.js app talks directly to Supabase. No custom backend and no WhatsApp API: messages leave through `wa.me` deep links opened on the staff member's phone.

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | Next.js (App Router), TypeScript | Server Actions for writes; server components for lists |
| UI | Tailwind CSS + shadcn/ui | Mobile-first, large tap targets, one-hand use at the counter |
| Database | Supabase Postgres | RLS on every table; all timestamps `timestamptz`, displayed in Asia/Kolkata |
| Auth | Supabase Auth | Owner creates staff accounts; staff log in with phone number + 4-digit PIN (see Roles) |
| Photos | Supabase Storage, bucket `item-photos` | Compress in the browser to about 200 KB before upload |
| PWA | Web manifest + service worker (Serwist or next-pwa) | Installable on Android home screen; app shell cached |
| Hosting | Cloudflare (OpenNext) or Vercel | Custom subdomain, e.g. `alter.singhvireadymades.in` |
| Messaging | `https://wa.me/91XXXXXXXXXX?text=<encoded>` | Opens WhatsApp with the chat and text pre-filled |

**Key rules for the build**

- The app must work well on a cheap Android phone over patchy 4G. Keep pages light and avoid heavy client bundles.
- No offline writes in v1. If the network drops, show a clear error and keep the form filled so nothing is retyped.
- All business logic that changes status lives in one Postgres function (`advance_status`), so the history log can never be skipped.

## Roles, auth and permissions

There are two roles, owner and staff. Only the owner can undo, cancel or delete anything.

| Action | Owner | Staff |
| --- | --- | --- |
| Create a new alteration entry | Yes | Yes |
| Move status forward (send to tailor, mark ready, deliver) | Yes | Yes |
| Tap WhatsApp buttons | Yes | Yes |
| Edit notes, promised date, tailor on an open item | Yes | Yes (logged) |
| Move status backward, cancel an item | Yes | No |
| Delete an item | No one; cancel instead | No |
| Add, deactivate or reset PIN for staff | Yes | No |
| Manage tailor list and message templates | Yes | No |
| See activity log of all staff | Yes | Own actions only |

**Login**

- Supabase Auth with email + password under the hood. The app maps a phone number to a synthetic email (`9829012345@staff.singhvi.local`) and uses a 4-digit PIN as the password. This avoids paying for SMS OTP.
- Supabase needs passwords of 6+ characters, so store `PIN + fixed pepper` (e.g. PIN `4821` → password `4821-sr-shop`). The pepper lives in an env variable.
- Sessions last 30 days on the device. The owner can force-logout a staff member by deactivating them.
- Owner account is created once via a seed script.

**Profiles table** holds `role` (`owner` | `staff`), `name`, `phone`, `active`. RLS checks `active = true` on every query, so a deactivated worker loses access at once.

## Status flow

A token, with all its pieces, only moves forward through four statuses; the owner alone can cancel it or move it backward. Green labels mark where a WhatsApp button appears.

&#91;embedded content: alteration lifecycle · 4 statuses, 1 redo loop, cancel\]

**Transition rules**

- `received → with_tailor`: requires a tailor. Use an "In-house" tailor entry for work done at the shop.
- `with_tailor → ready`: staff confirm the item is back and on the pickup shelf. A shelf or rack label is optional.
- `ready → with_tailor` (redo): allowed for staff, needs a short reason (e.g. "waist still loose"). The item keeps its token and the redo count goes up.
- `ready → delivered`: records who handed it over and when, plus an optional handover photo.
- Skipping a status is allowed only from `received` straight to `ready`, for quick in-house fixes like a hem done while the customer waits.
- `cancelled`: owner only, needs a reason. Cancelled items drop off every list but stay in history.
- Every transition writes one row to `item_events`. Nothing changes status except the `advance_status` function.

## Data model

One token per customer visit, holding every piece they hand over (e.g. blazer + 2 trousers + shirt + kurta = one token). Pieces never get their own token number. Status lives on the token, because the pieces usually travel to the tailor and back together.

| Table | Purpose |
| --- | --- |
| `profiles` | Owner and staff accounts, linked to `auth.users` |
| `customers` | One row per phone number |
| `tailors` | Tailor list, including one "In-house" entry |
| `alterations` | The token: customer, status, tailor, dates, charge, public slug |
| `alteration_pieces` | Each garment under a token, with its notes and photos |
| `alteration_events` | Append-only history of every status change and edit |
| `message_log` | Every WhatsApp button tap: which template, who, when |
| `message_templates` | Owner-editable message text per status |
| `shop_settings` | Shop name, phone, address, reminder days, public base URL |

```sql
create type user_role as enum ('owner', 'staff');
create type alteration_status as enum ('received', 'with_tailor', 'ready', 'delivered', 'cancelled');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  phone text not null unique,          -- 10 digits, no country code
  role user_role not null default 'staff',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null unique,          -- normalised: 10 digits
  notes text,
  created_at timestamptz not null default now()
);

create table tailors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  is_in_house boolean not null default false,
  active boolean not null default true
);

create sequence token_seq start 101;

create table alterations (
  id uuid primary key default gen_random_uuid(),
  token_no int not null unique default nextval('token_seq'),
  public_slug text not null unique,    -- random 10 chars, for the customer page
  customer_id uuid not null references customers,
  status alteration_status not null default 'received',
  tailor_id uuid references tailors,
  promised_date date not null,
  charge numeric(10,2),                -- null = free alteration
  paid boolean not null default false,
  rack_label text,
  redo_count int not null default 0,
  collected_by_name text,              -- if someone else picks it up
  cancel_reason text,
  created_by uuid not null references profiles,
  created_at timestamptz not null default now(),
  sent_to_tailor_at timestamptz,
  ready_at timestamptz,
  delivered_at timestamptz,
  delivered_by uuid references profiles,
  updated_at timestamptz not null default now()
);

create table alteration_pieces (
  id uuid primary key default gen_random_uuid(),
  alteration_id uuid not null references alterations on delete cascade,
  item_type text not null,             -- Suit, Blazer, Sherwani, Jodhpuri, Kurta, Trouser, Shirt, Other
  description text,                    -- e.g. 'Navy blazer, bought here'
  work_notes text not null,            -- e.g. 'Sleeves short 1 inch, taper waist'
  photo_paths text[] not null default '{}',
  sort int not null default 0
);

create table alteration_events (
  id bigint generated always as identity primary key,
  alteration_id uuid not null references alterations on delete cascade,
  kind text not null,                  -- 'status' | 'edit' | 'note'
  from_status alteration_status,
  to_status alteration_status,
  note text,
  photo_path text,                     -- handover photo on delivery
  actor_id uuid not null references profiles,
  created_at timestamptz not null default now()
);

create table message_log (
  id bigint generated always as identity primary key,
  alteration_id uuid not null references alterations on delete cascade,
  template_key text not null,
  opened_by uuid not null references profiles,
  opened_at timestamptz not null default now()
);

create table message_templates (
  key text primary key,                -- receipt | ready | reminder | delivered | delay
  label text not null,
  body text not null,
  active boolean not null default true
);

create table shop_settings (
  id int primary key default 1 check (id = 1),
  shop_name text not null,
  shop_phone text not null,
  address text,
  public_base_url text not null,
  reminder_after_days int not null default 3
);
```

**Function `advance_status(p_id, p_to, p_note, p_tailor_id, p_photo_path)`**, `security definer`:

- Checks the caller is an active profile and the transition is allowed for their role (see Status flow).
- Sets the matching timestamp (`sent_to_tailor_at`, `ready_at`, `delivered_at` + `delivered_by`), bumps `redo_count` on a redo, and requires a tailor for `with_tailor`.
- Inserts one `alteration_events` row in the same transaction and returns the updated row.

**RLS**

- A helper `is_active_user()` returns true when `auth.uid()` has an active profile; `is_owner()` also checks the role.
- Active users can select everything and insert customers, alterations and pieces. Direct `update` on `alterations.status` is blocked; status goes only through `advance_status`.
- Only the owner can update `profiles`, `tailors`, `message_templates` and `shop_settings`.
- `alteration_events` and `message_log` are insert-only for everyone; no updates or deletes.
- Storage bucket `item-photos` is private. The app shows photos through signed URLs.

**Indexes:** `customers(phone)`, `alterations(status, promised_date)`, `alterations(customer_id)`, `alterations(public_slug)`, `alteration_events(alteration_id, created_at)`.

## Screens and UX

There are five main screens behind a bottom nav (Home, New, Search, Tailors, More). Every common action takes at most three taps from Home.

| Route | Screen | Who |
| --- | --- | --- |
| `/login` | Phone + 4-digit PIN | All |
| `/` | Home: today's work lists | All |
| `/new` | New alteration entry | All |
| `/a/[token]` | Token detail: status actions + WhatsApp buttons | All |
| `/search` | Search by phone, name or token | All |
| `/tailors` | What is with each tailor, and for how long | All |
| `/more/staff`, `/more/tailors`, `/more/templates`, `/more/settings`, `/more/activity` | Owner admin | Owner |
| `/t/[slug]` | Public customer token page, no login | Public |

**Home (`/`)**

- Four tabs with counts: **Due today**, **Overdue** (red), **With tailor**, **Ready, not collected**.
- Each card shows token number, customer name, item types (e.g. "Blazer + Trouser"), promised date, tailor, and days in the current status.
- Ready cards older than `reminder_after_days` show a WhatsApp reminder button right on the card.
- A large "+ New" floating button.

**New entry (`/new`)**

1. Phone number first. If the customer exists, autofill the name and show their open tokens as a warning ("2 items already in for alteration").
2. Name (if new).
3. Pieces: item type chips (Suit, Blazer, Sherwani, Jodhpuri, Kurta, Trouser, Shirt, Other), work notes, photo (camera opens directly). "+ Add another piece".
4. Promised date: quick chips (Tomorrow, 2 days, 3 days, 1 week) plus a date picker.
5. Optional: tailor (if sending straight away), charge, paid toggle, rack label.
6. Save → token number shown big ("Token #142") with the **Send receipt on WhatsApp** button and a "Write #142 on the tag" reminder.

**Token detail (`/a/[token]`)**

- Header: token number, status badge, customer name with a tap-to-call link, promised date (red if overdue).
- Pieces with photos (tap to enlarge) and work notes.
- One primary button for the next status: "Send to tailor" (opens a tailor picker), "Mark ready", "Hand over". Secondary: "Needs redo".
- "Hand over" opens a sheet: confirm customer name or "collected by someone else" + name, optional handover photo, a paid check if a charge is unpaid.
- WhatsApp button for the current status, plus "Send delay notice" when overdue. The button turns into "Sent ✓ by Ramesh, 4:12 PM" after a tap (from `message_log`), with a resend option.
- History timeline from `alteration_events` and `message_log`, newest first.

**Search (`/search`)**

- One box. Digits match phone or token; letters match customer name. Results show all tokens for that customer, including delivered ones, so "I never took it" disputes are settled by the history.

**Tailors (`/tailors`)**

- One card per tailor: items currently with them, oldest first, and how many days each has been out.

**Owner admin (`/more/*`)**

- Staff: add (name, phone, PIN), reset PIN, deactivate.
- Tailors: add, edit, deactivate.
- Templates: edit message text with a live preview using a sample token.
- Activity: feed of all events and WhatsApp taps, filter by staff and date.

## WhatsApp click-to-send

Each button builds a `wa.me` link with the customer's number and the filled-in template, logs the tap, then hands off to WhatsApp, where staff press Send. Nothing is sent automatically.

```ts
// lib/whatsapp.ts
export function buildWaLink(phone10: string, text: string) {
  const digits = phone10.replace(/\D/g, '').slice(-10);
  return `https://wa.me/91${digits}?text=${encodeURIComponent(text)}`;
}

export function fillTemplate(body: string, vars: Record<string, string>) {
  return body.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

// On tap: await logMessage(alterationId, templateKey) (server action),
// then window.location.href = buildWaLink(...).
// Same-tab navigation hands off to the WhatsApp app inside the installed PWA.
```

**Placeholders:** `{customer_name}`, `{token}`, `{items}` (e.g. "Navy Blazer + Trouser"), `{promised_date}` (e.g. "Fri, 20 Nov"), `{link}` (public token page), `{delivered_at}`, `{collected_by}`, `{shop_name}`, `{shop_phone}`.

**Default templates** (seeded; owner can edit them in `/more/templates`)

| Key | When the button shows | Default text |
| --- | --- | --- |
| `receipt` | After saving a new entry | Namaste {customer\_name} ji 🙏 {shop\_name} has received your {items} for alteration. Token #{token}, ready by {promised\_date}. Please show this message when collecting. Details: {link} |
| `ready` | Status becomes Ready | Good news {customer\_name} ji! Your {items} (Token #{token}) is ready for pickup at {shop\_name}. Details: {link} |
| `reminder` | Ready for more than `reminder_after_days` | Reminder: your {items} (Token #{token}) is ready and waiting at {shop\_name}. Please collect at your convenience. |
| `delay` | Past the promised date and not Ready | Sorry {customer\_name} ji, your {items} (Token #{token}) needs a little more time. We will message you as soon as it is ready. |
| `delivered` | Status becomes Delivered | Thank you {customer\_name} ji! Token #{token} ({items}) was collected on {delivered\_at} by {collected\_by}. If this was not you, please call us on {shop\_phone}. |

**Notes for the build**

- Staff phones should have the shop's WhatsApp Business account logged in, so messages come from one shop number. On phones with both WhatsApp and WhatsApp Business installed, Android asks which app to use. Set WhatsApp Business as the default once.
- A `wa.me` link cannot attach photos. The `{link}` to the public token page carries the photo instead.
- `message_log` records that the button was tapped, not that the message was sent. Label it "Opened WhatsApp" in the UI to stay honest.
- If the customer's phone is missing or invalid, disable the button and show why.

## Public token page

`/t/[slug]` is the customer's digital slip. It is read-only, needs no login, and shows only what the customer already knows.

**Shows**

- Shop name, logo, address, and tap-to-call shop phone.
- Token number, status as a simple 4-step progress bar, promised date.
- Pieces: item type, work notes, photo.
- When delivered: date, time and collected-by name.

**Hides**

- Customer phone (show only the last 4 digits), charge, internal notes, tailor name, staff names.

**Implementation**

- A server component reads by `public_slug` with the service-role key and selects only the allowed columns. No public RLS policies on the tables.
- Photos are served through short-lived signed URLs (1 hour).
- The slug is 10 random URL-safe characters, never the token number, so tokens cannot be guessed by counting.
- Add `noindex` and a simple Open Graph preview ("Token #142 · Singhvi Readymades"), so the WhatsApp link preview looks clean.

## Build phases

Build in four phases. Each one ends with something staff can use at the counter.

1. **Foundation:** project setup, Supabase schema + RLS + `advance_status`, seed script (owner, In-house tailor, templates, settings), PIN login, app shell with bottom nav, PWA manifest.
   - [ ] Owner and one staff can log in on two phones; a deactivated staff member is locked out.
   - [ ] A direct `update` of `alterations.status` from the client is rejected.
2. **Intake and tracking:** New entry with photos, token detail, all status actions including redo and hand over, history timeline.
   - [ ] A 3-piece entry with photos saves in under 60 seconds on a mid-range Android phone.
   - [ ] Every status change appears in history with the staff name and time.
3. **WhatsApp and customer page:** templates, link builder, message log, buttons on detail and Home cards, public `/t/[slug]` page.
   - [ ] Tapping "Send receipt" opens WhatsApp Business with the right chat and full text.
   - [ ] The public page shows no phone number, charge or tailor name.
4. **Home lists, search and owner admin:** four Home tabs with counts, search, tailor view, staff, tailor and template management, activity feed.
   - [ ] An item past its promised date shows in Overdue and offers the delay message.
   - [ ] Searching a phone number shows delivered tokens with their delivery details.

## Edge cases

- **Repeat customer, same phone:** reuse the customer row; show open tokens at intake.
- **Wrong phone number typed:** owner can edit the customer's phone; the edit is logged.
- **Pieces ready at different times:** still one token. v1 tracks status for the whole token, so staff mark it Ready only when every piece is back. Per-piece status is a v2 option.
- **Someone else collects:** hand-over sheet records their name; the delivered message goes to the customer's number, so the customer is informed.
- **Customer lost the slip:** search by phone; the WhatsApp receipt in their chat is the backup.
- **Item never collected:** the Ready tab shows days waiting; after 30 days, highlight it for the owner.
- **Two staff update the same token at once:** `advance_status` checks the current status and fails with "Already marked ready by Suresh" instead of double-logging.
- **Photo upload fails on weak network:** save the entry anyway, mark the piece "photo pending", and allow adding a photo later from the detail page.

## Open questions

- Should the token sequence restart each year (e.g. 26-101) or run forever?
- Are alteration charges tracked here, or only noted on the bill? The schema supports both.
- Does the shop need a printed tag with a QR code linking to the token page? This could be a v2 add-on with a cheap thermal printer.

## Claude Code kickoff prompt

Save this doc as `SPEC.md` in an empty repo, then paste:

```text
Read SPEC.md fully. It is the spec for an alteration tracking PWA for a menswear shop.

Stack: Next.js (App Router, TypeScript), Tailwind + shadcn/ui, Supabase (Postgres, Auth, Storage), deploy target Cloudflare via OpenNext.

Work phase by phase as listed under "Build phases". Before writing code for a phase:
1. Summarise what you will build and list any spec ambiguities as questions.
2. Wait for my answers.
Then build it, write Supabase migrations under supabase/migrations, and finish the phase by checking every acceptance item and telling me how to test it on my phone.

Rules:
- Mobile-first; test layouts at 360px width.
- Status changes only through the advance_status Postgres function.
- No WhatsApp API: only wa.me links as described in the spec.
- All dates shown in Asia/Kolkata.
- Keep secrets in .env.local; never commit them.

Start with Phase 1.
```
