-- ============================================================================
-- 20261019020000_loop_owner_scopes.sql
-- Per-institution loop owners — the Attendance → Intervention loop is owned by
-- each college's Principal (Director decision 2026-09-06).
--
-- WHY THIS EXISTS
--   loop_registry carries ONE owner_email per loop and has no per-institution
--   owner mechanism at all (sweep 2026-09-06: the only owner migration on main
--   is 20260821111719, an UPDATE of that single column). The Director ruled
--   that 'attendance-intervention' is owned by EACH COLLEGE'S PRINCIPAL, split
--   by college. This file adds that mechanism, add-only:
--
--   * loop_owner_scopes — one row per (loop_key, institution_id) naming the
--     owner for that institution. A loop with no scope rows keeps behaving
--     exactly as before (registry owner_email only).
--   * fn_loop_set_scoped_owner — the super-admin-only write path for the
--     Owners & verdicts panel on /admin/loops, same shape and same
--     enforcement as fn_loop_set_owner (20260812024306): SECURITY DEFINER with
--     its OWN is_super_admin() check; a blank email REMOVES the scope row so
--     that institution falls back to the registry owner.
--   * Seed: seven scope rows for 'attendance-intervention', one per live
--     Principal, resolved by institutions.name at apply time. The seed RAISES
--     if ANY name fails to resolve — it never seeds six of seven.
--
--   loop_registry.owner_email for 'attendance-intervention' is deliberately
--   LEFT as director@jkkn.ac.in: it is the estate-level fallback / escalation
--   owner for any institution that has no scope row (Arts & Science (Self),
--   Allied Health Sciences, College of Education, …), and the address the
--   estate-wide verdict still goes to. Nothing in this file changes who is
--   NOTIFIED — learner-risk-staff-notifications and every other routing path
--   are untouched; wiring Principals into verdict prompts is a separate
--   Director decision.
--
-- RLS mirrors loop_registry exactly: SELECT for super/admin only (the live
-- policy is the initplan-wrapped form from rls_initplan_wrap_sweep.sql), no
-- INSERT/UPDATE/DELETE policies — writes go through the RPC or service_role.
--
-- FILE ONLY — NOT applied by merging. Applying is the orchestrator's
-- Director-gated merge-time step.
-- ============================================================================

-- ── 1. Table ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.loop_owner_scopes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loop_key        text NOT NULL REFERENCES public.loop_registry(loop_key) ON DELETE CASCADE,
  institution_id  uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  owner_email     text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loop_key, institution_id)
);

COMMENT ON TABLE public.loop_owner_scopes IS
  'Per-institution loop owner. Overrides loop_registry.owner_email for that institution only; a loop with no rows here is owned estate-wide by its registry owner_email. Added 2026-09-06 (Director decision: attendance-intervention is owned by each college''s Principal).';

-- ── 2. RLS — mirror of loop_registry_select_admin ────────────────────────────

ALTER TABLE public.loop_owner_scopes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'loop_owner_scopes_select_admin') THEN
    CREATE POLICY "loop_owner_scopes_select_admin" ON public.loop_owner_scopes
      FOR SELECT USING ((SELECT is_super_admin()) OR (SELECT is_admin()));
  END IF;
END $$;
-- No INSERT/UPDATE/DELETE policies: only the RPC below (SECURITY DEFINER) and
-- service_role (bypasses RLS) write.

-- Same grant surface as loop_registry: Supabase's default privileges grant ALL
-- on new tables to anon AND authenticated — say what we mean: SELECT only, and
-- never anon.
REVOKE ALL ON public.loop_owner_scopes FROM anon, authenticated, PUBLIC;
GRANT  SELECT ON public.loop_owner_scopes TO authenticated;

-- ── 3. Write path — same contract as fn_loop_set_owner ───────────────────────
-- Blank / whitespace email = "no scoped owner for this institution": the row
-- is deleted and the institution falls back to loop_registry.owner_email.
-- Returns true when a row was written or removed; false when p_loop_key has
-- no registry row (surfaced as an explicit error toast in the panel).

