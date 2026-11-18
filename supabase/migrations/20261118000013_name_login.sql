-- Login with name + PIN instead of phone + PIN.
-- The sign-in email becomes an opaque id-based address (no phone number inside), and a lookup finds it from the name.
-- Wrong PINs are rate-limited so a guessable name does not make the 4-digit PIN easier to brute-force.

create or replace function norm_name(p text) returns text language sql immutable as $$
  select lower(btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')))
$$;

alter table profiles alter column phone drop not null;   -- staff no longer need a phone number
create unique index profiles_name_unique on profiles (norm_name(name));

-- Existing accounts: replace the phone-based email with an id-based one.
update auth.users u set email = p.id::text || '@staff.singhvi.local', updated_at = now()
from profiles p where p.id = u.id;

create table login_attempts (
  id bigint generated always as identity primary key,
  name_key text not null,
  ip text not null,
  at timestamptz not null default now()
);
create index login_attempts_idx on login_attempts (name_key, at);
alter table login_attempts enable row level security;   -- no policies: only the functions below touch it

-- Step 1 of logging in: is this name/IP locked out, and which sign-in address belongs to the name?
create or replace function login_begin(p_name text, p_ip text) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare
  k text := norm_name(p_name); v_ip text := left(coalesce(p_ip, ''), 64);
  ip_fail int; name_fail int; wait int := 0; first_at timestamptz; em text;
begin
  if k = '' or length(k) > 60 then return jsonb_build_object('email', null, 'locked_seconds', 0); end if;
  delete from login_attempts where at < now() - interval '1 day';

  select count(*), min(at) into ip_fail, first_at from login_attempts
    where name_key = k and login_attempts.ip = v_ip and at > now() - interval '15 minutes';
  if ip_fail >= 5 then
    wait := greatest(wait, ceil(extract(epoch from (first_at + interval '15 minutes' - now())))::int);
  end if;
  select count(*), min(at) into name_fail, first_at from login_attempts
    where name_key = k and at > now() - interval '15 minutes';
  if name_fail >= 30 then
    wait := greatest(wait, ceil(extract(epoch from (first_at + interval '15 minutes' - now())))::int);
  end if;
  if wait > 0 then return jsonb_build_object('email', null, 'locked_seconds', wait); end if;

  select u.email into em from profiles p join auth.users u on u.id = p.id
    where norm_name(p.name) = k and p.active;
  return jsonb_build_object('email', em, 'locked_seconds', 0);
end $$;

-- Step 2: record how it went. A success clears this device's failures.
create or replace function login_finish(p_name text, p_ip text, p_ok boolean) returns void
language plpgsql security definer set search_path = public as $$
declare k text := norm_name(p_name); v_ip text := left(coalesce(p_ip, ''), 64);
begin
  if k = '' or length(k) > 60 then return; end if;
  if p_ok then
    delete from login_attempts where name_key = k and login_attempts.ip = v_ip;
  else
    insert into login_attempts (name_key, ip) values (k, v_ip);
  end if;
end $$;
revoke all on function login_begin(text, text) from public;
revoke all on function login_finish(text, text, boolean) from public;
grant execute on function login_begin(text, text) to anon, authenticated;
grant execute on function login_finish(text, text, boolean) to anon, authenticated;

-- Adding staff: name + PIN. Phone is optional.
create or replace function owner_create_staff(p_name text, p_phone text, p_password text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := gen_random_uuid();
begin
  if not is_owner() then raise exception 'Only the owner can add staff' using errcode = '42501'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'Name is required'; end if;
  if length(btrim(p_name)) > 40 then raise exception 'Name is too long (40 letters at most)'; end if;
  if nullif(btrim(coalesce(p_phone, '')), '') is not null and p_phone !~ '^[0-9]{10}$' then
    raise exception 'Enter a valid 10-digit phone number, or leave it empty';
  end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'Invalid password'; end if;
  if exists (select 1 from profiles where norm_name(name) = norm_name(p_name)) then
    raise exception 'Someone with this name already exists. Add a surname or an initial so each person has a different name.';
  end if;
  if nullif(btrim(coalesce(p_phone, '')), '') is not null and exists (select 1 from profiles where phone = p_phone) then
    raise exception 'This phone number is already registered';
  end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
    uid::text || '@staff.singhvi.local', crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
  insert into profiles (id, name, phone, role) values (uid, btrim(p_name), nullif(btrim(coalesce(p_phone, '')), ''), 'staff');
  return uid;
end $$;
