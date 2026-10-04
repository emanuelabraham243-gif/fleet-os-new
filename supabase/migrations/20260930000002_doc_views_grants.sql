-- Recreating the v_*_documents views in 20260925000001 re-applied Supabase's default privileges, which
-- handed `authenticated` DELETE again. Restore the original rule from rls_audit_triggers: records are
-- voided, not deleted, so no org-scoped relation grants DELETE to `authenticated`.
revoke delete on public.v_vehicle_documents, public.v_driver_documents, public.v_general_documents
  from authenticated;
revoke all on public.v_vehicle_documents, public.v_driver_documents, public.v_general_documents
  from anon;
