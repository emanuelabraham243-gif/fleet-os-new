-- FleetOS V1 revision pass 7: phone number + password sign-in.
--
-- Email is no longer a sign-in method. People sign in with an Ethiopian mobile number (stored E.164,
-- e.g. +251911223344) and a password. Accounts are created by the app's server (service role) only,
-- and only for numbers an admin has put on their organization's people list (org_phone_members).
--
-- Brute-force and abuse controls live here, behind security-definer functions that only the
-- service role may call:
--   * auth_login_*   : after 5 wrong passwords within 15 minutes the number waits 15 minutes.
--   * auth_reset_*   : 6-digit reset codes, stored as HMAC hashes, valid 10 minutes, single use,
--                      dead after 5 wrong tries; at most 1 send per minute and 5 per hour per number.
-- Nothing here stores a password or a plain code.

-- ---------------------------------------------------------------- people list (who may sign up)
create table public.org_phone_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  phone text not null unique check (phone ~ '^\+251[79][0-9]{8}$'), -- one account per number
  full_name text not null check (char_length(full_name) between 1 and 120),
  role text not null default 'staff' check (role in ('admin', 'staff')),
  user_id uuid unique references auth.users (id) on delete set null, -- set once the person signs up
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index org_phone_members_org_idx on public.org_phone_members (organization_id);
create index org_phone_members_created_by_idx on public.org_phone_members (created_by);
create trigger set_updated_at before update on public.org_phone_members
  for each row execute function private.set_updated_at();
-- Adding or removing a person changes who can get in, so it is audited like fleet data.
create trigger z_audit after insert or update or delete on public.org_phone_members
  for each row execute function private.audit_row();

alter table public.org_phone_members enable row level security;
create policy org_phone_members_select on public.org_phone_members for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_admin()));
create policy org_phone_members_insert on public.org_phone_members for insert to authenticated
  with check (organization_id = (select private.current_org_id()) and (select private.is_admin()) and user_id is null);
-- Admins may rename / change role; phone, organization and user_id are fixed (see column revoke).
create policy org_phone_members_update on public.org_phone_members for update to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_admin()))
  with check (organization_id = (select private.current_org_id()) and (select private.is_admin()));
create policy org_phone_members_delete on public.org_phone_members for delete to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_admin()) and user_id is null);
revoke all on public.org_phone_members from anon;
revoke update on public.org_phone_members from authenticated;
grant update (full_name, role) on public.org_phone_members to authenticated;

