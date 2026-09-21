-- FleetOS V1: authorization helpers, RLS, void/audit guards, derived-state triggers, storage.

-- ---------------------------------------------------------------- helpers
create function private.current_org_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select organization_id from public.profiles where id = (select auth.uid())
$$;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role = 'admin' from public.profiles where id = (select auth.uid())), false)
$$;

revoke all on function private.current_org_id() from public, anon;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.current_org_id() to authenticated;
grant execute on function private.is_admin() to authenticated;

-- A profile is created only when an admin sets organization_id in app_metadata
-- (app_metadata cannot be edited by the user; user_metadata can, so it is never trusted).
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.raw_app_meta_data ->> 'organization_id') is not null then
    insert into public.profiles (id, organization_id, role, full_name, language)
    values (
      new.id,
      (new.raw_app_meta_data ->> 'organization_id')::uuid,
      coalesce(new.raw_app_meta_data ->> 'role', 'staff'),
      coalesce(new.raw_user_meta_data ->> 'full_name', ''),
      'am'
    );
    insert into public.notification_preferences (user_id, organization_id)
    values (new.id, (new.raw_app_meta_data ->> 'organization_id')::uuid);
  end if;
  return new;
end $$;
revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------- void guard
-- Applies to every table with voided_at. Only admins may void/restore; a reason is mandatory.
create function private.guard_row() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id is immutable' using errcode = '42501';
  end if;
  new.created_by := old.created_by;
  if auth.uid() is not null
     and (new.voided_at is distinct from old.voided_at or new.voided_by is distinct from old.voided_by) then
    if not private.is_admin() then
      raise exception 'only an admin can void or restore a record' using errcode = '42501';
    end if;
    if new.voided_at is not null then
      if coalesce(btrim(new.void_reason), '') = '' then
        raise exception 'a reason is required to void a record' using errcode = '23514';
      end if;
      new.voided_by := auth.uid();
    else
      new.voided_by := null;
      new.void_reason := null;
    end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_row() from public, anon, authenticated;

-- ---------------------------------------------------------------- audit
create function private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_action text := tg_op;
  v_org uuid;
  v_id uuid;
  v_reason text := nullif(current_setting('app.audit_reason', true), '');
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'updated_at') = (to_jsonb(old) - 'updated_at') then
      return new;
    end if;
    if (to_jsonb(new) ->> 'voided_at') is not null and (to_jsonb(old) ->> 'voided_at') is null then
      v_action := 'VOID';
      v_reason := coalesce(v_reason, to_jsonb(new) ->> 'void_reason');
    elsif (to_jsonb(new) ->> 'voided_at') is null and (to_jsonb(old) ->> 'voided_at') is not null then
      v_action := 'RESTORE';
    end if;
  end if;

  if tg_op = 'DELETE' then
    v_org := old.organization_id; v_id := old.id;
  else
    v_org := new.organization_id; v_id := new.id;
  end if;

  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, before, after, reason)
  values (
    v_org, auth.uid(), v_action, tg_table_name, v_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    v_reason
  );
  return coalesce(new, old);
