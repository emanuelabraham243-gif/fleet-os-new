# FleetOS — Database

Source of truth: `supabase/migrations/*.sql`, applied in filename order.
This document summarizes what those migrations actually create; when the
two disagree, the SQL wins.

## Conventions

- Money: `NUMERIC(14,2)` (or similar), ETB. Never floating point.
- Distance/quantity: `NUMERIC(10,1)` km, `NUMERIC(10,2)` liters.
- Dates: `DATE` for business dates (trip date, service date, expiry),
  `TIMESTAMPTZ` for instants (`created_at`, `occurred_at`).
- **Records are voided, never deleted.** Every operational table has
  `voided_at`, `voided_by`, `void_reason`; `DELETE` is revoked for the
  `authenticated` role on every table in `public`.
- **Composite foreign keys** — `foreign key (vehicle_id, organization_id)
  references vehicles (id, organization_id)` — make it structurally
  impossible to reference a row from another organization.
- **Unknown stays unknown.** Nullable columns like `expires_on`,
  `current_odometer`, `next_due_date` are never defaulted to a fabricated
  value; derived views map `NULL` to a `'UNKNOWN'` status instead of
  `'EXPIRED'` or `'OK'`.

## Core tables

`organizations`, `profiles` (role: `admin`/`staff`, language: `am`/`en`),
`vehicles`, `drivers`, `fuel_records`, `trips`, `trip_revenue`,
`trip_expenses`, `service_records`, `maintenance_schedules`,
`vehicle_documents`, `driver_documents`, `incidents`, `reminders`,
`notification_preferences`, `notification_deliveries`, `audit_logs`.

Field-level detail (exact columns, checks, and defaults) lives in
`supabase/migrations/20260921000001_core_schema.sql` — it is short enough
to read directly rather than duplicate here and risk drifting out of sync.

## Derived views (never store what can be computed)

- `v_vehicle_documents` / `v_driver_documents` — adds `status`
  (`VALID`/`EXPIRING_SOON`/`EXPIRED`/`UNKNOWN`) and `superseded` (a newer
  document of the same type already replaced this one).
- `v_trip_financials` — `profit = revenue - expenses`, computed per trip.
  No revenue recorded means `profit` is `NULL` (insufficient data), not 0.
- `v_maintenance_status` — combines date-based and odometer-based due
  logic into one `overall_status` (`OVERDUE`/`DUE_SOON`/`OK`/`UNKNOWN`).

All three use `security_invoker = true`, so the querying user's own RLS
policies apply to the underlying tables — a view is never a way around RLS.

## Triggers (business rules enforced in the database, not just the UI)

- `guard_row()` — organization_id is immutable; only an admin may void or
  restore a record; a reason is mandatory to void; void metadata is frozen
  once set.
- `audit_row()` — writes every insert/update/delete (and specifically
  void/restore) to `audit_logs` with a JSON `before`/`after` snapshot.
- `trip_before()` / `trip_after()` — a trip can only go `IN_PROGRESS` if
  the driver is active and the vehicle isn't `MAINTENANCE`/
  `OUT_OF_SERVICE`; a unique partial index
  (`trips_one_in_progress_per_vehicle`) makes "one open trip per vehicle"
  race-proof at the database level, not just checked in application code.
  Vehicle `status` (`AVAILABLE` ⇄ `ON_TRIP`) is refreshed automatically.
- `sync_vehicle_odometer()` — a fuel or service record's odometer reading
  only ever moves `vehicles.current_odometer` forward.
- `roll_maintenance_schedule()` — a new (non-backdated) service record
  rolls the matching schedule's next-due date/odometer forward.

## Row Level Security

Every table is scoped to `organization_id = private.current_org_id()`.
Master data (`vehicles`, `drivers`, `maintenance_schedules`) requires
`private.is_admin()` to insert or update. Operational records can be
created by any authenticated staff member of the organization; only an
admin can void one. Full policies are in
`supabase/migrations/20260921000002_rls_audit_triggers.sql` — see
`docs/SECURITY.md` for the authorization model in prose.

## Storage

One private bucket, `documents`, 10 MB limit, JPEG/PNG/WebP/PDF only.
Objects are namespaced by organization id as the first path segment, and
storage policies enforce that a user can only read/write inside their own
organization's folder.
