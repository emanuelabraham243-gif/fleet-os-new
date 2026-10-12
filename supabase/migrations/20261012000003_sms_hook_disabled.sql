-- FleetOS: placeholder "Send SMS" auth hook while no SMS service is bought.
--
-- Supabase needs an SMS sender before the Phone sign-in provider can be switched on. FleetOS never asks
-- Supabase Auth to send SMS (accounts are created with phone_confirm by the server, and reset codes are
-- sent by the app itself), so this hook only refuses. Select it under Authentication -> Hooks ->
-- "Send SMS hook" (Postgres function public.send_sms_disabled). Replace it when an SMS provider is set up.

create function public.send_sms_disabled(event jsonb) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('error', jsonb_build_object(
    'http_code', 503,
    'message', 'SMS is not set up for FleetOS yet.'
  ))
$$;

revoke all on function public.send_sms_disabled(jsonb) from public, anon, authenticated;
grant execute on function public.send_sms_disabled(jsonb) to supabase_auth_admin;
