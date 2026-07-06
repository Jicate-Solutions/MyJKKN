-- ============================================================================
-- Schools Network module — DB substrate (Agent A)
-- File:  20260630120000_schools_network_substrate.sql
-- Spec:  /tmp/schools-network-spec.md (2026-06-30)
-- Date:  2026-06-30
--
-- WHAT THIS MIGRATION DOES (additive + idempotent — safe to re-run):
--   1. Creates 5 enum types     (school_ownership, school_status,
--                                school_owner_role, school_contribution_kind,
--                                program_partner_status).
--   2. Creates 3 master tables  (school_session_types,
--                                program_partner_types,
--                                school_contact_roles) — seeded.
--   3. Creates 7 core tables    (program_partners, schools, school_contacts,
--                                school_jkkn_owners, school_sessions,
--                                school_contributions, program_partner_grants)
--                                with proper FK ordering.
--   4. Creates 3 helper fns     (user_owns_school, user_leads_partner_for_school,
--                                is_school_portal_user_for) — SECURITY DEFINER,
--                                REVOKE FROM anon/PUBLIC, GRANT TO authenticated.
--   5. Creates 10 service RPCs  (fn_schools_list, fn_school_detail,
--                                fn_school_session_record,
--                                fn_school_contribution_record,
--                                fn_school_assign_owner, fn_school_revoke_owner,
--                                fn_program_partner_rollup,
--                                fn_schools_silence_candidates,
--                                fn_schools_recompute_status [stub],
--                                fn_school_portal_self,
--                                fn_school_portal_submit_update).
--                                All SECURITY DEFINER + REVOKE anon/PUBLIC + GRANT authenticated.
--   6. Enables RLS + policies on all 10 new tables (canonical pattern:
--                                is_super_admin() OR is_admin() OR
--                                (user_has_permission('schools_network.X') AND
--                                 school-scope helper)).
--   7. Seeds 2 new custom_roles (outreach_coordinator, program_lead).
--   8. NOTIFY pgrst, 'reload schema' so PostgREST exposes new tables/RPCs immediately.
--
-- NOTE: fn_schools_recompute_status is a stub (returns 0). Threshold decisions
-- for active/sustaining/dormant transitions are deferred to Director (spec §12).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enum types (idempotent via DO block — Postgres has no CREATE TYPE IF NOT EXISTS)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'school_ownership') THEN
    CREATE TYPE public.school_ownership AS ENUM ('external', 'internal');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'school_status') THEN
    CREATE TYPE public.school_status AS ENUM ('active', 'sustaining', 'dormant', 'inactive');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'school_owner_role') THEN
    CREATE TYPE public.school_owner_role AS ENUM ('outreach_coordinator', 'program_lead');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'school_contribution_kind') THEN
    CREATE TYPE public.school_contribution_kind AS ENUM (
      'device', 'branding', 'website', 'fund', 'training_kit', 'other'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'program_partner_status') THEN
    CREATE TYPE public.program_partner_status AS ENUM ('active', 'sustaining', 'dormant');
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Master (value-list) tables
-- ----------------------------------------------------------------------------

