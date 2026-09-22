-- FleetOS V1 demo data. One organization with organizations.is_demo = true; every
-- business record below belongs to it. The app shows a "demo data" banner (see
-- src/app/(app)/layout.tsx) whenever the signed-in user's organization has is_demo = true,
-- so demo and real client data are never presented as the same thing.
--
-- To sign in and see this data, attach a Supabase Auth user to the printed organization id:
--   * New user: create via the Admin API (supabase.auth.admin.createUser) with
--       app_metadata: { "organization_id": "<id from the NOTICE below>", "role": "admin" }
--     The on_auth_user_created trigger creates the matching profile automatically.
--   * Existing user: that trigger only fires on INSERT into auth.users, so instead insert a
--     row directly, e.g.:
--       insert into public.profiles (id, organization_id, role, full_name, language)
--       values ('<existing auth.users.id>', '<org id>', 'admin', 'Owner', 'am');
--
-- All amounts are ETB, all distances km, dates relative to "today" in Africa/Addis_Ababa
-- so the reminder engine (expiring documents, overdue maintenance, missing records) has
-- something to demonstrate the day this migration is applied.

do $$
declare
  v_org uuid;
  v_v1 uuid; v_v2 uuid; v_v3 uuid; v_v4 uuid;
  v_d1 uuid; v_d2 uuid; v_d3 uuid; v_d4 uuid;
  v_t1 uuid; v_t2 uuid; v_t3 uuid;
  v_today date := (now() at time zone 'Africa/Addis_Ababa')::date;
