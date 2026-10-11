-- FleetOS: "Pending" drivers.
--
-- A client fleet is onboarded before every driver's details are in hand (one driver per vehicle).
-- PENDING marks a driver slot that exists but is not complete yet: it is listed on the Drivers page
-- but is not offered when starting a trip (the trip form only lists ACTIVE drivers). An admin fills
-- in the details and switches the status to Active.
--
-- Seeds 6 pending slots ("Driver 1" .. "Driver 6") for each real (non-demo) organization that has no
-- drivers yet. Organizations that already have drivers are left untouched, so re-running is a no-op.

alter table public.drivers drop constraint drivers_status_check;
alter table public.drivers
  add constraint drivers_status_check check (status in ('ACTIVE', 'INACTIVE', 'PENDING'));

insert into public.drivers (organization_id, name, status, notes)
select o.id, 'Driver ' || n, 'PENDING', 'Details pending - fill in from the client intake sheet.'
from public.organizations o
cross join generate_series(1, 6) as n
where not o.is_demo
  and not exists (select 1 from public.drivers d where d.organization_id = o.id);
