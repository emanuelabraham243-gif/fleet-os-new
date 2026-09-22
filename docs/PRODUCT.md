# FleetOS — Product

FleetOS is the digital version of the operational vehicle files and daily
paper records a small Ethiopian transport business already keeps. It is not
a GPS tracking product; GPS is one optional data source among several. The
core question the product answers for the owner is:

> "What is happening with my vehicles, trips, expenses, maintenance,
> documents, and upcoming responsibilities?"

## Who uses it

- **Admin / Owner** — manages vehicles, drivers, maintenance schedules, and
  can void or correct records.
- **Staff / Operator** — records day-to-day operational data (trips, fuel,
  expenses, documents, incidents) from a phone.

Both roles sign in with Supabase Auth and belong to exactly one
organization (see `docs/DATABASE.md`).

## V1 screens

1. **Command Center** (`/`) — fleet counts, "Attention required" list,
   quick actions (record fuel, new trip, report an issue), upcoming
   reminders, and an optional GPS section at the bottom.
2. **Vehicle File** (`/vehicles`, `/vehicles/[id]`) — the digital version of
   one truck's paper folder: current driver, status, cost/km, fuel
   efficiency, profit this month, current trip, recent history (fuel,
   service, trips merged), documents, and incidents. Admins can add and
   edit vehicles here.
3. **Trips** (`/trips`, `/new/trip`) — plan, start, and complete trips;
   revenue and expenses roll up into a profit figure per trip.
4. **Maintenance** (`/maintenance`) — due/overdue schedules by date and/or
   odometer, plus service history. Admins can add schedules.
5. **Trip Expenses** (`/expenses`) — expenses grouped by trip, with revenue
   and profit shown alongside.
6. **Documents** (`/documents`) — vehicle and driver documents with
   VALID / EXPIRING_SOON / EXPIRED / UNKNOWN status.

**Drivers** (`/drivers`) is reachable from the Vehicles page but is
intentionally not a bottom-navigation item, matching the master prompt's
core V1 navigation list. **Incidents** exist in the database and on the
Vehicle File but likewise have no dedicated primary navigation entry.

Nothing outside this list (CRM, warehouse, invoicing, dispatch, payroll,
route optimization, etc.) is in V1, by design.

## Product principles actually enforced in the code

- **Unknown is a valid state.** A vehicle's `current_odometer`, a
  document's `expires_on`, or a maintenance schedule's due date can all be
  `NULL`. The UI shows "Unknown" or "Insufficient data" rather than a
  fabricated number — see the `reason` messages in the Vehicle File metrics
  and `UNKNOWN` status codes throughout.
- **Facts are separated from interpretation.** GPS surfaces "Last signal
  received 47 minutes ago," never a claim about where the vehicle is now
  (`src/lib/gps.ts`). Fuel discrepancies are surfaced as
  `amount_mismatch`, never silently corrected (see `docs/DECISIONS.md`).
- **Important changes are auditable and reversible.** Operational records
  are voided, never deleted (`voided_at`/`void_reason`), and every insert,
  update, void, and restore is written to `audit_logs`.
