-- FleetOS V1 revision pass 4: self sign-up creates the user's own organization.
--
-- Before: a profile was created only when an admin pre-set organization_id in app_metadata;
-- anyone else who signed up was left without a profile (and saw "not linked to an organization").
-- Now:
--   * app_metadata.organization_id set (account provisioned by an admin) -> join that organization,
--     role from app_metadata (default 'staff'). Unchanged from before.
--   * otherwise (ordinary sign-up) -> a brand-new, empty organization is created and the user
--     becomes its admin. The name comes from user_metadata.organization_name; it is only a label
--     for the user's own new organization, so trusting user-supplied metadata here grants nothing.
--     organization_id / role are still never read from user_metadata.
--
-- Isolation itself is unchanged and stays in RLS: every policy keys on private.current_org_id(),
-- which is the caller's profiles.organization_id.

alter table public.organizations
  add constraint organizations_name_len check (char_length(name) between 1 and 120) not valid;
alter table public.organizations validate constraint organizations_name_len;

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := (new.raw_app_meta_data ->> 'organization_id')::uuid;
  v_role text := coalesce(new.raw_app_meta_data ->> 'role', 'staff');
  v_org_name text;
begin
  if v_org is null then
    v_org_name := left(btrim(coalesce(new.raw_user_meta_data ->> 'organization_name', '')), 120);
    if v_org_name = '' then
      v_org_name := coalesce(nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Fleet');
    end if;
    insert into public.organizations (name) values (v_org_name) returning id into v_org;
    v_role := 'admin';
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
