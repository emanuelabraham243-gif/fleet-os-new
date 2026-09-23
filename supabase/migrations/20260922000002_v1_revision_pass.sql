-- FleetOS V1 revision pass:
--   * maintenance schedules can now also roll forward on a trip-count interval
--     (e.g. every 5 completed trips), alongside the existing km/day intervals.
--   * general_documents: org-level file storage not tied to a vehicle or driver
--     (family / school / personal / other), reusing the same private "documents"
--     bucket and doc_status()/days_left convention as vehicle/driver documents.
--   * the "documents" storage bucket's allowed_mime_types never included XLSX,
--     so an upload that passed the app's magic-byte sniff would still be
--     rejected by Storage itself. Fixed here.

-- ---------------------------------------------------------------- 1. maintenance: trip-count intervals
alter table public.maintenance_schedules
  add column interval_trips int check (interval_trips > 0),
  add column next_due_trip_count int;

alter table public.maintenance_schedules drop constraint maintenance_schedules_check;
alter table public.maintenance_schedules
  add constraint maintenance_schedules_check
  check (interval_km is not null or interval_days is not null or interval_trips is not null);

-- A round trip is one row in `trips`, so "every 5 trips" = 5 COMPLETED trip rows for the vehicle.
create or replace function private.roll_maintenance_schedule() returns trigger
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
        then new.odometer + s.interval_km end,
      next_due_trip_count = case when s.interval_trips is not null then (
        select count(*) from public.trips t
        where t.vehicle_id = new.vehicle_id and t.organization_id = new.organization_id
          and t.status = 'COMPLETED' and t.voided_at is null and t.trip_date <= new.service_date
      ) + s.interval_trips end
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

-- Adds a trip_status dimension (folded into overall_status, same OR-across-dimensions rule as
-- date/odometer) and current_trip_count. Dropped and recreated (not CREATE OR REPLACE) because
-- the new columns are not at the end of the original column list.
drop view public.v_maintenance_status;
create view public.v_maintenance_status with (security_invoker = true) as
with s as (
  select ms.*, v.name as vehicle_name, v.plate_number, v.current_odometer,
    (
      select count(*) from public.trips t
      where t.vehicle_id = ms.vehicle_id and t.organization_id = ms.organization_id
        and t.status = 'COMPLETED' and t.voided_at is null
    ) as current_trip_count,
    case
      when ms.next_due_date is null then 'UNKNOWN'
      when ms.next_due_date < private.today_addis() then 'OVERDUE'
      when ms.next_due_date <= private.today_addis() + 14 then 'DUE_SOON'
      else 'OK'
    end as date_status,
    case
      when ms.next_due_odometer is null or v.current_odometer is null then 'UNKNOWN'
      when v.current_odometer >= ms.next_due_odometer then 'OVERDUE'
      when ms.next_due_odometer - v.current_odometer <= 500 then 'DUE_SOON'
      else 'OK'
    end as odometer_status
  from public.maintenance_schedules ms
  join public.vehicles v on v.id = ms.vehicle_id and v.organization_id = ms.organization_id
),
s2 as (
  select s.*,
    case
      when s.next_due_trip_count is null then 'UNKNOWN'
      when s.current_trip_count >= s.next_due_trip_count then 'OVERDUE'
      when s.next_due_trip_count - s.current_trip_count <= 1 then 'DUE_SOON'
      else 'OK'
    end as trip_status
  from s
)
select s2.*,
  case
    when 'OVERDUE' in (date_status, odometer_status, trip_status) then 'OVERDUE'
    when 'DUE_SOON' in (date_status, odometer_status, trip_status) then 'DUE_SOON'
    when 'OK' in (date_status, odometer_status, trip_status) then 'OK'
    else 'UNKNOWN'
  end as overall_status
from s2;

