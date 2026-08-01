-- ============================================================================
-- Updated: 2026-08-01 — CAC cluster collaboration: four read-only views.
--
-- NOT applied to any database — Director-gated apply. Nothing here writes,
-- creates a table, or stores a new fact. Every figure is derived at read time
-- from records other modules already own.
--
-- WHAT THIS IS FOR
-- The Cluster Academic Council has, until now, had no cluster-level reading of
-- anything. It could see itself — its roster, its meetings — and it could see
-- per-institution metrics side by side. What it could not see is the one thing
-- a cluster body exists to see: whether the colleges actually work with each
-- other. These four views answer that from data already in production.
--
-- WHY VIEWS AND NOT AN RPC
-- The neighbouring surface (fn_cac_measured_metrics, 20260730110000) is one
-- SECURITY DEFINER function because it fans out across a dozen unrelated tables
-- and needed a single guarded read. These four are narrow, each over two or
-- three tables, and none of them needs to see past the caller's own access
-- rules to be useful. A DEFINER function here would be strictly more authority
-- for strictly no gain — so they are views, and INVOKER views at that.
--
-- WHY security_invoker = true, ON EVERY ONE
-- A plain PostgreSQL view executes as its OWNER. Rows the caller could never
-- select from the base table come straight back through the view, past that
-- table's RLS, with nothing in the view's own definition to hint at it. That is
-- exactly how 27 relations became anon-readable on this project on 2026-07-31.
-- `security_invoker` makes the view evaluate the base tables as the caller, so
-- each one keeps whatever protection it already had. The consequence is real
-- and deliberate: a viewer whose access rules narrow `resource_reservations`
-- sees a narrower exchange map, and the page says so rather than presenting a
-- partial read as a finding.
--
-- WHY REVOKE authenticated BEFORE GRANTing IT SELECT
-- Supabase ships `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES
-- TO authenticated` (views included — a view is a relation). At CREATE time the
-- ACL therefore already reads `authenticated=arwdDxt`, and a bare `GRANT SELECT`
-- adds nothing while silently leaving INSERT/UPDATE/DELETE in place. These are
-- all read-only aggregates so no write could succeed anyway, but the ACL is what
-- an auditor reads, and it should say read-only because it IS read-only.
--
-- WHY EVERY VIEW AGGREGATES
-- The `authenticated` role carries an 8s statement_timeout and the CAC page
-- fires several reads at once. Each view returns tens of rows, not thousands,
-- so the grouping happens once in the database rather than once per page.
--
-- WHAT IS DELIBERATELY NOT HERE
-- No count is written into any comment as a fact to be trusted later. Eleven
-- hardcoded counts had to be stripped out of this module once already when the
-- numbers moved and the prose did not. The figures quoted below are dated
-- readings used to explain a join, never a contract.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SOLUTION FUNNEL — activated department -> solution -> phase -> publication.
--
-- The drop-off is the finding. Read 2026-08-01: 44 departments activated across
-- six colleges, 2 solutions, 0 phases, 0 publications. A panel that reported
-- "44 solution departments" and stopped would be describing an intention as an
-- achievement.
--
-- Attribution runs through the ACTIVATED DEPARTMENT rather than
-- `sh_solutions.institution_id`, which is nullable. Joining on
-- `lead_department_id` keeps every stage of the funnel counted against the same
-- population, so `depts_producing` can never exceed `depts_activated` and the
-- ratio is honest by construction.
--
-- LEFT JOIN to `institutions` on purpose: an institution the caller's access
-- rules hide still yields its row, with a null name, so the page can say a row
-- is out of view instead of quietly shortening the funnel.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_cac_solution_funnel
WITH (security_invoker = true) AS
SELECT
  sd.institution_id,
  i.name                                                             AS institution_name,
  i.iqac_code,
  count(DISTINCT sd.id)                                              AS departments_activated,
  count(DISTINCT sd.department_id) FILTER (WHERE s.id IS NOT NULL)   AS departments_producing,
  count(DISTINCT s.id)                                               AS solutions,
  count(DISTINCT ph.id)                                              AS phases,
  count(DISTINCT pb.id)                                              AS publications
