-- FleetOS V1 review fixes: void guard hardening, one in-progress trip per vehicle (race-proof),
-- staff can delete their own uploads, superseded (renewed) documents, reminder reopen, atomic trip+revenue RPC.

-- ---------------------------------------------------------------- 1. guard_row hardening
create or replace function private.guard_row() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id is immutable' using errcode = '42501';
  end if;
  new.created_by := old.created_by;

  -- Already voided: the void metadata is frozen. Only an explicit restore (voided_at -> NULL) may touch it.
  if old.voided_at is not null and new.voided_at is not null
     and (new.voided_at is distinct from old.voided_at
          or new.voided_by is distinct from old.voided_by
          or new.void_reason is distinct from old.void_reason) then
    raise exception 'record is already voided; void data cannot be changed' using errcode = '23514';
  end if;

  -- A reason without a void makes no sense.
  if old.voided_at is null and new.voided_at is null and new.void_reason is not null then
    raise exception 'void_reason can only be set when voiding a record' using errcode = '23514';
  end if;

  -- The void time is the server clock, never the client's.
  if old.voided_at is null and new.voided_at is not null then
    new.voided_at := now();
  end if;

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

-- ---------------------------------------------------------------- 2. race-proof single in-progress trip
create unique index trips_one_in_progress_per_vehicle
  on public.trips (vehicle_id) where status = 'IN_PROGRESS' and voided_at is null;

-- ---------------------------------------------------------------- 3. storage: delete own uploads
create policy documents_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select private.current_org_id())::text
    and owner_id = (select auth.uid())::text);

-- ---------------------------------------------------------------- 4. superseded documents
create or replace view public.v_vehicle_documents with (security_invoker = true) as
select d.*, private.doc_status(d.expires_on) as status,
       d.expires_on - private.today_addis() as days_left,
       (d.expires_on is not null and exists (
          select 1 from public.vehicle_documents n
          where n.organization_id = d.organization_id and n.vehicle_id = d.vehicle_id
            and n.document_type = d.document_type and n.voided_at is null
            and n.expires_on > d.expires_on)) as superseded
from public.vehicle_documents d
where d.voided_at is null;

create or replace view public.v_driver_documents with (security_invoker = true) as
select d.*, private.doc_status(d.expires_on) as status,
       d.expires_on - private.today_addis() as days_left,
       (d.expires_on is not null and exists (
          select 1 from public.driver_documents n
          where n.organization_id = d.organization_id and n.driver_id = d.driver_id
            and n.document_type = d.document_type and n.voided_at is null
            and n.expires_on > d.expires_on)) as superseded
from public.driver_documents d
where d.voided_at is null;

-- ---------------------------------------------------------------- 5. reminder reopen
alter table public.reminders add column auto_completed boolean not null default false;
-- (no column grant: users still update only status/completed_at/dismissed_at)

create or replace function private.generate_reminders() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := private.today_addis();
  v_reopen uuid[];
