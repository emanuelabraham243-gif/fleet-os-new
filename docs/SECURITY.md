# FleetOS — Security

## Authentication and authorization

- Supabase Auth issues the session; `requireViewer()`
  (`src/lib/auth.ts`) is called at the top of every authenticated
  page/action and redirects to `/login` if there is no session or no
  matching `profiles` row.
- A profile is only ever created by the `handle_new_user()` trigger, which
  reads `organization_id`/`role` from `raw_app_meta_data` — never from
  `raw_user_meta_data`, which the user themselves can edit. A user cannot
  join an existing organization or give themselves a role in one.
- Public sign-up is off (revision pass 5). There is no `/signup` page, and
  `handle_new_user()` raises for any new `auth.users` row without
  `app_metadata.organization_id` (`20261004000001_disable_self_signup.sql`),
  so a sign-up made directly against the Supabase Auth API with the
  publishable key is rejected too and creates nothing. New accounts are
  provisioned by an admin in the Supabase dashboard with
  `app_metadata.organization_id` (and optionally `role`).
- `scripts/verify-org-isolation.mjs` checks isolation live, as two real
  signed-in users through the public API (no service-role key): each sees
  only its own organization's rows, and reading/updating the other's rows by
  exact id, inserting into the other organization, and listing/downloading
  its stored files are all refused.
- Two roles: `admin`, `staff`. `isAdmin(profile)` gates admin-only UI
  (voiding records, adding/editing vehicles, drivers, and maintenance
  schedules); the real enforcement is server-side, in RLS.

## The client is never trusted with `organization_id`

Every server action re-derives `organization_id` from the authenticated
caller's own profile (`profile.organization_id`) and passes that to
Supabase — a request can't write into another organization by supplying a
different id in the form payload, and even if it tried, RLS would reject
it independently. See `docs/DATABASE.md` → Row Level Security.

## Row Level Security

RLS is enabled on every table that holds organization-scoped data. No
table is exempted. The service-role key is never used from the browser or
in any client bundle — only the publishable key (`NEXT_PUBLIC_SUPABASE_*`
in `.env.local`) ships to the client, and `.env.local` is gitignored.

## File uploads

Documents are stored in a single **private** Storage bucket, limited to
10 MB and to `image/jpeg`, `image/png`, `image/webp`, `application/pdf`
(`src/lib/file-sniff.ts` verifies the actual file content, not just the
extension/declared MIME type, before accepting an upload). Storage
policies namespace every object under the caller's `organization_id` as
the first path segment, so cross-organization access is impossible even
with a guessed URL.

## Auditability

Every insert, update, void, and restore on an audited table is written to
`audit_logs` with a `before`/`after` JSON snapshot and the acting user's
id, by a database trigger — this cannot be bypassed by going around the
Next.js app (e.g. a direct SQL client) as long as the connection uses the
same authenticated role.

## What "voided, never deleted" buys

`DELETE` is revoked for the `authenticated` Postgres role on every table in
`public`. Combined with the audit log, no operational record can silently
disappear — a mistaken entry is voided with a mandatory reason, and the
history remains inspectable.

## Reviewed

This codebase went through an explicit ECC security-review pass; see the
`fix: apply security, correctness and UX review findings` commit and the
hardening in `20260921000006_review_fixes.sql` (stricter void-guard rules,
a race-proof single-in-progress-trip constraint, and an atomic
trip+revenue RPC to remove a create-then-fail-halfway window).
