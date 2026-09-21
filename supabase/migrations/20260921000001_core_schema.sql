-- FleetOS V1 core schema.
-- Conventions: money NUMERIC(14,2); business dates are DATE (Africa/Addis_Ababa);
-- instants are TIMESTAMPTZ. Records are voided, never deleted.
-- Composite (id, organization_id) FKs make cross-organization references impossible.

create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_demo boolean not null default false,
  timezone text not null default 'Africa/Addis_Ababa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id),
  full_name text not null default '',
  phone text,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  language text not null default 'am' check (language in ('am', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_org_idx on public.profiles (organization_id);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null,
  plate_number text not null,
  make text,
  model text,
  year int check (year between 1980 and 2100),
  status text not null default 'AVAILABLE'
    check (status in ('AVAILABLE', 'ON_TRIP', 'MAINTENANCE', 'OUT_OF_SERVICE')),
  current_odometer numeric(10, 1) check (current_odometer >= 0), -- NULL = unknown
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, plate_number)
);

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null,
  phone text,
  license_number text,
  license_expiry date, -- NULL = unknown
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

-- Shared column groups are repeated (not inherited) so each table stays explicit.

create table public.fuel_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  vehicle_id uuid not null,
  fuel_date date not null,
  fuel_type text not null default 'DIESEL' check (fuel_type in ('DIESEL', 'PETROL')),
  quantity numeric(10, 2) not null check (quantity > 0),          -- liters
  unit_price numeric(12, 2) not null check (unit_price >= 0),     -- ETB / liter
  total_amount numeric(14, 2) not null check (total_amount >= 0), -- ETB, as written on the receipt
  -- Surfaced, never silently corrected: TRUE when quantity x unit_price differs from total by > 0.50 ETB.
  amount_mismatch boolean generated always as (abs(quantity * unit_price - total_amount) > 0.50) stored,
  odometer numeric(10, 1) check (odometer >= 0),
  notes text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  void_reason text,
  foreign key (vehicle_id, organization_id) references public.vehicles (id, organization_id)
);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  vehicle_id uuid not null,
  driver_id uuid not null, -- permanent historical record, not "current assignment"
  trip_date date not null,
  origin text not null,
  destination text not null,
  status text not null default 'PLANNED'
    check (status in ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  notes text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  void_reason text,
  unique (id, organization_id),
  foreign key (vehicle_id, organization_id) references public.vehicles (id, organization_id),
  foreign key (driver_id, organization_id) references public.drivers (id, organization_id)
);

create table public.trip_revenue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  trip_id uuid not null,
  amount numeric(14, 2) not null check (amount > 0),
  revenue_date date not null,
  description text,
  notes text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  void_reason text,
  foreign key (trip_id, organization_id) references public.trips (id, organization_id)
);

create table public.trip_expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  trip_id uuid not null,
  vehicle_id uuid not null,
  category text not null check (category in
    ('FUEL', 'DRIVER_ALLOWANCE', 'TOLL', 'LOADING', 'PARKING', 'REPAIR', 'FINE', 'OTHER')),
  description text,
  amount numeric(14, 2) not null check (amount > 0),
  expense_date date not null,
  notes text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  void_reason text,
  foreign key (trip_id, organization_id) references public.trips (id, organization_id),
  foreign key (vehicle_id, organization_id) references public.vehicles (id, organization_id)
);

create table public.service_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  vehicle_id uuid not null,
  service_date date not null,
  category text not null,
  description text,
  odometer numeric(10, 1) check (odometer >= 0),
  cost numeric(14, 2) check (cost >= 0), -- NULL = unknown
  service_provider text,
  notes text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  void_reason text,
  unique (id, organization_id),
  foreign key (vehicle_id, organization_id) references public.vehicles (id, organization_id)
);

create table public.maintenance_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  vehicle_id uuid not null,
  service_category text not null,
  interval_km numeric(10, 1) check (interval_km > 0),
  interval_days int check (interval_days > 0),
  last_service_id uuid,
  next_due_date date,
  next_due_odometer numeric(10, 1),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (interval_km is not null or interval_days is not null),
  unique (vehicle_id, service_category),
  foreign key (vehicle_id, organization_id) references public.vehicles (id, organization_id),
  foreign key (last_service_id, organization_id) references public.service_records (id, organization_id)
);