-- Adds a trip-count MAINTENANCE_DUE branch, mirroring the existing odometer one.
-- Full function body (CREATE OR REPLACE replaces it wholesale, not a diff).
create or replace function private.generate_reminders() returns void
language plpgsql security definer set search_path = '' as $$
declare v_today date := private.today_addis();
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
  where d.voided_at is null and d.expires_on is not null and d.expires_on <= v_today + 30;

  insert into pg_temp.cur
  select d.organization_id, 'DRIVER_DOCUMENT_EXPIRY', 'driver_document', d.id,
    jsonb_build_object('driver_name', dr.name, 'document_type', d.document_type),
    'ddoc:' || d.id || ':' || d.expires_on || ':' || case when d.expires_on < v_today then 'expired' else 'soon' end,
    d.expires_on, case when d.expires_on <= v_today + 7 then 'high' else 'normal' end
  from public.driver_documents d
  join public.drivers dr on dr.id = d.driver_id and dr.organization_id = d.organization_id
  where d.voided_at is null and d.expires_on is not null and d.expires_on <= v_today + 30;

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
  select s.organization_id, 'MAINTENANCE_DUE', 'maintenance_schedule', s.id,
    jsonb_build_object('vehicle_name', v.name, 'plate_number', v.plate_number,
                       'service_category', s.service_category, 'basis', 'trips',
                       'next_due_trip_count', s.next_due_trip_count, 'current_trip_count', tc.cnt),
    'maint-trip:' || s.id || ':' || s.next_due_trip_count || ':' || case when tc.cnt >= s.next_due_trip_count then 'overdue' else 'soon' end,
    null, case when tc.cnt >= s.next_due_trip_count then 'high' else 'normal' end
  from public.maintenance_schedules s
  join public.vehicles v on v.id = s.vehicle_id and v.organization_id = s.organization_id
  join lateral (
    select count(*) as cnt from public.trips t
    where t.vehicle_id = s.vehicle_id and t.organization_id = s.organization_id
      and t.status = 'COMPLETED' and t.voided_at is null
  ) tc on true
  where s.next_due_trip_count is not null and s.next_due_trip_count - tc.cnt <= 1;

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

  insert into public.reminders (organization_id, type, entity_type, entity_id, params, dedupe_key, due_on, priority)
  select organization_id, type, entity_type, entity_id, params, dedupe_key, due_on, priority
  from pg_temp.cur
  on conflict (organization_id, dedupe_key) do nothing;

  update public.reminders r
  set status = 'COMPLETED', completed_at = now()
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

-- ---------------------------------------------------------------- 2. general documents (family / school / personal / other)
-- doc_type-style `category` is plain text (no CHECK), same convention as vehicle/driver document_type
-- and service_category: new categories are an app-side list change, never a schema migration.
create table public.general_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  category text not null,
  title text not null,
  document_number text,
  issued_on date,
  expires_on date, -- NULL = status UNKNOWN; general docs are not required to have an expiry at all
  file_path text,
  notes text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  void_reason text
);

create index general_documents_org_idx on public.general_documents (organization_id, category);

alter table public.general_documents enable row level security;

create policy p_general_documents_select on public.general_documents for select to authenticated
  using (organization_id = (select private.current_org_id()));
create policy p_general_documents_insert on public.general_documents for insert to authenticated
  with check (organization_id = (select private.current_org_id())
    and created_by = (select auth.uid()) and voided_at is null);
create policy p_general_documents_update on public.general_documents for update to authenticated
  using (organization_id = (select private.current_org_id())
    and (voided_at is null or (select private.is_admin())))
  with check (organization_id = (select private.current_org_id()));

create trigger a_guard before update on public.general_documents
  for each row execute function private.guard_row();
create trigger z_audit after insert or update or delete on public.general_documents
  for each row execute function private.audit_row();
create trigger set_updated_at before update on public.general_documents
  for each row execute function private.set_updated_at();

revoke delete on public.general_documents from authenticated;

create view public.v_general_documents with (security_invoker = true) as
select d.*, private.doc_status(d.expires_on) as status,
       d.expires_on - private.today_addis() as days_left
from public.general_documents d
where d.voided_at is null;

-- ---------------------------------------------------------------- 3. storage: allow XLSX (gap from a prior pass)
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
where id = 'documents';