-- 2.1 school_session_types
CREATE TABLE IF NOT EXISTS public.school_session_types (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL UNIQUE,
  label         TEXT NOT NULL,
  description   TEXT,
  is_system     BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 100,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.school_session_types ENABLE ROW LEVEL SECURITY;

INSERT INTO public.school_session_types (code, label, description, is_system, display_order) VALUES
  ('visit',       'School Visit',        'In-person visit by JKKN team',                TRUE, 10),
  ('orientation', 'Orientation Session', 'Career / program orientation for students',   TRUE, 20),
  ('training',    'Teacher Training',    'Capacity-building session for school staff',  TRUE, 30),
  ('event',       'Event / Workshop',    'On-campus or partner-led event',              TRUE, 40),
  ('drop_by',     'Drop-by / Informal',  'Quick informal contact',                      TRUE, 50)
ON CONFLICT (code) DO NOTHING;

-- 2.2 program_partner_types
CREATE TABLE IF NOT EXISTS public.program_partner_types (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL UNIQUE,
  label         TEXT NOT NULL,
  description   TEXT,
  is_system     BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 100,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.program_partner_types ENABLE ROW LEVEL SECURITY;

INSERT INTO public.program_partner_types (code, label, description, is_system, display_order) VALUES
  ('csr',             'CSR Partner',        'Corporate CSR arm (HP, NIIT, etc.)', TRUE, 10),
  ('grant',           'Grant / Foundation', 'Philanthropic foundation grant',     TRUE, 20),
  ('corporate',       'Corporate Sponsor',  'Direct corporate sponsorship',       TRUE, 30),
  ('govt_foundation', 'Govt. Foundation',   'Government / quasi-govt foundation', TRUE, 40)
ON CONFLICT (code) DO NOTHING;

-- 2.3 school_contact_roles
CREATE TABLE IF NOT EXISTS public.school_contact_roles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                TEXT NOT NULL UNIQUE,
  label               TEXT NOT NULL,
  description         TEXT,
  is_system           BOOLEAN NOT NULL DEFAULT FALSE,
  display_order       INTEGER NOT NULL DEFAULT 100,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  can_login_to_portal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.school_contact_roles ENABLE ROW LEVEL SECURITY;

INSERT INTO public.school_contact_roles
  (code, label, description, is_system, display_order, can_login_to_portal) VALUES
  ('hm',        'Headmaster',      'Headmaster / school head',        TRUE, 10, TRUE),
  ('principal', 'Principal',       'Principal (if distinct from HM)', TRUE, 20, TRUE),
  ('teacher',   'Teacher / Staff', 'Subject teacher or coordinator',  TRUE, 30, FALSE),
  ('alt',       'Alternate',       'Alternate point-of-contact',      TRUE, 40, FALSE)
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. Core entity tables (FK-safe order: program_partners → schools → children)
-- ----------------------------------------------------------------------------

-- 3.6 program_partners (created first so school_jkkn_owners can FK to it)
CREATE TABLE IF NOT EXISTS public.program_partners (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  type_id        UUID NOT NULL REFERENCES public.program_partner_types(id) ON DELETE RESTRICT,
  contact_email  TEXT,
  contact_phone  TEXT,
  contact_person TEXT,
  website_url    TEXT,
  status         program_partner_status NOT NULL DEFAULT 'active',
  notes          TEXT,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS program_partners_type_idx   ON public.program_partners (type_id);
CREATE INDEX IF NOT EXISTS program_partners_status_idx ON public.program_partners (status);
ALTER TABLE public.program_partners ENABLE ROW LEVEL SECURITY;

-- 3.1 schools (master record)
CREATE TABLE IF NOT EXISTS public.schools (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  ownership         school_ownership NOT NULL,
  institution_id    UUID REFERENCES public.institutions(id) ON DELETE SET NULL,
  district          TEXT,
  state             TEXT,
  pincode           TEXT,
  address           TEXT,
  latitude          NUMERIC(10, 7),
  longitude         NUMERIC(10, 7),
  intake_year       INTEGER,
  status            school_status NOT NULL DEFAULT 'active',
  status_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT schools_internal_requires_institution CHECK (
    (ownership = 'external' AND institution_id IS NULL) OR
    (ownership = 'internal' AND institution_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS schools_ownership_idx      ON public.schools (ownership);
CREATE INDEX IF NOT EXISTS schools_status_idx         ON public.schools (status);
CREATE INDEX IF NOT EXISTS schools_district_state_idx ON public.schools (state, district);
CREATE INDEX IF NOT EXISTS schools_institution_id_idx ON public.schools (institution_id) WHERE institution_id IS NOT NULL;
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

-- 3.2 school_contacts
CREATE TABLE IF NOT EXISTS public.school_contacts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  role_id    UUID NOT NULL REFERENCES public.school_contact_roles(id) ON DELETE RESTRICT,
  name       TEXT NOT NULL,
  phone      TEXT,
  email      TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT school_contacts_email_or_phone CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS school_contacts_one_primary_per_school
  ON public.school_contacts (school_id) WHERE is_primary = TRUE;
CREATE INDEX IF NOT EXISTS school_contacts_school_id_idx ON public.school_contacts (school_id);
CREATE INDEX IF NOT EXISTS school_contacts_email_idx     ON public.school_contacts (lower(email)) WHERE email IS NOT NULL;
ALTER TABLE public.school_contacts ENABLE ROW LEVEL SECURITY;

-- 3.3 school_jkkn_owners
CREATE TABLE IF NOT EXISTS public.school_jkkn_owners (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  jkkn_user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role               school_owner_role NOT NULL,
  program_partner_id UUID REFERENCES public.program_partners(id) ON DELETE SET NULL,
  assigned_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT school_jkkn_owners_program_lead_has_partner CHECK (
    role <> 'program_lead' OR program_partner_id IS NOT NULL
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS school_jkkn_owners_unique_active
  ON public.school_jkkn_owners (school_id, jkkn_user_id, role, COALESCE(program_partner_id::text, ''))
  WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS school_jkkn_owners_user_idx    ON public.school_jkkn_owners (jkkn_user_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS school_jkkn_owners_school_idx  ON public.school_jkkn_owners (school_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS school_jkkn_owners_partner_idx ON public.school_jkkn_owners (program_partner_id) WHERE program_partner_id IS NOT NULL;
ALTER TABLE public.school_jkkn_owners ENABLE ROW LEVEL SECURITY;

-- 3.4 school_sessions
CREATE TABLE IF NOT EXISTS public.school_sessions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id            UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  session_type_id      UUID NOT NULL REFERENCES public.school_session_types(id) ON DELETE RESTRICT,
  conducted_at         TIMESTAMPTZ NOT NULL,
  conducted_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  program_partner_id   UUID REFERENCES public.program_partners(id) ON DELETE SET NULL,
  attendee_count       INTEGER NOT NULL DEFAULT 0 CHECK (attendee_count >= 0),
  topic                TEXT,
  notes                TEXT,
  attachments          JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS school_sessions_school_id_idx    ON public.school_sessions (school_id, conducted_at DESC);
CREATE INDEX IF NOT EXISTS school_sessions_type_idx         ON public.school_sessions (session_type_id);
CREATE INDEX IF NOT EXISTS school_sessions_partner_idx      ON public.school_sessions (program_partner_id) WHERE program_partner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS school_sessions_conducted_by_idx ON public.school_sessions (conducted_by_user_id);
ALTER TABLE public.school_sessions ENABLE ROW LEVEL SECURITY;

-- 3.5 school_contributions
CREATE TABLE IF NOT EXISTS public.school_contributions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  kind               school_contribution_kind NOT NULL,
  description        TEXT NOT NULL,
  value_inr          NUMERIC(14, 2) CHECK (value_inr IS NULL OR value_inr >= 0),
  delivered_at       DATE,
  program_partner_id UUID REFERENCES public.program_partners(id) ON DELETE SET NULL,
  evidence_url       TEXT,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS school_contributions_school_idx  ON public.school_contributions (school_id, delivered_at DESC);
CREATE INDEX IF NOT EXISTS school_contributions_kind_idx    ON public.school_contributions (kind);
CREATE INDEX IF NOT EXISTS school_contributions_partner_idx ON public.school_contributions (program_partner_id) WHERE program_partner_id IS NOT NULL;
ALTER TABLE public.school_contributions ENABLE ROW LEVEL SECURITY;

-- 3.7 program_partner_grants
CREATE TABLE IF NOT EXISTS public.program_partner_grants (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_partner_id UUID NOT NULL REFERENCES public.program_partners(id) ON DELETE CASCADE,
  amount_inr         NUMERIC(14, 2) NOT NULL CHECK (amount_inr > 0),
  received_at        DATE NOT NULL,
  designated_for     TEXT NOT NULL,
  invoice_url        TEXT,
  receipt_no         TEXT,
  notes              TEXT,
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS program_partner_grants_partner_idx
  ON public.program_partner_grants (program_partner_id, received_at DESC);
ALTER TABLE public.program_partner_grants ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 4. Helper functions (per spec §4.1) — SECURITY DEFINER + REVOKE anon/PUBLIC
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.user_owns_school(p_school_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.school_jkkn_owners
     WHERE school_id    = p_school_id
       AND jkkn_user_id = auth.uid()
       AND is_active    = TRUE
  );
$$;
REVOKE EXECUTE ON FUNCTION public.user_owns_school(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.user_owns_school(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.user_leads_partner_for_school(p_school_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.school_jkkn_owners owner_link
      JOIN public.school_jkkn_owners partner_lead
        ON partner_lead.program_partner_id = owner_link.program_partner_id
       AND partner_lead.role = 'program_lead'
       AND partner_lead.jkkn_user_id = auth.uid()
       AND partner_lead.is_active = TRUE
     WHERE owner_link.school_id = p_school_id
       AND owner_link.is_active = TRUE
       AND owner_link.program_partner_id IS NOT NULL
    UNION ALL
    SELECT 1
      FROM public.school_sessions s
      JOIN public.school_jkkn_owners pl
        ON pl.program_partner_id = s.program_partner_id
       AND pl.role = 'program_lead'
       AND pl.jkkn_user_id = auth.uid()
       AND pl.is_active = TRUE
     WHERE s.school_id = p_school_id
       AND s.program_partner_id IS NOT NULL
  );
$$;
REVOKE EXECUTE ON FUNCTION public.user_leads_partner_for_school(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.user_leads_partner_for_school(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_school_portal_user_for(p_school_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.school_contacts sc
      JOIN auth.users u ON lower(u.email) = lower(sc.email)
      JOIN public.school_contact_roles r ON r.id = sc.role_id
     WHERE sc.school_id = p_school_id
       AND u.id = auth.uid()
       AND r.can_login_to_portal = TRUE
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_school_portal_user_for(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_school_portal_user_for(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. Service RPCs (per spec §6) — SECURITY DEFINER + REVOKE anon/PUBLIC
-- ----------------------------------------------------------------------------

-- 6.1 fn_schools_list — paginated list with owner/partner facets
CREATE OR REPLACE FUNCTION public.fn_schools_list(
  p_search             TEXT    DEFAULT NULL,
  p_ownership          TEXT    DEFAULT NULL,
  p_status             TEXT    DEFAULT NULL,
  p_state              TEXT    DEFAULT NULL,
  p_district           TEXT    DEFAULT NULL,
  p_program_partner_id UUID    DEFAULT NULL,
  p_jkkn_user_id       UUID    DEFAULT NULL,
  p_limit              INTEGER DEFAULT 50,
  p_offset             INTEGER DEFAULT 0
)
RETURNS TABLE (
  id                     UUID,
  name                   TEXT,
  ownership              school_ownership,
  district               TEXT,
  state                  TEXT,
  status                 school_status,
  intake_year            INTEGER,
  primary_owner_user_id  UUID,
  primary_owner_name     TEXT,
  program_partner_id     UUID,
  program_partner_name   TEXT,
  last_session_at        TIMESTAMPTZ,
  session_count          INTEGER,
  total_contribution_inr NUMERIC,
  total_count            BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total BIGINT;
BEGIN
  -- precompute total count once (over the filter, not the page)
  SELECT count(*)::bigint INTO v_total
    FROM public.schools s
    LEFT JOIN public.school_jkkn_owners o
      ON o.school_id = s.id AND o.is_active = TRUE
   WHERE (p_search IS NULL OR s.name ILIKE '%' || p_search || '%' OR coalesce(s.district,'') ILIKE '%' || p_search || '%')
     AND (p_ownership IS NULL OR s.ownership::text = p_ownership)
     AND (p_status IS NULL OR s.status::text = p_status)
     AND (p_state IS NULL OR s.state = p_state)
     AND (p_district IS NULL OR s.district = p_district)
     AND (p_program_partner_id IS NULL OR o.program_partner_id = p_program_partner_id)
     AND (p_jkkn_user_id IS NULL OR o.jkkn_user_id = p_jkkn_user_id);

  RETURN QUERY
  WITH filtered AS (
    SELECT DISTINCT s.id, s.name, s.ownership, s.district, s.state, s.status, s.intake_year
      FROM public.schools s
      LEFT JOIN public.school_jkkn_owners o
        ON o.school_id = s.id AND o.is_active = TRUE
     WHERE (p_search IS NULL OR s.name ILIKE '%' || p_search || '%' OR coalesce(s.district,'') ILIKE '%' || p_search || '%')
       AND (p_ownership IS NULL OR s.ownership::text = p_ownership)
       AND (p_status IS NULL OR s.status::text = p_status)
       AND (p_state IS NULL OR s.state = p_state)
       AND (p_district IS NULL OR s.district = p_district)
       AND (p_program_partner_id IS NULL OR o.program_partner_id = p_program_partner_id)
       AND (p_jkkn_user_id IS NULL OR o.jkkn_user_id = p_jkkn_user_id)
  ),
  primary_owner AS (
    SELECT DISTINCT ON (o.school_id)
           o.school_id,
           o.jkkn_user_id,
           o.program_partner_id,
           p.full_name AS owner_name
      FROM public.school_jkkn_owners o
      LEFT JOIN public.profiles p ON p.id = o.jkkn_user_id
     WHERE o.is_active = TRUE
     ORDER BY o.school_id,
              CASE WHEN o.role = 'outreach_coordinator' THEN 0 ELSE 1 END,
              o.assigned_at DESC
  ),
  session_stats AS (
    SELECT school_id,
           max(conducted_at) AS last_session_at,
           count(*)::int     AS session_count
      FROM public.school_sessions
     GROUP BY school_id
  ),
  contrib_stats AS (
    SELECT school_id,
           coalesce(sum(value_inr), 0)::numeric AS total_contribution_inr
      FROM public.school_contributions
     GROUP BY school_id
  )
  SELECT f.id,
         f.name,
         f.ownership,
         f.district,
         f.state,
         f.status,
         f.intake_year,
         po.jkkn_user_id              AS primary_owner_user_id,
         po.owner_name                AS primary_owner_name,
         po.program_partner_id        AS program_partner_id,
         pp.name                      AS program_partner_name,
         ss.last_session_at,
         coalesce(ss.session_count, 0) AS session_count,
         coalesce(cs.total_contribution_inr, 0)::numeric AS total_contribution_inr,
         v_total                      AS total_count
    FROM filtered f
    LEFT JOIN primary_owner po ON po.school_id = f.id
    LEFT JOIN public.program_partners pp ON pp.id = po.program_partner_id
    LEFT JOIN session_stats ss ON ss.school_id = f.id
    LEFT JOIN contrib_stats cs ON cs.school_id = f.id
   ORDER BY f.name
   LIMIT p_limit OFFSET p_offset;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_schools_list(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, INTEGER, INTEGER) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_schools_list(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, INTEGER, INTEGER) TO authenticated;

-- 6.2 fn_school_detail — single school + owners[] + contacts[] + last 10 sessions + contribution totals
CREATE OR REPLACE FUNCTION public.fn_school_detail(p_school_id UUID)
RETURNS TABLE (
  school              JSONB,
  owners              JSONB,
  contacts            JSONB,
  recent_sessions     JSONB,
  contribution_count  INTEGER,
  contribution_total  NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    to_jsonb(s.*) AS school,
    coalesce(
      (SELECT jsonb_agg(o ORDER BY o.assigned_at DESC) FROM (
         SELECT o.id, o.school_id, o.jkkn_user_id,
                p.full_name AS jkkn_user_name,
                o.role, o.program_partner_id,
                pp.name AS program_partner_name,
                o.assigned_at, o.assigned_by, o.is_active
           FROM public.school_jkkn_owners o
           LEFT JOIN public.profiles p ON p.id = o.jkkn_user_id
           LEFT JOIN public.program_partners pp ON pp.id = o.program_partner_id
          WHERE o.school_id = p_school_id AND o.is_active = TRUE
       ) o),
      '[]'::jsonb
    ) AS owners,
    coalesce(
      (SELECT jsonb_agg(c ORDER BY c.is_primary DESC, c.name) FROM (
         SELECT sc.id, sc.school_id, sc.role_id,
                r.code AS role_code, r.label AS role_label,
                sc.name, sc.phone, sc.email, sc.is_primary, sc.notes,
                sc.created_at, sc.updated_at
           FROM public.school_contacts sc
           LEFT JOIN public.school_contact_roles r ON r.id = sc.role_id
          WHERE sc.school_id = p_school_id
       ) c),
      '[]'::jsonb
    ) AS contacts,
    coalesce(
      (SELECT jsonb_agg(ss ORDER BY ss.conducted_at DESC) FROM (
         SELECT ses.id, ses.school_id, ses.session_type_id,
                st.code AS session_type_code, st.label AS session_type_label,
                ses.conducted_at, ses.conducted_by_user_id, p.full_name AS conducted_by_name,
                ses.program_partner_id, pp.name AS program_partner_name,
                ses.attendee_count, ses.topic, ses.notes, ses.attachments, ses.metadata,
                ses.created_at, ses.updated_at
           FROM public.school_sessions ses
           LEFT JOIN public.school_session_types st ON st.id = ses.session_type_id
           LEFT JOIN public.profiles p ON p.id = ses.conducted_by_user_id
           LEFT JOIN public.program_partners pp ON pp.id = ses.program_partner_id
          WHERE ses.school_id = p_school_id
          ORDER BY ses.conducted_at DESC
          LIMIT 10
       ) ss),
      '[]'::jsonb
    ) AS recent_sessions,
    (SELECT count(*)::int FROM public.school_contributions WHERE school_id = p_school_id) AS contribution_count,
    coalesce((SELECT sum(value_inr) FROM public.school_contributions WHERE school_id = p_school_id), 0)::numeric AS contribution_total
  FROM public.schools s
  WHERE s.id = p_school_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_school_detail(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_school_detail(UUID) TO authenticated;

-- 6.3 fn_school_session_record — record a session (returns session id)
CREATE OR REPLACE FUNCTION public.fn_school_session_record(
  p_school_id          UUID,
  p_session_type_code  TEXT,
  p_conducted_at       TIMESTAMPTZ,
  p_attendee_count     INTEGER DEFAULT 0,
  p_program_partner_id UUID    DEFAULT NULL,
  p_topic              TEXT    DEFAULT NULL,
  p_notes              TEXT    DEFAULT NULL,
  p_attachments        JSONB   DEFAULT '[]'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type_id    UUID;
  v_session_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_type_id FROM public.school_session_types WHERE code = p_session_type_code AND is_active = TRUE;
  IF v_type_id IS NULL THEN
    RAISE EXCEPTION 'unknown session_type_code: %', p_session_type_code USING ERRCODE = '22023';
  END IF;

  -- Permission: super-admin / admin / owner / partner-lead
  IF NOT (
    is_super_admin() OR is_admin()
    OR (user_has_permission('schools_network.sessions.create')
        AND (user_owns_school(p_school_id) OR user_leads_partner_for_school(p_school_id)))
  ) THEN
    RAISE EXCEPTION 'not authorized to record session for school %', p_school_id USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.school_sessions
    (school_id, session_type_id, conducted_at, conducted_by_user_id,
     program_partner_id, attendee_count, topic, notes, attachments)
  VALUES
    (p_school_id, v_type_id, p_conducted_at, auth.uid(),
     p_program_partner_id, coalesce(p_attendee_count, 0), p_topic, p_notes, coalesce(p_attachments, '[]'::jsonb))
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_school_session_record(UUID, TEXT, TIMESTAMPTZ, INTEGER, UUID, TEXT, TEXT, JSONB) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_school_session_record(UUID, TEXT, TIMESTAMPTZ, INTEGER, UUID, TEXT, TEXT, JSONB) TO authenticated;

-- 6.4 fn_school_contribution_record — record a contribution
CREATE OR REPLACE FUNCTION public.fn_school_contribution_record(
  p_school_id          UUID,
  p_kind               school_contribution_kind,
  p_description        TEXT,
  p_value_inr          NUMERIC DEFAULT NULL,
  p_delivered_at       DATE    DEFAULT NULL,
  p_program_partner_id UUID    DEFAULT NULL,
  p_evidence_url       TEXT    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    is_super_admin() OR is_admin()
    OR (user_has_permission('schools_network.contributions.create')
        AND (user_owns_school(p_school_id) OR user_leads_partner_for_school(p_school_id)))
  ) THEN
    RAISE EXCEPTION 'not authorized to record contribution for school %', p_school_id USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.school_contributions
    (school_id, kind, description, value_inr, delivered_at, program_partner_id, evidence_url, created_by)
  VALUES
    (p_school_id, p_kind, p_description, p_value_inr, p_delivered_at, p_program_partner_id, p_evidence_url, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_school_contribution_record(UUID, school_contribution_kind, TEXT, NUMERIC, DATE, UUID, TEXT) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_school_contribution_record(UUID, school_contribution_kind, TEXT, NUMERIC, DATE, UUID, TEXT) TO authenticated;

-- 6.5 fn_school_assign_owner / fn_school_revoke_owner
CREATE OR REPLACE FUNCTION public.fn_school_assign_owner(
  p_school_id          UUID,
  p_jkkn_user_id       UUID,
  p_role               school_owner_role,
  p_program_partner_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('schools_network.owners.manage')) THEN
    RAISE EXCEPTION 'not authorized to assign owners' USING ERRCODE = '42501';
  END IF;

  IF p_role = 'program_lead' AND p_program_partner_id IS NULL THEN
    RAISE EXCEPTION 'program_lead role requires p_program_partner_id' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.school_jkkn_owners
    (school_id, jkkn_user_id, role, program_partner_id, assigned_by, is_active)
  VALUES
    (p_school_id, p_jkkn_user_id, p_role, p_program_partner_id, auth.uid(), TRUE)
  ON CONFLICT (school_id, jkkn_user_id, role, COALESCE(program_partner_id::text, '')) WHERE is_active = TRUE
    DO UPDATE SET assigned_at = now(), assigned_by = auth.uid(), updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_school_assign_owner(UUID, UUID, school_owner_role, UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_school_assign_owner(UUID, UUID, school_owner_role, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_school_revoke_owner(p_owner_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('schools_network.owners.manage')) THEN
    RAISE EXCEPTION 'not authorized to revoke owners' USING ERRCODE = '42501';
  END IF;

  UPDATE public.school_jkkn_owners
     SET is_active = FALSE, updated_at = now()
   WHERE id = p_owner_id AND is_active = TRUE;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_school_revoke_owner(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_school_revoke_owner(UUID) TO authenticated;

-- 6.6 fn_program_partner_rollup — partner-scoped roll-up for program_lead dashboard
CREATE OR REPLACE FUNCTION public.fn_program_partner_rollup(p_program_partner_id UUID)
RETURNS TABLE (
  partner_id              UUID,
  partner_name            TEXT,
  schools_touched         INTEGER,
  sessions_count          INTEGER,
  attendees_total         INTEGER,
  contributions_count     INTEGER,
  contributions_inr       NUMERIC,
  grants_received_inr     NUMERIC,
  grants_outstanding_inr  NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pp.id   AS partner_id,
    pp.name AS partner_name,
    (
      SELECT count(DISTINCT school_id)::int FROM (
        SELECT school_id FROM public.school_jkkn_owners WHERE program_partner_id = pp.id AND is_active = TRUE
        UNION
        SELECT school_id FROM public.school_sessions WHERE program_partner_id = pp.id
        UNION
        SELECT school_id FROM public.school_contributions WHERE program_partner_id = pp.id
      ) u
    ) AS schools_touched,
    (SELECT count(*)::int FROM public.school_sessions WHERE program_partner_id = pp.id) AS sessions_count,
    coalesce((SELECT sum(attendee_count)::int FROM public.school_sessions WHERE program_partner_id = pp.id), 0) AS attendees_total,
    (SELECT count(*)::int FROM public.school_contributions WHERE program_partner_id = pp.id) AS contributions_count,
    coalesce((SELECT sum(value_inr) FROM public.school_contributions WHERE program_partner_id = pp.id), 0)::numeric AS contributions_inr,
    coalesce((SELECT sum(amount_inr) FROM public.program_partner_grants WHERE program_partner_id = pp.id), 0)::numeric AS grants_received_inr,
    -- "outstanding" = grants_received_inr - contributions_inr (floor at 0)
    GREATEST(
      coalesce((SELECT sum(amount_inr) FROM public.program_partner_grants WHERE program_partner_id = pp.id), 0)
      - coalesce((SELECT sum(value_inr) FROM public.school_contributions WHERE program_partner_id = pp.id), 0),
      0
    )::numeric AS grants_outstanding_inr
  FROM public.program_partners pp
  WHERE pp.id = p_program_partner_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_program_partner_rollup(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_program_partner_rollup(UUID) TO authenticated;

-- 6.7 fn_schools_silence_candidates — schools with no session in p_silence_days days
CREATE OR REPLACE FUNCTION public.fn_schools_silence_candidates(p_silence_days INTEGER DEFAULT 14)
RETURNS TABLE (
  school_id             UUID,
  school_name           TEXT,
  last_session_at       TIMESTAMPTZ,
  days_silent           INTEGER,
  primary_owner_user_id UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH last_seen AS (
    SELECT s.id, s.name, s.status,
           (SELECT max(conducted_at) FROM public.school_sessions ss WHERE ss.school_id = s.id) AS last_at
      FROM public.schools s
     WHERE s.status IN ('active','sustaining')
  ),
  primary_owner AS (
    SELECT DISTINCT ON (o.school_id)
           o.school_id, o.jkkn_user_id
      FROM public.school_jkkn_owners o
     WHERE o.is_active = TRUE
     ORDER BY o.school_id,
              CASE WHEN o.role = 'outreach_coordinator' THEN 0 ELSE 1 END,
              o.assigned_at DESC
  )
  SELECT ls.id,
         ls.name,
         ls.last_at,
         CASE WHEN ls.last_at IS NULL THEN p_silence_days ELSE EXTRACT(DAY FROM now() - ls.last_at)::int END,
         po.jkkn_user_id
    FROM last_seen ls
    LEFT JOIN primary_owner po ON po.school_id = ls.id
   WHERE ls.last_at IS NULL
      OR ls.last_at < now() - (p_silence_days || ' days')::interval;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_schools_silence_candidates(INTEGER) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_schools_silence_candidates(INTEGER) TO authenticated;

-- 6.8 fn_schools_recompute_status — STUB (spec §12: thresholds need Director input)
CREATE OR REPLACE FUNCTION public.fn_schools_recompute_status(p_school_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- STUB. Returns 0 until Director ratifies the active/sustaining/dormant thresholds
  -- (see spec §12 open follow-ups). The function exists so the cron + service layer
  -- can call it without 42883; the implementation lands in a follow-up PR.
  IF p_school_id IS NULL THEN
    RETURN 0;
  ELSE
    RETURN 0;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_schools_recompute_status(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_schools_recompute_status(UUID) TO authenticated;

-- 6.9 fn_school_portal_self — HM portal self-view
CREATE OR REPLACE FUNCTION public.fn_school_portal_self()
RETURNS TABLE (
  school             JSONB,
  recent_sessions    JSONB,
  contribution_count INTEGER,
  contribution_total NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  -- Find the school where the magic-link user is a portal-eligible contact
  SELECT sc.school_id INTO v_school_id
    FROM public.school_contacts sc
    JOIN auth.users u ON lower(u.email) = lower(sc.email)
    JOIN public.school_contact_roles r ON r.id = sc.role_id
   WHERE u.id = auth.uid() AND r.can_login_to_portal = TRUE
   ORDER BY sc.is_primary DESC, sc.created_at DESC
   LIMIT 1;

  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'no school associated with this portal session' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    to_jsonb(s.*) AS school,
    coalesce(
      (SELECT jsonb_agg(ss ORDER BY ss.conducted_at DESC) FROM (
         SELECT ses.id, ses.session_type_id,
                st.code AS session_type_code, st.label AS session_type_label,
                ses.conducted_at, ses.attendee_count, ses.topic, ses.notes
           FROM public.school_sessions ses
           LEFT JOIN public.school_session_types st ON st.id = ses.session_type_id
          WHERE ses.school_id = v_school_id
          ORDER BY ses.conducted_at DESC
          LIMIT 5
       ) ss),
      '[]'::jsonb
    ),
    (SELECT count(*)::int FROM public.school_contributions WHERE school_id = v_school_id),
    coalesce((SELECT sum(value_inr) FROM public.school_contributions WHERE school_id = v_school_id), 0)::numeric
  FROM public.schools s
  WHERE s.id = v_school_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_school_portal_self() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_school_portal_self() TO authenticated;

-- 6.10 fn_school_portal_submit_update — HM submits an update as a 'drop_by' session
CREATE OR REPLACE FUNCTION public.fn_school_portal_submit_update(
  p_message     TEXT,
  p_attachments JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id  UUID;
  v_type_id    UUID;
  v_session_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT sc.school_id INTO v_school_id
    FROM public.school_contacts sc
    JOIN auth.users u ON lower(u.email) = lower(sc.email)
    JOIN public.school_contact_roles r ON r.id = sc.role_id
   WHERE u.id = auth.uid() AND r.can_login_to_portal = TRUE
   ORDER BY sc.is_primary DESC, sc.created_at DESC
   LIMIT 1;

  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'no school associated with this portal session' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_type_id FROM public.school_session_types WHERE code = 'drop_by' AND is_active = TRUE;
  IF v_type_id IS NULL THEN
    RAISE EXCEPTION 'master row school_session_types.code=drop_by missing' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.school_sessions
    (school_id, session_type_id, conducted_at, conducted_by_user_id,
     attendee_count, notes, attachments, metadata)
  VALUES
    (v_school_id, v_type_id, now(), auth.uid(),
     0, p_message, coalesce(p_attachments, '[]'::jsonb), jsonb_build_object('source','hm_portal'))
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_school_portal_submit_update(TEXT, JSONB) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_school_portal_submit_update(TEXT, JSONB) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. RLS policies (per spec §4) — canonical pattern
-- ----------------------------------------------------------------------------

-- 6.A Master tables: read-open to authenticated, admin-write
DROP POLICY IF EXISTS school_session_types_select_authed ON public.school_session_types;
CREATE POLICY school_session_types_select_authed ON public.school_session_types
  FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS school_session_types_admin_write ON public.school_session_types;
CREATE POLICY school_session_types_admin_write ON public.school_session_types
  FOR ALL TO authenticated
  USING      (is_super_admin() OR is_admin() OR user_has_permission('schools_network.master.manage'))
  WITH CHECK (is_super_admin() OR is_admin() OR user_has_permission('schools_network.master.manage'));

DROP POLICY IF EXISTS program_partner_types_select_authed ON public.program_partner_types;
CREATE POLICY program_partner_types_select_authed ON public.program_partner_types
  FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS program_partner_types_admin_write ON public.program_partner_types;
CREATE POLICY program_partner_types_admin_write ON public.program_partner_types
  FOR ALL TO authenticated
  USING      (is_super_admin() OR is_admin() OR user_has_permission('schools_network.master.manage'))
  WITH CHECK (is_super_admin() OR is_admin() OR user_has_permission('schools_network.master.manage'));

DROP POLICY IF EXISTS school_contact_roles_select_authed ON public.school_contact_roles;
CREATE POLICY school_contact_roles_select_authed ON public.school_contact_roles
  FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS school_contact_roles_admin_write ON public.school_contact_roles;
CREATE POLICY school_contact_roles_admin_write ON public.school_contact_roles
  FOR ALL TO authenticated
  USING      (is_super_admin() OR is_admin() OR user_has_permission('schools_network.master.manage'))
  WITH CHECK (is_super_admin() OR is_admin() OR user_has_permission('schools_network.master.manage'));

-- 6.B schools
DROP POLICY IF EXISTS schools_select ON public.schools;
CREATE POLICY schools_select ON public.schools
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('schools_network.schools.view')
      AND (
        user_owns_school(id)
        OR user_leads_partner_for_school(id)
        OR (ownership = 'internal' AND role_has_institution_access(institution_id))
      )
    )
    OR is_school_portal_user_for(id)
  );

DROP POLICY IF EXISTS schools_insert ON public.schools;
CREATE POLICY schools_insert ON public.schools
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR user_has_permission('schools_network.schools.create')
  );

DROP POLICY IF EXISTS schools_update ON public.schools;
CREATE POLICY schools_update ON public.schools
  FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('schools_network.schools.edit')
        AND (user_owns_school(id) OR user_leads_partner_for_school(id)))
  )
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('schools_network.schools.edit')
        AND (user_owns_school(id) OR user_leads_partner_for_school(id)))
  );

DROP POLICY IF EXISTS schools_delete ON public.schools;
CREATE POLICY schools_delete ON public.schools
  FOR DELETE USING (is_super_admin() OR is_admin());

-- 6.C school_contacts
DROP POLICY IF EXISTS school_contacts_select ON public.school_contacts;
CREATE POLICY school_contacts_select ON public.school_contacts
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('schools_network.contacts.view')
        AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id)))
    OR is_school_portal_user_for(school_id)
  );
DROP POLICY IF EXISTS school_contacts_insert ON public.school_contacts;
CREATE POLICY school_contacts_insert ON public.school_contacts
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('schools_network.contacts.create')
        AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id)))
  );
DROP POLICY IF EXISTS school_contacts_update ON public.school_contacts;
CREATE POLICY school_contacts_update ON public.school_contacts
  FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('schools_network.contacts.edit')
        AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id)))
  )
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('schools_network.contacts.edit')
        AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id)))
  );
DROP POLICY IF EXISTS school_contacts_delete ON public.school_contacts;
CREATE POLICY school_contacts_delete ON public.school_contacts
  FOR DELETE USING (is_super_admin() OR is_admin());

-- 6.D school_sessions
DROP POLICY IF EXISTS school_sessions_select ON public.school_sessions;
CREATE POLICY school_sessions_select ON public.school_sessions
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('schools_network.sessions.view')
        AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id)))
    OR is_school_portal_user_for(school_id)
  );
DROP POLICY IF EXISTS school_sessions_insert ON public.school_sessions;
CREATE POLICY school_sessions_insert ON public.school_sessions
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('schools_network.sessions.create')
        AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id)))
  );
DROP POLICY IF EXISTS school_sessions_update ON public.school_sessions;
CREATE POLICY school_sessions_update ON public.school_sessions
  FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('schools_network.sessions.edit')
        AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id)))
  )
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('schools_network.sessions.edit')
        AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id)))
  );
