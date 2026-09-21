-- FleetOS V1 database checks (RLS, org isolation, roles, triggers, views, reminders, storage).
--
-- HOW TO RUN (safe on a project with real/demo data):
--   Each run = ONE statement batch (one mcp__supabase__execute_sql call, or one psql -f file)
--   made of PART 0 (harness + fixtures) followed by exactly ONE of BLOCK 1 / 2 / 3 below.
--   Every block ends with `RAISE EXCEPTION 'RESULT (...)'`, which ROLLS BACK everything, including
--   the temporary organizations 'ZZ Test A/B', their auth users and all rows. Read the PASS/FAIL
--   lines from the error text. Expected: "RESULT (0 fail / N total)".
--   Blocks re-create their own fixtures, so they can run in any order.
--   Last verified 2026-09-21 (after 20260921000006): block 1 = 239 checks, block 2 = 105, block 3 = 139,
--   block 4 (review fixes p-u) = 124; 0 fails.
--   (Block 1's (e)-DELETE and (g)-anon table loops were afterwards changed to capture the table list as
--   superuser first; the anon read loop was verified in block 2's earlier form, all 22 tables denied.)
--
-- Fixture ids are '00000000-0000-0000-0000-000000000' || 3 hex chars; tokens such as {oA} inside
-- SQL strings are replaced by pg_temp.sub(). oA/oB = orgs; uAa/uAs = admin/staff of A; uBa/uBs = of B;
-- vA.. vehicles; dA.. drivers; tA/tB trips; x1..x9 spare ids.

-- ======================================================================= PART 0
create temp table res(line text); grant all on res to public;
create temp table ids(k text, v uuid); grant all on ids to public;
insert into ids select k, ('00000000-0000-0000-0000-000000000'||h)::uuid from (values
('oA','a00'),('oB','b00'),('uAa','a01'),('uAs','a02'),('uBa','b01'),('uBs','b02'),
('vA','a11'),('vA2','a12'),('vA3','a13'),('vA4','a14'),('vA5','a15'),('vA6','a16'),('vB','b11'),
('dA','a21'),('dA2','a22'),('dB','b21'),('tA','a31'),('tB','b31'),
('fA','a41'),('fB','b41'),('eA','a51'),('eB','b51'),('rA','a61'),('rB','b61'),('sA','a71'),('sB','b71'),
('msA','a81'),('msB','b81'),('vdA','a91'),('vdB','b91'),('ddA','aa1'),('ddB','ba1'),('incA','ab1'),('incB','bb1'),
('x1','c01'),('x2','c02'),('x3','c03'),('x4','c04'),('x5','c05'),('x6','c06'),('x7','c07'),('x8','c08'),('x9','c09')) x(k,h);
create function pg_temp.sub(q text) returns text language plpgsql as $f$
declare r record; begin for r in select k,v from pg_temp.ids loop q := replace(q,'{'||r.k||'}', quote_literal(r.v::text)); end loop; return q; end $f$;
create function pg_temp.ex(q text) returns text language plpgsql as $f$
declare n bigint; begin execute pg_temp.sub(q); get diagnostics n = row_count; return 'OK:'||n;
exception when others then return 'ERR:'||sqlstate||':'||sqlerrm; end $f$;
create function pg_temp.t(q text) returns text language plpgsql as $f$
declare r text; begin execute pg_temp.sub(q) into r; return r; end $f$;
create function pg_temp.chk(nm text, c boolean, d text default '') returns void language plpgsql as $f$
begin insert into pg_temp.res values (case when c then 'PASS ' else 'FAIL ' end || nm || case when c then '' else ' -- ' || coalesce(d,'null') end); end $f$;
create function pg_temp.exp(nm text, q text, want text) returns void language plpgsql as $f$
declare r text := pg_temp.ex(q); c boolean;
begin c := case want when 'err' then r like 'ERR:%' when 'ok1' then r = 'OK:1' when 'ok' then r like 'OK:%'
  when 'blocked' then (r like 'ERR:%' or r = 'OK:0') else r like 'ERR:'||want||'%' end;
  perform pg_temp.chk(nm, c, r); end $f$;
create function pg_temp.eq(nm text, q text, want text) returns void language plpgsql as $f$
declare r text := pg_temp.t(q); begin perform pg_temp.chk(nm, r is not distinct from want, r); end $f$;
create function pg_temp.as_user(k text) returns void language plpgsql as $f$
begin reset role; perform set_config('request.jwt.claims', json_build_object('sub',(select v from pg_temp.ids where ids.k=as_user.k),'role','authenticated')::text, true); set local role authenticated; end $f$;
create function pg_temp.as_anon() returns void language plpgsql as $f$
begin reset role; perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true); set local role anon; end $f$;
create function pg_temp.as_su() returns void language plpgsql as $f$
begin reset role; perform set_config('request.jwt.claims', '', true); end $f$;
do $s$ begin execute pg_temp.sub($q$
insert into public.organizations(id,name) values ({oA},'ZZ Test A'),({oB},'ZZ Test B');
insert into auth.users(id,aud,role,email,raw_app_meta_data) values
 ({uAa},'authenticated','authenticated','zz-a-admin@test.invalid',jsonb_build_object('organization_id',{oA}::text,'role','admin')),
 ({uAs},'authenticated','authenticated','zz-a-staff@test.invalid',jsonb_build_object('organization_id',{oA}::text,'role','staff')),
 ({uBa},'authenticated','authenticated','zz-b-admin@test.invalid',jsonb_build_object('organization_id',{oB}::text,'role','admin')),
 ({uBs},'authenticated','authenticated','zz-b-staff@test.invalid',jsonb_build_object('organization_id',{oB}::text,'role','staff'));
insert into public.vehicles(id,organization_id,name,plate_number,status,current_odometer) values
 ({vA},{oA},'VA','ZZA-1','AVAILABLE',1000),({vA2},{oA},'VA2','ZZA-2','MAINTENANCE',100),
 ({vA3},{oA},'VA3','ZZA-3','OUT_OF_SERVICE',100),({vA4},{oA},'VA4','ZZA-4','AVAILABLE',100),
 ({vA5},{oA},'VA5','ZZA-5','AVAILABLE',null),({vA6},{oA},'VA6','ZZA-6','AVAILABLE',null),
 ({vB},{oB},'VB','ZZB-1','AVAILABLE',2000);
insert into public.drivers(id,organization_id,name,status) values ({dA},{oA},'DA','ACTIVE'),({dA2},{oA},'DA2','INACTIVE'),({dB},{oB},'DB','ACTIVE');
insert into public.trips(id,organization_id,vehicle_id,driver_id,trip_date,origin,destination,created_by) values
 ({tA},{oA},{vA},{dA},current_date,'o','d',{uAs}),({tB},{oB},{vB},{dB},current_date,'o','d',{uBs});
insert into public.fuel_records(id,organization_id,vehicle_id,fuel_date,quantity,unit_price,total_amount,created_by) values
 ({fA},{oA},{vA},current_date,10,50,500,{uAs}),({fB},{oB},{vB},current_date,10,50,500,{uBs});
insert into public.trip_revenue(id,organization_id,trip_id,amount,revenue_date,created_by) values ({rA},{oA},{tA},1000,current_date,{uAs}),({rB},{oB},{tB},1000,current_date,{uBs});
insert into public.trip_expenses(id,organization_id,trip_id,vehicle_id,category,amount,expense_date,created_by) values ({eA},{oA},{tA},{vA},'TOLL',100,current_date,{uAs}),({eB},{oB},{tB},{vB},'TOLL',100,current_date,{uBs});
insert into public.service_records(id,organization_id,vehicle_id,service_date,category,created_by) values ({sA},{oA},{vA},date '2026-01-01','BRAKES',{uAs}),({sB},{oB},{vB},date '2026-01-01','BRAKES',{uBs});
insert into public.maintenance_schedules(id,organization_id,vehicle_id,service_category,interval_km,interval_days) values ({msA},{oA},{vA},'OIL',5000,90),({msB},{oB},{vB},'OIL',5000,90);
insert into public.vehicle_documents(id,organization_id,vehicle_id,document_type,expires_on,created_by) values ({vdA},{oA},{vA},'INS',current_date+10,{uAs}),({vdB},{oB},{vB},'INS',current_date+10,{uBs});
insert into public.driver_documents(id,organization_id,driver_id,document_type,expires_on,created_by) values ({ddA},{oA},{dA},'LIC',current_date+400,{uAs}),({ddB},{oB},{dB},'LIC',current_date+400,{uBs});
insert into public.incidents(id,organization_id,vehicle_id,title,created_by) values ({incA},{oA},{vA},'inc',{uAs}),({incB},{oB},{vB},'inc',{uBs});
$q$); end $s$;

-- ======================================================================= BLOCK 1: (a)-(g)
do $b$
declare t text; i int; tb text; idb text; col text; rec record; ins text[]; names text[];
 tbls text[] := array['fuel_records:f:notes','trips:t:notes','trip_revenue:r:notes','trip_expenses:e:notes','service_records:s:notes','vehicle_documents:vd:notes','driver_documents:dd:notes','incidents:inc:title'];
 alltabs text[] := array['vehicles','drivers','trips','fuel_records','trip_revenue','trip_expenses','service_records','maintenance_schedules','vehicle_documents','driver_documents','incidents','reminders','audit_logs','notification_deliveries','notification_preferences','profiles'];
begin
-- (a) org isolation
perform pg_temp.as_user('uAs');
foreach t in array alltabs loop
  perform pg_temp.eq('a staff: 0 foreign-org rows in '||t, format('select count(*) from public.%I where organization_id <> {oA}', t), '0');
end loop;
perform pg_temp.eq('a staff: 0 foreign organizations', 'select count(*) from organizations where id <> {oA}', '0');
perform pg_temp.eq('a staff: sees own organization', 'select count(*) from organizations where id = {oA}', '1');
perform pg_temp.eq('a staff: sees own vehicles (6)', 'select count(*) from vehicles', '6');
perform pg_temp.eq('a staff: sees own profiles (2)', 'select count(*) from profiles', '2');
foreach t in array array['v_trip_financials','v_vehicle_documents','v_driver_documents','v_maintenance_status','v_notifications'] loop
  perform pg_temp.eq('a staff: 0 foreign-org rows in view '||t, format('select count(*) from public.%I where organization_id <> {oA}', t), '0');
