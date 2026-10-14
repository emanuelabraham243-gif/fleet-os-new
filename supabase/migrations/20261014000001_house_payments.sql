-- FleetOS: House & real estate payments (Documents > Other documents > Family).
--
-- Replaces the separate House Payments page: each property the family is buying, and every payment
-- made on it. Admin-only (family finances): staff can neither read nor write these rows.
--
-- "Confirmed" figures never include unknown or unverified numbers: price_confirmed and
-- payments_complete say whether the price and the payment history can be trusted for totals, and each
-- payment carries its own `confirmed` flag. Removing a house or a payment is a void (reason required),
-- never a delete, so the audit log keeps the history.

create table public.house_properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null check (btrim(name) <> ''),
  kind text,
  location text,
  house_no text,
  ownership text,
  price numeric(14, 2) check (price > 0), -- NULL = unknown
  price_confirmed boolean not null default true,
  plan text not null default 'other' check (plan in ('full', 'rounds', 'progress', 'other')),
  rounds_total integer check (rounds_total > 0),
  round_amount numeric(14, 2) check (round_amount > 0),
  payments_complete boolean not null default true, -- every payment made so far is recorded
  property_status text not null default 'none'
    check (property_status in ('none', 'under_construction', 'gov_hold', 'on_hold', 'handed_over')),
  hold_reason text,
  next_due_on date,
  next_amount numeric(14, 2) check (next_amount > 0),
  finishing_pending boolean not null default false,
  finishing_amount numeric(14, 2) check (finishing_amount > 0),
  checks text[] not null default '{}', -- open questions still to verify, one per item
  notes text,
  refs text,
  sort_order integer not null default 0,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  void_reason text
);

create index house_properties_org_idx on public.house_properties (organization_id, sort_order);

create table public.house_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  property_id uuid not null references public.house_properties (id),
  amount numeric(14, 2) not null check (amount > 0),
  paid_on date, -- NULL = date not recorded
  kind text not null default 'other'
    check (kind in ('advance', 'round', 'progress', 'finishing', 'full', 'other')),
  label text, -- e.g. round number, or "House 1" when one property covers two units
  confirmed boolean not null default true,
  note text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  void_reason text
);

create index house_payments_property_idx on public.house_payments (property_id);
create index house_payments_org_idx on public.house_payments (organization_id);

-- A payment must belong to a property of the same organization.
create function private.house_payment_same_org() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.house_properties p
    where p.id = new.property_id and p.organization_id = new.organization_id
  ) then
    raise exception 'house payment property is in another organization' using errcode = '23503';
  end if;
  return new;
end $$;
revoke all on function private.house_payment_same_org() from public, anon, authenticated;

create trigger house_payment_same_org before insert or update of property_id, organization_id
  on public.house_payments for each row execute function private.house_payment_same_org();

alter table public.house_properties enable row level security;
alter table public.house_payments enable row level security;

create policy p_house_properties_select on public.house_properties for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_admin()));
create policy p_house_properties_insert on public.house_properties for insert to authenticated
  with check (organization_id = (select private.current_org_id()) and (select private.is_admin())
    and created_by = (select auth.uid()) and voided_at is null);
create policy p_house_properties_update on public.house_properties for update to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_admin()))
  with check (organization_id = (select private.current_org_id()) and (select private.is_admin()));

create policy p_house_payments_select on public.house_payments for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_admin()));
create policy p_house_payments_insert on public.house_payments for insert to authenticated
  with check (organization_id = (select private.current_org_id()) and (select private.is_admin())
    and created_by = (select auth.uid()) and voided_at is null);
create policy p_house_payments_update on public.house_payments for update to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_admin()))
  with check (organization_id = (select private.current_org_id()) and (select private.is_admin()));

create trigger a_guard before update on public.house_properties
  for each row execute function private.guard_row();
create trigger z_audit after insert or update or delete on public.house_properties
  for each row execute function private.audit_row();
create trigger set_updated_at before update on public.house_properties
  for each row execute function private.set_updated_at();

create trigger a_guard before update on public.house_payments
  for each row execute function private.guard_row();
create trigger z_audit after insert or update or delete on public.house_payments
  for each row execute function private.audit_row();
create trigger set_updated_at before update on public.house_payments
  for each row execute function private.set_updated_at();

revoke delete on public.house_properties, public.house_payments from authenticated;
revoke all on public.house_properties, public.house_payments from anon;