create table public.vehicle_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  vehicle_id uuid not null,
  document_type text not null,
  document_number text,
  issued_on date,
  expires_on date, -- NULL = status UNKNOWN (never "expired")
  file_path text,
  notes text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  void_reason text,
  foreign key (vehicle_id, organization_id) references public.vehicles (id, organization_id)
);

create table public.driver_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  driver_id uuid not null,
  document_type text not null,
  document_number text,
  issued_on date,
  expires_on date,
  file_path text,
  notes text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  void_reason text,
  foreign key (driver_id, organization_id) references public.drivers (id, organization_id)
);

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  vehicle_id uuid not null,
  driver_id uuid,
  trip_id uuid,
  occurred_at timestamptz not null default now(),
  title text not null,
  description text, -- neutral, factual
  status text not null default 'OPEN' check (status in ('OPEN', 'REVIEWED', 'CLOSED')),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  void_reason text,
  foreign key (vehicle_id, organization_id) references public.vehicles (id, organization_id),
  foreign key (driver_id, organization_id) references public.drivers (id, organization_id),
  foreign key (trip_id, organization_id) references public.trips (id, organization_id)
);

-- Reminders: one row per business condition (idempotent via dedupe_key).
-- Text is NOT stored; the UI renders type + params in the user's language.
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  type text not null,
  entity_type text not null,
  entity_id uuid not null,
  params jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  due_on date,
  remind_at timestamptz not null default now(),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  status text not null default 'PENDING'
    check (status in ('SCHEDULED', 'PENDING', 'COMPLETED', 'DISMISSED')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  dismissed_at timestamptz,
  unique (organization_id, dedupe_key)
);

create table public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id),
  in_app boolean not null default true,
  whatsapp boolean not null default false,
  sms boolean not null default false,
  push boolean not null default false,
  email boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  reminder_id uuid not null references public.reminders (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  channel text not null default 'in_app'
    check (channel in ('in_app', 'whatsapp', 'sms', 'push', 'email')),
  status text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'READ', 'FAILED')),
  sent_at timestamptz,
  read_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (reminder_id, recipient_id, channel)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id),
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz not null default now()
);

-- Indexes (FKs and the common "by org, newest first" lookups)
create index vehicles_org_idx on public.vehicles (organization_id, status);
create index drivers_org_idx on public.drivers (organization_id);
create index fuel_vehicle_idx on public.fuel_records (organization_id, vehicle_id, fuel_date desc);
create index trips_org_date_idx on public.trips (organization_id, trip_date desc);
create index trips_vehicle_idx on public.trips (vehicle_id, trip_date desc);
create index trips_driver_idx on public.trips (driver_id);
create index trip_revenue_trip_idx on public.trip_revenue (trip_id);
create index trip_expenses_trip_idx on public.trip_expenses (trip_id);
create index trip_expenses_vehicle_idx on public.trip_expenses (vehicle_id);
create index service_vehicle_idx on public.service_records (organization_id, vehicle_id, service_date desc);
create index sched_vehicle_idx on public.maintenance_schedules (vehicle_id);
create index sched_last_service_idx on public.maintenance_schedules (last_service_id);
create index vdoc_vehicle_idx on public.vehicle_documents (vehicle_id);
create index vdoc_expiry_idx on public.vehicle_documents (organization_id, expires_on);
create index ddoc_driver_idx on public.driver_documents (driver_id);
create index ddoc_expiry_idx on public.driver_documents (organization_id, expires_on);
create index incidents_vehicle_idx on public.incidents (vehicle_id, occurred_at desc);
create index incidents_driver_idx on public.incidents (driver_id);
create index incidents_trip_idx on public.incidents (trip_id);
create index reminders_org_status_idx on public.reminders (organization_id, status, due_on);
create index deliveries_recipient_idx on public.notification_deliveries (recipient_id, status);
create index deliveries_reminder_idx on public.notification_deliveries (reminder_id);
create index audit_entity_idx on public.audit_logs (organization_id, entity_type, entity_id, created_at desc);

-- updated_at
do $$
declare t text;
begin
  foreach t in array array[
    'organizations','profiles','vehicles','drivers','fuel_records','trips','trip_revenue',
    'trip_expenses','service_records','maintenance_schedules','vehicle_documents',
    'driver_documents','incidents','notification_preferences'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', t);
  end loop;
end $$;