end loop;
ins := array[
 $q$insert into fuel_records(organization_id,vehicle_id,fuel_date,quantity,unit_price,total_amount) values ({oB},{vB},current_date,1,1,1)$q$,
 $q$insert into trips(organization_id,vehicle_id,driver_id,trip_date,origin,destination) values ({oB},{vB},{dB},current_date,'x','y')$q$,
 $q$insert into trip_expenses(organization_id,trip_id,vehicle_id,category,amount,expense_date) values ({oB},{tB},{vB},'TOLL',1,current_date)$q$,
 $q$insert into trip_revenue(organization_id,trip_id,amount,revenue_date) values ({oB},{tB},1,current_date)$q$,
 $q$insert into service_records(organization_id,vehicle_id,service_date,category) values ({oB},{vB},current_date,'X')$q$,
 $q$insert into vehicle_documents(organization_id,vehicle_id,document_type) values ({oB},{vB},'X')$q$,
 $q$insert into driver_documents(organization_id,driver_id,document_type) values ({oB},{dB},'X')$q$,
 $q$insert into incidents(organization_id,vehicle_id,title) values ({oB},{vB},'x')$q$];
for i in 1..array_length(ins,1) loop perform pg_temp.exp('a staff insert with org B id #'||i, ins[i], 'err'); end loop;
foreach t in array tbls loop
  tb := split_part(t,':',1); idb := split_part(t,':',2); col := split_part(t,':',3);
  perform pg_temp.exp('a staff update org-B row in '||tb, format($q$update public.%I set %I='zz' where id={%sB}$q$, tb, col, idb), 'blocked');
end loop;
perform pg_temp.exp('a staff move own fuel row to org B', $q$update fuel_records set organization_id={oB} where id={fA}$q$, 'err');
perform pg_temp.exp('a staff update org-B profile', $q$update profiles set full_name='zz' where id={uBs}$q$, 'blocked');
perform pg_temp.as_user('uAa');
perform pg_temp.exp('a admin insert vehicle in org B', $q$insert into vehicles(organization_id,name,plate_number) values ({oB},'x','ZZ-X')$q$, 'err');
perform pg_temp.exp('a admin update org-B vehicle', $q$update vehicles set name='zz' where id={vB}$q$, 'blocked');
perform pg_temp.exp('a admin update org-B driver', $q$update drivers set name='zz' where id={dB}$q$, 'blocked');
perform pg_temp.exp('a admin update org-B schedule', $q$update maintenance_schedules set notes='zz' where id={msB}$q$, 'blocked');
perform pg_temp.exp('a admin move own vehicle to org B', $q$update vehicles set organization_id={oB} where id={vA}$q$, 'err');
perform pg_temp.eq('a admin: 0 foreign audit rows', 'select count(*) from audit_logs where organization_id <> {oA}', '0');
-- (b) cross-org composite FKs
perform pg_temp.as_su();
perform pg_temp.exp('b FK: A trip with B vehicle -> 23503', $q$insert into trips(organization_id,vehicle_id,driver_id,trip_date,origin,destination) values ({oA},{vB},{dA},current_date,'x','y')$q$, '23503');
perform pg_temp.exp('b FK: A trip with B driver -> 23503', $q$insert into trips(organization_id,vehicle_id,driver_id,trip_date,origin,destination) values ({oA},{vA},{dB},current_date,'x','y')$q$, '23503');
perform pg_temp.exp('b FK: A fuel with B vehicle -> 23503', $q$insert into fuel_records(organization_id,vehicle_id,fuel_date,quantity,unit_price,total_amount) values ({oA},{vB},current_date,1,1,1)$q$, '23503');
perform pg_temp.exp('b FK: A expense on B trip', $q$insert into trip_expenses(organization_id,trip_id,vehicle_id,category,amount,expense_date) values ({oA},{tB},{vA},'TOLL',1,current_date)$q$, 'err');
perform pg_temp.as_user('uAs');
perform pg_temp.exp('b staff: A trip with B vehicle', $q$insert into trips(organization_id,vehicle_id,driver_id,trip_date,origin,destination) values ({oA},{vB},{dA},current_date,'x','y')$q$, 'err');
-- (c) master data admin-only
perform pg_temp.exp('c staff cannot insert vehicle', $q$insert into vehicles(organization_id,name,plate_number) values ({oA},'n','ZZA-9')$q$, 'err');
perform pg_temp.exp('c staff cannot update vehicle', $q$update vehicles set name='zz' where id={vA}$q$, 'blocked');
perform pg_temp.exp('c staff cannot insert driver', $q$insert into drivers(organization_id,name) values ({oA},'n')$q$, 'err');
perform pg_temp.exp('c staff cannot update driver', $q$update drivers set name='zz' where id={dA}$q$, 'blocked');
perform pg_temp.exp('c staff cannot insert schedule', $q$insert into maintenance_schedules(organization_id,vehicle_id,service_category,interval_km) values ({oA},{vA},'TIRES',1000)$q$, 'err');
perform pg_temp.exp('c staff cannot update schedule', $q$update maintenance_schedules set notes='zz' where id={msA}$q$, 'blocked');
perform pg_temp.as_user('uAa');
perform pg_temp.exp('c admin inserts vehicle', $q$insert into vehicles(organization_id,name,plate_number) values ({oA},'n','ZZA-9')$q$, 'ok1');
perform pg_temp.exp('c admin updates vehicle', $q$update vehicles set name='zz' where id={vA}$q$, 'ok1');
perform pg_temp.exp('c admin inserts driver', $q$insert into drivers(organization_id,name) values ({oA},'n')$q$, 'ok1');
perform pg_temp.exp('c admin updates driver', $q$update drivers set name='zz' where id={dA}$q$, 'ok1');
perform pg_temp.exp('c admin inserts schedule', $q$insert into maintenance_schedules(organization_id,vehicle_id,service_category,interval_km) values ({oA},{vA},'TIRES',1000)$q$, 'ok1');
perform pg_temp.exp('c admin updates schedule', $q$update maintenance_schedules set notes='zz' where id={msA}$q$, 'ok1');
-- (d) created_by
perform pg_temp.as_user('uAs');
ins := array[
 $q$insert into fuel_records(organization_id,vehicle_id,fuel_date,quantity,unit_price,total_amount,created_by) values ({oA},{vA},current_date,10,50,500,%s)$q$,
 $q$insert into trips(organization_id,vehicle_id,driver_id,trip_date,origin,destination,created_by) values ({oA},{vA},{dA},current_date,'o','d',%s)$q$,
 $q$insert into trip_expenses(organization_id,trip_id,vehicle_id,category,amount,expense_date,created_by) values ({oA},{tA},{vA},'TOLL',10,current_date,%s)$q$,
 $q$insert into trip_revenue(organization_id,trip_id,amount,revenue_date,created_by) values ({oA},{tA},10,current_date,%s)$q$,
 $q$insert into service_records(organization_id,vehicle_id,service_date,category,created_by) values ({oA},{vA},current_date,'MISC',%s)$q$,
 $q$insert into vehicle_documents(organization_id,vehicle_id,document_type,created_by) values ({oA},{vA},'INS',%s)$q$,
 $q$insert into driver_documents(organization_id,driver_id,document_type,created_by) values ({oA},{dA},'LIC',%s)$q$,
 $q$insert into incidents(organization_id,vehicle_id,title,created_by) values ({oA},{vA},'t',%s)$q$];
for i in 1..array_length(ins,1) loop
  perform pg_temp.exp('d staff insert #'||i||' created_by default', format(ins[i],'default'), 'ok1');
  perform pg_temp.exp('d staff insert #'||i||' created_by own uid', format(ins[i],'{uAs}'), 'ok1');
  perform pg_temp.exp('d staff insert #'||i||' created_by OTHER uid rejected', format(ins[i],'{uAa}'), 'err');
end loop;
foreach t in array tbls loop
  tb := split_part(t,':',1);
  perform pg_temp.eq('d '||tb||': no NULL/foreign created_by after default insert', format('select count(*) from public.%I where created_by is distinct from {uAs}', tb), '0');
end loop;
perform pg_temp.exp('d staff tries to rewrite created_by on update (trigger keeps old)', $q$update fuel_records set created_by={uAa} where id={fA}$q$, 'ok');
perform pg_temp.as_su();
perform pg_temp.eq('d created_by unchanged after update attempt', $q$select created_by::text from fuel_records where id={fA}$q$, (select v::text from pg_temp.ids where k='uAs'));
-- (e) void / delete
foreach t in array tbls loop
  tb := split_part(t,':',1); idb := split_part(t,':',2); col := split_part(t,':',3);
  perform pg_temp.as_user('uAs');
  perform pg_temp.exp('e staff cannot void '||tb, format($q$update public.%I set voided_at=now(), void_reason='x' where id={%sA}$q$, tb, idb), '42501');
  perform pg_temp.as_user('uAa');
  perform pg_temp.exp('e admin void without reason fails '||tb, format($q$update public.%I set voided_at=now() where id={%sA}$q$, tb, idb), '23514');
  perform pg_temp.exp('e admin void blank reason fails '||tb, format($q$update public.%I set voided_at=now(), void_reason='  ' where id={%sA}$q$, tb, idb), '23514');
  perform pg_temp.exp('e admin void with reason ok '||tb, format($q$update public.%I set voided_at=now(), voided_by={uAs}, void_reason='dup entry' where id={%sA}$q$, tb, idb), 'ok1');
  perform pg_temp.eq('e voided_by set by trigger to actor '||tb, format('select voided_by::text from public.%I where id={%sA}', tb, idb), (select v::text from pg_temp.ids where k='uAa'));
  perform pg_temp.eq('e VOID audit row with reason '||tb, format($q$select count(*) from audit_logs where entity_type=%L and entity_id={%sA} and action='VOID' and reason='dup entry' and actor_id={uAa}$q$, tb, idb), '1');
  perform pg_temp.as_user('uAs');
  perform pg_temp.exp('e staff cannot update voided row '||tb, format($q$update public.%I set %I='zz' where id={%sA}$q$, tb, col, idb), 'blocked');
  perform pg_temp.exp('e staff cannot un-void '||tb, format($q$update public.%I set voided_at=null where id={%sA}$q$, tb, idb), 'blocked');
end loop;
perform pg_temp.as_su();
select array_agg(table_name::text) into names from information_schema.tables where table_schema='public' and table_type='BASE TABLE';
foreach t in array names loop
  perform pg_temp.as_user('uAa');
  perform pg_temp.exp('e admin DELETE denied on '||t, format('delete from public.%I where false', t), '42501');
  perform pg_temp.as_user('uAs');
  perform pg_temp.exp('e staff DELETE denied on '||t, format('delete from public.%I where false', t), '42501');
