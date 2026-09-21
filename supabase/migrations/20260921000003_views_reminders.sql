-- FleetOS V1: derived views (unknown stays unknown) and the server-side reminder engine.

-- Supabase-provisioned helper should not be callable over the public RPC API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

create function private.today_addis() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Africa/Addis_Ababa')::date
$$;

create function private.doc_status(p_expires date, p_warn_days int default 30) returns text
language sql stable set search_path = '' as $$
  select case
    when p_expires is null then 'UNKNOWN'
    when p_expires < private.today_addis() then 'EXPIRED'
    when p_expires <= private.today_addis() + p_warn_days then 'EXPIRING_SOON'
    else 'VALID'
  end
$$;

revoke all on function private.today_addis() from public, anon;
revoke all on function private.doc_status(date, int) from public, anon;
grant execute on function private.today_addis() to authenticated;
grant execute on function private.doc_status(date, int) to authenticated;

-- security_invoker: the caller's RLS applies to the underlying tables.
create view public.v_vehicle_documents with (security_invoker = true) as
select d.*, private.doc_status(d.expires_on) as status,
       d.expires_on - private.today_addis() as days_left
from public.vehicle_documents d
where d.voided_at is null;

create view public.v_driver_documents with (security_invoker = true) as
select d.*, private.doc_status(d.expires_on) as status,
       d.expires_on - private.today_addis() as days_left
from public.driver_documents d
where d.voided_at is null;

-- profit is calculated, never stored. No revenue recorded => profit is NULL (insufficient data), not 0.
create view public.v_trip_financials with (security_invoker = true) as
select t.id as trip_id, t.organization_id, t.vehicle_id, t.driver_id, t.trip_date,
       t.origin, t.destination, t.status,
       r.total as revenue,
       coalesce(e.total, 0) as expenses,
       coalesce(r.cnt, 0) > 0 as has_revenue,
       coalesce(e.cnt, 0) > 0 as has_expenses,
       case when r.total is null then null else r.total - coalesce(e.total, 0) end as profit
from public.trips t
left join lateral (
  select sum(x.amount) as total, count(*) as cnt
  from public.trip_revenue x where x.trip_id = t.id and x.voided_at is null
) r on true
left join lateral (
  select sum(x.amount) as total, count(*) as cnt
  from public.trip_expenses x where x.trip_id = t.id and x.voided_at is null
) e on true
where t.voided_at is null;

-- Unknown odometer / missing due values => UNKNOWN, never a fabricated status.
create view public.v_maintenance_status with (security_invoker = true) as
with s as (
  select ms.*, v.name as vehicle_name, v.plate_number, v.current_odometer,
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
)
select s.*,
  case
    when 'OVERDUE' in (date_status, odometer_status) then 'OVERDUE'
    when 'DUE_SOON' in (date_status, odometer_status) then 'DUE_SOON'
    when 'OK' in (date_status, odometer_status) then 'OK'
    else 'UNKNOWN'
  end as overall_status
from s;

-- ---------------------------------------------------------------- reminder engine
-- Idempotent: every condition maps to a stable dedupe_key; re-running inserts nothing new.
-- Conditions that no longer hold are auto-completed. User-dismissed/completed reminders are never reopened.
create function private.generate_reminders() returns void
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
revoke all on function private.generate_reminders() from public, anon, authenticated;

-- Daily at 03:00 UTC = 06:00 Africa/Addis_Ababa. Re-running the migration replaces the job of the same name.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('fleetos-generate-reminders', '0 3 * * *', $$select private.generate_reminders()$$);