CREATE OR REPLACE FUNCTION public.fn_loop_set_scoped_owner(
  p_loop_key text,
  p_institution_id uuid,
  p_owner_email text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := NULLIF(btrim(p_owner_email), '');
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM loop_registry WHERE loop_key = p_loop_key) THEN
    RETURN false;
  END IF;
  IF p_institution_id IS NULL THEN RAISE EXCEPTION 'institution required'; END IF;

  IF v_email IS NULL THEN
    DELETE FROM loop_owner_scopes
     WHERE loop_key = p_loop_key AND institution_id = p_institution_id;
    RETURN true;
  END IF;

  INSERT INTO loop_owner_scopes (loop_key, institution_id, owner_email)
  VALUES (p_loop_key, p_institution_id, v_email)
  ON CONFLICT (loop_key, institution_id)
  DO UPDATE SET owner_email = EXCLUDED.owner_email, updated_at = now();
  RETURN true;
END $$;

-- MANDATORY house policy (2026-06-06): Supabase's default privileges grant
-- anon EXECUTE on every new function — revoke it explicitly, separate from
-- PUBLIC. Reference: migration 20260605191101 + feedback_supabase_anon_execute_default_grant.
REVOKE EXECUTE ON FUNCTION public.fn_loop_set_scoped_owner(text, uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_loop_set_scoped_owner(text, uuid, text) TO authenticated;

-- ── 4. Seed — the seven Principals, resolved by institutions.name ─────────────
-- Names verified against production 2026-09-06 (14 institutions; each of the
-- seven Principal profiles below carries exactly the institution_id these
-- names resolve to). Fails loudly on ANY miss: never six of seven.

DO $$
DECLARE
  v_missing text;
  v_seed CONSTANT text[][] := ARRAY[
    ['artsprincipal@jkkn.ac.in',      'JKKN College of Arts and Science (Aided)'],
    ['principaljkkncet@jkkn.ac.in',   'JKKN College of Engineering and Technology'],
    ['nursingprincipal@jkkn.ac.in',   'JKKN College of Nursing and Research'],
    ['pharmacyprincipal@jkkn.ac.in',  'JKKN College of Pharmacy'],
    ['dentalprincipal@jkkn.ac.in',    'JKKN Dental College and Hospital'],
    ['matricprincipal@jkkn.ac.in',    'JKKN Matric Higher Secondary School'],
    ['vidhyalyaprincipal@jkkn.ac.in', 'Nattraja Vidhyalya CBSE']
  ];
  i int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.loop_registry WHERE loop_key = 'attendance-intervention') THEN
    RAISE EXCEPTION 'loop_owner_scopes seed: loop_registry has no attendance-intervention row — apply 20260929010000 first';
  END IF;

  FOR i IN 1 .. array_length(v_seed, 1) LOOP
    IF (SELECT id FROM public.institutions WHERE name = v_seed[i][2]) IS NULL THEN
      v_missing := concat_ws(', ', v_missing, v_seed[i][2]);
    END IF;
  END LOOP;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'loop_owner_scopes seed: institution name(s) did not resolve: % — nothing seeded', v_missing;
  END IF;

  FOR i IN 1 .. array_length(v_seed, 1) LOOP
    INSERT INTO public.loop_owner_scopes (loop_key, institution_id, owner_email)
    VALUES (
      'attendance-intervention',
      (SELECT id FROM public.institutions WHERE name = v_seed[i][2]),
      v_seed[i][1]
    )
    ON CONFLICT (loop_key, institution_id) DO NOTHING;  -- add-only: a later panel edit is never overwritten
  END LOOP;

  IF (SELECT count(*) FROM public.loop_owner_scopes WHERE loop_key = 'attendance-intervention') < 7 THEN
    RAISE EXCEPTION 'loop_owner_scopes seed: expected 7 attendance-intervention rows after seed, found %',
      (SELECT count(*) FROM public.loop_owner_scopes WHERE loop_key = 'attendance-intervention');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