end loop;
-- (f) audit
perform pg_temp.as_user('uAs');
perform pg_temp.eq('f staff sees 0 audit rows', 'select count(*) from audit_logs', '0');
perform pg_temp.as_user('uAa');
perform pg_temp.chk('f admin sees audit rows', pg_temp.t('select count(*) from audit_logs')::bigint > 0);
foreach t in array array['uAa','uAs'] loop
  perform pg_temp.as_user(t);
  perform pg_temp.exp('f '||t||' cannot insert audit', $q$insert into audit_logs(organization_id,action,entity_type) values ({oA},'X','x')$q$, '42501');
  perform pg_temp.exp('f '||t||' cannot update audit', $q$update audit_logs set reason='x' where false$q$, '42501');
  perform pg_temp.exp('f '||t||' cannot delete audit', $q$delete from audit_logs where false$q$, '42501');
end loop;
-- (g) anon + private functions (table list captured as superuser: information_schema hides tables anon cannot access)
perform pg_temp.as_su();
select array_agg(table_name::text) into names from information_schema.tables where table_schema='public';
perform pg_temp.as_anon();
foreach t in array names loop
  perform pg_temp.exp('g anon cannot read '||t, format('select count(*) from public.%I', t), '42501');
end loop;
foreach t in array array['select private.current_org_id()','select private.is_admin()','select private.generate_reminders()','select private.today_addis()','select public.rls_auto_enable()'] loop
  perform pg_temp.exp('g anon cannot call: '||t, t, '42501');
end loop;
perform pg_temp.as_user('uAa');
foreach t in array array['select private.generate_reminders()','select public.rls_auto_enable()','select private.handle_new_user()','select private.guard_row()','select private.audit_row()','select private.refresh_vehicle_status(null::uuid)'] loop
  perform pg_temp.exp('g authenticated cannot call: '||t, t, '42501');
end loop;
perform pg_temp.as_su();
raise exception 'RESULT (% fail / % total): %', (select count(*) from pg_temp.res where line like 'FAIL%'), (select count(*) from pg_temp.res), E'\n'||coalesce((select string_agg(line, E'\n') filter (where line like 'FAIL%') from pg_temp.res),'')||E'\n--ALL--\n'||(select string_agg(line, E'\n') from pg_temp.res);
end $b$;

-- ======================================================================= BLOCK 2: (h)-(l)
-- (run PART 0 first, then this block)
do $b$
declare t text; names text[]; ex1 text[];
begin
-- (h) trip triggers
perform pg_temp.as_user('uAs');
perform pg_temp.exp('h start trip on MAINTENANCE vehicle fails', $q$insert into trips(organization_id,vehicle_id,driver_id,trip_date,origin,destination,status) values ({oA},{vA2},{dA},current_date,'o','d','IN_PROGRESS')$q$, '23514');
perform pg_temp.exp('h start trip on OUT_OF_SERVICE vehicle fails', $q$insert into trips(organization_id,vehicle_id,driver_id,trip_date,origin,destination,status) values ({oA},{vA3},{dA},current_date,'o','d','IN_PROGRESS')$q$, '23514');
perform pg_temp.exp('h planned trip on MAINTENANCE vehicle allowed', $q$insert into trips(id,organization_id,vehicle_id,driver_id,trip_date,origin,destination) values ({x9},{oA},{vA2},{dA},current_date,'o','d')$q$, 'ok1');
perform pg_temp.exp('h update planned trip to IN_PROGRESS on MAINTENANCE vehicle fails', $q$update trips set status='IN_PROGRESS' where id={x9}$q$, '23514');
perform pg_temp.exp('h start trip on AVAILABLE vehicle', $q$insert into trips(id,organization_id,vehicle_id,driver_id,trip_date,origin,destination,status) values ({x1},{oA},{vA4},{dA},current_date,'o','d','IN_PROGRESS')$q$, 'ok1');
perform pg_temp.eq('h vehicle ON_TRIP after start', $q$select status from vehicles where id={vA4}$q$, 'ON_TRIP');
perform pg_temp.exp('h second IN_PROGRESS trip same vehicle (insert) fails', $q$insert into trips(organization_id,vehicle_id,driver_id,trip_date,origin,destination,status) values ({oA},{vA4},{dA},current_date,'o','d','IN_PROGRESS')$q$, '23514');
perform pg_temp.exp('h planned trip on same vehicle ok', $q$insert into trips(id,organization_id,vehicle_id,driver_id,trip_date,origin,destination) values ({x2},{oA},{vA4},{dA},current_date,'o','d')$q$, 'ok1');
perform pg_temp.exp('h second IN_PROGRESS via update fails', $q$update trips set status='IN_PROGRESS' where id={x2}$q$, '23514');
perform pg_temp.exp('h complete trip', $q$update trips set status='COMPLETED' where id={x1}$q$, 'ok1');
perform pg_temp.eq('h vehicle AVAILABLE after complete', $q$select status from vehicles where id={vA4}$q$, 'AVAILABLE');
perform pg_temp.exp('h start again', $q$update trips set status='IN_PROGRESS' where id={x2}$q$, 'ok1');
perform pg_temp.eq('h ON_TRIP again', $q$select status from vehicles where id={vA4}$q$, 'ON_TRIP');
perform pg_temp.as_su();
perform pg_temp.exp('h (setup) put vehicle into MAINTENANCE', $q$update vehicles set status='MAINTENANCE' where id={vA4}$q$, 'ok1');
perform pg_temp.as_user('uAs');
perform pg_temp.exp('h complete trip on MAINTENANCE vehicle', $q$update trips set status='COMPLETED' where id={x2}$q$, 'ok1');
perform pg_temp.eq('h MAINTENANCE vehicle NOT flipped to AVAILABLE', $q$select status from vehicles where id={vA4}$q$, 'MAINTENANCE');
perform pg_temp.exp('h INACTIVE driver cannot be assigned', $q$insert into trips(organization_id,vehicle_id,driver_id,trip_date,origin,destination) values ({oA},{vA},{dA2},current_date,'o','d')$q$, '23514');
perform pg_temp.exp('h expense vehicle != trip vehicle fails', $q$insert into trip_expenses(organization_id,trip_id,vehicle_id,category,amount,expense_date) values ({oA},{tA},{vA5},'TOLL',5,current_date)$q$, '23514');
perform pg_temp.exp('h expense vehicle == trip vehicle ok', $q$insert into trip_expenses(organization_id,trip_id,vehicle_id,category,amount,expense_date) values ({oA},{tA},{vA},'TOLL',5,current_date)$q$, 'ok1');
-- (i) odometer
perform pg_temp.exp('i fuel odo 1500', $q$insert into fuel_records(organization_id,vehicle_id,fuel_date,quantity,unit_price,total_amount,odometer) values ({oA},{vA},current_date,1,1,1,1500)$q$, 'ok1');
perform pg_temp.eq('i odometer moved forward', $q$select current_odometer::text from vehicles where id={vA}$q$, '1500.0');
perform pg_temp.exp('i fuel odo 1200 (lower)', $q$insert into fuel_records(organization_id,vehicle_id,fuel_date,quantity,unit_price,total_amount,odometer) values ({oA},{vA},current_date,1,1,1,1200)$q$, 'ok1');
perform pg_temp.eq('i odometer not moved backwards', $q$select current_odometer::text from vehicles where id={vA}$q$, '1500.0');
perform pg_temp.exp('i fuel odo NULL', $q$insert into fuel_records(organization_id,vehicle_id,fuel_date,quantity,unit_price,total_amount,odometer) values ({oA},{vA},current_date,1,1,1,null)$q$, 'ok1');
perform pg_temp.eq('i NULL ignored', $q$select current_odometer::text from vehicles where id={vA}$q$, '1500.0');
perform pg_temp.exp('i service odo 1800', $q$insert into service_records(organization_id,vehicle_id,service_date,category,odometer) values ({oA},{vA},current_date,'MISC',1800)$q$, 'ok1');
perform pg_temp.eq('i service moves odometer', $q$select current_odometer::text from vehicles where id={vA}$q$, '1800.0');
perform pg_temp.as_su();
perform pg_temp.exp('i voided-on-insert fuel row odo 9999', $q$insert into fuel_records(organization_id,vehicle_id,fuel_date,quantity,unit_price,total_amount,odometer,voided_at,void_reason) values ({oA},{vA},current_date,1,1,1,9999,now(),'t')$q$, 'ok1');
perform pg_temp.eq('i voided record ignored', $q$select current_odometer::text from vehicles where id={vA}$q$, '1800.0');
perform pg_temp.as_user('uAa');
perform pg_temp.exp('i admin sets odo 5000 AND voids in one update', $q$update fuel_records set odometer=5000, voided_at=now(), void_reason='r' where id={fA}$q$, 'ok1');
perform pg_temp.eq('i void+odo update ignored', $q$select current_odometer::text from vehicles where id={vA}$q$, '1800.0');
perform pg_temp.as_user('uAs');
perform pg_temp.exp('i NULL->value on unknown-odometer vehicle', $q$insert into fuel_records(organization_id,vehicle_id,fuel_date,quantity,unit_price,total_amount,odometer) values ({oA},{vA5},current_date,1,1,1,500)$q$, 'ok1');
perform pg_temp.eq('i NULL odometer becomes 500', $q$select current_odometer::text from vehicles where id={vA5}$q$, '500.0');
perform pg_temp.exp('i NULL fuel odo on unknown vehicle', $q$insert into fuel_records(organization_id,vehicle_id,fuel_date,quantity,unit_price,total_amount) values ({oA},{vA6},current_date,1,1,1)$q$, 'ok1');
perform pg_temp.eq('i unknown stays unknown', $q$select current_odometer::text from vehicles where id={vA6}$q$, null);
-- (j) maintenance schedule rolling
perform pg_temp.exp('j service 2026-06-01 odo 1000', $q$insert into service_records(id,organization_id,vehicle_id,service_date,category,odometer) values ({x4},{oA},{vA},date '2026-06-01','OIL',1000)$q$, 'ok1');
perform pg_temp.eq('j next_due_date rolled (+90d)', $q$select next_due_date::text from maintenance_schedules where id={msA}$q$, (date '2026-06-01' + 90)::text);
perform pg_temp.eq('j next_due_odometer rolled (+5000)', $q$select next_due_odometer::text from maintenance_schedules where id={msA}$q$, '6000.0');
perform pg_temp.eq('j last_service_id = first', $q$select (last_service_id={x4})::text from maintenance_schedules where id={msA}$q$, 'true');
perform pg_temp.exp('j newer service 2026-09-01 odo 3000', $q$insert into service_records(id,organization_id,vehicle_id,service_date,category,odometer) values ({x5},{oA},{vA},date '2026-09-01','OIL',3000)$q$, 'ok1');
perform pg_temp.eq('j rolled to newer date', $q$select next_due_date::text from maintenance_schedules where id={msA}$q$, (date '2026-09-01' + 90)::text);
perform pg_temp.eq('j rolled to newer odo', $q$select next_due_odometer::text from maintenance_schedules where id={msA}$q$, '8000.0');
perform pg_temp.exp('j backdated service 2026-03-01 odo 500', $q$insert into service_records(id,organization_id,vehicle_id,service_date,category,odometer) values ({x6},{oA},{vA},date '2026-03-01','OIL',500)$q$, 'ok1');
perform pg_temp.eq('j backdated does NOT overwrite date', $q$select next_due_date::text from maintenance_schedules where id={msA}$q$, (date '2026-09-01' + 90)::text);
perform pg_temp.eq('j backdated does NOT overwrite odo', $q$select next_due_odometer::text from maintenance_schedules where id={msA}$q$, '8000.0');
perform pg_temp.eq('j last_service_id still newer', $q$select (last_service_id={x5})::text from maintenance_schedules where id={msA}$q$, 'true');
-- (k) fuel mismatch
perform pg_temp.exp('k ins exact', $q$insert into fuel_records(organization_id,vehicle_id,fuel_date,quantity,unit_price,total_amount,notes) values ({oA},{vA},current_date,10,50,500.00,'k1')$q$, 'ok1');
perform pg_temp.exp('k ins diff 0.50', $q$insert into fuel_records(organization_id,vehicle_id,fuel_date,quantity,unit_price,total_amount,notes) values ({oA},{vA},current_date,10,50,500.50,'k2')$q$, 'ok1');
perform pg_temp.exp('k ins diff 0.51', $q$insert into fuel_records(organization_id,vehicle_id,fuel_date,quantity,unit_price,total_amount,notes) values ({oA},{vA},current_date,10,50,500.51,'k3')$q$, 'ok1');
perform pg_temp.exp('k ins diff -1', $q$insert into fuel_records(organization_id,vehicle_id,fuel_date,quantity,unit_price,total_amount,notes) values ({oA},{vA},current_date,10,50,499.00,'k4')$q$, 'ok1');
perform pg_temp.eq('k exact => false', $q$select amount_mismatch::text from fuel_records where notes='k1'$q$, 'false');
perform pg_temp.eq('k diff exactly 0.50 => false', $q$select amount_mismatch::text from fuel_records where notes='k2'$q$, 'false');
perform pg_temp.eq('k diff 0.51 => true', $q$select amount_mismatch::text from fuel_records where notes='k3'$q$, 'true');
perform pg_temp.eq('k diff 1.00 under => true', $q$select amount_mismatch::text from fuel_records where notes='k4'$q$, 'true');
perform pg_temp.eq('k total stored unchanged (500.51)', $q$select total_amount::text from fuel_records where notes='k3'$q$, '500.51');
-- (l) views
perform pg_temp.exp('l trip x7', $q$insert into trips(id,organization_id,vehicle_id,driver_id,trip_date,origin,destination) values ({x7},{oA},{vA},{dA},current_date,'o','d')$q$, 'ok1');
perform pg_temp.exp('l trip x8', $q$insert into trips(id,organization_id,vehicle_id,driver_id,trip_date,origin,destination) values ({x8},{oA},{vA},{dA},current_date,'o','d')$q$, 'ok1');
perform pg_temp.eq('l no revenue/no expenses: profit NULL', $q$select profit::text from v_trip_financials where trip_id={x7}$q$, null);
perform pg_temp.eq('l no revenue: has_revenue false', $q$select has_revenue::text from v_trip_financials where trip_id={x7}$q$, 'false');
perform pg_temp.eq('l no expenses: expenses 0', $q$select expenses::text from v_trip_financials where trip_id={x7}$q$, '0');
perform pg_temp.exp('l x7 expense 100', $q$insert into trip_expenses(organization_id,trip_id,vehicle_id,category,amount,expense_date) values ({oA},{x7},{vA},'TOLL',100,current_date)$q$, 'ok1');
perform pg_temp.eq('l expenses only: profit still NULL', $q$select profit::text from v_trip_financials where trip_id={x7}$q$, null);
perform pg_temp.eq('l expenses only: has_expenses true', $q$select has_expenses::text from v_trip_financials where trip_id={x7}$q$, 'true');
perform pg_temp.exp('l x8 expense 100', $q$insert into trip_expenses(organization_id,trip_id,vehicle_id,category,amount,expense_date) values ({oA},{x8},{vA},'TOLL',100,current_date)$q$, 'ok1');
perform pg_temp.exp('l x8 expense 50 (to void)', $q$insert into trip_expenses(organization_id,trip_id,vehicle_id,category,amount,expense_date,description) values ({oA},{x8},{vA},'TOLL',50,current_date,'void-me')$q$, 'ok1');
perform pg_temp.exp('l x8 revenue 500', $q$insert into trip_revenue(organization_id,trip_id,amount,revenue_date,description) values ({oA},{x8},500,current_date,'rev-void-me')$q$, 'ok1');
perform pg_temp.eq('l with revenue: profit = 500-150', $q$select profit::text from v_trip_financials where trip_id={x8}$q$, '350.00');
perform pg_temp.as_user('uAa');
perform pg_temp.exp('l admin voids the 50 expense', $q$update trip_expenses set voided_at=now(), void_reason='r' where description='void-me'$q$, 'ok1');
perform pg_temp.eq('l voided expense excluded: profit 400', $q$select profit::text from v_trip_financials where trip_id={x8}$q$, '400.00');
perform pg_temp.eq('l voided expense excluded: expenses 100', $q$select expenses::text from v_trip_financials where trip_id={x8}$q$, '100.00');
perform pg_temp.exp('l admin voids revenue', $q$update trip_revenue set voided_at=now(), void_reason='r' where description='rev-void-me'$q$, 'ok1');
perform pg_temp.eq('l voided revenue: profit NULL', $q$select profit::text from v_trip_financials where trip_id={x8}$q$, null);
perform pg_temp.eq('l voided revenue: has_revenue false', $q$select has_revenue::text from v_trip_financials where trip_id={x8}$q$, 'false');
perform pg_temp.exp('l admin voids trip x8', $q$update trips set voided_at=now(), void_reason='r' where id={x8}$q$, 'ok1');
perform pg_temp.eq('l voided trip excluded from view', $q$select count(*) from v_trip_financials where trip_id={x8}$q$, '0');
perform pg_temp.as_user('uAs');
ex1 := array['DOC_NULL:null','DOC_TODAY:private.today_addis()','DOC_YEST:private.today_addis()-1','DOC_P30:private.today_addis()+30','DOC_P31:private.today_addis()+31','DOC_VOID:private.today_addis()'];
foreach t in array ex1 loop
  perform pg_temp.exp('l insert '||split_part(t,':',1), format($q$insert into vehicle_documents(organization_id,vehicle_id,document_type,expires_on) values ({oA},{vA},%L,%s)$q$, split_part(t,':',1), split_part(t,':',2)), 'ok1');
