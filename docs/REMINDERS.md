# FleetOS — Reminders

Reminders are a core V1 feature, not an afterthought: the goal is to help
the owner prepare ahead of a deadline, not only report that something is
already overdue.

## Where it runs

Entirely in Postgres, not in the Next.js app:
`private.generate_reminders()` (defined in
`supabase/migrations/20260921000003_views_reminders.sql`, hardened in
`20260921000006_review_fixes.sql`) is scheduled with `pg_cron` to run daily
at 03:00 UTC (06:00 Africa/Addis_Ababa). It runs whether or not a browser
is open, and re-running the migration simply replaces the existing job of
the same name rather than creating a duplicate.

## Architecture

```
business condition (a query over vehicles/drivers/trips/documents/...)
  -> a row with a stable dedupe_key
  -> reminders (upsert on (organization_id, dedupe_key))
  -> notification_deliveries (one row per recipient per channel)
```

## Idempotency

Every condition the engine checks maps to a deterministic `dedupe_key`
(e.g. `'maint-date:' || schedule_id || ':' || due_date || ':overdue'`).
Insertion is `on conflict (organization_id, dedupe_key) do nothing` (or,
after the review-fixes migration, a conditional `do update` that only
reopens a reminder the engine itself previously auto-completed). Running
the job twice in a row, or twice in the same day, never creates duplicate
reminders.

## Conditions currently generated

`VEHICLE_DOCUMENT_EXPIRY`, `DRIVER_DOCUMENT_EXPIRY`,
`DRIVER_LICENSE_EXPIRY` (documents/licenses expiring within 30 days, high
priority inside 7 days; a document already superseded by a newer one is
excluded), `MAINTENANCE_DUE` (date- and odometer-based, separately),
`UPCOMING_TRIP` (a planned trip starting today or tomorrow),
`MISSING_FUEL_RECORD` (a vehicle had a trip in the last 7 days but no fuel
record in that window), `MISSING_TRIP_REVENUE` (a trip completed 2+ days
ago with no revenue recorded), `STALE_TRIP` (a trip has been `IN_PROGRESS`
for 7+ days).

## Lifecycle

A reminder is `PENDING` until its condition no longer holds, at which point
the engine marks it `COMPLETED` (with `auto_completed = true`) — the user
never has to dismiss something that resolved itself. If the same condition
reappears later, that auto-completed reminder is reopened rather than a
new one created. A user-completed or user-dismissed reminder is never
silently reopened by the engine.

## Notifications

Each `PENDING` reminder gets one `notification_deliveries` row per
recipient whose `notification_preferences.in_app` is true (the default),
`on conflict (reminder_id, recipient_id, channel) do nothing` — so a
recipient is never notified twice for the same reminder on the same
channel. `channel` already models `whatsapp`/`sms`/`push`/`email` in the
schema; only `in_app` is actually delivered in V1. Adding a real channel
means writing a sender for it and flipping delivery status — no schema or
reminder-engine change required.

## Language

Reminder **text is not stored** — `reminders.type` + `reminders.params`
(JSON) are stored, and the UI renders the message in the viewer's own
language via `src/locales/*.ts` → `reminders.<TYPE>` templates
(`src/components/home/reminder-text.ts`). The same reminder row displays
correctly in Amharic or English depending on who's looking at it.
