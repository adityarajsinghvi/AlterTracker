-- Per-item tracking: each item has its own status, tailor and handover. The token (one customer visit) keeps
-- one derived overall status (the least advanced item still in progress) so lists and old screens keep working.
-- Photos now belong to the visit (token), not to each item. Item notes are optional.

-- 1. Columns ---------------------------------------------------------------------------------------------
alter table alteration_pieces
  add column status alteration_status not null default 'received',
  add column tailor_id uuid references tailors,
  add column sent_to_tailor_at timestamptz,
  add column ready_at timestamptz,
  add column delivered_at timestamptz,
  add column delivered_by uuid references profiles,
  add column collected_by_name text,
  add column redo_count int not null default 0,
  add column cancel_reason text,
  add column status_at timestamptz not null default now();
alter table alteration_pieces alter column work_notes drop not null;
alter table alterations
  add column photo_paths text[] not null default '{}',
  add column photo_pending boolean not null default false;
alter table alteration_events add column piece_ids uuid[];
create index alteration_pieces_status_idx on alteration_pieces (status, tailor_id);

-- 2. Backfill existing tokens: every item inherits its token's state; photos move to the token -------------
update alteration_pieces p set
  status = a.status, tailor_id = a.tailor_id, sent_to_tailor_at = a.sent_to_tailor_at, ready_at = a.ready_at,
  delivered_at = a.delivered_at, delivered_by = a.delivered_by, collected_by_name = a.collected_by_name,
  cancel_reason = a.cancel_reason,
  status_at = coalesce(a.delivered_at, a.ready_at, a.sent_to_tailor_at, a.created_at)
from alterations a where a.id = p.alteration_id;
update alteration_pieces p set redo_count = a.redo_count
from alterations a
where a.id = p.alteration_id
  and p.id = (select id from alteration_pieces x where x.alteration_id = a.id order by x.sort, x.id limit 1);
update alterations a set
  photo_paths = coalesce((select array_agg(x) from alteration_pieces p, unnest(p.photo_paths) x where p.alteration_id = a.id), '{}'),
  photo_pending = coalesce((select bool_or(p.photo_pending) from alteration_pieces p where p.alteration_id = a.id), false);