-- Profiles show the sign-in number (auth.users is not readable by the app's users).
alter table public.profiles add column phone_e164 text;

-- ---------------------------------------------------------------- login throttling
create table private.login_attempts (
  phone text primary key,
  failures int not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz
);

-- Returns the time the number may try again, or null when it may try now.
create function public.auth_login_locked_until(p_phone text) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select locked_until from private.login_attempts
  where phone = p_phone and locked_until > now()
$$;

-- Records one attempt. On the 5th failure inside 15 minutes the number is paused for 15 minutes.
create function public.auth_login_record(p_phone text, p_success boolean) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  r private.login_attempts;
begin
  if p_success then
    delete from private.login_attempts where phone = p_phone;
    return null;
  end if;

  insert into private.login_attempts as la (phone, failures, window_started_at)
  values (p_phone, 1, now())
  on conflict (phone) do update set
    failures = case when la.window_started_at < now() - interval '15 minutes' or la.locked_until <= now()
                    then 1 else la.failures + 1 end,
    window_started_at = case when la.window_started_at < now() - interval '15 minutes' or la.locked_until <= now()
                             then now() else la.window_started_at end,
    locked_until = case when la.locked_until <= now() then null else la.locked_until end
  returning * into r;

  if r.failures >= 5 then
    update private.login_attempts
      set locked_until = now() + interval '15 minutes', failures = 0, window_started_at = now()
      where phone = p_phone
      returning locked_until into r.locked_until;
  end if;
  return r.locked_until;
end $$;

-- ---------------------------------------------------------------- password reset codes
create table private.password_reset_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text not null,         -- HMAC-SHA256(secret, phone:code), hex; the code itself is never stored
  expires_at timestamptz not null,
  attempts int not null default 0, -- wrong tries against this code
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index password_reset_codes_phone_idx on private.password_reset_codes (phone, created_at desc);

-- 'ok' = a new code was stored (caller sends it); 'rate_limited' = nothing stored.
-- Callers must show the same message for every result so the screen never reveals who is registered.
create function public.auth_reset_request(p_phone text, p_code_hash text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('reset:' || p_phone));
  if exists (select 1 from private.password_reset_codes
             where phone = p_phone and created_at > now() - interval '1 minute')
     or (select count(*) from private.password_reset_codes
         where phone = p_phone and created_at > now() - interval '1 hour') >= 5 then
    return 'rate_limited';
  end if;

  -- Only the newest code is ever valid.
  update private.password_reset_codes set consumed_at = now()
    where phone = p_phone and consumed_at is null;
  insert into private.password_reset_codes (phone, code_hash, expires_at)
    values (p_phone, p_code_hash, now() + interval '10 minutes');
  delete from private.password_reset_codes where created_at < now() - interval '2 days';
  return 'ok';
end $$;

-- 'ok' (code consumed), 'invalid' (wrong / expired / used / none) or 'blocked' (5 wrong tries).
create function public.auth_reset_verify(p_phone text, p_code_hash text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  c private.password_reset_codes;
begin
  select * into c from private.password_reset_codes
    where phone = p_phone and consumed_at is null and expires_at > now()
    order by created_at desc limit 1
    for update;
  if not found then return 'invalid'; end if;
  if c.attempts >= 5 then return 'blocked'; end if;

  if c.code_hash = p_code_hash then
    update private.password_reset_codes set consumed_at = now() where id = c.id;
    return 'ok';
  end if;

  update private.password_reset_codes set attempts = attempts + 1 where id = c.id
    returning attempts into c.attempts;
  return case when c.attempts >= 5 then 'blocked' else 'invalid' end;
end $$;

-- ---------------------------------------------------------------- sessions + audit
-- Signs out every session of a user (used after a password reset or an admin-set password).
create function public.auth_revoke_sessions(p_user uuid) returns void
language sql security definer set search_path = '' as $$
  delete from auth.sessions where user_id = p_user
$$;

-- Auth events go to the organization's audit log. Never pass passwords or codes in p_details.
create function public.auth_audit(p_user uuid, p_action text, p_details jsonb default null) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, after)
  select p.organization_id, p.id, p_action, 'auth', p.id, p_details
  from public.profiles p where p.id = p_user
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'auth_login_locked_until(text)', 'auth_login_record(text, boolean)',
    'auth_reset_request(text, text)', 'auth_reset_verify(text, text)',
    'auth_revoke_sessions(uuid)', 'auth_audit(uuid, text, jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------- new users
-- Accounts come only from the app server, which puts organization_id + role in app_metadata after
-- checking org_phone_members. Copies the phone and name onto the profile and links the list row.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := (new.raw_app_meta_data ->> 'organization_id')::uuid;
  v_role text := coalesce(new.raw_app_meta_data ->> 'role', 'staff');
  v_phone text := case when new.phone is null or new.phone = '' then null
                       when left(new.phone, 1) = '+' then new.phone else '+' || new.phone end;
begin
  if v_org is null then
    raise exception 'self sign-up is disabled; accounts must be provisioned by an admin'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.profiles (id, organization_id, role, full_name, language, phone_e164)
  values (
    new.id,
    v_org,
    v_role,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120),
    'am',
    v_phone
  );
  insert into public.notification_preferences (user_id, organization_id)
  values (new.id, v_org);
  if v_phone is not null then
    update public.org_phone_members set user_id = new.id
      where phone = v_phone and organization_id = v_org and user_id is null;
  end if;
  return new;
end $$;
revoke all on function private.handle_new_user() from public, anon, authenticated;