end loop;
perform pg_temp.eq('l doc NULL expiry => UNKNOWN', $q$select status from v_vehicle_documents where document_type='DOC_NULL'$q$, 'UNKNOWN');
perform pg_temp.eq('l doc expires today => EXPIRING_SOON', $q$select status from v_vehicle_documents where document_type='DOC_TODAY'$q$, 'EXPIRING_SOON');
perform pg_temp.eq('l doc today days_left = 0', $q$select days_left::text from v_vehicle_documents where document_type='DOC_TODAY'$q$, '0');
perform pg_temp.eq('l doc yesterday => EXPIRED', $q$select status from v_vehicle_documents where document_type='DOC_YEST'$q$, 'EXPIRED');
perform pg_temp.eq('l doc +30d => EXPIRING_SOON', $q$select status from v_vehicle_documents where document_type='DOC_P30'$q$, 'EXPIRING_SOON');
perform pg_temp.eq('l doc +31d => VALID', $q$select status from v_vehicle_documents where document_type='DOC_P31'$q$, 'VALID');
perform pg_temp.as_user('uAa');
perform pg_temp.exp('l void a doc', $q$update vehicle_documents set voided_at=now(), void_reason='r' where document_type='DOC_VOID'$q$, 'ok1');
perform pg_temp.eq('l voided doc excluded from view', $q$select count(*) from v_vehicle_documents where document_type='DOC_VOID'$q$, '0');
perform pg_temp.as_user('uAs');
perform pg_temp.exp('l driver doc yesterday', $q$insert into driver_documents(organization_id,driver_id,document_type,expires_on) values ({oA},{dA},'DDOC_YEST',private.today_addis()-1)$q$, 'ok1');
perform pg_temp.exp('l driver doc null', $q$insert into driver_documents(organization_id,driver_id,document_type,expires_on) values ({oA},{dA},'DDOC_NULL',null)$q$, 'ok1');
perform pg_temp.eq('l driver doc yesterday => EXPIRED', $q$select status from v_driver_documents where document_type='DDOC_YEST'$q$, 'EXPIRED');
perform pg_temp.eq('l driver doc NULL => UNKNOWN', $q$select status from v_driver_documents where document_type='DDOC_NULL'$q$, 'UNKNOWN');
perform pg_temp.as_user('uAa');
perform pg_temp.exp('l schedule on unknown-odometer vehicle', $q$insert into maintenance_schedules(organization_id,vehicle_id,service_category,interval_km,next_due_odometer) values ({oA},{vA6},'UNK',1000,5000)$q$, 'ok1');
perform pg_temp.eq('l maintenance: unknown odo => odometer_status UNKNOWN', $q$select odometer_status from v_maintenance_status where service_category='UNK'$q$, 'UNKNOWN');
perform pg_temp.eq('l maintenance: all unknown => overall UNKNOWN', $q$select overall_status from v_maintenance_status where service_category='UNK'$q$, 'UNKNOWN');
perform pg_temp.as_su();
perform pg_temp.exp('l set odo 4600', $q$update vehicles set current_odometer=4600 where id={vA6}$q$, 'ok1');
perform pg_temp.eq('l odo 4600 vs 5000 => DUE_SOON', $q$select overall_status from v_maintenance_status where service_category='UNK'$q$, 'DUE_SOON');
perform pg_temp.exp('l set odo 5000', $q$update vehicles set current_odometer=5000 where id={vA6}$q$, 'ok1');
perform pg_temp.eq('l odo 5000 => OVERDUE', $q$select overall_status from v_maintenance_status where service_category='UNK'$q$, 'OVERDUE');
perform pg_temp.exp('l set odo 1000', $q$update vehicles set current_odometer=1000 where id={vA6}$q$, 'ok1');
perform pg_temp.eq('l odo 1000 => OK', $q$select overall_status from v_maintenance_status where service_category='UNK'$q$, 'OK');
perform pg_temp.exp('l odo unknown again', $q$update vehicles set current_odometer=null where id={vA6}$q$, 'ok1');
perform pg_temp.exp('l set date overdue', $q$update maintenance_schedules set next_due_date=private.today_addis()-1 where service_category='UNK'$q$, 'ok1');
perform pg_temp.eq('l unknown odo but overdue date => OVERDUE', $q$select overall_status from v_maintenance_status where service_category='UNK'$q$, 'OVERDUE');
perform pg_temp.as_su();
raise exception 'RESULT (% fail / % total): %', (select count(*) from pg_temp.res where line like 'FAIL%'), (select count(*) from pg_temp.res), E'\n'||coalesce((select string_agg(line, E'\n') filter (where line like 'FAIL%') from pg_temp.res),'')||E'\n--ALL--\n'||(select string_agg(line, E'\n') from pg_temp.res);
end $b$;