-- 3. Roll the items up into the token's overall status ------------------------------------------------------
create or replace function recompute_alteration(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  prev text := coalesce(current_setting('app.advancing', true), '');
  n_total int; n_active int; n_deliv int; min_rank int; redo int;
  sent timestamptz; rdy timestamptz; dlv timestamptz; dby uuid; dname text; why text; tl uuid;
  st alteration_status;
begin
  perform set_config('app.advancing', 'on', true);
  select count(*),
         count(*) filter (where status in ('received', 'with_tailor', 'ready')),
         count(*) filter (where status = 'delivered'),
         min(case status when 'received' then 0 when 'with_tailor' then 1 when 'ready' then 2 end),
         min(sent_to_tailor_at) filter (where status = 'with_tailor'),
         min(ready_at) filter (where status = 'ready'),
         coalesce(sum(redo_count), 0)
    into n_total, n_active, n_deliv, min_rank, sent, rdy, redo
    from alteration_pieces where alteration_id = p_id;
  if n_total = 0 then perform set_config('app.advancing', prev, true); return; end if;

  if n_active > 0 then
    st := (case min_rank when 0 then 'received' when 1 then 'with_tailor' else 'ready' end)::alteration_status;
  elsif n_deliv > 0 then st := 'delivered';
  else st := 'cancelled';
  end if;

  if st = 'delivered' then
    select delivered_at, delivered_by, collected_by_name into dlv, dby, dname
      from alteration_pieces where alteration_id = p_id and status = 'delivered' order by delivered_at desc limit 1;
  end if;
  if st = 'cancelled' then
    select cancel_reason into why from alteration_pieces where alteration_id = p_id order by status_at desc limit 1;
  end if;
  select tailor_id into tl from alteration_pieces
    where alteration_id = p_id and status = 'with_tailor' order by sent_to_tailor_at limit 1;

  update alterations set
    status = st, sent_to_tailor_at = sent, ready_at = rdy,
    delivered_at = case when st = 'delivered' then dlv end,
    delivered_by = case when st = 'delivered' then dby end,
    collected_by_name = case when st = 'delivered' then dname end,
    cancel_reason = case when st = 'cancelled' then why end,
    redo_count = redo, tailor_id = coalesce(tl, tailor_id)
  where id = p_id;
  perform set_config('app.advancing', prev, true);
end $$;
revoke all on function recompute_alteration(uuid) from public, anon, authenticated;

-- 4. The one function that changes item status ---------------------------------------------------------------
create or replace function advance_items(
  p_alteration uuid,
  p_pieces uuid[],
  p_to alteration_status,
  p_note text default null,
  p_tailor uuid default null,
  p_photo_path text default null,
  p_collected_by text default null,
  p_rack text default null,
  p_expected_from alteration_status default null
) returns alterations
language plpgsql security definer set search_path = public as $$
declare
  me profiles; a alterations; pc alteration_pieces;
  prev_adv text := coalesce(current_setting('app.advancing', true), '');
  n_found int; n_wanted int;
  note text := nullif(btrim(p_note), '');
  rank_from int; rank_to int; is_redo boolean; is_back boolean;
  tailor uuid; tailor_name text; cust_name text; who text; ev_note text; grp record;
  ids_received uuid[] := '{}'; ids_with_tailor uuid[] := '{}'; ids_ready uuid[] := '{}'; ids_delivered uuid[] := '{}';
begin
  select * into me from profiles where id = auth.uid() and active;
  if not found then raise exception 'Not allowed' using errcode = '42501'; end if;

  select * into a from alterations where id = p_alteration for update;
  if not found then raise exception 'Token not found'; end if;
  if p_pieces is null or coalesce(array_length(p_pieces, 1), 0) = 0 then raise exception 'Choose at least one item'; end if;

  perform 1 from alteration_pieces where alteration_id = p_alteration and id = any (p_pieces) for update;
  select count(*) into n_found from alteration_pieces where alteration_id = p_alteration and id = any (p_pieces);
  select count(distinct x) into n_wanted from unnest(p_pieces) x;
  if n_found <> n_wanted then raise exception 'Item not found on this token'; end if;

  rank_to := case p_to when 'received' then 0 when 'with_tailor' then 1 when 'ready' then 2 when 'delivered' then 3 end;
  perform set_config('app.advancing', 'on', true);

  if p_to = 'with_tailor' then
    tailor := p_tailor;
    if tailor is not null then select name into tailor_name from tailors where id = tailor; end if;
  end if;
  select name into cust_name from customers where id = a.customer_id;

  for pc in select * from alteration_pieces where alteration_id = p_alteration and id = any (p_pieces) order by sort, id loop
    -- someone else already did this, or the screen is out of date
    if pc.status = p_to or (p_expected_from is not null and pc.status <> p_expected_from) then
      select p.name into who from alteration_events e join profiles p on p.id = e.actor_id
        where e.alteration_id = a.id and e.kind = 'status' and (e.piece_ids is null or pc.id = any (e.piece_ids))
        order by e.id desc limit 1;
      raise exception '% is already marked % by %', pc.item_type, replace(pc.status::text, '_', ' '), coalesce(who, 'someone')
        using errcode = '40001';
    end if;

    rank_from := case pc.status when 'received' then 0 when 'with_tailor' then 1 when 'ready' then 2 when 'delivered' then 3 end;
    is_redo := false; is_back := false;

    if p_to = 'cancelled' then
      if me.role <> 'owner' then raise exception 'Only the owner can cancel' using errcode = '42501'; end if;
      if note is null then raise exception 'A reason is required to cancel'; end if;
      if pc.status not in ('received', 'with_tailor', 'ready') then raise exception '% is % and cannot be cancelled', pc.item_type, pc.status; end if;
    elsif pc.status = 'cancelled' then
      raise exception '% is cancelled', pc.item_type;
    elsif pc.status = 'delivered' then
      if me.role <> 'owner' then raise exception 'Only the owner can undo a handover' using errcode = '42501'; end if;
      if note is null then raise exception 'A reason is required to move backward'; end if;
      is_back := true;
    elsif pc.status = 'ready' and p_to = 'with_tailor' then
      is_redo := true;
      if note is null then raise exception 'A short reason is required for a redo'; end if;
    elsif rank_to < rank_from then
      is_back := true;
      if me.role <> 'owner' then raise exception 'Only the owner can move an item backward' using errcode = '42501'; end if;
      if note is null then raise exception 'A reason is required to move backward'; end if;
    elsif not ((pc.status = 'received' and p_to in ('with_tailor', 'ready'))
            or (pc.status = 'with_tailor' and p_to = 'ready')
            or (pc.status = 'ready' and p_to = 'delivered')) then
      raise exception 'Cannot move % from % to %', pc.item_type, pc.status, p_to;
    end if;

    if p_to = 'with_tailor' then
      if coalesce(tailor, pc.tailor_id) is null then raise exception 'Choose a tailor first'; end if;
      update alteration_pieces set status = 'with_tailor', tailor_id = coalesce(tailor, pc.tailor_id),
        sent_to_tailor_at = now(), ready_at = null, delivered_at = null, delivered_by = null, collected_by_name = null,
        redo_count = redo_count + (case when is_redo then 1 else 0 end), status_at = now()
      where id = pc.id;
    elsif p_to = 'ready' then
      update alteration_pieces set status = 'ready', ready_at = case when is_back then coalesce(ready_at, now()) else now() end,
        delivered_at = null, delivered_by = null, collected_by_name = null, status_at = now()
      where id = pc.id;
    elsif p_to = 'received' then
      update alteration_pieces set status = 'received', sent_to_tailor_at = null, ready_at = null,
        delivered_at = null, delivered_by = null, collected_by_name = null, status_at = now()
      where id = pc.id;
    elsif p_to = 'delivered' then
      update alteration_pieces set status = 'delivered', delivered_at = now(), delivered_by = me.id,
        collected_by_name = coalesce(nullif(btrim(p_collected_by), ''), cust_name), status_at = now()
      where id = pc.id;
    else
      update alteration_pieces set status = 'cancelled', cancel_reason = note, status_at = now() where id = pc.id;
    end if;

    if pc.status = 'received' then ids_received := ids_received || pc.id;
    elsif pc.status = 'with_tailor' then ids_with_tailor := ids_with_tailor || pc.id;
    elsif pc.status = 'ready' then ids_ready := ids_ready || pc.id;
    else ids_delivered := ids_delivered || pc.id;
    end if;
  end loop;

  -- one history row per group of items that made the same move
  if p_to = 'with_tailor' and tailor_name is null then
    select t.name into tailor_name from alteration_pieces x join tailors t on t.id = x.tailor_id where x.id = any (p_pieces) limit 1;
  end if;
  for grp in
    select t.st, t.ids from (values ('received'::alteration_status, ids_received), ('with_tailor', ids_with_tailor),
                                    ('ready', ids_ready), ('delivered', ids_delivered)) as t(st, ids)
    where coalesce(array_length(t.ids, 1), 0) > 0
  loop
    ev_note := case when p_to = 'with_tailor' then
        coalesce(tailor_name, '') || case when note is not null
          then (case when tailor_name is not null then ' · ' else '' end) || (case when grp.st = 'ready' then 'Redo: ' else '' end) || note
          else '' end
      else coalesce(note, '') end;
    insert into alteration_events (alteration_id, kind, from_status, to_status, note, photo_path, actor_id, piece_ids)
    values (a.id, 'status', grp.st, p_to, nullif(btrim(ev_note), ''), p_photo_path, me.id, grp.ids);
  end loop;

  if p_to = 'ready' and nullif(btrim(p_rack), '') is not null then
    update alterations set rack_label = btrim(p_rack) where id = a.id;
  end if;
  perform recompute_alteration(a.id);
  perform set_config('app.advancing', prev_adv, true);
  select * into a from alterations where id = a.id;
  return a;
end $$;
revoke all on function advance_items(uuid, uuid[], alteration_status, text, uuid, text, text, text, alteration_status) from public, anon;
grant execute on function advance_items(uuid, uuid[], alteration_status, text, uuid, text, text, text, alteration_status) to authenticated;

-- 5. Old whole-token function stays (the current screens use it): it moves every item at the token's stage ------
create or replace function advance_status(
  p_id uuid, p_to alteration_status, p_note text default null, p_tailor_id uuid default null,
  p_photo_path text default null, p_collected_by text default null, p_rack_label text default null,
  p_expected_from alteration_status default null
) returns alterations
language plpgsql security definer set search_path = public as $$
declare a alterations; ids uuid[];
begin
  select * into a from alterations where id = p_id;
  if not found then raise exception 'Token not found'; end if;
  if p_to = 'cancelled' then
    ids := array(select id from alteration_pieces where alteration_id = p_id and status in ('received', 'with_tailor', 'ready'));
  else
    ids := array(select id from alteration_pieces where alteration_id = p_id and status = a.status);
  end if;
  return advance_items(p_id, ids, p_to, p_note, p_tailor_id, p_photo_path, p_collected_by, p_rack_label, p_expected_from);
end $$;

-- 6. Item edits and inserts: status fields are locked; closed items are read-only; new items start 'received' --
create or replace function pieces_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); advancing boolean := coalesce(current_setting('app.advancing', true), '') = 'on';
begin
  if uid is null or advancing then return new; end if;
  if new.alteration_id is distinct from old.alteration_id then
    raise exception 'An item cannot move to another token' using errcode = '42501';
  end if;
  if new.status is distinct from old.status or new.tailor_id is distinct from old.tailor_id
     or new.sent_to_tailor_at is distinct from old.sent_to_tailor_at or new.ready_at is distinct from old.ready_at
     or new.delivered_at is distinct from old.delivered_at or new.delivered_by is distinct from old.delivered_by
     or new.collected_by_name is distinct from old.collected_by_name or new.redo_count is distinct from old.redo_count
     or new.cancel_reason is distinct from old.cancel_reason or new.status_at is distinct from old.status_at then
    raise exception 'Item status can only change through advance_items()' using errcode = '42501';
  end if;
  if old.status in ('delivered', 'cancelled') then
    raise exception 'This item is %; it can no longer be edited', old.status using errcode = '42501';
  end if;
  if new.item_type is distinct from old.item_type or new.description is distinct from old.description
     or new.work_notes is distinct from old.work_notes then
    insert into alteration_events (alteration_id, kind, note, actor_id, piece_ids)
    values (old.alteration_id, 'edit', 'Edited ' || old.item_type, uid, array[old.id]);
  end if;
  return new;
