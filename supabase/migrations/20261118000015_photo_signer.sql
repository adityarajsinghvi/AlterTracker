-- Photo-only account for the customer page.
-- The auth user (photo-signer@staff.singhvi.local, no profile) is created once per project with a random password that is
-- stored as the PHOTO_SIGNER_PASSWORD secret on the web host; see scripts/create-photo-signer.ts.
-- It has no profile, so is_active_user() is false and every table is closed to it. It may only read the photo bucket.
create policy item_photos_signer_select on storage.objects for select to authenticated
  using (bucket_id = 'item-photos' and (select auth.uid()) = '0f6b1804-ff75-4856-9fac-5559071c4e1d'::uuid);
