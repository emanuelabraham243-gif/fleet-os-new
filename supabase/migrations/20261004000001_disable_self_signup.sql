-- FleetOS V1 revision pass 5: public self sign-up is turned off.
--
-- The system is delivered to a single organization. An account may only be created when an admin
-- provisions it with app_metadata.organization_id (Supabase dashboard / service role); the profile then
-- joins that organization exactly as before. Any other sign-up -- through the app or by calling the
-- Supabase Auth API directly with the publishable key -- is rejected here, so the auth.users insert
-- rolls back and no account or organization is created.
--
-- Supersedes the "otherwise create a new organization" branch of 20260930000001_self_signup_orgs.sql.

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := (new.raw_app_meta_data ->> 'organization_id')::uuid;
  v_role text := coalesce(new.raw_app_meta_data ->> 'role', 'staff');
begin
  if v_org is null then
    raise exception 'self sign-up is disabled; accounts must be provisioned by an admin'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.profiles (id, organization_id, role, full_name, language)
  values (
    new.id,
    v_org,
    v_role,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120),
    'am'
  );
  insert into public.notification_preferences (user_id, organization_id)
  values (new.id, v_org);
  return new;
end $$;
revoke all on function private.handle_new_user() from public, anon, authenticated;
