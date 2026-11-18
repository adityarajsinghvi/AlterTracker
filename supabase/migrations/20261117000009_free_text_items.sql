-- Item type is now free text (typed with suggestions) instead of a fixed list.
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
    if length(btrim(coalesce(piece->>'item_type', ''))) not between 1 and 40 then
      raise exception 'Write what the item is (up to 40 letters)';
    end if;
    if coalesce(btrim(piece->>'work_notes'), '') = '' then raise exception 'Work notes are required for every piece'; end if;
    insert into alteration_pieces (alteration_id, item_type, description, work_notes, photo_pending, sort)
    values (alt.id, btrim(piece->>'item_type'), nullif(btrim(piece->>'description'), ''), btrim(piece->>'work_notes'),
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
