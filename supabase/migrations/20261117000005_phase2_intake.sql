-- Phase 2: atomic intake, piece-photo helper, edit logging for pieces and customers

create or replace function create_alteration(
  p_phone text,
  p_name text,
  p_promised date,
  p_pieces jsonb,
  p_tailor uuid default null,
  p_charge numeric default null,
  p_paid boolean default false,
  p_rack text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  cust customers;
  alt alterations;
  piece jsonb;
  piece_ids uuid[] := '{}';
  pid uuid;
  i int := 0;
  allowed text[] := array['Suit','Blazer','Sherwani','Jodhpuri','Kurta','Trouser','Shirt','Other'];
begin
  if not is_active_user() then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_phone !~ '^[0-9]{10}$' then raise exception 'Enter a valid 10-digit phone number'; end if;
  if p_promised is null then raise exception 'Promised date is required'; end if;
  if jsonb_typeof(p_pieces) <> 'array' or jsonb_array_length(p_pieces) = 0 then
    raise exception 'Add at least one piece';
  end if;

  select * into cust from customers where phone = p_phone;
  if not found then
    if coalesce(btrim(p_name), '') = '' then raise exception 'Customer name is required'; end if;
    insert into customers (name, phone) values (btrim(p_name), p_phone) returning * into cust;
  end if;

  insert into alterations (customer_id, promised_date, charge, paid, rack_label, created_by)
  values (cust.id, p_promised, p_charge, coalesce(p_paid, false), nullif(btrim(p_rack), ''), me)
  returning * into alt;

  for piece in select * from jsonb_array_elements(p_pieces) loop
    if not (piece->>'item_type') = any (allowed) then raise exception 'Unknown item type'; end if;
    if coalesce(btrim(piece->>'work_notes'), '') = '' then raise exception 'Work notes are required for every piece'; end if;
    insert into alteration_pieces (alteration_id, item_type, description, work_notes, photo_pending, sort)
    values (alt.id, piece->>'item_type', nullif(btrim(piece->>'description'), ''), btrim(piece->>'work_notes'),
            coalesce((piece->>'has_photo')::boolean, false), i)
    returning id into pid;
    piece_ids := piece_ids || pid;
    i := i + 1;
  end loop;

  if p_tailor is not null then
    perform advance_status(alt.id, 'with_tailor', null, p_tailor);
  end if;

  return jsonb_build_object(
    'id', alt.id, 'token_year', alt.token_year, 'token_no', alt.token_no, 'slug', alt.public_slug,
    'customer_name', cust.name, 'piece_ids', to_jsonb(piece_ids)
  );
end $$;
revoke all on function create_alteration(text, text, date, jsonb, uuid, numeric, boolean, text) from public, anon;
grant execute on function create_alteration(text, text, date, jsonb, uuid, numeric, boolean, text) to authenticated;

-- Attach uploaded photos to a piece. p_pending = true when some uploads failed.
create or replace function set_piece_photos(p_piece uuid, p_paths text[], p_pending boolean)
returns alteration_pieces
language plpgsql security definer set search_path = public as $$
declare pc alteration_pieces; st alteration_status;
begin
  if not is_active_user() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select a.status into st from alteration_pieces p join alterations a on a.id = p.alteration_id where p.id = p_piece;
  if st is null then raise exception 'Piece not found'; end if;
  if st in ('delivered', 'cancelled') then raise exception 'This token is closed'; end if;
  update alteration_pieces
    set photo_paths = photo_paths || coalesce(p_paths, '{}'), photo_pending = p_pending
    where id = p_piece returning * into pc;
  return pc;
end $$;
revoke all on function set_piece_photos(uuid, text[], boolean) from public, anon;
grant execute on function set_piece_photos(uuid, text[], boolean) to authenticated;

-- Log piece edits (type / description / work notes) and keep closed tokens read-only
create or replace function pieces_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare st alteration_status; uid uuid := auth.uid();
begin
  if uid is null then return new; end if;
  if new.alteration_id is distinct from old.alteration_id then
    raise exception 'A piece cannot move to another token' using errcode = '42501';
  end if;
  select status into st from alterations where id = old.alteration_id;
  if st in ('delivered', 'cancelled') then
    raise exception 'This token is %; it can no longer be edited', st using errcode = '42501';
  end if;
  if new.item_type is distinct from old.item_type
     or new.description is distinct from old.description
     or new.work_notes is distinct from old.work_notes then
    insert into alteration_events (alteration_id, kind, note, actor_id)
    values (old.alteration_id, 'edit', 'Edited notes for ' || old.item_type, uid);
  end if;
  return new;
end $$;
create trigger trg_pieces_guard before update on alteration_pieces
  for each row execute function pieces_guard();

-- Owner edits to a customer (name / phone) are logged on every token of that customer
create or replace function customers_log_edit() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); msg text;
begin
  if uid is null then return new; end if;
  if new.phone is distinct from old.phone then
    msg := 'Customer phone changed from ' || old.phone || ' to ' || new.phone;
  elsif new.name is distinct from old.name then
    msg := 'Customer name changed from ' || old.name || ' to ' || new.name;
  else
    return new;
  end if;
  insert into alteration_events (alteration_id, kind, note, actor_id)
  select id, 'edit', msg, uid from alterations where customer_id = new.id;
  return new;
end $$;
create trigger trg_customers_log_edit after update on customers
  for each row execute function customers_log_edit();