end $$;

create or replace function pieces_insert_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); st alteration_status;
begin
  if uid is null or coalesce(current_setting('app.advancing', true), '') = 'on' then return new; end if;
  select status into st from alterations where id = new.alteration_id;
  if st in ('delivered', 'cancelled') then raise exception 'This token is closed. Start a new token for new items.' using errcode = '42501'; end if;
  new.status := 'received'; new.tailor_id := null; new.sent_to_tailor_at := null; new.ready_at := null;
  new.delivered_at := null; new.delivered_by := null; new.collected_by_name := null; new.redo_count := 0;
  new.cancel_reason := null; new.status_at := now();
  return new;
end $$;
create trigger trg_pieces_insert_guard before insert on alteration_pieces
  for each row execute function pieces_insert_guard();

create or replace function pieces_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform recompute_alteration(new.alteration_id); return null; end $$;
create trigger trg_pieces_after_insert after insert on alteration_pieces
  for each row execute function pieces_after_insert();

-- 7. Visit photos ----------------------------------------------------------------------------------------------
create or replace function set_alteration_photos(p_alteration uuid, p_paths text[], p_pending boolean)
returns alterations
language plpgsql security definer set search_path = public as $$
declare a alterations;
begin
  if not is_active_user() then raise exception 'Not allowed' using errcode = '42501'; end if;
  update alterations set photo_paths = photo_paths || coalesce(p_paths, '{}'), photo_pending = p_pending
    where id = p_alteration returning * into a;
  if not found then raise exception 'Token not found'; end if;
  return a;
