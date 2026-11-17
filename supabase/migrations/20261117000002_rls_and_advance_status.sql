-- Phase 1: RLS, edit guard, advance_status, storage

alter table profiles enable row level security;
alter table customers enable row level security;
alter table tailors enable row level security;
alter table token_counters enable row level security;   -- no policies: only the trigger function touches it
alter table alterations enable row level security;
alter table alteration_pieces enable row level security;
alter table alteration_events enable row level security;
alter table message_log enable row level security;
alter table message_templates enable row level security;
alter table shop_settings enable row level security;

-- profiles: active users read; only owner updates; inserts via service role only
create policy profiles_select on profiles for select to authenticated using (is_active_user());
create policy profiles_update_owner on profiles for update to authenticated
  using (is_owner()) with check (is_owner());

-- customers
create policy customers_select on customers for select to authenticated using (is_active_user());
create policy customers_insert on customers for insert to authenticated with check (is_active_user());
create policy customers_update_owner on customers for update to authenticated
  using (is_owner()) with check (is_owner());

-- tailors / templates / settings: read for all active, write for owner
create policy tailors_select on tailors for select to authenticated using (is_active_user());
create policy tailors_write on tailors for all to authenticated using (is_owner()) with check (is_owner());
create policy templates_select on message_templates for select to authenticated using (is_active_user());
create policy templates_write on message_templates for all to authenticated using (is_owner()) with check (is_owner());
create policy settings_select on shop_settings for select to authenticated using (is_active_user());
create policy settings_update on shop_settings for update to authenticated using (is_owner()) with check (is_owner());

-- alterations: select + insert (fresh 'received' rows only) + update (guarded by trigger below)
create policy alterations_select on alterations for select to authenticated using (is_active_user());
create policy alterations_insert on alterations for insert to authenticated with check (
  is_active_user() and created_by = auth.uid() and status = 'received' and redo_count = 0
  and sent_to_tailor_at is null and ready_at is null and delivered_at is null
  and delivered_by is null and cancel_reason is null and collected_by_name is null
);
create policy alterations_update on alterations for update to authenticated
  using (is_active_user()) with check (is_active_user());

-- pieces: no delete policy, so nothing can be removed
create policy pieces_select on alteration_pieces for select to authenticated using (is_active_user());
create policy pieces_insert on alteration_pieces for insert to authenticated with check (is_active_user());
create policy pieces_update on alteration_pieces for update to authenticated
  using (is_active_user()) with check (is_active_user());

-- events / message_log: select + insert only (append-only)
create policy events_select on alteration_events for select to authenticated using (is_active_user());
create policy events_insert on alteration_events for insert to authenticated
  with check (is_active_user() and actor_id = auth.uid());
create policy msglog_select on message_log for select to authenticated using (is_active_user());
create policy msglog_insert on message_log for insert to authenticated
  with check (is_active_user() and opened_by = auth.uid());

-- Hard-stop update/delete on the append-only logs, even for service role mistakes
create or replace function forbid_mutation() returns trigger language plpgsql as $$
begin raise exception '% is append-only', tg_table_name; end $$;
create trigger events_immutable before update or delete on alteration_events
  for each row execute function forbid_mutation();
create trigger msglog_immutable before update or delete on message_log
  for each row execute function forbid_mutation();

-- Guard direct updates on alterations.
-- Only advance_status (which sets app.advancing = 'on' for its transaction) may change
-- status-related columns. Other edits are allowed on open tokens and are logged.
create or replace function alterations_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  changed text[] := '{}';
  advancing boolean := coalesce(current_setting('app.advancing', true), '') = 'on';
begin
  new.updated_at := now();
  if advancing or auth.uid() is null then
    return new;   -- advance_status, or a trusted service-role/migration context
  end if;

  if new.status is distinct from old.status
     or new.redo_count is distinct from old.redo_count
     or new.sent_to_tailor_at is distinct from old.sent_to_tailor_at
     or new.ready_at is distinct from old.ready_at
     or new.delivered_at is distinct from old.delivered_at
     or new.delivered_by is distinct from old.delivered_by
     or new.collected_by_name is distinct from old.collected_by_name
     or new.cancel_reason is distinct from old.cancel_reason
     or new.token_no is distinct from old.token_no
     or new.token_year is distinct from old.token_year
     or new.public_slug is distinct from old.public_slug
     or new.customer_id is distinct from old.customer_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Status and history fields can only change through advance_status()'
      using errcode = '42501';
  end if;

  if old.status in ('delivered', 'cancelled') then
    raise exception 'This token is %; it can no longer be edited', old.status using errcode = '42501';
  end if;

  if new.promised_date is distinct from old.promised_date then changed := changed || 'promised_date'; end if;
  if new.tailor_id is distinct from old.tailor_id then changed := changed || 'tailor'; end if;
  if new.charge is distinct from old.charge then changed := changed || 'charge'; end if;
  if new.paid is distinct from old.paid then changed := changed || 'paid'; end if;
  if new.rack_label is distinct from old.rack_label then changed := changed || 'rack_label'; end if;

  if array_length(changed, 1) > 0 then
    insert into alteration_events (alteration_id, kind, note, actor_id)
    values (old.id, 'edit', 'Changed: ' || array_to_string(changed, ', '), auth.uid());
  end if;
  return new;