-- ======================================================================= BLOCK 3: (m)-(o)
-- (run PART 0 first, then this block)
do $b$
declare ra1 bigint; da1 bigint; rb1 bigint; db1 bigint; tot1 bigint; t text; u text; names text[];
begin
-- (m) reminders
perform pg_temp.exp('m (setup) staff B opts out of in_app', $q$update notification_preferences set in_app=false where user_id={uBs}$q$, 'ok1');
perform pg_temp.exp('m generate run 1', 'select private.generate_reminders()', 'ok');
ra1 := pg_temp.t('select count(*) from reminders where organization_id={oA}')::bigint;
rb1 := pg_temp.t('select count(*) from reminders where organization_id={oB}')::bigint;
da1 := pg_temp.t('select count(*) from notification_deliveries where organization_id={oA}')::bigint;
db1 := pg_temp.t('select count(*) from notification_deliveries where organization_id={oB}')::bigint;
tot1 := pg_temp.t('select count(*) from reminders')::bigint;
perform pg_temp.chk('m reminders generated for A and B', ra1 > 0 and rb1 > 0, ra1||'/'||rb1);
perform pg_temp.chk('m A deliveries = pending reminders x 2 recipients', da1 = 2*pg_temp.t($q$select count(*) from reminders where organization_id={oA} and status='PENDING'$q$)::bigint, da1::text);
perform pg_temp.chk('m B deliveries respect in_app=false (admin only)', db1 = pg_temp.t($q$select count(*) from reminders where organization_id={oB} and status='PENDING'$q$)::bigint, db1::text);
perform pg_temp.exp('m generate run 2', 'select private.generate_reminders()', 'ok');
perform pg_temp.exp('m generate run 3', 'select private.generate_reminders()', 'ok');
perform pg_temp.chk('m 3 runs: no duplicate reminders (A,B,total)', pg_temp.t('select count(*) from reminders where organization_id={oA}')::bigint = ra1 and pg_temp.t('select count(*) from reminders where organization_id={oB}')::bigint = rb1 and pg_temp.t('select count(*) from reminders')::bigint = tot1);
perform pg_temp.chk('m 3 runs: no duplicate deliveries', pg_temp.t('select count(*) from notification_deliveries where organization_id={oA}')::bigint = da1 and pg_temp.t('select count(*) from notification_deliveries where organization_id={oB}')::bigint = db1);
perform pg_temp.as_user('uAs');
perform pg_temp.chk('m staff sees only own deliveries', pg_temp.t('select count(*) from notification_deliveries where recipient_id <> {uAs}')::bigint = 0 and pg_temp.t('select count(*) from notification_deliveries')::bigint > 0);
perform pg_temp.chk('m v_notifications: own rows only, matches deliveries', pg_temp.t('select count(*) from v_notifications where recipient_id <> {uAs}')::bigint = 0 and pg_temp.t('select count(*) from v_notifications where recipient_id = {uAs}')::bigint = pg_temp.t($q$select count(*) from notification_deliveries where channel='in_app'$q$)::bigint);
foreach t in array array['priority','type','params','entity_id','dedupe_key','due_on','organization_id','created_at'] loop
  perform pg_temp.exp('m staff cannot update reminders.'||t, format('update reminders set %I=%I where entity_id={vdA}', t, t), '42501');
end loop;
perform pg_temp.exp('m staff cannot update org-B reminder', $q$update reminders set status='DISMISSED' where organization_id={oB}$q$, 'blocked');
foreach t in array array['recipient_id','error','channel','sent_at','reminder_id','organization_id','created_at'] loop
  perform pg_temp.exp('m staff cannot update deliveries.'||t, format('update notification_deliveries set %I=%I where recipient_id={uAs}', t, t), '42501');
end loop;
perform pg_temp.exp('m staff updates own delivery status/read_at', $q$update notification_deliveries set status='READ', read_at=now() where recipient_id={uAs}$q$, 'ok');
perform pg_temp.chk('m own deliveries marked READ', pg_temp.t($q$select count(*) from notification_deliveries where recipient_id={uAs} and (status<>'READ' or read_at is null)$q$)::bigint = 0);
perform pg_temp.exp('m staff cannot update admin deliveries', $q$update notification_deliveries set status='READ', read_at=now() where recipient_id={uAa}$q$, 'blocked');
perform pg_temp.exp('m staff cannot insert delivery', $q$insert into notification_deliveries(organization_id,reminder_id,recipient_id) select organization_id,id,{uAs} from reminders limit 1$q$, '42501');
perform pg_temp.exp('m staff cannot insert reminder', $q$insert into reminders(organization_id,type,entity_type,entity_id,dedupe_key) values ({oA},'X','x',{vA},'zz')$q$, '42501');
perform pg_temp.exp('m staff updates reminder status/dismissed_at (dismiss)', $q$update reminders set status='DISMISSED', dismissed_at=now() where entity_id={vdA}$q$, 'ok1');
perform pg_temp.exp('m staff updates own prefs', $q$update notification_preferences set push=true where user_id={uAs}$q$, 'ok1');
perform pg_temp.exp('m staff cannot update other prefs', $q$update notification_preferences set push=true where user_id={uAa}$q$, 'blocked');
perform pg_temp.as_user('uAa');
perform pg_temp.chk('m admin sees org deliveries incl. staff', pg_temp.t('select count(*) from notification_deliveries where recipient_id={uAs}')::bigint > 0);
perform pg_temp.exp('m admin cannot update staff delivery', $q$update notification_deliveries set status='SENT' where recipient_id={uAs}$q$, 'blocked');
perform pg_temp.as_su();
perform pg_temp.exp('m generate after dismissal', 'select private.generate_reminders()', 'ok');
perform pg_temp.eq('m DISMISSED reminder not reopened', $q$select status from reminders where entity_id={vdA}$q$, 'DISMISSED');
perform pg_temp.eq('m no duplicate reminder for dismissed condition', $q$select count(*) from reminders where entity_id={vdA}$q$, '1');
perform pg_temp.eq('m A reminder count stable after dismissal', 'select count(*) from reminders where organization_id={oA}', ra1::text);
perform pg_temp.exp('m extend B doc expiry to +60d', $q$update vehicle_documents set expires_on=current_date+60 where id={vdB}$q$, 'ok1');
perform pg_temp.eq('m B doc reminder pending before', $q$select status from reminders where entity_id={vdB}$q$, 'PENDING');
perform pg_temp.exp('m generate after expiry extended', 'select private.generate_reminders()', 'ok');
perform pg_temp.eq('m reminder auto-COMPLETED when condition disappears', $q$select status from reminders where entity_id={vdB}$q$, 'COMPLETED');
perform pg_temp.eq('m auto-completed has completed_at', $q$select (completed_at is not null)::text from reminders where entity_id={vdB}$q$, 'true');
perform pg_temp.exp('m generate again', 'select private.generate_reminders()', 'ok');
perform pg_temp.eq('m completed reminder stays COMPLETED', $q$select status from reminders where entity_id={vdB}$q$, 'COMPLETED');
perform pg_temp.eq('m B reminder count stable (no dup)', 'select count(*) from reminders where organization_id={oB}', rb1::text);
-- (n) profiles / signup
perform pg_temp.as_user('uAs');
perform pg_temp.exp('n user cannot change own role', $q$update profiles set role='admin' where id={uAs}$q$, '42501');
perform pg_temp.exp('n user cannot change own organization_id', $q$update profiles set organization_id={oB} where id={uAs}$q$, '42501');
perform pg_temp.exp('n user cannot change own id', $q$update profiles set id={x1} where id={uAs}$q$, '42501');
perform pg_temp.exp('n user can change own full_name', $q$update profiles set full_name='New Name' where id={uAs}$q$, 'ok1');
perform pg_temp.exp('n user can change own phone', $q$update profiles set phone='0911' where id={uAs}$q$, 'ok1');
perform pg_temp.exp('n user can change own language', $q$update profiles set language='en' where id={uAs}$q$, 'ok1');
perform pg_temp.exp('n invalid language rejected', $q$update profiles set language='xx' where id={uAs}$q$, 'err');
perform pg_temp.exp('n user cannot edit colleague profile', $q$update profiles set full_name='hax' where id={uAa}$q$, 'blocked');
perform pg_temp.as_user('uAa');
perform pg_temp.exp('n admin cannot change colleague role via API', $q$update profiles set role='admin' where id={uAs}$q$, 'err');
perform pg_temp.exp('n user cannot insert profile', $q$insert into profiles(id,organization_id) values ({x1},{oA})$q$, '42501');
perform pg_temp.as_su();
perform pg_temp.eq('n role still staff', $q$select role from profiles where id={uAs}$q$, 'staff');
perform pg_temp.eq('n org unchanged', $q$select (organization_id={oA})::text from profiles where id={uAs}$q$, 'true');
perform pg_temp.exp('n user w/ ONLY user_metadata org+role', $q$insert into auth.users(id,aud,role,email,raw_user_meta_data) values ({x1},'authenticated','authenticated','zz-x1@test.invalid',jsonb_build_object('organization_id',{oA}::text,'role','admin'))$q$, 'ok1');
perform pg_temp.exp('n user w/ app role but NO org', $q$insert into auth.users(id,aud,role,email,raw_app_meta_data) values ({x2},'authenticated','authenticated','zz-x2@test.invalid',jsonb_build_object('role','admin'))$q$, 'ok1');
perform pg_temp.eq('n no profile for user_metadata-only user', 'select count(*) from profiles where id={x1}', '0');
perform pg_temp.eq('n no profile for role-only user', 'select count(*) from profiles where id={x2}', '0');
perform pg_temp.eq('n no prefs row for those users', 'select count(*) from notification_preferences where user_id in ({x1},{x2})', '0');
select array_agg(table_name::text) into names from information_schema.tables where table_schema='public';
foreach u in array array['x1','x2'] loop
  perform pg_temp.as_user(u);
  foreach t in array names loop
    perform pg_temp.eq('n profile-less '||u||' sees 0 rows in '||t, format('select count(*) from public.%I', t), '0');
  end loop;
  perform pg_temp.eq('n profile-less '||u||' sees 0 organizations', 'select count(*) from organizations', '0');
  perform pg_temp.exp('n profile-less '||u||' cannot insert vehicle', $q$insert into vehicles(organization_id,name,plate_number) values ({oA},'n','ZZ-N')$q$, 'err');
  perform pg_temp.exp('n profile-less '||u||' cannot insert fuel', $q$insert into fuel_records(organization_id,vehicle_id,fuel_date,quantity,unit_price,total_amount) values ({oA},{vA},current_date,1,1,1)$q$, 'err');
