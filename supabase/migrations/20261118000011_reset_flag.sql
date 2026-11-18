-- The status function now switches its bypass flag back off when it finishes.
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