DROP POLICY IF EXISTS school_sessions_delete ON public.school_sessions;
CREATE POLICY school_sessions_delete ON public.school_sessions
  FOR DELETE USING (is_super_admin() OR is_admin());

-- 6.E school_contributions
DROP POLICY IF EXISTS school_contributions_select ON public.school_contributions;
CREATE POLICY school_contributions_select ON public.school_contributions
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('schools_network.contributions.view')
        AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id)))
    OR is_school_portal_user_for(school_id)
  );
DROP POLICY IF EXISTS school_contributions_insert ON public.school_contributions;
CREATE POLICY school_contributions_insert ON public.school_contributions
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('schools_network.contributions.create')
        AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id)))
  );
DROP POLICY IF EXISTS school_contributions_update ON public.school_contributions;
CREATE POLICY school_contributions_update ON public.school_contributions
  FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('schools_network.contributions.edit')
        AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id)))
  )
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('schools_network.contributions.edit')
        AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id)))
  );
DROP POLICY IF EXISTS school_contributions_delete ON public.school_contributions;
CREATE POLICY school_contributions_delete ON public.school_contributions
  FOR DELETE USING (is_super_admin() OR is_admin());

-- 6.F school_jkkn_owners
DROP POLICY IF EXISTS school_jkkn_owners_select ON public.school_jkkn_owners;
CREATE POLICY school_jkkn_owners_select ON public.school_jkkn_owners
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR jkkn_user_id = auth.uid()
    OR (user_has_permission('schools_network.owners.view')
        AND user_owns_school(school_id))
  );
