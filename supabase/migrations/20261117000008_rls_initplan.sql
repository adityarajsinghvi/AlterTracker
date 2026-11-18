-- Performance: evaluate the access helpers once per query instead of once per row.
-- (Wrapping in a sub-select lets Postgres cache the result as an initplan.)
alter policy profiles_select on profiles using ((select is_active_user()));
alter policy profiles_update_owner on profiles using ((select is_owner())) with check ((select is_owner()));
alter policy customers_select on customers using ((select is_active_user()));
alter policy customers_insert on customers with check ((select is_active_user()));
alter policy customers_update_owner on customers using ((select is_owner())) with check ((select is_owner()));
alter policy tailors_select on tailors using ((select is_active_user()));
alter policy tailors_write on tailors using ((select is_owner())) with check ((select is_owner()));
alter policy templates_select on message_templates using ((select is_active_user()));
alter policy templates_write on message_templates using ((select is_owner())) with check ((select is_owner()));
alter policy settings_select on shop_settings using ((select is_active_user()));
alter policy settings_update on shop_settings using ((select is_owner())) with check ((select is_owner()));
alter policy alterations_select on alterations using ((select is_active_user()));
alter policy alterations_insert on alterations with check (
  (select is_active_user()) and created_by = (select auth.uid()) and status = 'received' and redo_count = 0
  and sent_to_tailor_at is null and ready_at is null and delivered_at is null
  and delivered_by is null and cancel_reason is null and collected_by_name is null
);
alter policy alterations_update on alterations using ((select is_active_user())) with check ((select is_active_user()));
alter policy pieces_select on alteration_pieces using ((select is_active_user()));
alter policy pieces_insert on alteration_pieces with check ((select is_active_user()));
alter policy pieces_update on alteration_pieces using ((select is_active_user())) with check ((select is_active_user()));
alter policy events_select on alteration_events using ((select is_active_user()));
alter policy events_insert on alteration_events with check ((select is_active_user()) and actor_id = (select auth.uid()));
alter policy msglog_select on message_log using ((select is_active_user()));
alter policy msglog_insert on message_log with check ((select is_active_user()) and opened_by = (select auth.uid()));
alter policy item_photos_select on storage.objects using (bucket_id = 'item-photos' and (select is_active_user()));
alter policy item_photos_insert on storage.objects with check (bucket_id = 'item-photos' and (select is_active_user()));
-- Index for the Home lists and the activity feed
create index if not exists message_log_opened_idx on message_log (opened_at);
create index if not exists alteration_events_created_idx on alteration_events (created_at);
create index if not exists alterations_created_idx on alterations (created_at);