end $$;
create trigger trg_alterations_guard before update on alterations
  for each row execute function alterations_guard();

-- advance_status: the only way to change status
create or replace function advance_status(
  p_id uuid,
  p_to alteration_status,
  p_note text default null,
  p_tailor_id uuid default null,
  p_photo_path text default null,
  p_collected_by text default null,
  p_rack_label text default null,
  p_expected_from alteration_status default null
) returns alterations
language plpgsql security definer set search_path = public as $$
declare
  a alterations;
  me profiles;
  from_s alteration_status;
  rank_from int;
  rank_to int;
  tailor uuid;
  cust_name text;
  who text;
  is_redo boolean := false;
  is_backward boolean := false;
begin
  select * into me from profiles where id = auth.uid() and active;
  if not found then raise exception 'Not allowed' using errcode = '42501'; end if;

  select * into a from alterations where id = p_id for update;
  if not found then raise exception 'Token not found'; end if;
  from_s := a.status;

  -- concurrency: someone else already moved it
  if from_s = p_to or (p_expected_from is not null and p_expected_from <> from_s) then
    select p.name into who from alteration_events e join profiles p on p.id = e.actor_id
      where e.alteration_id = a.id and e.kind = 'status' order by e.id desc limit 1;
    raise exception 'Already marked % by %', replace(from_s::text, '_', ' '), coalesce(who, 'someone')
      using errcode = '40001';
  end if;

  if from_s in ('delivered', 'cancelled') and not (from_s = 'delivered' and me.role = 'owner' and p_to = 'ready') then
    raise exception 'This token is already %', from_s;
  end if;

  rank_from := case from_s when 'received' then 0 when 'with_tailor' then 1 when 'ready' then 2 when 'delivered' then 3 end;
  rank_to := case p_to when 'received' then 0 when 'with_tailor' then 1 when 'ready' then 2 when 'delivered' then 3 end;

  if p_to = 'cancelled' then
    if me.role <> 'owner' then raise exception 'Only the owner can cancel' using errcode = '42501'; end if;
    if coalesce(btrim(p_note), '') = '' then raise exception 'A reason is required to cancel'; end if;
  elsif from_s = 'ready' and p_to = 'with_tailor' then
    is_redo := true;
    if coalesce(btrim(p_note), '') = '' then raise exception 'A short reason is required for a redo'; end if;
  elsif rank_to < rank_from then
    is_backward := true;
    if me.role <> 'owner' then raise exception 'Only the owner can move a token backward' using errcode = '42501'; end if;
    if coalesce(btrim(p_note), '') = '' then raise exception 'A reason is required to move backward'; end if;
  elsif not ((from_s = 'received' and p_to in ('with_tailor', 'ready'))
          or (from_s = 'with_tailor' and p_to = 'ready')
          or (from_s = 'ready' and p_to = 'delivered')) then
    raise exception 'Cannot move from % to %', from_s, p_to;
  end if;

  perform set_config('app.advancing', 'on', true);

  if p_to = 'with_tailor' then
    tailor := coalesce(p_tailor_id, a.tailor_id);
    if tailor is null then raise exception 'Choose a tailor first'; end if;
    update alterations set
      status = 'with_tailor', tailor_id = tailor,
      sent_to_tailor_at = now(),
      ready_at = null,
      redo_count = redo_count + (case when is_redo then 1 else 0 end)
    where id = a.id;
  elsif p_to = 'ready' and not is_backward then
    update alterations set status = 'ready', ready_at = now(),
      rack_label = coalesce(nullif(btrim(p_rack_label), ''), rack_label)
    where id = a.id;
  elsif p_to = 'delivered' then
    select name into cust_name from customers where id = a.customer_id;
    update alterations set status = 'delivered', delivered_at = now(), delivered_by = me.id,
      collected_by_name = coalesce(nullif(btrim(p_collected_by), ''), cust_name)
    where id = a.id;
  elsif p_to = 'cancelled' then
    update alterations set status = 'cancelled', cancel_reason = btrim(p_note) where id = a.id;
  elsif is_backward then
    update alterations set
      status = p_to,
      sent_to_tailor_at = case when rank_to < 1 then null else sent_to_tailor_at end,
      ready_at = case when rank_to < 2 then null else ready_at end,
      delivered_at = null, delivered_by = null, collected_by_name = null
    where id = a.id;
  end if;

  insert into alteration_events (alteration_id, kind, from_status, to_status, note, photo_path, actor_id)
  values (a.id, 'status', from_s, p_to,
          case when is_redo then 'Redo: ' || btrim(p_note) else nullif(btrim(p_note), '') end,
          p_photo_path, me.id);

  select * into a from alterations where id = p_id;
  return a;
end $$;

revoke all on function advance_status(uuid, alteration_status, text, uuid, text, text, text, alteration_status) from public, anon;
grant execute on function advance_status(uuid, alteration_status, text, uuid, text, text, text, alteration_status) to authenticated;

-- Storage: private bucket for item photos; signed URLs only
insert into storage.buckets (id, name, public) values ('item-photos', 'item-photos', false)
on conflict (id) do nothing;

create policy item_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'item-photos' and is_active_user());
create policy item_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'item-photos' and is_active_user());