DROP POLICY IF EXISTS school_jkkn_owners_admin_write ON public.school_jkkn_owners;
CREATE POLICY school_jkkn_owners_admin_write ON public.school_jkkn_owners
  FOR ALL USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('schools_network.owners.manage')
  )
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR user_has_permission('schools_network.owners.manage')
  );

-- 6.G program_partners
DROP POLICY IF EXISTS program_partners_select ON public.program_partners;
CREATE POLICY program_partners_select ON public.program_partners
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('schools_network.partners.view')
  );
DROP POLICY IF EXISTS program_partners_admin_write ON public.program_partners;
CREATE POLICY program_partners_admin_write ON public.program_partners
  FOR ALL USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('schools_network.partners.manage')
  )
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR user_has_permission('schools_network.partners.manage')
  );

-- 6.H program_partner_grants
DROP POLICY IF EXISTS program_partner_grants_select ON public.program_partner_grants;
CREATE POLICY program_partner_grants_select ON public.program_partner_grants
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('schools_network.grants.view')
  );
DROP POLICY IF EXISTS program_partner_grants_admin_write ON public.program_partner_grants;
CREATE POLICY program_partner_grants_admin_write ON public.program_partner_grants
  FOR ALL USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('schools_network.grants.manage')
  )
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR user_has_permission('schools_network.grants.manage')
  );

