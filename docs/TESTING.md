# FleetOS — Testing

## What's actually covered

Vitest unit tests target **pure logic in `src/lib/*.ts`** — the functions
that decide calculations, statuses, and validation rules — not page
components, server actions, or the database itself:

- `calc.test.ts`, `vehicle-file.test.ts` — cost/km, fuel efficiency,
  monthly profit, and the "insufficient data" reasons each one returns.
- `trip-rules.test.ts`, `maintenance-rules.test.ts` — trip/maintenance
  status derivation.
- `money.test.ts`, `format.test.ts` — decimal/money parsing and
  formatting (no floating-point drift).
- `schemas.test.ts`, `action-helpers.test.ts` — Zod validation and the
  Postgres-error-to-user-message mapping.
- `gps.test.ts` — signal classification (`LIVE`/`DELAYED`/`OFFLINE`/
  `UNKNOWN`) and the mock provider.
- `file-sniff.test.ts` — upload content-type verification.
- `i18n.test.ts` — see `docs/LOCALIZATION.md`; this is the one test file
  that also statically scans every `.tsx`/`.ts` file in `src/` for
  `t()`/`label()` calls, so it doubles as a check on the pages and forms
  themselves without needing to render them.

Run: `npm run typecheck && npm run lint && npm test && npm run build`
(all four pass as of this writing — see `docs/DECISIONS.md` for anything
notable found and fixed along the way).

## Database checks

`supabase/tests/db_checks.sql` — SQL sanity checks run directly against
the database (RLS behavior, constraints) rather than through the app.

## What's not covered by an automated test

Page-level and server-action logic (`page.tsx`, `actions.ts`,
`*-form.tsx`) is exercised by the TypeScript compiler and the i18n
literal-key scan, but has no behavioral test suite — correctness there
depends on manual workflow testing against a real Supabase project (see
`docs/WORKFLOWS.md` for the workflows to walk through) and the review
passes already recorded in `docs/DECISIONS.md`. This matches the "smallest
useful system" principle: pure logic is cheap and valuable to unit test;
re-testing what RLS and Next.js already guarantee is not.