begin
  create temp table if not exists pg_temp.cur (
    organization_id uuid, type text, entity_type text, entity_id uuid,
    params jsonb, dedupe_key text, due_on date, priority text
  ) on commit drop;
  truncate pg_temp.cur;

  insert into pg_temp.cur
  select d.organization_id, 'VEHICLE_DOCUMENT_EXPIRY', 'vehicle_document', d.id,
    jsonb_build_object('vehicle_name', v.name, 'plate_number', v.plate_number, 'document_type', d.document_type),
    'vdoc:' || d.id || ':' || d.expires_on || ':' || case when d.expires_on < v_today then 'expired' else 'soon' end,
    d.expires_on, case when d.expires_on <= v_today + 7 then 'high' else 'normal' end
  from public.vehicle_documents d
  join public.vehicles v on v.id = d.vehicle_id and v.organization_id = d.organization_id
  where d.voided_at is null and d.expires_on is not null and d.expires_on <= v_today + 30
    and not exists (
      select 1 from public.vehicle_documents n
      where n.organization_id = d.organization_id and n.vehicle_id = d.vehicle_id
        and n.document_type = d.document_type and n.voided_at is null and n.expires_on > d.expires_on);

  insert into pg_temp.cur
  select d.organization_id, 'DRIVER_DOCUMENT_EXPIRY', 'driver_document', d.id,
    jsonb_build_object('driver_name', dr.name, 'document_type', d.document_type),
    'ddoc:' || d.id || ':' || d.expires_on || ':' || case when d.expires_on < v_today then 'expired' else 'soon' end,
    d.expires_on, case when d.expires_on <= v_today + 7 then 'high' else 'normal' end
  from public.driver_documents d
  join public.drivers dr on dr.id = d.driver_id and dr.organization_id = d.organization_id
  where d.voided_at is null and d.expires_on is not null and d.expires_on <= v_today + 30
    and not exists (
      select 1 from public.driver_documents n
      where n.organization_id = d.organization_id and n.driver_id = d.driver_id
        and n.document_type = d.document_type and n.voided_at is null and n.expires_on > d.expires_on);

  insert into pg_temp.cur
  select dr.organization_id, 'DRIVER_LICENSE_EXPIRY', 'driver', dr.id,
    jsonb_build_object('driver_name', dr.name),
    'lic:' || dr.id || ':' || dr.license_expiry || ':' || case when dr.license_expiry < v_today then 'expired' else 'soon' end,
    dr.license_expiry, case when dr.license_expiry <= v_today + 7 then 'high' else 'normal' end
  from public.drivers dr
  where dr.status = 'ACTIVE' and dr.license_expiry is not null and dr.license_expiry <= v_today + 30;

  insert into pg_temp.cur
  select s.organization_id, 'MAINTENANCE_DUE', 'maintenance_schedule', s.id,
    jsonb_build_object('vehicle_name', v.name, 'plate_number', v.plate_number,
                       'service_category', s.service_category, 'basis', 'date'),
    'maint-date:' || s.id || ':' || s.next_due_date || ':' || case when s.next_due_date < v_today then 'overdue' else 'soon' end,
    s.next_due_date, case when s.next_due_date < v_today then 'high' else 'normal' end
  from public.maintenance_schedules s
  join public.vehicles v on v.id = s.vehicle_id and v.organization_id = s.organization_id
  where s.next_due_date is not null and s.next_due_date <= v_today + 14;

  insert into pg_temp.cur
  select s.organization_id, 'MAINTENANCE_DUE', 'maintenance_schedule', s.id,
    jsonb_build_object('vehicle_name', v.name, 'plate_number', v.plate_number,
                       'service_category', s.service_category, 'basis', 'odometer',
                       'next_due_odometer', s.next_due_odometer),
    'maint-km:' || s.id || ':' || s.next_due_odometer || ':' || case when v.current_odometer >= s.next_due_odometer then 'overdue' else 'soon' end,
    null, case when v.current_odometer >= s.next_due_odometer then 'high' else 'normal' end
  from public.maintenance_schedules s
  join public.vehicles v on v.id = s.vehicle_id and v.organization_id = s.organization_id
  where s.next_due_odometer is not null and v.current_odometer is not null
    and s.next_due_odometer - v.current_odometer <= 500;

  insert into pg_temp.cur
  select t.organization_id, 'UPCOMING_TRIP', 'trip', t.id,
    jsonb_build_object('vehicle_name', v.name, 'plate_number', v.plate_number, 'driver_name', d.name,
                       'origin', t.origin, 'destination', t.destination),
    'trip:' || t.id || ':' || t.trip_date, t.trip_date, 'normal'
  from public.trips t
  join public.vehicles v on v.id = t.vehicle_id and v.organization_id = t.organization_id
  join public.drivers d on d.id = t.driver_id and d.organization_id = t.organization_id
  where t.voided_at is null and t.status = 'PLANNED'
    and t.trip_date between v_today and v_today + 1;

  insert into pg_temp.cur
  select v.organization_id, 'MISSING_FUEL_RECORD', 'vehicle', v.id,
    jsonb_build_object('vehicle_name', v.name, 'plate_number', v.plate_number),
    'nofuel:' || v.id || ':' || to_char(v_today, 'IYYY-IW'), v_today, 'low'
  from public.vehicles v
  where exists (
      select 1 from public.trips t
      where t.vehicle_id = v.id and t.voided_at is null
        and t.status in ('IN_PROGRESS', 'COMPLETED') and t.trip_date >= v_today - 7)
    and not exists (
      select 1 from public.fuel_records f
      where f.vehicle_id = v.id and f.voided_at is null and f.fuel_date >= v_today - 7);

  insert into pg_temp.cur
  select t.organization_id, 'MISSING_TRIP_REVENUE', 'trip', t.id,
    jsonb_build_object('vehicle_name', v.name, 'origin', t.origin, 'destination', t.destination),
    'norev:' || t.id, t.trip_date, 'normal'
  from public.trips t
  join public.vehicles v on v.id = t.vehicle_id and v.organization_id = t.organization_id
  where t.voided_at is null and t.status = 'COMPLETED' and t.trip_date <= v_today - 2
    and not exists (
      select 1 from public.trip_revenue r where r.trip_id = t.id and r.voided_at is null);

  insert into pg_temp.cur
  select t.organization_id, 'STALE_TRIP', 'trip', t.id,
    jsonb_build_object('vehicle_name', v.name, 'origin', t.origin, 'destination', t.destination),
    'stale:' || t.id, t.trip_date, 'normal'
  from public.trips t
  join public.vehicles v on v.id = t.vehicle_id and v.organization_id = t.organization_id
  where t.voided_at is null and t.status = 'IN_PROGRESS' and t.trip_date <= v_today - 7;

  -- Reminders the engine itself completed earlier whose condition holds again get reopened.
  -- DISMISSED and user-COMPLETED (auto_completed = false) stay sticky.
  select coalesce(array_agg(r.id), '{}') into v_reopen
  from public.reminders r
  join pg_temp.cur c on c.organization_id = r.organization_id and c.dedupe_key = r.dedupe_key
  where r.auto_completed and r.status = 'COMPLETED';

  insert into public.reminders (organization_id, type, entity_type, entity_id, params, dedupe_key, due_on, priority)
  select organization_id, type, entity_type, entity_id, params, dedupe_key, due_on, priority
  from pg_temp.cur
  on conflict (organization_id, dedupe_key) do update
    set status = 'PENDING', completed_at = null, auto_completed = false,
        priority = excluded.priority, params = excluded.params, due_on = excluded.due_on
    where public.reminders.auto_completed and public.reminders.status = 'COMPLETED';

  update public.notification_deliveries nd
  set status = 'SENT', read_at = null
  where nd.reminder_id = any (v_reopen) and nd.channel = 'in_app';

  update public.reminders r
  set status = 'COMPLETED', completed_at = now(), auto_completed = true
  where r.status in ('PENDING', 'SCHEDULED')
    and r.type in ('VEHICLE_DOCUMENT_EXPIRY', 'DRIVER_DOCUMENT_EXPIRY', 'DRIVER_LICENSE_EXPIRY',
                   'MAINTENANCE_DUE', 'UPCOMING_TRIP', 'MISSING_FUEL_RECORD',
                   'MISSING_TRIP_REVENUE', 'STALE_TRIP')
    and not exists (
      select 1 from pg_temp.cur c
      where c.organization_id = r.organization_id and c.dedupe_key = r.dedupe_key);

  insert into public.notification_deliveries (organization_id, reminder_id, recipient_id, channel, status, sent_at)
  select r.organization_id, r.id, p.id, 'in_app', 'SENT', now()
  from public.reminders r
  join public.profiles p on p.organization_id = r.organization_id
  left join public.notification_preferences np on np.user_id = p.id
  where r.status = 'PENDING' and coalesce(np.in_app, true)
  on conflict (reminder_id, recipient_id, channel) do nothing;
