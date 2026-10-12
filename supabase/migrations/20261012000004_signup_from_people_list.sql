-- FleetOS fix: phone sign-up failed with "self sign-up is disabled".
--
-- Supabase's admin createUser inserts the auth.users row first and writes app_metadata (organization,
-- role) afterwards, so handle_new_user saw no organization at insert time and refused every account.
-- The People list (org_phone_members) is the real source of who may join, so the trigger now takes
-- the organization, role and name from the list entry for the new account's phone number. An
-- organization in app_metadata (accounts provisioned by hand in the dashboard) still works as before.

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := (new.raw_app_meta_data ->> 'organization_id')::uuid;
  v_role text := coalesce(new.raw_app_meta_data ->> 'role', 'staff');
  v_name text := nullif(new.raw_user_meta_data ->> 'full_name', '');
  v_phone text := case when new.phone is null or new.phone = '' then null
                       when left(new.phone, 1) = '+' then new.phone else '+' || new.phone end;
  m public.org_phone_members;
begin
  if v_phone is not null then
    select * into m from public.org_phone_members
      where phone = v_phone and user_id is null
        and (v_org is null or organization_id = v_org);
    if found then
      v_org := m.organization_id;
      v_role := m.role;
      v_name := coalesce(v_name, m.full_name);
    end if;
  end if;

  if v_org is null then
    raise exception 'self sign-up is disabled; accounts must be provisioned by an admin'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.profiles (id, organization_id, role, full_name, language, phone_e164)
  values (new.id, v_org, v_role, left(coalesce(v_name, ''), 120), 'am', v_phone);
  insert into public.notification_preferences (user_id, organization_id)
  values (new.id, v_org);
  if v_phone is not null then
    update public.org_phone_members set user_id = new.id
      where phone = v_phone and organization_id = v_org and user_id is null;
  end if;
  return new;
end $$;
revoke all on function private.handle_new_user() from public, anon, authenticated;
