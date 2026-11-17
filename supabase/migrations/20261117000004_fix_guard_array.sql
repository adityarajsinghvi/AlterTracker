-- fix: array || unknown literal failed to parse
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

  if new.promised_date is distinct from old.promised_date then changed := array_append(changed, 'promised_date'); end if;
  if new.tailor_id is distinct from old.tailor_id then changed := array_append(changed, 'tailor'); end if;
  if new.charge is distinct from old.charge then changed := array_append(changed, 'charge'); end if;
  if new.paid is distinct from old.paid then changed := array_append(changed, 'paid'); end if;
  if new.rack_label is distinct from old.rack_label then changed := array_append(changed, 'rack_label'); end if;

  if array_length(changed, 1) > 0 then
    insert into alteration_events (alteration_id, kind, note, actor_id)
    values (old.id, 'edit', 'Changed: ' || array_to_string(changed, ', '), auth.uid());
  end if;
  return new;
end $$;
