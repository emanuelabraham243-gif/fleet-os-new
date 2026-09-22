# FleetOS — Decisions

Notable tradeoffs actually made in this codebase, and why.

## Odometer only moves forward automatically

`sync_vehicle_odometer()` updates `vehicles.current_odometer` only when a
new fuel/service reading is *higher* than the stored value. This means a
mistyped high reading (e.g. `1420300` instead of `142030`) would move the
vehicle's "current" odometer far into the future and can't be
auto-corrected by a later, correct, lower reading.

**Mitigation chosen:** the create-record form flags a large forward jump
and requires an explicit "save anyway" confirmation
(`odometerJumpNeedsConfirm` in `src/lib/maintenance-rules.ts`, wired into
`maintenance/actions.ts`), and every write is audit-logged with a
`before`/`after` snapshot, so a mistake is visible and traceable to an
actor even though it isn't blocked outright. An admin can then correct the
vehicle's record; the bad fuel/service record itself is voided (with a
reason), not deleted.

**Why not just let any reading move it in either direction?** Because a
genuinely backdated entry (staff catching up on paperwork from a few days
ago) is common and legitimate, and would otherwise fight with the
"forward only" rule in the wrong direction — allowing backward movement
from *any* record would let a single mistake silently erase real mileage.

## Vehicles and drivers are admin-only master data

RLS requires `is_admin()` to insert or update `vehicles`/`drivers`/
`maintenance_schedules`; staff can create operational records (trips,
fuel, expenses, documents, incidents) but not the fleet's master data
itself. This matches "STAFF/OPERATOR" being an operational role, and
avoids an ordinary user accidentally renaming a vehicle everyone depends
on. The corresponding add/edit UI (`/vehicles` → "Add vehicle",
`/vehicles/[id]` → "Edit vehicle", `/drivers`) is admin-gated in the page
itself as well, purely for a better error experience — RLS is what
actually enforces it.

**Vehicle status while on a trip:** the edit form omits the status field
entirely while a vehicle has an open trip, and the server action
re-checks and drops any submitted status change in that case too. This
prevents an admin's edit from ever contradicting the trip-driven
`ON_TRIP` state, which is otherwise maintained automatically by
`refresh_vehicle_status()`.

## Reminders run in the database, not the app

`private.generate_reminders()` is scheduled with `pg_cron` rather than
triggered by a page load or a Next.js cron route. A browser does not need
to be open for a reminder to fire, and there is exactly one execution path
to reason about instead of "also make sure the app re-checks this."

## GPS is an abstraction with only a mock provider in V1

`src/lib/gps.ts` exists specifically so a real provider can be added later
without touching the UI, per the master build prompt's explicit
requirement. No real GPS integration exists yet because no provider/device
was specified; inventing one would have meant fabricated business fields,
which section 4 of the build prompt rules out.

## Demo data is one whole organization, not per-record flags

`organizations.is_demo` is the only "this is a demo" marker in the schema
(see `supabase/migrations/20260922000001_demo_data.sql`) — individual rows
are not flagged. The UI shows a demo banner whenever the signed-in user's
organization has `is_demo = true`. Moving a client from demo to production
means creating their own organization (not flipping the demo one to
`false`), keeping the sample data clearly separate from real records
rather than merged into the same organization.

## GitHub repository name

The build prompt names the target repository `fleet-os`; the repository
actually connected as `origin` is `fleet-os-new`
(`github.com/emanuelabraham243-gif/fleet-os-new`) — `fleet-os` does not
exist under that account. This is a naming difference only; the repository
in use has full history and is the one being pushed to.