-- ----------------------------------------------------------------------------
-- 7. Anon lockdown — explicit (defense-in-depth on top of policies)
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.school_session_types     FROM anon;
REVOKE ALL ON public.program_partner_types    FROM anon;
REVOKE ALL ON public.school_contact_roles     FROM anon;
REVOKE ALL ON public.schools                  FROM anon;
REVOKE ALL ON public.school_contacts          FROM anon;
REVOKE ALL ON public.school_jkkn_owners       FROM anon;
REVOKE ALL ON public.school_sessions          FROM anon;
REVOKE ALL ON public.school_contributions     FROM anon;
REVOKE ALL ON public.program_partners         FROM anon;
REVOKE ALL ON public.program_partner_grants   FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_session_types     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_partner_types    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_contact_roles     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schools                  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_contacts          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_jkkn_owners       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_sessions          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_contributions     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_partners         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_partner_grants   TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. Custom roles seed (per spec §5) — 2 new system roles
-- ----------------------------------------------------------------------------
INSERT INTO public.custom_roles
  (role_key, role_name, description, permissions, institution_scope, is_system_role, is_active)
VALUES (
  'outreach_coordinator',
  'Outreach Coordinator',
  'JKKN faculty assigned as in-charge of one or more schools. Scope: own assigned schools (via school_jkkn_owners.jkkn_user_id = auth.uid()).',
  '{
    "schools_network.schools.view":         true,
    "schools_network.schools.create":       true,
    "schools_network.schools.edit":         true,
    "schools_network.contacts.view":        true,
    "schools_network.contacts.create":      true,
    "schools_network.contacts.edit":        true,
    "schools_network.sessions.view":        true,
    "schools_network.sessions.create":      true,
    "schools_network.sessions.edit":        true,
    "schools_network.contributions.view":   true,
    "schools_network.contributions.create": true,
    "schools_network.contributions.edit":   true,
    "schools_network.owners.view":          true,
    "schools_network.partners.view":        true,
    "schools_network.master.view":          true
  }'::jsonb,
  'own',
  TRUE,
  TRUE
)
ON CONFLICT (role_key) DO NOTHING;

INSERT INTO public.custom_roles
  (role_key, role_name, description, permissions, institution_scope, is_system_role, is_active)
VALUES (
  'program_lead',
  'Program Lead',
  'Coordinator of a program partner (HP, NIIT, etc.). Faceted by program_partner_id via school_jkkn_owners. Sees/edits any school their partner touches.',
  '{
    "schools_network.schools.view":         true,
    "schools_network.schools.edit":         true,
    "schools_network.contacts.view":        true,
    "schools_network.sessions.view":        true,
    "schools_network.sessions.create":      true,
    "schools_network.sessions.edit":        true,
    "schools_network.contributions.view":   true,
    "schools_network.contributions.create": true,
    "schools_network.contributions.edit":   true,
    "schools_network.owners.view":          true,
    "schools_network.partners.view":        true,
    "schools_network.partners.edit":        true,
    "schools_network.grants.view":          true,
    "schools_network.master.view":          true
  }'::jsonb,
  'own',
  TRUE,
  TRUE
)
ON CONFLICT (role_key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 9. PostgREST schema reload so the new tables/RPCs become callable immediately
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
