# FleetOS — Workflows

The workflows below are what the implemented UI actually supports.

## Onboarding a real client

1. An admin creates vehicles and drivers (`/vehicles` → "Add vehicle",
   `/drivers` → "Add driver"). Odometer, make/model/year and license
   details are optional and left blank when unknown — never guessed.
2. Vehicle and driver documents are added under `/documents`.
3. Maintenance schedules (interval by km and/or by days) are added per
   vehicle from `/maintenance`.

Every new organization starts with **no** operational history; nothing is
fabricated to make the Command Center look busy on day one — empty states
say so explicitly (`vehicles.empty`, `home.noVehicles`, etc.).

## Trip lifecycle

`PLANNED → IN_PROGRESS → COMPLETED` (or `CANCELLED` at any point).

- **New trip** (`/new/trip`): choose an available/on-trip vehicle and an
  active driver, set origin/destination/date, optionally record revenue in
  the same step (`create_trip_with_revenue`, one transaction).
- Starting a trip (`IN_PROGRESS`) is blocked if the vehicle is in
  maintenance/out of service, or already has another trip in progress —
  enforced by a database trigger and a unique index, not just client-side
  validation, so it can't race.
- Completing a trip does not require revenue to already be recorded; if it
  isn't within a couple of days, the reminder engine raises
  `MISSING_TRIP_REVENUE` on the Command Center.
- Expenses (`/expenses` → pick the trip) are categorized
  (fuel, driver allowance, toll, loading, parking, repair, fine, other) and
  must belong to the same vehicle as the trip.

## Recording fuel

`/new/fuel`: vehicle, date, fuel type, quantity (L), unit price, and the
total as written on the receipt. If quantity × unit price doesn't match
the written total by more than 0.50 ETB, the record still saves — the
discrepancy is surfaced (`amount_mismatch`), never silently corrected or
rejected. A recorded odometer reading only ever advances the vehicle's
stored `current_odometer`, so an earlier/lower backdated reading is safe
to enter without corrupting the current value.

## Maintenance

Two independent ways to define "due": a day interval, a distance interval,
or both. `/maintenance` shows schedules grouped into overdue/due soon/ok,
with the reason spelled out when a schedule can't be evaluated (missing
odometer, no due date set). Recording a new service (`/maintenance` → "Add
service") rolls the matching schedule forward automatically if it isn't
backdated before the schedule's last known service.

## Documents

`/documents` covers both vehicle and driver documents. A document with no
`expires_on` shows `UNKNOWN`, never `EXPIRED`. Uploading a new document of
the same type marks the older one `superseded` rather than deleting it —
the paper trail is kept.

## Incidents

`/new/incident`: a neutral, factual record (what happened, when, which
vehicle/driver/trip if relevant). Incidents show up in the Vehicle File and
in Command Center's "Attention required" while `OPEN`.

## Reminders and notifications

See `docs/REMINDERS.md`. From the user's side: the Command Center's
"Upcoming reminders" section and `/notifications` are the two places
reminders surface; both are driven by the same server-generated `reminders`
rows, never computed ad hoc in the browser.