begin
  insert into public.organizations (name, is_demo)
  values ('FleetOS Demo', true)
  returning id into v_org;

  -- ---------------------------------------------------------------- vehicles
  insert into public.vehicles
    (organization_id, name, plate_number, make, model, year, status, current_odometer, notes)
  values
    (v_org, 'Truck 1', 'AA-12345', 'Isuzu', 'FRR', 2018, 'AVAILABLE', 142300, 'Demo data.'),
    (v_org, 'Truck 2', 'AA-23456', 'Sinotruk', 'Howo', 2020, 'AVAILABLE', 88450, 'Demo data.'),
    (v_org, 'Truck 3', 'AA-34567', 'Isuzu', 'NPR', 2016, 'MAINTENANCE', 201870, 'Demo data.'),
    (v_org, 'Truck 4', 'AA-45678', 'Mitsubishi Fuso', 'Canter', 2021, 'AVAILABLE', 51200, 'Demo data.');

  select id into v_v1 from public.vehicles where organization_id = v_org and plate_number = 'AA-12345';
  select id into v_v2 from public.vehicles where organization_id = v_org and plate_number = 'AA-23456';
  select id into v_v3 from public.vehicles where organization_id = v_org and plate_number = 'AA-34567';
  select id into v_v4 from public.vehicles where organization_id = v_org and plate_number = 'AA-45678';

  -- ---------------------------------------------------------------- drivers
  insert into public.drivers
    (organization_id, name, phone, license_number, license_expiry, status, notes)
  values
    (v_org, 'Abebe Kebede', '+251911223344', 'DL-10234', v_today + 120, 'ACTIVE', 'Demo data.'),
    (v_org, 'Chaltu Bekele', '+251922334455', 'DL-10567', v_today + 20, 'ACTIVE', 'Demo data.'),
    (v_org, 'Dawit Alemu', '+251933445566', 'DL-10890', v_today - 10, 'ACTIVE', 'Demo data.'),
    (v_org, 'Selam Tesfaye', '+251944556677', null, null, 'ACTIVE', 'Demo data. License not on file yet.');

  select id into v_d1 from public.drivers where organization_id = v_org and name = 'Abebe Kebede';
  select id into v_d2 from public.drivers where organization_id = v_org and name = 'Chaltu Bekele';
  select id into v_d3 from public.drivers where organization_id = v_org and name = 'Dawit Alemu';
  select id into v_d4 from public.drivers where organization_id = v_org and name = 'Selam Tesfaye';

  -- ---------------------------------------------------------------- trips + revenue + expenses
  -- Completed, fully recorded.
  insert into public.trips (organization_id, vehicle_id, driver_id, trip_date, origin, destination, status, notes)
  values (v_org, v_v1, v_d1, v_today - 5, 'Addis Ababa', 'Adama', 'COMPLETED', 'Demo data.')
  returning id into v_t1;
  insert into public.trip_revenue (organization_id, trip_id, amount, revenue_date, description)
  values (v_org, v_t1, 8500.00, v_today - 5, 'Cargo delivery');
  insert into public.trip_expenses (organization_id, trip_id, vehicle_id, category, amount, expense_date, description)
  values
    (v_org, v_t1, v_v1, 'DRIVER_ALLOWANCE', 300.00, v_today - 5, null),
    (v_org, v_t1, v_v1, 'TOLL', 50.00, v_today - 5, null);

  insert into public.trips (organization_id, vehicle_id, driver_id, trip_date, origin, destination, status, notes)
  values (v_org, v_v2, v_d2, v_today - 3, 'Addis Ababa', 'Hawassa', 'COMPLETED', 'Demo data.')
  returning id into v_t2;
  insert into public.trip_revenue (organization_id, trip_id, amount, revenue_date, description)
  values (v_org, v_t2, 12000.00, v_today - 3, 'Cargo delivery');
  insert into public.trip_expenses (organization_id, trip_id, vehicle_id, category, amount, expense_date, description)
  values
    (v_org, v_t2, v_v2, 'TOLL', 100.00, v_today - 3, null),
    (v_org, v_t2, v_v2, 'PARKING', 50.00, v_today - 3, null);

  -- Completed but revenue not yet recorded: demonstrates the MISSING_TRIP_REVENUE reminder.
  insert into public.trips (organization_id, vehicle_id, driver_id, trip_date, origin, destination, status, notes)
  values (v_org, v_v1, v_d1, v_today - 4, 'Adama', 'Addis Ababa', 'COMPLETED', 'Demo data.')
  returning id into v_t3;

  -- Open trip: the trip_after trigger moves Truck 4 to ON_TRIP automatically.
  insert into public.trips (organization_id, vehicle_id, driver_id, trip_date, origin, destination, status, notes)
  values (v_org, v_v4, v_d4, v_today - 1, 'Addis Ababa', 'Bishoftu', 'IN_PROGRESS', 'Demo data.');

  -- Planned, upcoming: demonstrates the UPCOMING_TRIP reminder.
  insert into public.trips (organization_id, vehicle_id, driver_id, trip_date, origin, destination, status, notes)
  values (v_org, v_v2, v_d3, v_today + 1, 'Addis Ababa', 'Debre Zeit', 'PLANNED', 'Demo data.');

  -- ---------------------------------------------------------------- fuel (Truck 2 deliberately
  -- has no recent fuel record: demonstrates the MISSING_FUEL_RECORD reminder)
  insert into public.fuel_records
    (organization_id, vehicle_id, fuel_date, fuel_type, quantity, unit_price, total_amount, odometer, notes)
  values
    -- total_amount as written on the receipt differs from quantity x unit_price by more than
    -- 0.50 ETB: amount_mismatch is surfaced, never silently corrected.
    (v_org, v_v1, v_today - 5, 'DIESEL', 120.00, 55.00, 6550.00, 141800, 'Demo data.'),
    (v_org, v_v4, v_today - 1, 'DIESEL', 60.00, 55.00, 3300.00, 51100, 'Demo data.');

  -- ---------------------------------------------------------------- maintenance
  insert into public.maintenance_schedules
    (organization_id, vehicle_id, service_category, interval_km, next_due_odometer)
  values (v_org, v_v1, 'OIL_CHANGE', 8000, 142400); -- due soon (100 km away)

  insert into public.maintenance_schedules
    (organization_id, vehicle_id, service_category, interval_days, next_due_date)
  values (v_org, v_v2, 'GENERAL_SERVICE', 90, v_today - 3); -- overdue

  insert into public.maintenance_schedules
    (organization_id, vehicle_id, service_category, interval_km, interval_days, next_due_date, next_due_odometer)
  values (v_org, v_v4, 'TIRES', 10000, 180, v_today + 60, 60700); -- ok

  insert into public.service_records
    (organization_id, vehicle_id, service_date, category, description, odometer, cost, service_provider)
  values (v_org, v_v3, v_today - 2, 'GENERAL_SERVICE', 'Demo data.', 201850, 4500.00, 'Bole Garage');

  -- ---------------------------------------------------------------- documents
  insert into public.vehicle_documents
    (organization_id, vehicle_id, document_type, document_number, issued_on, expires_on)
  values
    (v_org, v_v1, 'INSURANCE', 'INS-2024-0091', v_today - 355, v_today + 10),      -- expiring soon
    (v_org, v_v1, 'REGISTRATION', 'LB-778812', v_today - 200, v_today + 200),      -- valid
    (v_org, v_v2, 'ANNUAL_INSPECTION', 'BOLO-4471', v_today - 370, v_today - 5),   -- expired
    (v_org, v_v3, 'INSURANCE', null, null, null);                                 -- unknown, never fabricated

  insert into public.driver_documents
    (organization_id, driver_id, document_type, document_number, issued_on, expires_on)
  values (v_org, v_d2, 'MEDICAL_CERTIFICATE', 'MED-3391', v_today - 350, v_today + 15); -- expiring soon

  -- ---------------------------------------------------------------- incidents (neutral, factual)
  insert into public.incidents (organization_id, vehicle_id, driver_id, occurred_at, title, description, status)
  values (
    v_org, v_v3, v_d3, now() - interval '3 days',
    'Minor bumper scrape in the yard',
    'Demo data. Reported by staff while reversing; no injuries.',
    'OPEN'
  );

  raise notice 'FleetOS demo organization id: %', v_org;
end $$;
