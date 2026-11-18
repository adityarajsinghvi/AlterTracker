-- Phase 4: owner-only staff management without needing the service-role key.
-- The app computes the password (PIN + pepper) and passes it in; only an active owner may call these.

create or replace function owner_create_staff(p_name text, p_phone text, p_password text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := gen_random_uuid();
begin
  if not is_owner() then raise exception 'Only the owner can add staff' using errcode = '42501'; end if;
  if p_phone !~ '^[0-9]{10}$' then raise exception 'Enter a valid 10-digit phone number'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'Name is required'; end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'Invalid password'; end if;
  if exists (select 1 from profiles where phone = p_phone) then
    raise exception 'This phone number is already registered';
  end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
    p_phone || '@staff.singhvi.local', crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
  insert into profiles (id, name, phone, role) values (uid, btrim(p_name), p_phone, 'staff');
  return uid;
end $$;

create or replace function owner_set_pin(p_user uuid, p_password text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not is_owner() then raise exception 'Only the owner can reset a PIN' using errcode = '42501'; end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'Invalid password'; end if;
  if not exists (select 1 from profiles where id = p_user) then raise exception 'User not found'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = p_user;
  -- Force the other person to log in again with the new PIN (the owner keeps their own session).
  if p_user <> auth.uid() then delete from auth.sessions where user_id = p_user; end if;
end $$;

revoke all on function owner_create_staff(text, text, text) from public, anon;
revoke all on function owner_set_pin(uuid, text) from public, anon;
grant execute on function owner_create_staff(text, text, text) to authenticated;
grant execute on function owner_set_pin(uuid, text) to authenticated;

-- The owner cannot switch off or demote their own account.
create or replace function profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and old.id = auth.uid()
     and (new.active = false or (old.role = 'owner' and new.role <> 'owner')) then
    raise exception 'You cannot switch off or demote your own account' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_profiles_guard before update on profiles
  for each row execute function profiles_guard();