end $$;
revoke all on function set_alteration_photos(uuid, text[], boolean) from public, anon;
grant execute on function set_alteration_photos(uuid, text[], boolean) to authenticated;

-- 8. Intake: items are a name + optional note; photos belong to the visit. Old field names still accepted. ----
drop function if exists create_alteration(text, text, date, jsonb, uuid, numeric, boolean, text);
create or replace function create_alteration(
  p_phone text, p_name text, p_promised date, p_pieces jsonb,
  p_tailor uuid default null, p_charge numeric default null, p_paid boolean default false, p_rack text default null,
  p_has_photo boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); cust customers; alt alterations; piece jsonb;
  piece_ids uuid[] := '{}'; pid uuid; i int := 0; nm text; any_photo boolean := coalesce(p_has_photo, false);
begin
  if not is_active_user() then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_phone !~ '^[0-9]{10}$' then raise exception 'Enter a valid 10-digit phone number'; end if;
  if p_promised is null then raise exception 'Promised date is required'; end if;
  if jsonb_typeof(p_pieces) <> 'array' or jsonb_array_length(p_pieces) = 0 then raise exception 'Add at least one item'; end if;

  select * into cust from customers where phone = p_phone;
  if not found then
    if coalesce(btrim(p_name), '') = '' then raise exception 'Customer name is required'; end if;
    insert into customers (name, phone) values (btrim(p_name), p_phone) returning * into cust;
  end if;

  insert into alterations (customer_id, promised_date, charge, paid, rack_label, created_by, photo_pending)
  values (cust.id, p_promised, p_charge, coalesce(p_paid, false), nullif(btrim(p_rack), ''), me, false)
  returning * into alt;

  for piece in select * from jsonb_array_elements(p_pieces) loop
    nm := btrim(coalesce(piece->>'name', piece->>'item_type', ''));
    if length(nm) not between 1 and 40 then raise exception 'Write what each item is (up to 40 letters)'; end if;
    insert into alteration_pieces (alteration_id, item_type, description, work_notes, sort)
    values (alt.id, nm, nullif(btrim(piece->>'description'), ''), nullif(btrim(coalesce(piece->>'note', piece->>'work_notes', '')), ''), i)
    returning id into pid;
    piece_ids := piece_ids || pid;
    any_photo := any_photo or coalesce((piece->>'has_photo')::boolean, false);
    i := i + 1;
  end loop;
  if any_photo then update alterations set photo_pending = true where id = alt.id; end if;

  if p_tailor is not null then
    perform advance_items(alt.id, piece_ids, 'with_tailor', null, p_tailor);
  end if;

  select * into alt from alterations where id = alt.id;
  return jsonb_build_object('id', alt.id, 'token_year', alt.token_year, 'token_no', alt.token_no, 'slug', alt.public_slug,
    'customer_name', cust.name, 'piece_ids', to_jsonb(piece_ids));
