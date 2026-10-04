// Live organization-isolation check, run against the real Supabase project through the same public
// API (publishable key + a signed-in user's JWT) that the deployed app and any browser can reach.
// Nothing here uses a service-role key, so every result is exactly what RLS allows that user.
//
//   ACCOUNT_A_EMAIL=... ACCOUNT_A_PASSWORD=... ACCOUNT_B_EMAIL=... ACCOUNT_B_PASSWORD=... \
//     node --env-file=.env.local scripts/verify-org-isolation.mjs
//
// Checks, in both directions (A vs B, then B vs A):
//   1. every row the user can read in every org-scoped table belongs to their own organization;
//   2. fetching the OTHER organization's real row ids directly ("guessing an id") returns nothing;
//   3. updating the other organization's rows by id affects 0 rows;
//   4. inserting a row stamped with the other organization's id is rejected;
//   5. storage: listing / downloading under the other organization's folder returns nothing.
// Read-only in effect: the only writes attempted are ones RLS must reject (3 and 4). If one ever
// succeeded, the script reports it as a FAIL and prints the id so it can be voided.
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const accounts = ['A', 'B'].map((k) => ({
  label: k,
  email: process.env[`ACCOUNT_${k}_EMAIL`],
  password: process.env[`ACCOUNT_${k}_PASSWORD`],
}));
if (!url || !key || accounts.some((a) => !a.email || !a.password)) {
  console.error('Missing env: NEXT_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY / ACCOUNT_{A,B}_{EMAIL,PASSWORD}');
  process.exit(2);
}

// Every table that carries organization_id.
const ORG_TABLES = [
  'organizations', 'profiles', 'vehicles', 'drivers', 'maintenance_schedules', 'trips', 'trip_revenue',
  'trip_expenses', 'fuel_records', 'service_records', 'vehicle_documents', 'driver_documents',
  'general_documents', 'incidents', 'reminders', 'audit_logs',
];
// Tables probed with the other org's real ids; `col` is a free-text column used for the update attempt.
const PROBE = {
  vehicles: 'notes',
  drivers: 'notes',
  trips: 'notes',
  fuel_records: 'notes',
  trip_expenses: 'notes',
  vehicle_documents: 'document_number',
  driver_documents: 'document_number',
  general_documents: 'document_number',
};

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !detail ? '' : ` -- ${detail}`}`);
};

async function session(acct) {
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email: acct.email, password: acct.password });
  if (error || !data.user) throw new Error(`sign-in failed for account ${acct.label}: ${error?.message}`);
  const { data: prof, error: pErr } = await sb
    .from('profiles')
    .select('organization_id, role')
    .eq('id', data.user.id)
    .single();
  if (pErr) throw new Error(`no profile for account ${acct.label}: ${pErr.message}`);
  return { ...acct, sb, org: prof.organization_id, role: prof.role };
}

async function snapshot(s) {
  const out = {};
  for (const t of ORG_TABLES) {
    const col = t === 'organizations' ? 'id' : 'organization_id';
    const { data, error } = await s.sb.from(t).select(`id, ${col}`).limit(1000);
    if (error) {
      check(`[${s.label}] read ${t}`, false, error.message);
      continue;
    }
    const foreign = data.filter((r) => r[col] !== s.org);
    check(`[${s.label}] ${t}: all ${data.length} visible rows belong to own org`, foreign.length === 0, `${foreign.length} foreign`);
    out[t] = data.map((r) => r.id);
  }
  return out;
}

async function probe(attacker, victim, victimIds) {
  const tag = `[${attacker.label} -> ${victim.label}]`;
  check(`${tag} accounts are in different organizations`, attacker.org !== victim.org, 'same organization');

  const { data: org } = await attacker.sb.from('organizations').select('id').eq('id', victim.org);
  check(`${tag} cannot read the other organization's row by id`, (org ?? []).length === 0);

  for (const [t, col] of Object.entries(PROBE)) {
    const ids = (victimIds[t] ?? []).slice(0, 25);
    if (ids.length === 0) {
      console.log(`SKIP ${tag} ${t}: the other organization has no rows to probe`);
      continue;
    }
    const { data: got, error: gErr } = await attacker.sb.from(t).select('id').in('id', ids);
    check(`${tag} ${t}: select ${ids.length} known foreign ids -> 0 rows`, !gErr && got.length === 0, gErr?.message ?? `${got?.length} rows`);

    const { data: upd, error: uErr } = await attacker.sb.from(t).update({ [col]: 'rls-probe' }).in('id', ids).select('id');
    check(`${tag} ${t}: update foreign ids -> 0 rows changed`, (upd ?? []).length === 0, uErr?.message ?? `${upd?.length} changed`);
  }

  // A row stamped with the other organization's id must be rejected by the RLS WITH CHECK clause.
  const { data: ins, error: iErr } = await attacker.sb
    .from('vehicles')
    .insert({ organization_id: victim.org, name: 'RLS PROBE - must be rejected', plate_number: 'RLS-PROBE' })
    .select('id');
  check(`${tag} insert a vehicle into the other organization is rejected`, !!iErr && !(ins ?? []).length, `inserted ${JSON.stringify(ins)}`);

  const { data: files, error: lErr } = await attacker.sb.storage.from('documents').list(victim.org, { limit: 100 });
  check(`${tag} storage: list the other organization's folder -> empty`, !!lErr || files.length === 0, `${files?.length} objects`);

  // Download a real stored file of the other organization by its exact path.
  for (const t of ['vehicle_documents', 'driver_documents', 'general_documents']) {
    const { data: docs } = await victim.sb.from(t).select('file_path').not('file_path', 'is', null).limit(1);
    const path = docs?.[0]?.file_path;
    if (!path) continue;
    const { data, error } = await attacker.sb.storage.from('documents').download(path);
    check(`${tag} storage: download a known foreign file (${t}) -> denied`, !!error && !data);
  }
}

const a = await session(accounts[0]);
const b = await session(accounts[1]);
console.log(`Account A: ${a.email} role=${a.role} org=${a.org}`);
console.log(`Account B: ${b.email} role=${b.role} org=${b.org}`);
const snapA = await snapshot(a);
const snapB = await snapshot(b);
console.log(`A sees: ${Object.entries(snapA).map(([t, ids]) => `${t}=${ids.length}`).join(' ')}`);
console.log(`B sees: ${Object.entries(snapB).map(([t, ids]) => `${t}=${ids.length}`).join(' ')}`);
await probe(b, a, snapA);
await probe(a, b, snapB);
console.log(`\nRESULT: ${fail} fail / ${pass + fail} total`);
process.exit(fail ? 1 : 0);
