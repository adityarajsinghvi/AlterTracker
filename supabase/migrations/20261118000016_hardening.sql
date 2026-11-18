-- Security review follow-ups.

-- 1. Internal trigger functions must not be callable by anyone through the API.
revoke all on function alterations_assign_token(), alterations_guard(), customers_log_edit(), pieces_after_insert(),
  pieces_guard(), pieces_insert_guard(), profiles_guard() from public, anon, authenticated;

-- 2. Row-level-security helpers are for signed-in users only.
revoke all on function is_active_user(), is_owner() from public, anon;
grant execute on function is_active_user(), is_owner() to authenticated;

-- 3. Old whole-token / per-item-photo functions are no longer used by the app.
drop function if exists advance_status(uuid, alteration_status, text, uuid, text, text, text, alteration_status);
drop function if exists set_piece_photos(uuid, text[], boolean);

-- 4. Fixed search paths.
alter function forbid_mutation() set search_path = public;
alter function norm_name(text) set search_path = public;

-- 5. History rows are written only by the database functions, never directly by a client.
drop policy if exists events_insert on alteration_events;

-- 6. One policy per action (the owner's "all" policies overlapped the read policies).
drop policy if exists templates_write on message_templates;
create policy templates_insert on message_templates for insert to authenticated with check ((select is_owner()));
create policy templates_update on message_templates for update to authenticated using ((select is_owner())) with check ((select is_owner()));
create policy templates_delete on message_templates for delete to authenticated using ((select is_owner()));
drop policy if exists tailors_write on tailors;
create policy tailors_insert on tailors for insert to authenticated with check ((select is_owner()));
create policy tailors_update on tailors for update to authenticated using ((select is_owner())) with check ((select is_owner()));
create policy tailors_delete on tailors for delete to authenticated using ((select is_owner()));

-- 7. WhatsApp log can only hold the five known message kinds.
alter table message_log add constraint message_log_key_ok check (template_key in ('receipt', 'ready', 'reminder', 'delay', 'delivered'));

-- 8. Indexes on foreign keys.
create index if not exists alteration_events_actor_idx on alteration_events (actor_id);
create index if not exists alteration_pieces_tailor_idx on alteration_pieces (tailor_id);
create index if not exists alteration_pieces_delivered_by_idx on alteration_pieces (delivered_by);
create index if not exists alterations_created_by_idx on alterations (created_by);
create index if not exists alterations_delivered_by_idx on alterations (delivered_by);
create index if not exists alterations_tailor_idx on alterations (tailor_id);
create index if not exists message_log_opened_by_idx on message_log (opened_by);

-- 9. Daily "I am alive" call from the web host, so the free database is never paused for inactivity.
create or replace function keep_alive() returns text
language sql stable security definer set search_path = public as $$ select 'ok'::text $$;
revoke all on function keep_alive() from public;
grant execute on function keep_alive() to anon, authenticated;

-- The daily call also leaves a visible timestamp, so it is easy to check that it is running.
create table if not exists app_heartbeat (id int primary key default 1 check (id = 1), last_seen timestamptz not null default now(), runs bigint not null default 0);
alter table app_heartbeat enable row level security;
insert into app_heartbeat (id) values (1) on conflict do nothing;
create or replace function keep_alive() returns text
language sql volatile security definer set search_path = public as $$
  update app_heartbeat set last_seen = now(), runs = runs + 1 where id = 1 returning 'ok'::text
$$;
revoke all on function keep_alive() from public;
grant execute on function keep_alive() to anon, authenticated;
