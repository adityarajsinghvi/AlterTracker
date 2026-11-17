-- Phase 1: schema, token numbering, helpers
create type user_role as enum ('owner', 'staff');
create type alteration_status as enum ('received', 'with_tailor', 'ready', 'delivered', 'cancelled');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  phone text not null unique check (phone ~ '^[0-9]{10}$'),
  role user_role not null default 'staff',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null unique check (phone ~ '^[0-9]{10}$'),
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

-- Token numbers restart every year (Asia/Kolkata), starting at 101.
-- Display format: "26-101" (token_year % 100 + '-' + token_no).
create table token_counters (
  year int primary key,
  last_no int not null
);

create or replace function next_token_no(p_year int) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into token_counters (year, last_no) values (p_year, 101)
  on conflict (year) do update set last_no = token_counters.last_no + 1
  returning last_no into n;
  return n;
end $$;
revoke all on function next_token_no(int) from public, anon, authenticated;

create table alterations (
  id uuid primary key default gen_random_uuid(),
  token_year int not null default extract(year from (now() at time zone 'Asia/Kolkata'))::int,
  token_no int,                        -- assigned by trigger; unique per year
  public_slug text not null unique default substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 10),
  customer_id uuid not null references customers,
  status alteration_status not null default 'received',
  tailor_id uuid references tailors,
  promised_date date not null,
  charge numeric(10,2),
  paid boolean not null default false,
  rack_label text,
  redo_count int not null default 0,
  collected_by_name text,
  cancel_reason text,
  created_by uuid not null references profiles,
  created_at timestamptz not null default now(),
  sent_to_tailor_at timestamptz,
  ready_at timestamptz,
  delivered_at timestamptz,
  delivered_by uuid references profiles,
  updated_at timestamptz not null default now(),
  unique (token_year, token_no)
);

create or replace function alterations_assign_token() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.token_no is null then
    new.token_no := next_token_no(new.token_year);
  end if;
  return new;
end $$;
create trigger trg_alterations_token before insert on alterations
  for each row execute function alterations_assign_token();

create table alteration_pieces (
  id uuid primary key default gen_random_uuid(),
  alteration_id uuid not null references alterations on delete cascade,
  item_type text not null,
  description text,
  work_notes text not null,
  photo_paths text[] not null default '{}',
  photo_pending boolean not null default false,
  sort int not null default 0
);

create table alteration_events (
  id bigint generated always as identity primary key,
  alteration_id uuid not null references alterations on delete cascade,
  kind text not null check (kind in ('status','edit','note')),
  from_status alteration_status,
  to_status alteration_status,
  note text,
  photo_path text,
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
  key text primary key,
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

create index customers_phone_idx on customers (phone);
create index alterations_status_promised_idx on alterations (status, promised_date);
create index alterations_customer_idx on alterations (customer_id);
create index alterations_slug_idx on alterations (public_slug);
create index alteration_events_alt_idx on alteration_events (alteration_id, created_at);
create index alteration_pieces_alt_idx on alteration_pieces (alteration_id);
create index message_log_alt_idx on message_log (alteration_id, opened_at);

-- Helpers
create or replace function is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active)
$$;
create or replace function is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active and role = 'owner')
$$;
