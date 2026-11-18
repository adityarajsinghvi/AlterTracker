-- Owner can delete a whole entry (a customer visit) that was made by mistake.
-- A short record of what was deleted is kept (deletion_log); everything else about the entry is removed.

create table deletion_log (
  id bigint generated always as identity primary key,
  token_label text not null,
  customer_name text,
  customer_phone text,
  items text,
  last_status text,
  entry_created_at timestamptz,
  deleted_by uuid not null references profiles,
  deleted_at timestamptz not null default now(),
  reason text
);
alter table deletion_log enable row level security;
create policy deletion_log_select on deletion_log for select to authenticated using ((select is_owner()));
create index deletion_log_by_idx on deletion_log (deleted_by);

-- History and WhatsApp-log rows are append-only, except while the owner deletes a whole entry.
create or replace function forbid_mutation() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('app.deleting', true), '') = 'on' then return old; end if;
  raise exception '% is append-only', tg_table_name;
end $$;

create or replace function delete_alteration(p_id uuid, p_reason text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  me profiles; a alterations; c customers; label text; items text;
  prev text := coalesce(current_setting('app.deleting', true), '');
begin
  select * into me from profiles where id = auth.uid() and active and role = 'owner';
  if not found then raise exception 'Only the owner can delete an entry' using errcode = '42501'; end if;
  select * into a from alterations where id = p_id for update;
  if not found then raise exception 'Entry not found'; end if;
  select * into c from customers where id = a.customer_id;
  label := right(a.token_year::text, 2) || '-' || a.token_no;
  select string_agg(item_type, ' + ' order by sort) into items from alteration_pieces where alteration_id = a.id;

  insert into deletion_log (token_label, customer_name, customer_phone, items, last_status, entry_created_at, deleted_by, reason)
  values (label, c.name, c.phone, items, a.status::text, a.created_at, me.id, nullif(btrim(p_reason), ''));

  perform set_config('app.deleting', 'on', true);
  delete from message_log where alteration_id = a.id;
  delete from alteration_events where alteration_id = a.id;
  delete from alteration_pieces where alteration_id = a.id;
  delete from alterations where id = a.id;
  -- a customer only exists because of entries: remove them too if this was their only one
  delete from customers where id = c.id and not exists (select 1 from alterations x where x.customer_id = c.id);
  perform set_config('app.deleting', prev, true);
  return label;
end $$;
revoke all on function delete_alteration(uuid, text) from public, anon;
grant execute on function delete_alteration(uuid, text) to authenticated;

-- The owner may also remove the photo files of a deleted entry.
create policy item_photos_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'item-photos' and (select is_owner()));
