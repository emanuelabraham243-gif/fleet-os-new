-- FleetOS V1: in-app notification feed. security_invoker => the caller's RLS applies
-- (deliveries: own rows or admin; reminders: own organization). The app filters recipient_id = auth.uid().
create view public.v_notifications with (security_invoker = true) as
select n.id as delivery_id,
       n.recipient_id,
       n.status as delivery_status,
       n.read_at,
       n.sent_at,
       r.id as reminder_id,
       r.organization_id,
       r.type,
       r.entity_type,
       r.entity_id,
       r.params,
       r.due_on,
       r.priority,
       r.status as reminder_status,
       r.created_at
from public.notification_deliveries n
join public.reminders r on r.id = n.reminder_id
where n.channel = 'in_app';

revoke all on public.v_notifications from anon, public;
grant select on public.v_notifications to authenticated;
