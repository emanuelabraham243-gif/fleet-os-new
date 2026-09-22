# FleetOS — Architecture

## Stack

- **Next.js 16** (App Router, Turbopack), React 19, TypeScript.
- **Supabase**: Postgres (source of truth), Auth, Storage (private
  `documents` bucket).
- **Tailwind CSS 4** for a phone-first UI.
- **Zod** for server-side form validation.
- **Vitest** for unit tests of pure logic.

## Request flow

Every page under `src/app/(app)/` is a React Server Component that:

1. Calls `requireViewer()` (`src/lib/auth.ts`), which reads the Supabase
   session, loads the caller's `profiles` row (organization, role,
   language), and redirects to `/login` if either is missing.
2. Queries Supabase directly with the user's own session (the anon/publishable
   key plus RLS — see `docs/SECURITY.md`), never the service-role key.
3. Renders server-side; mutations go through **Server Actions**
   (`'use server'` files named `actions.ts` next to each page) that
   re-validate the caller, validate input with Zod, and write through
   Supabase, relying on RLS and database triggers as the real
   authorization boundary — the client can't be trusted to enforce
   `organization_id`.

Client components are only used where interactivity requires it (forms,
navigation, the online/offline banner). See `src/components/forms-core.tsx`
for the shared field/validation/error-display primitives every form in the
app reuses.

## Directory layout

```
src/app/(app)/          Authenticated routes (one folder per feature)
  <feature>/page.tsx       Server Component: reads data, renders
  <feature>/actions.ts     'use server': validates + writes
  <feature>/*-form.tsx     Client Component: the form itself
src/app/auth/            OAuth/magic-link callback
src/app/login/           Sign-in
src/components/          Shared UI (Card, PageHeader, StatusBadge, nav, forms-core)
src/lib/                 Pure logic + Supabase clients (auth, i18n, gps, calc, ...)
src/locales/             en (source of truth) / am dictionaries, merged in index.ts
supabase/migrations/     Numbered, applied-in-order SQL migrations
supabase/tests/          SQL sanity checks (db_checks.sql)
```

## Derived state lives in Postgres, not the client

Vehicle status transitions (`AVAILABLE` ⇄ `ON_TRIP`), odometer sync from
fuel/service records, and maintenance schedule roll-forward are all
triggers in `supabase/migrations/20260921000002_rls_audit_triggers.sql`.
The app never computes or trusts these from the client; it only reads the
result. `MAINTENANCE`/`OUT_OF_SERVICE` are the two states an admin sets
manually (via the Vehicle File edit form), and the trigger is written to
never overwrite them.

## GPS abstraction

`src/lib/gps.ts` defines a provider-agnostic `GpsProvider` interface
(`getLatest(vehicleIds)`) and a single swap point, `getGpsProvider()`.
V1 ships only `MockGpsProvider`, which deterministically returns a mix of
LIVE / DELAYED / OFFLINE / UNKNOWN signals so the UI states can be
demonstrated without a real tracker. Adding a real provider (REST, webhook,
MQTT, TCP, CSV) means implementing `GpsProvider` and changing
`getGpsProvider()` — no UI changes required.

## Reminders and notifications

See `docs/REMINDERS.md` for the full design — the short version is that the
reminder engine runs entirely in Postgres (`private.generate_reminders()`,
scheduled with `pg_cron`), not in the Next.js app, so it runs whether or
not a browser is open.
