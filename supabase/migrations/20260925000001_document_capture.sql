-- FleetOS V1 revision pass 3: document capture + auto-cleanup.
--
-- 1. vehicle/driver documents get an optional user-given `title` (general_documents already has one).
-- 2. Every document table gets `original_file_path`: for camera captures, `file_path` holds the cleaned
--    scan (shown by default) and `original_file_path` keeps the untouched photo so nothing is lost if
--    the automatic cleanup gets it wrong. NULL for ordinary file-picker uploads.
-- 3. The v_*_documents views select `d.*`, which Postgres expands when the view is created, so they are
--    recreated (same definitions) to expose the new columns. Nothing else depends on these views.

alter table public.vehicle_documents
  add column title text check (title is null or char_length(title) <= 120),
  add column original_file_path text;

alter table public.driver_documents
  add column title text check (title is null or char_length(title) <= 120),
  add column original_file_path text;

alter table public.general_documents
  add column original_file_path text;

drop view public.v_vehicle_documents;
drop view public.v_driver_documents;
drop view public.v_general_documents;

create view public.v_vehicle_documents with (security_invoker = true) as
select d.*, private.doc_status(d.expires_on) as status,
       d.expires_on - private.today_addis() as days_left,
       (d.expires_on is not null and exists (
          select 1 from public.vehicle_documents n
          where n.organization_id = d.organization_id and n.vehicle_id = d.vehicle_id
            and n.document_type = d.document_type and n.voided_at is null
            and n.expires_on > d.expires_on)) as superseded
from public.vehicle_documents d
where d.voided_at is null;

create view public.v_driver_documents with (security_invoker = true) as
select d.*, private.doc_status(d.expires_on) as status,
       d.expires_on - private.today_addis() as days_left,
       (d.expires_on is not null and exists (
          select 1 from public.driver_documents n
          where n.organization_id = d.organization_id and n.driver_id = d.driver_id
            and n.document_type = d.document_type and n.voided_at is null
            and n.expires_on > d.expires_on)) as superseded
from public.driver_documents d
where d.voided_at is null;

create view public.v_general_documents with (security_invoker = true) as
select d.*, private.doc_status(d.expires_on) as status,
       d.expires_on - private.today_addis() as days_left
from public.general_documents d
where d.voided_at is null;