FROM public.sh_solution_departments sd
LEFT JOIN public.institutions       i  ON i.id = sd.institution_id
LEFT JOIN public.sh_solutions       s  ON s.lead_department_id = sd.department_id
LEFT JOIN public.sh_solution_phases ph ON ph.solution_id = s.id
LEFT JOIN public.sh_publications    pb ON pb.solution_id = s.id
WHERE sd.status = 'active'
GROUP BY sd.institution_id, i.name, i.iqac_code;

COMMENT ON VIEW public.v_cac_solution_funnel IS
  'CAC: per-institution drop-off from activated solution department to solution '
  'to phase to publication. Read-only, security_invoker.';

-- ----------------------------------------------------------------------------
-- 2. EXCHANGE MAP — who gives, who receives, in the two places JKKN records it.
--
-- The two sources put giver and receiver in OPPOSITE columns, and getting that
-- backwards inverts every arrow on the panel:
--
--   TEACHING  a Senior Learner whose home is A is scheduled onto a plan owned
--             by B. A GIVES the teaching. B RECEIVES it. Home comes from that
--             person's profile (`profiles.institution_id`, reached through
--             `staff.profile_id`); host is `staff_plans.institution_id`.
--
--   BOOKINGS  someone whose home is B books a resource belonging to A.
--             A GIVES the room. B RECEIVES it. Owner is
--             `resources.institution_id`; the booker's home comes from the
--             profile behind `resource_reservations.user_id`. (There is no
--             `institution_id` on `resource_reservations` at all — the owner has
--             to come from the resource.)
--
-- `relation` splits HUB from PEER and is the most important column here. Read
-- 2026-08-01: 78 of 79 bookings crossed an institution boundary, but 63 of them
-- were a college booking JKKN Main Office — shared central infrastructure, not
-- two colleges choosing to work together. Only 15 were college-to-college. A
-- headline of "78 of 79 cross institutions" would be arithmetically true and
-- would misdescribe the cluster, which is the precise failure the council's
-- locked decisions exist to prevent. Kept as a column rather than a filter so
-- the hub traffic stays visible and countable instead of being deleted to make
-- the peer number look better.
--
-- The hub is identified by name, not by a hardcoded id: identifiers differ
-- between production and staging, names do not — the same reasoning
-- cac-institution-groups.ts already uses for the two schools.
--
-- Matched on lower(btrim(name)), NOT a raw `=`. institutions.name is a typed
-- value in an editable table, so a trailing space or a case edit would make
-- the hub CTE return no rows — every one of the 63 hub bookings would then
-- reclassify as peer collaboration and the headline would read 78 instead of
-- 15, with no error raised anywhere. cac-institution-groups.ts normalises the
-- same way and for the same stated reason.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_cac_exchange_edges
WITH (security_invoker = true) AS
WITH hub AS (
  SELECT id FROM public.institutions
   WHERE lower(btrim(name)) = 'jkkn main office'
),
teaching AS (
  SELECT
    p.institution_id  AS giver_institution_id,
    sp.institution_id AS receiver_institution_id,
    st.id             AS person_id,
    spc.id            AS unit_id
  FROM public.staff_plan_courses spc
  JOIN public.staff_plans sp ON sp.id = spc.staff_plan_id
  JOIN public.staff st       ON st.id = spc.staff_id
  JOIN public.profiles p     ON p.id  = st.profile_id
  WHERE p.institution_id IS DISTINCT FROM sp.institution_id
    AND p.institution_id  IS NOT NULL
    AND sp.institution_id IS NOT NULL
),
bookings AS (
  SELECT
    r.institution_id AS giver_institution_id,
    p.institution_id AS receiver_institution_id,
    rr.user_id       AS person_id,
    rr.id            AS unit_id
  FROM public.resource_reservations rr
  JOIN public.resources r ON r.id = rr.resource_id
  JOIN public.profiles  p ON p.id = rr.user_id
  WHERE r.institution_id IS DISTINCT FROM p.institution_id
    AND r.institution_id IS NOT NULL
    AND p.institution_id IS NOT NULL
),
edges AS (
  SELECT 'teaching'::text AS exchange_kind, * FROM teaching
  UNION ALL
  SELECT 'booking'::text  AS exchange_kind, * FROM bookings
)
SELECT
  e.exchange_kind,
  CASE
    WHEN e.giver_institution_id    IN (SELECT id FROM hub)
      OR e.receiver_institution_id IN (SELECT id FROM hub)
    THEN 'hub'
    ELSE 'peer'
  END                                     AS relation,
  e.giver_institution_id,
  g.name                                  AS giver_name,
  g.iqac_code                             AS giver_iqac_code,
  e.receiver_institution_id,
  rc.name                                 AS receiver_name,
  rc.iqac_code                            AS receiver_iqac_code,
  count(DISTINCT e.unit_id)               AS units,
  count(DISTINCT e.person_id)             AS people