end $$;
revoke all on function private.audit_row() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'fuel_records','trips','trip_revenue','trip_expenses','service_records',
    'vehicle_documents','driver_documents','incidents'
  ] loop
    execute format(
      'create trigger a_guard before update on public.%I for each row execute function private.guard_row()', t);
  end loop;

  foreach t in array array[
    'vehicles','drivers','fuel_records','trips','trip_revenue','trip_expenses','service_records',
    'maintenance_schedules','vehicle_documents','driver_documents','incidents','profiles'
  ] loop
    execute format(
      'create trigger z_audit after insert or update or delete on public.%I for each row execute function private.audit_row()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- derived state
-- Vehicle status and odometer are maintained here, not trusted from clients.
create function private.refresh_vehicle_status(p_vehicle uuid) returns void
language sql security definer set search_path = '' as $$
  update public.vehicles v
  set status = case when exists (
    select 1 from public.trips t
    where t.vehicle_id = v.id and t.status = 'IN_PROGRESS' and t.voided_at is null
  ) then 'ON_TRIP' else 'AVAILABLE' end
  where v.id = p_vehicle and v.status in ('AVAILABLE', 'ON_TRIP')
$$;
revoke all on function private.refresh_vehicle_status(uuid) from public, anon, authenticated;

create function private.trip_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  if tg_op = 'INSERT' and exists (
    select 1 from public.drivers d where d.id = new.driver_id and d.status <> 'ACTIVE'
  ) then
    raise exception 'driver is not active' using errcode = '23514';
  end if;

  if new.status = 'IN_PROGRESS' and new.voided_at is null
     and (tg_op = 'INSERT' or old.status is distinct from 'IN_PROGRESS' or old.vehicle_id <> new.vehicle_id) then
    select status into v_status from public.vehicles where id = new.vehicle_id;
    if v_status in ('MAINTENANCE', 'OUT_OF_SERVICE') then
      raise exception 'vehicle is % and cannot start a trip', v_status using errcode = '23514';
    end if;
    if exists (
      select 1 from public.trips t
      where t.vehicle_id = new.vehicle_id and t.status = 'IN_PROGRESS' and t.voided_at is null
        and t.id <> new.id
    ) then
      raise exception 'vehicle already has a trip in progress' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.trip_before() from public, anon, authenticated;

create function private.trip_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.vehicle_id <> new.vehicle_id then
    perform private.refresh_vehicle_status(old.vehicle_id);
  end if;
  perform private.refresh_vehicle_status(new.vehicle_id);
  return new;
end $$;
revoke all on function private.trip_after() from public, anon, authenticated;

create trigger b_trip_before before insert or update on public.trips
  for each row execute function private.trip_before();
create trigger y_trip_after after insert or update on public.trips
  for each row execute function private.trip_after();

create function private.expense_vehicle_matches_trip() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.trips t
    where t.id = new.trip_id and t.organization_id = new.organization_id and t.vehicle_id = new.vehicle_id
  ) then
    raise exception 'expense vehicle does not match the trip vehicle' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function private.expense_vehicle_matches_trip() from public, anon, authenticated;

create trigger b_expense_vehicle before insert or update of trip_id, vehicle_id on public.trip_expenses
  for each row execute function private.expense_vehicle_matches_trip();

-- Odometer only moves forward automatically. A mistyped high value is possible; see docs/DECISIONS.md.
create function private.sync_vehicle_odometer() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.odometer is not null and new.voided_at is null then
    update public.vehicles
    set current_odometer = new.odometer
    where id = new.vehicle_id and organization_id = new.organization_id
      and (current_odometer is null or current_odometer < new.odometer);
  end if;
  return new;
end $$;
revoke all on function private.sync_vehicle_odometer() from public, anon, authenticated;

create trigger y_sync_odometer after insert or update of odometer, voided_at on public.fuel_records
  for each row execute function private.sync_vehicle_odometer();
create trigger y_sync_odometer after insert or update of odometer, voided_at on public.service_records
  for each row execute function private.sync_vehicle_odometer();

-- A new (non-backdated) service record rolls the matching schedule forward.
create function private.roll_maintenance_schedule() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.voided_at is not null then
    return new;
  end if;
  update public.maintenance_schedules s
  set last_service_id = new.id,
      next_due_date = case when s.interval_days is not null
        then new.service_date + s.interval_days end,
      next_due_odometer = case when s.interval_km is not null and new.odometer is not null
        then new.odometer + s.interval_km end
  where s.vehicle_id = new.vehicle_id
    and s.organization_id = new.organization_id
    and s.service_category = new.category
    and (
      s.last_service_id is null
      or coalesce((select sr.service_date from public.service_records sr where sr.id = s.last_service_id), date '0001-01-01')
         <= new.service_date
    );
  return new;
end $$;
revoke all on function private.roll_maintenance_schedule() from public, anon, authenticated;