end loop;
perform pg_temp.as_su();
perform pg_temp.exp('n user w/ app org, no role, user_metadata role=admin', $q$insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values ({x3},'authenticated','authenticated','zz-x3@test.invalid',jsonb_build_object('organization_id',{oA}::text),jsonb_build_object('role','admin','organization_id',{oB}::text))$q$, 'ok1');
perform pg_temp.eq('n default role = staff, user_metadata role ignored', 'select role from profiles where id={x3}', 'staff');
perform pg_temp.eq('n org from app_metadata, user_metadata org ignored', $q$select (organization_id={oA})::text from profiles where id={x3}$q$, 'true');
perform pg_temp.eq('n notification_preferences row created', 'select count(*) from notification_preferences where user_id={x3}', '1');
perform pg_temp.as_user('x3');
perform pg_temp.exp('n x3 (staff) cannot insert vehicle', $q$insert into vehicles(organization_id,name,plate_number) values ({oA},'n','ZZ-N')$q$, 'err');
-- (o) storage
perform pg_temp.as_su();
perform pg_temp.eq('o bucket documents is private', $q$select public::text from storage.buckets where id='documents'$q$, 'false');
perform pg_temp.eq('o bucket size limit 10MB', $q$select file_size_limit::text from storage.buckets where id='documents'$q$, '10485760');
perform pg_temp.eq('o bucket mime allow-list', $q$select array_to_string(array(select unnest(allowed_mime_types) order by 1),',') from storage.buckets where id='documents'$q$, 'application/pdf,image/jpeg,image/png,image/webp');
perform pg_temp.eq('o 5 documents_* policies on storage.objects', $q$select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'documents\_%'$q$, '5');
perform pg_temp.eq('o policies all reference org folder', $q$select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'documents\_%' and (coalesce(qual,'')||coalesce(with_check,'')) like '%current_org_id%' and (coalesce(qual,'')||coalesce(with_check,'')) like '%foldername%'$q$, '5');
perform pg_temp.exp('o (setup) objects', $q$insert into storage.objects(bucket_id,name) values ('documents',{oA}::text||'/z.pdf'),('documents',{oB}::text||'/y.pdf'),('documents','loose.pdf')$q$, 'ok');
perform pg_temp.as_user('uAs');
perform pg_temp.eq('o staff A sees only own-folder objects', $q$select count(*) from storage.objects where bucket_id='documents' and name not like {oA}::text||'/%'$q$, '0');
perform pg_temp.eq('o staff A sees own object', $q$select count(*) from storage.objects where name={oA}::text||'/z.pdf'$q$, '1');
perform pg_temp.exp('o staff A uploads to own folder', $q$insert into storage.objects(bucket_id,name) values ('documents',{oA}::text||'/new.pdf')$q$, 'ok1');
perform pg_temp.exp('o staff A cannot upload to org B folder', $q$insert into storage.objects(bucket_id,name) values ('documents',{oB}::text||'/x.pdf')$q$, 'err');
perform pg_temp.exp('o staff A cannot upload to root', $q$insert into storage.objects(bucket_id,name) values ('documents','loose2.pdf')$q$, 'err');
perform pg_temp.exp('o staff A cannot upload to other bucket', $q$insert into storage.objects(bucket_id,name) values ('avatars',{oA}::text||'/x.pdf')$q$, 'err');
perform pg_temp.exp('o staff A cannot update org B object', $q$update storage.objects set name={oB}::text||'/y2.pdf' where name={oB}::text||'/y.pdf'$q$, 'blocked');
perform pg_temp.exp('o staff A cannot move own object into org B folder', $q$update storage.objects set name={oB}::text||'/moved.pdf' where name={oA}::text||'/z.pdf'$q$, 'err');
perform set_config('storage.allow_delete_query','true',true);
perform pg_temp.exp('o staff A cannot delete objects they did not upload (owner_id null here)', $q$delete from storage.objects where name={oA}::text||'/z.pdf'$q$, 'blocked');
perform pg_temp.as_user('uAa');
perform pg_temp.exp('o admin A cannot delete org B object', $q$delete from storage.objects where name={oB}::text||'/y.pdf'$q$, 'blocked');
perform pg_temp.exp('o admin A can delete own-folder object', $q$delete from storage.objects where name={oA}::text||'/z.pdf'$q$, 'ok1');
perform pg_temp.as_anon();
perform pg_temp.eq('o anon sees no objects', 'select count(*) from storage.objects', '0');
perform pg_temp.as_su();
raise exception 'RESULT (% fail / % total): %', (select count(*) from pg_temp.res where line like 'FAIL%'), (select count(*) from pg_temp.res), E'\n'||coalesce((select string_agg(line, E'\n') filter (where line like 'FAIL%') from pg_temp.res),'')||E'\n--ALL--\n'||(select string_agg(line, E'\n') from pg_temp.res);
end $b$;