FROM edges e
LEFT JOIN public.institutions g  ON g.id  = e.giver_institution_id
LEFT JOIN public.institutions rc ON rc.id = e.receiver_institution_id
GROUP BY
  e.exchange_kind,
  2,
  e.giver_institution_id, g.name, g.iqac_code,
  e.receiver_institution_id, rc.name, rc.iqac_code;

COMMENT ON VIEW public.v_cac_exchange_edges IS
  'CAC: cross-institution teaching assignments and resource bookings, one row '
  'per giver/receiver pair, split into hub and peer traffic. Read-only, '
  'security_invoker.';

-- ----------------------------------------------------------------------------
-- 3a. LEARNING-FRAMEWORK OVERLAP — titles taught in more than one institution.
--     (The relation keeps the name `v_cac_curriculum_overlap`: an identifier is
--      not copy, and renaming a database object to satisfy a prose convention
--      would break every reader for no reader's benefit.)
--
-- Matching is exact on `lower(btrim(course_name))`, which makes every figure it
-- produces a FLOOR and never a ceiling. The proof is in the data: one of the
-- titles that matched across three colleges on 2026-08-01 was
-- "data strcutures and algorithms" — a typo, repeated identically in three
-- places. It matched because the same mistake was made three times. Wherever
-- data entry differed at all, a genuinely shared course did NOT match and is
-- missing from this count. The panel must say floor, because a reader who takes
-- it as a ceiling draws the opposite conclusion about how much is shared.
--
-- No fuzzy matching here on purpose. Trigram or Levenshtein matching would
-- raise the number and lower the trust: the council would be reading a
-- similarity threshold somebody chose, not a fact about what is taught.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_cac_curriculum_overlap
WITH (security_invoker = true) AS
WITH normalised AS (
  SELECT
    lower(btrim(c.course_name)) AS course_title,
    c.institution_id
  FROM public.courses c
  WHERE c.institution_id IS NOT NULL
    AND btrim(coalesce(c.course_name, '')) <> ''
)
SELECT
  n.course_title,
  count(DISTINCT n.institution_id)                       AS institution_count,
  array_agg(DISTINCT i.name ORDER BY i.name) FILTER (WHERE i.name IS NOT NULL)
                                                         AS institution_names
FROM normalised n
LEFT JOIN public.institutions i ON i.id = n.institution_id
GROUP BY n.course_title
HAVING count(DISTINCT n.institution_id) > 1;

COMMENT ON VIEW public.v_cac_curriculum_overlap IS
  'CAC: course titles taught in more than one institution, matched exactly on '
  'lower(btrim(course_name)) so the count is a floor. Read-only, '
  'security_invoker.';

-- ----------------------------------------------------------------------------
-- 3b. The two denominators the overlap panel needs.
--
-- Separate from 3a so the page can print "N of M titles" without pulling every
-- shared title over the wire to count them. The panel reads this one row plus
-- the top of 3a.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_cac_curriculum_overlap_summary
WITH (security_invoker = true) AS
WITH normalised AS (
  SELECT
    lower(btrim(c.course_name)) AS course_title,
    c.institution_id
  FROM public.courses c
  WHERE c.institution_id IS NOT NULL
    AND btrim(coalesce(c.course_name, '')) <> ''
),
grouped AS (
  SELECT course_title, count(DISTINCT institution_id) AS institution_count
  FROM normalised
  GROUP BY course_title
)
SELECT
  count(*)                                        AS distinct_titles,
  count(*) FILTER (WHERE institution_count > 1)   AS shared_titles,
  max(institution_count)                          AS widest_span
FROM grouped;

COMMENT ON VIEW public.v_cac_curriculum_overlap_summary IS
  'CAC: denominators for the learning-framework overlap panel — distinct normalised '
  'course titles and how many span more than one institution. Read-only, '
  'security_invoker.';

-- ----------------------------------------------------------------------------
-- 4. ISOLATION AND DEPENDENCY — the same edges read twice.
--
-- One row per TEACHING institution, whether or not it appears on any edge. The
-- institutions that appear nowhere in view 2 are the ones this panel is for, and
-- they can only be named by starting from the institution list and joining
-- outward — start from the edges and the isolated colleges are, by definition,
-- absent.
--
-- Two readings, because volume alone is ambiguous:
--
--   ISOLATION    `peer_bookings_made` / `peer_lends_made` at zero means this
--                institution has never borrowed from, or lent to, a sibling
--                college. Read 2026-08-01: six of the eight colleges had never
--                booked a peer's resource, and nothing belonging to Engineering,
--                Dental or Allied Health had ever been booked by anyone.
--
--   DEPENDENCY   `teaching_received` counts cross-campus teaching arriving. Read
--                2026-08-01: Allied Health received 65 of the 68 cross-campus
--                assignments in the cluster, from two sibling colleges. As
--                collaboration that is the best number on the page. As staffing
--                it is a concentration risk. A panel that ranked institutions by
--                exchange volume would publish the first reading and hide the
--                second; both columns are returned so the page can state both.
--
-- Teaching institutions only — `iqac_code IS NOT NULL` (the marker
-- use-body-dashboard.ts already treats as "the colleges") plus the two schools
-- by name. The software vendor, the administrative office, the incubator and
-- the test-data row are not colleges and an "isolated" verdict against them
-- would be noise that buries the real ones. The hub is excluded from the peer
-- columns for the same reason it is labelled in view 2: booking the central
-- office is not peer collaboration.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_cac_collaboration_isolation
WITH (security_invoker = true) AS
WITH hub AS (
  SELECT id FROM public.institutions
   WHERE lower(btrim(name)) = 'jkkn main office'
),
teaching_institutions AS (
  SELECT i.id, i.name, i.iqac_code
  FROM public.institutions i
  WHERE i.iqac_code IS NOT NULL
     OR lower(btrim(i.name)) IN ('jkkn matric higher secondary school',
                                'nattraja vidhyalya cbse')
),
booking_edges AS (
  SELECT
    r.institution_id AS owner_id,
    p.institution_id AS booker_id,
    rr.id            AS reservation_id
  FROM public.resource_reservations rr
  JOIN public.resources r ON r.id = rr.resource_id
  JOIN public.profiles  p ON p.id = rr.user_id
  WHERE r.institution_id IS DISTINCT FROM p.institution_id
    AND r.institution_id IS NOT NULL
    AND p.institution_id IS NOT NULL
),
peer_edges AS (
  SELECT * FROM booking_edges
  WHERE owner_id  NOT IN (SELECT id FROM hub)
    AND booker_id NOT IN (SELECT id FROM hub)
),
teaching_edges AS (
  SELECT
    p.institution_id  AS giver_id,
    sp.institution_id AS receiver_id,
    spc.id            AS assignment_id
  FROM public.staff_plan_courses spc
  JOIN public.staff_plans sp ON sp.id = spc.staff_plan_id
  JOIN public.staff st       ON st.id = spc.staff_id
  JOIN public.profiles p     ON p.id  = st.profile_id
  WHERE p.institution_id IS DISTINCT FROM sp.institution_id
    AND p.institution_id  IS NOT NULL
    AND sp.institution_id IS NOT NULL
)
SELECT
  t.id                                                                AS institution_id,
  t.name                                                              AS institution_name,
  t.iqac_code,
  (SELECT count(*) FROM peer_edges pe    WHERE pe.booker_id  = t.id)  AS peer_bookings_made,
  (SELECT count(*) FROM peer_edges pe    WHERE pe.owner_id   = t.id)  AS peer_lends_made,
  (SELECT count(*) FROM booking_edges be WHERE be.booker_id  = t.id)  AS bookings_made_any,
  (SELECT count(*) FROM booking_edges be WHERE be.owner_id   = t.id)  AS lends_made_any,
  (SELECT count(*) FROM teaching_edges te WHERE te.giver_id    = t.id) AS teaching_given,
  (SELECT count(*) FROM teaching_edges te WHERE te.receiver_id = t.id) AS teaching_received
FROM teaching_institutions t;

COMMENT ON VIEW public.v_cac_collaboration_isolation IS
  'CAC: one row per teaching institution with its peer-booking and '
  'cross-campus-teaching volumes in both directions, so isolation and '
  'lopsided reliance can be read off the same edges. Read-only, '
  'security_invoker.';

-- ----------------------------------------------------------------------------
-- GRANTS
--
-- `authenticated` is revoked FIRST and deliberately. Supabase's default
-- privileges have already granted it ALL on every relation created in this
-- schema, so the ACL at this point reads `authenticated=arwdDxt`. A bare
-- `GRANT SELECT` would add nothing and leave the write bits standing. Revoking
-- first and re-granting only SELECT makes the ACL read `authenticated=r`, which
-- is what an audit of this schema should find.
--
-- Nothing is granted to `anon`. These views span the whole cluster; the public
-- anon key ships in every browser bundle.
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.v_cac_solution_funnel              FROM anon, PUBLIC, authenticated;
REVOKE ALL ON public.v_cac_exchange_edges               FROM anon, PUBLIC, authenticated;
REVOKE ALL ON public.v_cac_curriculum_overlap           FROM anon, PUBLIC, authenticated;
REVOKE ALL ON public.v_cac_curriculum_overlap_summary   FROM anon, PUBLIC, authenticated;
REVOKE ALL ON public.v_cac_collaboration_isolation      FROM anon, PUBLIC, authenticated;

GRANT SELECT ON public.v_cac_solution_funnel            TO authenticated;
GRANT SELECT ON public.v_cac_exchange_edges             TO authenticated;
GRANT SELECT ON public.v_cac_curriculum_overlap         TO authenticated;
GRANT SELECT ON public.v_cac_curriculum_overlap_summary TO authenticated;
GRANT SELECT ON public.v_cac_collaboration_isolation    TO authenticated;

-- ----------------------------------------------------------------------------
-- ASSERTION — the ACL, read from the catalog rather than trusted from the text
-- above. Fails the migration loudly if any of the five ends up with more than
-- SELECT for `authenticated`, or with anything at all for `anon` or PUBLIC.
--
-- Reading relacl directly rather than calling has_table_privilege because an
-- empty grant and a missing grant must be distinguishable, and because the
-- write bits have to be checked as a set, not one at a time.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_rel   text;
  v_acl   text;
  v_names text[] := ARRAY[
    'v_cac_solution_funnel',
    'v_cac_exchange_edges',
    'v_cac_curriculum_overlap',
    'v_cac_curriculum_overlap_summary',
    'v_cac_collaboration_isolation'
  ];
BEGIN
  FOREACH v_rel IN ARRAY v_names LOOP
    SELECT coalesce(array_to_string(c.relacl, ' '), '')
      INTO v_acl
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = v_rel;

    IF v_acl IS NULL THEN
      RAISE EXCEPTION 'public.% was not created', v_rel;
    END IF;

    IF v_acl !~ ('(^| )authenticated=r/') THEN
      RAISE EXCEPTION
        'public.% must grant authenticated exactly SELECT; acl is %', v_rel, v_acl;
    END IF;

    IF v_acl ~ '(^| )anon=' THEN
      RAISE EXCEPTION 'public.% is granted to anon; acl is %', v_rel, v_acl;
    END IF;

    -- A PUBLIC grant appears as an entry with an empty grantee ("=r/owner").
    IF v_acl ~ '(^| )=' THEN
      RAISE EXCEPTION 'public.% is granted to PUBLIC; acl is %', v_rel, v_acl;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_rel
        AND c.reloptions @> ARRAY['security_invoker=true']
    ) THEN
      RAISE EXCEPTION 'public.% is not security_invoker', v_rel;
    END IF;
  END LOOP;
END $$;
