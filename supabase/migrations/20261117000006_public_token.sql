-- Phase 3: read-only data for the public customer page.
-- Returns ONLY fields the customer already knows. No tailor, staff names, charge, notes or full phone.
-- Tables keep no public RLS policies; anon can run this one function and nothing else.
create or replace function public_token(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'shop_name', s.shop_name,
    'shop_phone', s.shop_phone,
    'address', s.address,
    'base_url', s.public_base_url,
    'token_year', a.token_year,
    'token_no', a.token_no,
    'status', a.status,
    'promised_date', a.promised_date,
    'delivered_at', a.delivered_at,
    'collected_by', case when a.status = 'delivered' then a.collected_by_name end,
    'phone_last4', right(c.phone, 4),
    'pieces', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_type', p.item_type, 'work_notes', p.work_notes, 'photo_paths', p.photo_paths) order by p.sort)
      from alteration_pieces p where p.alteration_id = a.id), '[]'::jsonb)
  )
  from alterations a
  join customers c on c.id = a.customer_id
  cross join shop_settings s
  where a.public_slug = p_slug and length(p_slug) between 6 and 40
$$;
revoke all on function public_token(text) from public;
grant execute on function public_token(text) to anon, authenticated;
