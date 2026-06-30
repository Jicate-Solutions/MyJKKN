-- 20260630220200_induction_drop_legacy_rpc_overloads.sql
-- FOLLOW-UP to 20260630220100_induction_multi_target_rpcs.sql.
--
-- That migration added array params to fn_induction_create_program /
-- fn_induction_preview_enroll. Because the added params changed each function's
-- SIGNATURE, CREATE OR REPLACE created OVERLOADS rather than replacing — the
-- original 11-arg create and 5-arg preview functions kept existing alongside the
-- new 14-arg / 8-arg versions. A supabase-js .rpc() call sends NAMED arguments, so
-- a call carrying only the original keys matches BOTH overloads and PostgREST
-- cannot disambiguate (PGRST203) — which would break induction creation/preview on
-- any caller still on the legacy arity (e.g. main before the service update ships).
--
-- Drop the legacy signatures so exactly ONE version of each remains. The new
-- version's array params default to NULL, so legacy named calls (original keys
-- only) resolve to the single remaining function and transparently take the
-- back-compat v_multi=false path. Idempotent via IF EXISTS.
DROP FUNCTION IF EXISTS public.fn_induction_create_program(
  uuid, uuid, text, timestamptz, timestamptz, text, text, integer, text, uuid, text);
DROP FUNCTION IF EXISTS public.fn_induction_preview_enroll(
  uuid, integer, text, text, uuid[]);

NOTIFY pgrst, 'reload schema';