end $$;
revoke all on function private.generate_reminders() from public, anon, authenticated;

-- ---------------------------------------------------------------- 6. atomic trip + revenue
-- SECURITY INVOKER: RLS and triggers apply. One function call = one transaction.
create function public.create_trip_with_revenue(
  p_vehicle_id uuid, p_driver_id uuid, p_trip_date date, p_origin text, p_destination text,
  p_status text, p_notes text, p_revenue numeric, p_revenue_description text
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_org uuid := private.current_org_id();
  v_trip uuid;
begin
  if v_org is null then
    raise exception 'no organization for the current user' using errcode = '42501';
  end if;
  insert into public.trips (organization_id, vehicle_id, driver_id, trip_date, origin, destination, status, notes, created_by)
  values (v_org, p_vehicle_id, p_driver_id, p_trip_date, p_origin, p_destination,
          coalesce(p_status, 'PLANNED'), p_notes, auth.uid())
  returning id into v_trip;

  if p_revenue is not null and p_revenue > 0 then
    insert into public.trip_revenue (organization_id, trip_id, amount, revenue_date, description, created_by)
    values (v_org, v_trip, p_revenue, p_trip_date, p_revenue_description, auth.uid());
  end if;
  return v_trip;
end $$;
revoke execute on function public.create_trip_with_revenue(uuid, uuid, date, text, text, text, text, numeric, text) from public, anon;
grant execute on function public.create_trip_with_revenue(uuid, uuid, date, text, text, text, text, numeric, text) to authenticated;
