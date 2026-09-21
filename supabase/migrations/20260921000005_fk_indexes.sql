-- FleetOS V1: cover the two organization_id foreign keys the performance advisor flagged
-- on tables that are filtered per organization. Other flagged FKs (created_by/voided_by,
-- composite (x_id, organization_id)) are already served by prefix indexes on the leading
-- column or are never joined; left as-is on purpose.
create index if not exists deliveries_org_idx on public.notification_deliveries (organization_id);
create index if not exists prefs_org_idx on public.notification_preferences (organization_id);