create trigger y_roll_schedule after insert or update of service_date, category, odometer, voided_at
  on public.service_records for each row execute function private.roll_maintenance_schedule();

-- ---------------------------------------------------------------- RLS
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.drivers enable row level security;
alter table public.maintenance_schedules enable row level security;
alter table public.reminders enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.audit_logs enable row level security;

create policy organizations_select on public.organizations for select to authenticated
  using (id = (select private.current_org_id()));

create policy profiles_select on public.profiles for select to authenticated
  using (organization_id = (select private.current_org_id()));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Admin-managed master data
do $$
declare t text;
begin
  foreach t in array array['vehicles','drivers','maintenance_schedules'] loop
    execute format('create policy p_%1$s_select on public.%1$I for select to authenticated
      using (organization_id = (select private.current_org_id()))', t);
    execute format('create policy p_%1$s_insert on public.%1$I for insert to authenticated
      with check (organization_id = (select private.current_org_id()) and (select private.is_admin()))', t);
    execute format('create policy p_%1$s_update on public.%1$I for update to authenticated
      using (organization_id = (select private.current_org_id()) and (select private.is_admin()))
      with check (organization_id = (select private.current_org_id()) and (select private.is_admin()))', t);
  end loop;

  -- Operational records: staff and admin create/edit; only admin voids (guard trigger).
  foreach t in array array[
    'fuel_records','trips','trip_revenue','trip_expenses','service_records',
    'vehicle_documents','driver_documents','incidents'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy p_%1$s_select on public.%1$I for select to authenticated
      using (organization_id = (select private.current_org_id()))', t);
    execute format('create policy p_%1$s_insert on public.%1$I for insert to authenticated
      with check (organization_id = (select private.current_org_id())
        and created_by = (select auth.uid()) and voided_at is null)', t);
    execute format('create policy p_%1$s_update on public.%1$I for update to authenticated
      using (organization_id = (select private.current_org_id())
        and (voided_at is null or (select private.is_admin())))
      with check (organization_id = (select private.current_org_id()))', t);
  end loop;
end $$;

create policy reminders_select on public.reminders for select to authenticated
  using (organization_id = (select private.current_org_id()));
create policy reminders_update on public.reminders for update to authenticated
  using (organization_id = (select private.current_org_id()))
  with check (organization_id = (select private.current_org_id()));

create policy deliveries_select on public.notification_deliveries for select to authenticated
  using (
    organization_id = (select private.current_org_id())
    and (recipient_id = (select auth.uid()) or (select private.is_admin()))
  );
create policy deliveries_update on public.notification_deliveries for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));

create policy prefs_select on public.notification_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy prefs_update on public.notification_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy audit_select on public.audit_logs for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_admin()));

-- ---------------------------------------------------------------- grants
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
revoke delete on all tables in schema public from authenticated;   -- records are voided, not deleted
revoke insert, update on public.audit_logs from authenticated;
revoke insert, update on public.organizations from authenticated;
revoke insert on public.profiles, public.reminders, public.notification_deliveries,
  public.notification_preferences from authenticated;

revoke update on public.profiles from authenticated;
grant update (full_name, phone, language) on public.profiles to authenticated;
revoke update on public.reminders from authenticated;
grant update (status, completed_at, dismissed_at) on public.reminders to authenticated;
revoke update on public.notification_deliveries from authenticated;
grant update (status, read_at) on public.notification_deliveries to authenticated;
revoke update on public.notification_preferences from authenticated;
grant update (in_app, whatsapp, sms, push, email) on public.notification_preferences to authenticated;

-- ---------------------------------------------------------------- storage (private bucket, folder = organization_id)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy documents_select on storage.objects for select to authenticated
  using (bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select private.current_org_id())::text);
create policy documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select private.current_org_id())::text);
create policy documents_update on storage.objects for update to authenticated
  using (bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select private.current_org_id())::text)
  with check (bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select private.current_org_id())::text);
create policy documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select private.current_org_id())::text
    and (select private.is_admin()));