end $$;
revoke all on function create_alteration(text, text, date, jsonb, uuid, numeric, boolean, text, boolean) from public, anon;
grant execute on function create_alteration(text, text, date, jsonb, uuid, numeric, boolean, text, boolean) to authenticated;

-- 9. Customer page data: per-item status, visit photos ------------------------------------------------------------
create or replace function public_token(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'shop_name', s.shop_name, 'shop_phone', s.shop_phone, 'address', s.address, 'base_url', s.public_base_url,
    'token_year', a.token_year, 'token_no', a.token_no, 'status', a.status, 'promised_date', a.promised_date,
    'delivered_at', a.delivered_at, 'collected_by', case when a.status = 'delivered' then a.collected_by_name end,
    'phone_last4', right(c.phone, 4), 'photos', a.photo_paths,
    'pieces', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_type', p.item_type, 'work_notes', p.work_notes, 'status', p.status,
        'delivered_at', p.delivered_at, 'collected_by', case when p.status = 'delivered' then p.collected_by_name end,
        'photo_paths', p.photo_paths) order by p.sort)
      from alteration_pieces p where p.alteration_id = a.id), '[]'::jsonb)
  )
  from alterations a join customers c on c.id = a.customer_id cross join shop_settings s
  where a.public_slug = p_slug and length(p_slug) between 6 and 40
$$;
revoke all on function public_token(text) from public;
grant execute on function public_token(text) to anon, authenticated;