-- ======================================================================= BLOCK 4: (p)-(u) review fixes
-- (run PART 0 first, then this block)
do $b$
begin
-- (p) guard_row hardening
perform pg_temp.as_user('uAa');
perform pg_temp.exp('p admin void with CLIENT clock in the past', $q$update fuel_records set voided_at=timestamptz '2000-01-01', void_reason='r' where id={fA}$q$, 'ok1');
perform pg_temp.eq('p voided_at forced to now()', $q$select (voided_at = now())::text from fuel_records where id={fA}$q$, 'true');
perform pg_temp.chk('p re-void: change void_reason rejected (23514 already voided)', pg_temp.ex($q$update fuel_records set void_reason='changed' where id={fA}$q$) like 'ERR:23514:%already voided%');
perform pg_temp.chk('p re-void: change voided_at rejected', pg_temp.ex($q$update fuel_records set voided_at=now()+interval '1 day' where id={fA}$q$) like 'ERR:23514:%already voided%');
perform pg_temp.chk('p re-void: change voided_by rejected', pg_temp.ex($q$update fuel_records set voided_by={uAs} where id={fA}$q$) like 'ERR:23514:%already voided%');
perform pg_temp.eq('p original void_reason intact', $q$select void_reason from fuel_records where id={fA}$q$, 'r');
perform pg_temp.eq('p VOID audit logged once', $q$select count(*) from audit_logs where entity_type='fuel_records' and entity_id={fA} and action='VOID'$q$, '1');
perform pg_temp.exp('p admin can still edit other fields of voided row', $q$update fuel_records set notes='n' where id={fA}$q$, 'ok1');
perform pg_temp.as_user('uAs');
perform pg_temp.exp('p staff cannot restore', $q$update fuel_records set voided_at=null where id={fA}$q$, 'blocked');
perform pg_temp.as_user('uAa');
perform pg_temp.exp('p admin restore (passing a stale void_reason)', $q$update fuel_records set voided_at=null, void_reason='keep' where id={fA}$q$, 'ok1');
perform pg_temp.eq('p restore clears void_reason', $q$select coalesce(void_reason,'<null>') from fuel_records where id={fA}$q$, '<null>');
perform pg_temp.eq('p restore clears voided_by', $q$select count(*) from fuel_records where id={fA} and voided_by is null and voided_at is null$q$, '1');
perform pg_temp.eq('p RESTORE audit logged once', $q$select count(*) from audit_logs where entity_type='fuel_records' and entity_id={fA} and action='RESTORE'$q$, '1');
perform pg_temp.exp('p re-void after restore ok', $q$update fuel_records set voided_at=now(), void_reason='again' where id={fA}$q$, 'ok1');
perform pg_temp.eq('p VOID audit count now 2', $q$select count(*) from audit_logs where entity_type='fuel_records' and entity_id={fA} and action='VOID'$q$, '2');
perform pg_temp.chk('p admin: void_reason on non-voided row rejected', pg_temp.ex($q$update trip_expenses set void_reason='x' where id={eA}$q$) like 'ERR:23514:%');
perform pg_temp.as_user('uAs');
perform pg_temp.chk('p staff: void_reason on non-voided row rejected', pg_temp.ex($q$update trip_expenses set void_reason='x' where id={eA}$q$) like 'ERR:23514:%');
perform pg_temp.exp('p staff cannot void (still)', $q$update trip_expenses set voided_at=now(), void_reason='x' where id={eA}$q$, '42501');
-- (q) one IN_PROGRESS trip per vehicle at index level
perform pg_temp.as_su();
perform pg_temp.eq('q index exists', $q$select count(*) from pg_indexes where indexname='trips_one_in_progress_per_vehicle' and indexdef like '%UNIQUE%' and indexdef like '%IN_PROGRESS%'$q$, '1');
perform pg_temp.exp('q first IN_PROGRESS', $q$insert into trips(id,organization_id,vehicle_id,driver_id,trip_date,origin,destination,status) values ({x1},{oA},{vA4},{dA},current_date,'o','d','IN_PROGRESS')$q$, 'ok1');
perform pg_temp.exp('q (setup) disable pre-check trigger to simulate a race', 'alter table public.trips disable trigger b_trip_before', 'ok');
perform pg_temp.chk('q duplicate IN_PROGRESS rejected by the unique index (23505 + index name)', pg_temp.ex($q$insert into trips(organization_id,vehicle_id,driver_id,trip_date,origin,destination,status) values ({oA},{vA4},{dA},current_date,'o','d','IN_PROGRESS')$q$) like 'ERR:23505:%trips_one_in_progress_per_vehicle%');
perform pg_temp.exp('q PLANNED on same vehicle fine', $q$insert into trips(id,organization_id,vehicle_id,driver_id,trip_date,origin,destination) values ({x2},{oA},{vA4},{dA},current_date,'o','d')$q$, 'ok1');
perform pg_temp.chk('q PLANNED->IN_PROGRESS duplicate rejected by index', pg_temp.ex($q$update trips set status='IN_PROGRESS' where id={x2}$q$) like 'ERR:23505:%');
perform pg_temp.exp('q COMPLETED on same vehicle fine', $q$update trips set status='COMPLETED' where id={x2}$q$, 'ok1');
perform pg_temp.exp('q different vehicle IN_PROGRESS fine', $q$insert into trips(organization_id,vehicle_id,driver_id,trip_date,origin,destination,status) values ({oA},{vA5},{dA},current_date,'o','d','IN_PROGRESS')$q$, 'ok1');
perform pg_temp.exp('q void the first', $q$update trips set voided_at=now(), void_reason='r' where id={x1}$q$, 'ok1');
perform pg_temp.exp('q new IN_PROGRESS after voiding first is fine', $q$insert into trips(organization_id,vehicle_id,driver_id,trip_date,origin,destination,status) values ({oA},{vA4},{dA},current_date,'o','d','IN_PROGRESS')$q$, 'ok1');
perform pg_temp.exp('q (teardown) re-enable trigger', 'alter table public.trips enable trigger b_trip_before', 'ok');
-- (r) storage: staff delete own uploads only
perform pg_temp.exp('r (setup) objects with owners', $q$insert into storage.objects(bucket_id,name,owner_id) values ('documents',{oA}::text||'/s1.pdf',{uAs}::text),('documents',{oA}::text||'/s2.pdf',{uAa}::text),('documents',{oB}::text||'/s3.pdf',{uBs}::text),('documents',{oB}::text||'/s4.pdf',{uAs}::text)$q$, 'ok');
perform pg_temp.as_user('uAs');
perform set_config('storage.allow_delete_query','true',true);
perform pg_temp.exp('r staff deletes object they uploaded', $q$delete from storage.objects where name={oA}::text||'/s1.pdf'$q$, 'ok1');
perform pg_temp.exp('r staff cannot delete colleague(admin) upload', $q$delete from storage.objects where name={oA}::text||'/s2.pdf'$q$, 'blocked');
perform pg_temp.exp('r staff cannot delete org B object', $q$delete from storage.objects where name={oB}::text||'/s3.pdf'$q$, 'blocked');
perform pg_temp.exp('r staff cannot delete org B object even if owner_id = self', $q$delete from storage.objects where name={oB}::text||'/s4.pdf'$q$, 'blocked');
perform pg_temp.as_user('uBs');
perform pg_temp.exp('r staff B deletes own', $q$delete from storage.objects where name={oB}::text||'/s3.pdf'$q$, 'ok1');
perform pg_temp.as_user('uAa');
perform pg_temp.exp('r admin can still delete colleague upload', $q$delete from storage.objects where name={oA}::text||'/s2.pdf'$q$, 'ok1');
perform pg_temp.as_anon();
perform pg_temp.exp('r anon cannot delete', $q$delete from storage.objects where bucket_id='documents'$q$, 'blocked');
-- (s) superseded documents
perform pg_temp.as_user('uAs');
perform pg_temp.exp('s vdoc REN old (+10)', $q$insert into vehicle_documents(id,organization_id,vehicle_id,document_type,expires_on) values ({x3},{oA},{vA5},'REN',current_date+10)$q$, 'ok1');
perform pg_temp.eq('s lone doc not superseded', $q$select superseded::text from v_vehicle_documents where id={x3}$q$, 'false');
perform pg_temp.exp('s vdoc REN new (+400)', $q$insert into vehicle_documents(id,organization_id,vehicle_id,document_type,expires_on) values ({x4},{oA},{vA5},'REN',current_date+400)$q$, 'ok1');
perform pg_temp.eq('s old is superseded', $q$select superseded::text from v_vehicle_documents where id={x3}$q$, 'true');
perform pg_temp.eq('s new is not superseded', $q$select superseded::text from v_vehicle_documents where id={x4}$q$, 'false');
perform pg_temp.eq('s status of superseded doc still computed', $q$select status from v_vehicle_documents where id={x3}$q$, 'EXPIRING_SOON');
perform pg_temp.exp('s vdoc same type other vehicle (+400)', $q$insert into vehicle_documents(organization_id,vehicle_id,document_type,expires_on) values ({oA},{vA6},'REN',current_date+400)$q$, 'ok1');
perform pg_temp.eq('s other vehicle does not supersede (still exactly one superseded on vA5)', $q$select count(*) from v_vehicle_documents where vehicle_id={vA5} and superseded$q$, '1');
perform pg_temp.exp('s vdoc REN2 null expiry', $q$insert into vehicle_documents(id,organization_id,vehicle_id,document_type,expires_on) values ({x5},{oA},{vA5},'REN2',null)$q$, 'ok1');
perform pg_temp.exp('s vdoc REN2 dated', $q$insert into vehicle_documents(id,organization_id,vehicle_id,document_type,expires_on) values ({x6},{oA},{vA5},'REN2',current_date+5)$q$, 'ok1');
perform pg_temp.eq('s NULL expiry never superseded', $q$select superseded::text from v_vehicle_documents where id={x5}$q$, 'false');
perform pg_temp.eq('s dated doc not superseded by NULL', $q$select superseded::text from v_vehicle_documents where id={x6}$q$, 'false');
perform pg_temp.exp('s vdoc REN3 a', $q$insert into vehicle_documents(organization_id,vehicle_id,document_type,expires_on,notes) values ({oA},{vA5},'REN3',current_date+20,'a')$q$, 'ok1');
perform pg_temp.exp('s vdoc REN3 b same date', $q$insert into vehicle_documents(organization_id,vehicle_id,document_type,expires_on,notes) values ({oA},{vA5},'REN3',current_date+20,'b')$q$, 'ok1');
perform pg_temp.eq('s equal expiry: neither superseded (strict)', $q$select count(*) from v_vehicle_documents where document_type='REN3' and superseded$q$, '0');
perform pg_temp.as_user('uAa');
perform pg_temp.exp('s admin voids the newer REN doc', $q$update vehicle_documents set voided_at=now(), void_reason='r' where id={x4}$q$, 'ok1');
perform pg_temp.eq('s voided newer no longer supersedes', $q$select superseded::text from v_vehicle_documents where id={x3}$q$, 'false');
perform pg_temp.as_user('uAs');
perform pg_temp.exp('s ddoc DREN old', $q$insert into driver_documents(id,organization_id,driver_id,document_type,expires_on) values ({x7},{oA},{dA},'DREN',current_date+10)$q$, 'ok1');
perform pg_temp.exp('s ddoc DREN new', $q$insert into driver_documents(id,organization_id,driver_id,document_type,expires_on) values ({x8},{oA},{dA},'DREN',current_date+300)$q$, 'ok1');
perform pg_temp.eq('s driver old superseded', $q$select superseded::text from v_driver_documents where id={x7}$q$, 'true');
perform pg_temp.eq('s driver new not superseded', $q$select superseded::text from v_driver_documents where id={x8}$q$, 'false');
perform pg_temp.eq('s foreign org rows invisible in views (security_invoker)', 'select count(*)::text from v_vehicle_documents where organization_id<>{oA}', '0');
perform pg_temp.eq('s views keep security_invoker', $q$select count(*) from pg_class where relname in ('v_vehicle_documents','v_driver_documents') and 'security_invoker=true' = any(reloptions)$q$, '2');
perform pg_temp.as_su();
perform pg_temp.eq('s anon has no grant on views', $q$select count(*) from information_schema.role_table_grants where table_name in ('v_vehicle_documents','v_driver_documents') and grantee='anon'$q$, '0');
-- (t) reminders: superseded ignored, auto-complete, reopen, sticky dismissed / user-completed
perform pg_temp.exp('t generate run 1', 'select private.generate_reminders()', 'ok');
perform pg_temp.eq('t vdA reminder pending', $q$select status from reminders where entity_id={vdA}$q$, 'PENDING');
perform pg_temp.as_user('uAs');
perform pg_temp.exp('t staff marks own deliveries READ', $q$update notification_deliveries set status='READ', read_at=now() where recipient_id={uAs}$q$, 'ok');
perform pg_temp.exp('t staff renews doc INS (+400) on vA', $q$insert into vehicle_documents(id,organization_id,vehicle_id,document_type,expires_on) values ({x9},{oA},{vA},'INS',current_date+400)$q$, 'ok1');
perform pg_temp.as_su();
perform pg_temp.exp('t generate after renewal', 'select private.generate_reminders()', 'ok');
perform pg_temp.eq('t superseded doc reminder auto-COMPLETED', $q$select status from reminders where entity_id={vdA}$q$, 'COMPLETED');
perform pg_temp.eq('t ... flagged auto_completed', $q$select auto_completed::text from reminders where entity_id={vdA}$q$, 'true');
perform pg_temp.eq('t renewal doc gets no reminder', $q$select count(*) from reminders where entity_id={x9}$q$, '0');
perform pg_temp.as_user('uAa');
perform pg_temp.exp('t admin voids the renewal', $q$update vehicle_documents set voided_at=now(), void_reason='wrong doc' where id={x9}$q$, 'ok1');
perform pg_temp.as_su();
perform pg_temp.exp('t generate after renewal voided', 'select private.generate_reminders()', 'ok');
perform pg_temp.eq('t auto-completed reminder REOPENED', $q$select status from reminders where entity_id={vdA}$q$, 'PENDING');
perform pg_temp.eq('t reopened: completed_at cleared, auto_completed false', $q$select count(*) from reminders where entity_id={vdA} and completed_at is null and not auto_completed$q$, '1');
perform pg_temp.eq('t reopened: still one reminder row', $q$select count(*) from reminders where entity_id={vdA}$q$, '1');
perform pg_temp.eq('t reopened: in_app deliveries reset to SENT / read_at null', $q$select count(*) from notification_deliveries d join reminders r on r.id=d.reminder_id where r.entity_id={vdA} and d.channel='in_app' and d.status='SENT' and d.read_at is null$q$, '2');
perform pg_temp.eq('t reopened: no non-reset in_app deliveries', $q$select count(*) from notification_deliveries d join reminders r on r.id=d.reminder_id where r.entity_id={vdA} and (d.status<>'SENT' or d.read_at is not null)$q$, '0');
-- dismissed stays sticky through supersede + un-supersede
perform pg_temp.as_user('uAs');
perform pg_temp.exp('t staff dismisses the reminder', $q$update reminders set status='DISMISSED', dismissed_at=now() where entity_id={vdA}$q$, 'ok1');
perform pg_temp.exp('t staff renews again', $q$insert into vehicle_documents(id,organization_id,vehicle_id,document_type,expires_on) values ({x1},{oA},{vA},'INS',current_date+500)$q$, 'ok1');
perform pg_temp.as_su();
perform pg_temp.exp('t generate (superseded again)', 'select private.generate_reminders()', 'ok');
perform pg_temp.eq('t DISMISSED stays DISMISSED while superseded', $q$select status from reminders where entity_id={vdA}$q$, 'DISMISSED');
perform pg_temp.as_user('uAa');
perform pg_temp.exp('t admin voids that renewal', $q$update vehicle_documents set voided_at=now(), void_reason='r2' where id={x1}$q$, 'ok1');
perform pg_temp.as_su();
perform pg_temp.exp('t generate (condition returns)', 'select private.generate_reminders()', 'ok');
perform pg_temp.eq('t DISMISSED not reopened', $q$select status from reminders where entity_id={vdA}$q$, 'DISMISSED');
perform pg_temp.eq('t no duplicate for dismissed condition', $q$select count(*) from reminders where entity_id={vdA}$q$, '1');
-- user-completed stays sticky
perform pg_temp.as_user('uBs');
perform pg_temp.exp('t staff B completes reminder', $q$update reminders set status='COMPLETED', completed_at=now() where entity_id={vdB}$q$, 'ok1');
perform pg_temp.as_su();
perform pg_temp.eq('t user-completed has auto_completed false', $q$select auto_completed::text from reminders where entity_id={vdB}$q$, 'false');
perform pg_temp.exp('t generate (condition still holds)', 'select private.generate_reminders()', 'ok');
perform pg_temp.eq('t user-COMPLETED not reopened (condition holds)', $q$select status from reminders where entity_id={vdB}$q$, 'COMPLETED');
perform pg_temp.exp('t condition disappears', $q$update vehicle_documents set expires_on=current_date+90 where id={vdB}$q$, 'ok1');
perform pg_temp.exp('t generate (gone)', 'select private.generate_reminders()', 'ok');
perform pg_temp.exp('t condition returns (same date/key)', $q$update vehicle_documents set expires_on=current_date+10 where id={vdB}$q$, 'ok1');
perform pg_temp.exp('t generate (back)', 'select private.generate_reminders()', 'ok');
perform pg_temp.eq('t user-COMPLETED still not reopened after gap', $q$select status from reminders where entity_id={vdB}$q$, 'COMPLETED');
perform pg_temp.eq('t user-completed: auto_completed still false', $q$select auto_completed::text from reminders where entity_id={vdB}$q$, 'false');
-- auto_completed is not user-updatable
perform pg_temp.as_user('uAs');
perform pg_temp.exp('t staff cannot update reminders.auto_completed', $q$update reminders set auto_completed=true where entity_id={vdA}$q$, '42501');
perform pg_temp.as_user('uAa');
perform pg_temp.exp('t admin cannot update reminders.auto_completed', $q$update reminders set auto_completed=false where entity_id={vdA}$q$, '42501');
perform pg_temp.as_su();
perform pg_temp.eq('t no user-updatable grant on auto_completed', $q$select count(*) from information_schema.column_privileges where table_name='reminders' and column_name='auto_completed' and grantee in ('authenticated','anon','public') and privilege_type='UPDATE'$q$, '0');
-- (u) create_trip_with_revenue
perform pg_temp.exp('u (setup) profile-less user', $q$insert into auth.users(id,aud,role,email) values ({x1},'authenticated','authenticated','zz-x1@test.invalid')$q$, 'ok1');
perform pg_temp.as_user('uAs');
perform pg_temp.exp('u rpc with revenue', $q$select public.create_trip_with_revenue({vA},{dA},current_date,'o','d','PLANNED','rpc1',1500,'freight')$q$, 'ok');
perform pg_temp.eq('u trip created (created_by = caller, org = caller org)', $q$select count(*) from trips where notes='rpc1' and created_by={uAs} and organization_id={oA} and status='PLANNED'$q$, '1');
perform pg_temp.eq('u revenue created with amount/date/description/created_by', $q$select count(*) from trip_revenue r join trips t on t.id=r.trip_id where t.notes='rpc1' and r.amount=1500 and r.revenue_date=t.trip_date and r.description='freight' and r.created_by={uAs} and r.organization_id={oA}$q$, '1');
perform pg_temp.exp('u rpc without revenue (null)', $q$select public.create_trip_with_revenue({vA},{dA},current_date,'o','d',null,'rpc2',null,null)$q$, 'ok');
perform pg_temp.eq('u null revenue: trip (default PLANNED), no revenue row', $q$select count(*) from trips t where notes='rpc2' and status='PLANNED' and not exists (select 1 from trip_revenue r where r.trip_id=t.id)$q$, '1');
perform pg_temp.exp('u rpc revenue 0', $q$select public.create_trip_with_revenue({vA},{dA},current_date,'o','d','PLANNED','rpc3',0,null)$q$, 'ok');
perform pg_temp.exp('u rpc revenue negative (skipped by design)', $q$select public.create_trip_with_revenue({vA},{dA},current_date,'o','d','PLANNED','rpc4',-5,null)$q$, 'ok');
perform pg_temp.eq('u zero/negative revenue: trips exist, no revenue rows', $q$select count(*) from trips t where notes in ('rpc3','rpc4') and not exists (select 1 from trip_revenue r where r.trip_id=t.id)$q$, '2');
perform pg_temp.chk('u revenue insert FAILS (numeric overflow) -> error', pg_temp.ex($q$select public.create_trip_with_revenue({vA},{dA},current_date,'o','d','PLANNED','rpc-fail',99999999999999999,null)$q$) like 'ERR:22003%');
perform pg_temp.eq('u ... and NO trip remains (atomic)', $q$select count(*) from trips where notes='rpc-fail'$q$, '0');
perform pg_temp.eq('u ... and no orphan revenue', $q$select count(*) from trip_revenue where amount > 1000000$q$, '0');
perform pg_temp.chk('u vehicle of another org rejected (23503)', pg_temp.ex($q$select public.create_trip_with_revenue({vB},{dA},current_date,'o','d','PLANNED','rpc-x1',10,null)$q$) like 'ERR:23503%');
perform pg_temp.chk('u driver of another org rejected (23503)', pg_temp.ex($q$select public.create_trip_with_revenue({vA},{dB},current_date,'o','d','PLANNED','rpc-x2',10,null)$q$) like 'ERR:23503%');
perform pg_temp.eq('u no trip for rejected calls', $q$select count(*) from trips where notes in ('rpc-x1','rpc-x2')$q$, '0');
perform pg_temp.exp('u triggers apply: IN_PROGRESS on MAINTENANCE vehicle fails', $q$select public.create_trip_with_revenue({vA2},{dA},current_date,'o','d','IN_PROGRESS','rpc-m',10,null)$q$, '23514');
perform pg_temp.eq('u ... no trip left', $q$select count(*) from trips where notes='rpc-m'$q$, '0');
perform pg_temp.exp('u inactive driver rejected (trigger)', $q$select public.create_trip_with_revenue({vA},{dA2},current_date,'o','d','PLANNED','rpc-i',10,null)$q$, '23514');
perform pg_temp.exp('u IN_PROGRESS via rpc on free vehicle', $q$select public.create_trip_with_revenue({vA6},{dA},current_date,'o','d','IN_PROGRESS','rpc5',200,null)$q$, 'ok');
perform pg_temp.eq('u vehicle ON_TRIP after rpc', $q$select status from vehicles where id={vA6}$q$, 'ON_TRIP');
perform pg_temp.exp('u second IN_PROGRESS via rpc on same vehicle fails', $q$select public.create_trip_with_revenue({vA6},{dA},current_date,'o','d','IN_PROGRESS','rpc6',200,null)$q$, 'err');
perform pg_temp.eq('u ... nothing persisted', $q$select count(*) from trips where notes='rpc6'$q$, '0');
perform pg_temp.as_user('uBs');
perform pg_temp.chk('u staff B cannot use org A vehicle', pg_temp.ex($q$select public.create_trip_with_revenue({vA},{dB},current_date,'o','d','PLANNED','rpc-b',10,null)$q$) like 'ERR:23503%');
perform pg_temp.as_user('x1');
perform pg_temp.exp('u profile-less user rejected (42501)', $q$select public.create_trip_with_revenue({vA},{dA},current_date,'o','d','PLANNED','rpc-n',10,null)$q$, '42501');
perform pg_temp.as_anon();
perform pg_temp.exp('u anon cannot execute rpc', $q$select public.create_trip_with_revenue({vA},{dA},current_date,'o','d','PLANNED','rpc-a',10,null)$q$, '42501');
perform pg_temp.as_su();
perform pg_temp.eq('u function is SECURITY INVOKER with empty search_path', $q$select count(*) from pg_proc where proname='create_trip_with_revenue' and not prosecdef and 'search_path=""' = any(proconfig)$q$, '1');
perform pg_temp.eq('u audit row written for rpc trip (as caller)', $q$select count(*) from audit_logs a join trips t on t.id=a.entity_id where a.entity_type='trips' and a.action='INSERT' and t.notes='rpc1' and a.actor_id={uAs}$q$, '1');
raise exception 'RESULT (% fail / % total): %', (select count(*) from pg_temp.res where line like 'FAIL%'), (select count(*) from pg_temp.res), E'\n'||coalesce((select string_agg(line, E'\n') filter (where line like 'FAIL%') from pg_temp.res),'')||E'\n--ALL--\n'||(select string_agg(line, E'\n') from pg_temp.res);
end $b$;
