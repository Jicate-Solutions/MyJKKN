-- ============================================================================
-- One community initiative, several departments — and each confirms its own part
-- ============================================================================
--
-- ⚠️ NOT APPLIED. FILE AND PR ONLY. Nothing in this change has been run against
--    any database. The orchestrator applies migrations at merge time.
--
-- WHAT IS WRONG TODAY.
--   `sh_community_engagements` (created 20261013000000, capture UI shipped in
--   PR #3335 / #3408) carries `department_id uuid NOT NULL` — exactly ONE
--   department per recorded initiative. JKKN is one walkable campus, so a
--   health camp run jointly by Pharmacy, Nursing and Dental is the ordinary
--   case, not the exotic one. Under the present shape it cannot be recorded as
--   joint at all. Whoever types it in must either name one department and erase
--   the other two from the record, or type the same camp three times and turn
--   one camp into three in every total that reads the table.
--
--   The table holds zero rows on production, so there is no migration of
--   existing data to get wrong. That is the reason to change the shape NOW,
--   before the first row makes the single-department assumption load-bearing.
--
-- THE FOUR DIRECTOR DECISIONS (2026-09-18) THIS FILE ENCODES.
--
--   D1 — BOTH-LINKED. A community initiative may also be an event on the
--        events calendar. Link the two; never make someone type it twice.
--        → `sh_community_engagements.event_id`, nullable. NULL means the
--          initiative was recorded straight into the register and was never an
--          event. See §1.
--
--   D2 — CREDIT IS NOT DIVIDED. Each participating college shows the FULL
--        `beneficiaries_count`, marked shared. The cluster counts each
--        initiative ONCE, so nothing is double-counted upward.
--        → `fn_community_college_totals()` gives every confirmed college the
--          whole number; `fn_community_cluster_totals()` counts the initiative
--          once. The two DELIBERATELY DISAGREE, and §6 says so in a COMMENT on
--          both functions so that a future reader does not "fix" the gap and
--          destroy the decision.
--
--   D3 — EACH DEPARTMENT CONFIRMS ITS OWN PART, WITH HOURS. A department that
--        is named but has not confirmed does NOT count anywhere. This is the
--        whole defence against D2 being gamed: without it, a lead could list
--        six departments that did nothing and six colleges would each display
--        the full beneficiary number.
--        → `confirmation_status`, and an UPDATE policy that lets ONLY the
--          named department's own approver move it. The lead cannot confirm on
--          another department's behalf. See §5 and §6.
--
--   D4 — START EMPTY. Build the measure now; zero rows must read as a reason,
--        never as a bare 0.
--        → The averages in §6 return NULL, not 0, when there is nothing to
--          average. NULL is renderable as "no joint initiative recorded yet";
--          a 0 is indistinguishable from "joint initiatives reach nobody".
--
-- WHAT THIS FILE DOES NOT DO.
--   No screen, route, hook, service or type is touched — this is the substrate
--   only, plus the one permission key the substrate checks. The approval rule
--   from PR #3408 (`approval_status = 'approved'`) is RESPECTED, never
--   re-implemented. No GRANT is revoked anywhere: an RLS policy only narrows a
--   privilege the role already holds, and a REVOKE aimed at tightening a policy
--   took the super-admin approval queue down for 63 minutes on 2026-09-15.
-- ============================================================================

-- ── 0. Refuse rather than fail halfway ──────────────────────────────────────

DO $preflight$
BEGIN
    IF to_regclass('public.sh_community_engagements') IS NULL THEN
        RAISE EXCEPTION
            'public.sh_community_engagements does not exist here. Apply '
            '20261013000000_societal_capture_and_activity_clock.sql first.';
    END IF;

    IF to_regclass('public.events') IS NULL THEN
        RAISE EXCEPTION 'public.events does not exist here; D1 cannot be encoded.';
    END IF;

    IF to_regclass('public.departments') IS NULL
       OR to_regclass('public.institutions') IS NULL
       OR to_regclass('public.profiles') IS NULL THEN
        RAISE EXCEPTION 'A base table this migration references is absent.';
    END IF;

    -- The confirming department is derived from the caller, never taken as an
    -- argument. If that helper is absent the UPDATE policy in §5 would be
    -- written against nothing and would fail open on creation.
    IF to_regproc('public.sh_user_department_id') IS NULL THEN
        RAISE EXCEPTION
            'public.sh_user_department_id() is absent. It is how §5 derives the '
            'confirming department from auth.uid(); refusing to create a '
            'confirmation policy without it.';
    END IF;
END
$preflight$;

-- ── 1. D1 — an initiative may also be an event ──────────────────────────────

ALTER TABLE public.sh_community_engagements
    ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.sh_community_engagements.event_id IS
  'Which event this initiative was run as, when it was also on the events '
  'calendar. NULL = recorded directly in the register and never an event. '
  'ON DELETE SET NULL, not CASCADE: deleting a calendar entry must never erase '
  'the record that the community work happened.';

CREATE INDEX IF NOT EXISTS idx_sh_community_engagements_event
    ON public.sh_community_engagements(event_id) WHERE event_id IS NOT NULL;

-- ── 2. The participants table ───────────────────────────────────────────────
--
-- WHY department_id POINTS AT public.departments AND NOT AT
-- public.sh_solution_departments — read this before changing it.
--   The parent's own `department_id` references `public.departments(id)`
--   (20261013000000, line 1 of the table). Two things in this file copy or
--   compare against that value:
--     (a) the lead-row trigger in §4 writes the parent's `department_id`
--         straight into this column, and
--     (b) the UPDATE policy in §5 compares this column to
--         `sh_user_department_id()`, which returns `profiles.department_id` —
--         also a `departments.id`.
--   Pointing this FK at `sh_solution_departments(id)` (a separate surrogate
--   key) would make BOTH impossible: every lead-row insert would violate the
--   foreign key, and no HoD would ever match their own row. The column NAME is
--   unchanged, which is what sibling code joins on.

CREATE TABLE IF NOT EXISTS public.sh_community_engagement_participants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id uuid NOT NULL
        REFERENCES public.sh_community_engagements(id) ON DELETE CASCADE,
    department_id uuid NOT NULL
        REFERENCES public.departments(id) ON DELETE RESTRICT,
    institution_id uuid REFERENCES public.institutions(id),
    hours_contributed numeric,
    is_lead boolean NOT NULL DEFAULT false,
    confirmation_status text NOT NULL DEFAULT 'pending'
        CHECK (confirmation_status IN ('pending','confirmed','declined')),
    confirmed_by uuid REFERENCES public.profiles(id),
    confirmed_at timestamptz,
    decline_note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (engagement_id, department_id)
);

COMMENT ON TABLE public.sh_community_engagement_participants IS
  'One row per department taking part in one community initiative. Exists '
  'because sh_community_engagements holds exactly one department_id and JKKN '
  'runs joint initiatives across colleges as the ordinary case. A row here is '
  'a CLAIM until its own department confirms it: only '
  'confirmation_status = ''confirmed'' counts in either read function, which is '
  'what stops the shared-credit rule (D2) being gamed by naming departments '
  'that did nothing.';

COMMENT ON COLUMN public.sh_community_engagement_participants.department_id IS
  'A public.departments(id) — the same key space as '
  'sh_community_engagements.department_id and profiles.department_id, because '
  'the lead-row trigger copies the former and the confirmation policy compares '
  'against the latter.';

COMMENT ON COLUMN public.sh_community_engagement_participants.hours_contributed IS
  'Hours THIS department put in, not the initiative''s total. The per-college '
  'read sums these; the cluster read uses the initiative''s own hours_spent. '
  'NULL means the department confirmed without stating hours.';

COMMENT ON COLUMN public.sh_community_engagement_participants.is_lead IS
  'The department that recorded the initiative. Exactly one row per engagement '
  'carries this today, written by trg_community_engagement_lead_participant. '
  'Being lead carries no power to confirm anybody else''s participation.';

COMMENT ON COLUMN public.sh_community_engagement_participants.institution_id IS
  'Denormalised from the department''s college at insert time so the '
  'per-college read does not depend on a department never moving. NULL is '
  'backfilled from public.departments by the stamp trigger.';

CREATE INDEX IF NOT EXISTS idx_sh_ce_participants_engagement
    ON public.sh_community_engagement_participants(engagement_id);
CREATE INDEX IF NOT EXISTS idx_sh_ce_participants_department_pending
    ON public.sh_community_engagement_participants(department_id, created_at DESC)
    WHERE confirmation_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_sh_ce_participants_confirmed
    ON public.sh_community_engagement_participants(engagement_id, institution_id)
    WHERE confirmation_status = 'confirmed';

-- ── 3. The pairing check: a confirmation can never be half-written ──────────
--
-- Created AND validated from the catalog rather than from an IF NOT EXISTS
-- branch alone — the idiom from 20261123081000_events_academic_type_link_and_
-- backmap.sql. A partial prior run that created the constraint but died before
-- VALIDATE would otherwise leave it NOT VALID forever, which is the exact
-- re-run hazard the block exists to close. The table is new, so NOT VALID is
-- immediately valid anyway; the idiom is kept so the file reads the same as its
-- siblings.

DO $constraints$
DECLARE r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'sh_ce_participants_confirmation_paired'
                    AND conrelid = 'public.sh_community_engagement_participants'::regclass) THEN
    ALTER TABLE public.sh_community_engagement_participants
      ADD CONSTRAINT sh_ce_participants_confirmation_paired
      CHECK (
        (confirmation_status = 'confirmed')
        = (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)
      ) NOT VALID;
  END IF;

  FOR r IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'public.sh_community_engagement_participants'::regclass
              AND convalidated = false
              AND conname IN ('sh_ce_participants_confirmation_paired')
  LOOP
    EXECUTE format('ALTER TABLE public.sh_community_engagement_participants VALIDATE CONSTRAINT %I', r.conname);
  END LOOP;
END
$constraints$;

-- ── 4. The lead department is a participant from the moment it records ──────
--
-- RATIONALE: the department that recorded the initiative has self-evidently
-- taken part, so writing its row here means ONE query returns every
-- participating department — callers never have to remember to union the
-- parent's own department_id back in. It is inserted already confirmed because
-- the act of recording IS its confirmation.
--
-- ON CONFLICT DO NOTHING, never DO UPDATE ... WHERE. A false WHERE on a
-- DO UPDATE silently DISCARDS the incoming row — no insert, no update, no
-- error — which is how roughly a hundred groupable bug reports were lost for
-- weeks (2026-09-16). DO NOTHING is correct here precisely because there is
-- nothing to update: if the department already has a row for this engagement,
-- that row is the truth and must not be reset to 'confirmed' behind whoever
-- set it.

CREATE OR REPLACE FUNCTION public.on_community_engagement_add_lead_participant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF NEW.department_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- The pairing check in §3 forbids a confirmed row without both stamps, so
    -- a row with no recorded_by (an import, a service-role write) is inserted
    -- PENDING rather than skipped. Skipping it would leave the initiative with
    -- no participants at all, which reads downstream as "no department ran
    -- this" — a worse lie than "the department has not confirmed yet".
    INSERT INTO public.sh_community_engagement_participants
        (engagement_id, department_id, institution_id,
         is_lead, confirmation_status, confirmed_by, confirmed_at)
    SELECT NEW.id,
           NEW.department_id,
           COALESCE(NEW.institution_id, d.institution_id),
           true,
           CASE WHEN NEW.recorded_by IS NOT NULL THEN 'confirmed' ELSE 'pending' END,
           NEW.recorded_by,
           CASE WHEN NEW.recorded_by IS NOT NULL THEN now() ELSE NULL END
      FROM public.departments d
     WHERE d.id = NEW.department_id
    ON CONFLICT (engagement_id, department_id) DO NOTHING;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.on_community_engagement_add_lead_participant() IS
  'Writes the recording department in as a confirmed participant so one query '
  'returns every department on an initiative. SECURITY DEFINER because the row '
  'must appear whatever the writer''s own INSERT rights on the participants '
  'table are; it derives every value from the parent row and takes no argument.';

-- SECURITY DEFINER lockdown. A RETURNS trigger function cannot be called over
-- PostgREST and Postgres does not test EXECUTE when a trigger fires, so this
-- costs nothing and removes the question. anon AND PUBLIC are both named:
-- authenticated is a member of PUBLIC, so revoking one does not revoke the other.
REVOKE EXECUTE ON FUNCTION public.on_community_engagement_add_lead_participant() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_community_engagement_lead_participant ON public.sh_community_engagements;
CREATE TRIGGER trg_community_engagement_lead_participant
    AFTER INSERT ON public.sh_community_engagements
    FOR EACH ROW EXECUTE FUNCTION public.on_community_engagement_add_lead_participant();

-- ── 4b. Stamps that a client must not be trusted to supply ──────────────────
--
-- From the 2026-09-17 lesson: deriving WHO from auth.uid() while accepting
-- WHAT verbatim is still forgeable, and the route is never the only caller —
-- PostgREST exposes this table to anything holding a signed-in token. So the
-- confirming identity, the confirmation time and the college are set HERE, from
-- the server's own knowledge, and whatever the client sent in those three
-- columns is overwritten rather than validated.

CREATE OR REPLACE FUNCTION public.guard_community_participant_confirmation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    -- The college always follows the department, never the client.
    SELECT d.institution_id INTO NEW.institution_id
      FROM public.departments d WHERE d.id = NEW.department_id;

    IF TG_OP = 'INSERT' THEN
        -- A row may only be BORN confirmed by the SECURITY DEFINER lead trigger
        -- above, which runs as the function's OWNER — so `current_user` is the
        -- migration owner there and is literally 'authenticated' for any
        -- signed-in client write through PostgREST. That distinction is the
        -- gate, and a client cannot forge it: it is not a column, a claim or a
        -- setting they can send.
        --
        -- Gating on `NOT NEW.is_lead` instead would have been forgeable —
        -- is_lead is a client-supplied column, so a caller could insert
        -- is_lead = true, confirmation_status = 'confirmed', confirmed_by =
        -- <any profile> for a department that never agreed, and D3 (a
        -- department confirms its OWN part) would be decorative.
        IF current_user IN ('authenticated', 'anon') THEN
            NEW.is_lead := false;
            IF NEW.confirmation_status = 'confirmed' THEN
                NEW.confirmation_status := 'pending';
                NEW.confirmed_by := NULL;
                NEW.confirmed_at := NULL;
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.confirmation_status IS DISTINCT FROM OLD.confirmation_status THEN
        IF NEW.confirmation_status = 'confirmed' THEN
            NEW.confirmed_by := auth.uid();
            NEW.confirmed_at := now();
            NEW.decline_note := NULL;
        ELSE
            -- 'pending' and 'declined' both mean "this department has not
            -- confirmed", and the pairing check forbids either carrying stamps.
            NEW.confirmed_by := NULL;
            NEW.confirmed_at := NULL;
        END IF;
    ELSE
        -- Not a status change: the stamps are not editable at all.
        NEW.confirmed_by := OLD.confirmed_by;
        NEW.confirmed_at := OLD.confirmed_at;
    END IF;

    -- Which department a row belongs to is the thing the UPDATE policy gates
    -- on. Letting it move would let a confirmed row be re-pointed at a
    -- department that never agreed.
    NEW.department_id := OLD.department_id;
    NEW.engagement_id := OLD.engagement_id;
    NEW.is_lead := OLD.is_lead;
    NEW.updated_at := now();

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_community_participant_confirmation() IS
  'Sets confirmed_by, confirmed_at and institution_id from the server''s own '
  'knowledge and pins engagement_id, department_id and is_lead to their '
  'original values. An RLS UPDATE policy cannot compare OLD to NEW, so without '
  'this a caller could confirm their own department''s row and then re-point it '
  'at a department that never agreed.';

REVOKE EXECUTE ON FUNCTION public.guard_community_participant_confirmation() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_guard_community_participant_confirmation
    ON public.sh_community_engagement_participants;
CREATE TRIGGER trg_guard_community_participant_confirmation
    BEFORE INSERT OR UPDATE ON public.sh_community_engagement_participants
    FOR EACH ROW EXECUTE FUNCTION public.guard_community_participant_confirmation();

-- ── 5. RLS, mirroring the parent's shape ────────────────────────────────────

ALTER TABLE public.sh_community_engagement_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sh_ce_participants_select" ON public.sh_community_engagement_participants;
DROP POLICY IF EXISTS "sh_ce_participants_insert" ON public.sh_community_engagement_participants;
DROP POLICY IF EXISTS "sh_ce_participants_update" ON public.sh_community_engagement_participants;
DROP POLICY IF EXISTS "sh_ce_participants_delete" ON public.sh_community_engagement_participants;

-- SELECT: readable by anyone who can read the parent engagement. Expressed as
-- an EXISTS against the parent rather than by transcribing the parent's four
-- branches, because a subquery inside a policy is itself subject to that
-- table's RLS — so this says "whatever the register lets you read" and stays
-- true when the register's own policy changes. There is no recursion: the
-- parent's policy does not reference this table.
CREATE POLICY "sh_ce_participants_select" ON public.sh_community_engagement_participants
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.sh_community_engagements e
             WHERE e.id = sh_community_engagement_participants.engagement_id
        )
    );

-- INSERT: whoever may edit the parent may name a department on it. The two
-- branches are the parent's own UPDATE branches from 20261019000000 — an
-- approver within institution scope, or the submitter of a still-pending row.
CREATE POLICY "sh_ce_participants_insert" ON public.sh_community_engagement_participants
    FOR INSERT WITH CHECK (
        public.is_super_admin()
        OR public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.sh_community_engagements e
             WHERE e.id = sh_community_engagement_participants.engagement_id
               AND (
                    (
                        public.user_has_permission('solutions.societal.approve')
                        AND public.role_has_institution_access(e.institution_id)
                    )
                    OR (
                        e.approval_status = 'pending'
                        AND e.recorded_by = auth.uid()
                        AND (
                            public.user_has_permission('solutions.societal.submit')
                            OR public.user_has_permission('solutions.societal.record')
                        )
                    )
               )
        )
    );

-- UPDATE: D3, and the whole point of the table. ONLY the named department's own
-- approver may move its confirmation. The lead cannot confirm on anyone else's
-- behalf, and no permission key widens this: the predicate is
-- `department_id = sh_user_department_id()`, derived from auth.uid() and never
-- from anything the caller sends.
--
-- WITH CHECK repeats the predicate so the row cannot be updated OUT of the
-- caller's own department in the same statement. (The §4b trigger pins
-- department_id as well — belt and braces, because a policy and a trigger fail
-- in different ways.)
CREATE POLICY "sh_ce_participants_update" ON public.sh_community_engagement_participants
    FOR UPDATE USING (
        public.is_super_admin()
        OR public.is_admin()
        OR (
            public.user_has_permission('solutions.societal.confirm')
            AND department_id = public.sh_user_department_id()
        )
    )
    WITH CHECK (
        public.is_super_admin()
        OR public.is_admin()
        OR (
            public.user_has_permission('solutions.societal.confirm')
            AND department_id = public.sh_user_department_id()
        )
    );

-- DELETE: admin only, exactly as on the parent register. Removing the row would
-- erase the evidence that a department was asked. A wrongly named department is
-- already harmless under D3 — it stays 'pending' and counts nowhere — and the
-- department itself can record a 'declined' with a note, which is a better
-- record than a vanished row.
CREATE POLICY "sh_ce_participants_delete" ON public.sh_community_engagement_participants
    FOR DELETE USING (public.is_super_admin() OR public.is_admin());

-- Anon lockdown (CI gate: every new table locks anon explicitly). Nothing is
-- revoked from `authenticated` anywhere in this file: an RLS policy only
-- narrows a privilege the role already holds, and a REVOKE meant to tighten
-- access took the super-admin approval queue down for 63 minutes on 2026-09-15.
REVOKE ALL ON TABLE public.sh_community_engagement_participants FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.sh_community_engagement_participants TO authenticated;
GRANT ALL ON TABLE public.sh_community_engagement_participants TO service_role;

-- ── 6. The two read surfaces ────────────────────────────────────────────────
--
-- THEY DISAGREE ON PURPOSE. Summing fn_community_college_totals() over every
-- college gives MORE beneficiaries than fn_community_cluster_totals() reports,
-- by exactly the joint initiatives counted in more than one college. That IS
-- decision D2: a college that ran a camp reaching 400 people reports 400, and
-- so does its partner, and the cluster still says 400. Do not "reconcile" them.

CREATE OR REPLACE FUNCTION public.fn_community_cluster_totals()
RETURNS TABLE (
    initiatives        integer,
    beneficiaries      bigint,
    hours              numeric,
    joint_initiatives  integer,
    solo_initiatives   integer,
    avg_reach_joint    numeric,
    avg_reach_solo     numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
#variable_conflict use_column
BEGIN
    IF NOT (
        public.is_super_admin()
        OR public.is_admin()
        OR public.user_has_permission('solutions.societal.view')
    ) THEN
        RAISE EXCEPTION
            'You do not have access to the community engagement register. '
            'Ask for the View Community Engagements permission.';
    END IF;

    RETURN QUERY
    WITH confirmed AS (
        SELECT p.engagement_id, count(*)::int AS confirmed_departments
          FROM public.sh_community_engagement_participants p
         WHERE p.confirmation_status = 'confirmed'
         GROUP BY p.engagement_id
    ),
    eng AS (
        -- One row per approved engagement, whatever its participant count.
        -- This is what makes the cluster count each initiative exactly ONCE.
        SELECT e.id,
               e.beneficiaries_count,
               e.hours_spent,
               COALESCE(c.confirmed_departments, 0) AS confirmed_departments
          FROM public.sh_community_engagements e
          LEFT JOIN confirmed c ON c.engagement_id = e.id
         WHERE e.approval_status = 'approved'
    )
    SELECT count(*)::int,
           COALESCE(sum(eng.beneficiaries_count), 0)::bigint,
           COALESCE(sum(eng.hours_spent), 0)::numeric,
           (count(*) FILTER (WHERE eng.confirmed_departments > 1))::int,
           (count(*) FILTER (WHERE eng.confirmed_departments <= 1))::int,
           -- NULL, not 0, when there is nothing to average (D4). A 0 here would
           -- read as "joint initiatives reach nobody"; NULL renders as "none
           -- recorded yet", which is the true statement on the day this ships.
           round(avg(eng.beneficiaries_count) FILTER (WHERE eng.confirmed_departments > 1), 1),
           round(avg(eng.beneficiaries_count) FILTER (WHERE eng.confirmed_departments <= 1), 1)
      FROM eng;
END;
$$;

COMMENT ON FUNCTION public.fn_community_cluster_totals() IS
  'Cluster view of community work. Each APPROVED initiative is counted exactly '
  'once, however many colleges ran it (decision D2, 2026-09-18). It therefore '
  'reports FEWER beneficiaries than fn_community_college_totals() summed over '
  'every college, by exactly the joint initiatives — that gap is the decision, '
  'not a bug, and reconciling the two would destroy it. avg_reach_joint and '
  'avg_reach_solo are the metric that matters: reach PER INITIATIVE, joint '
  'against solo. A COUNT of joint initiatives alone is gameable by naming '
  'departments, which is why only confirmation_status = ''confirmed'' '
  'participants make an initiative joint. Both averages are NULL, never 0, when '
  'nothing has been recorded yet.';

CREATE OR REPLACE FUNCTION public.fn_community_college_totals()
RETURNS TABLE (
    institution_id      uuid,
    institution_name    text,
    engagement_id       uuid,
    title               text,
    engagement_date     date,
    beneficiaries_count integer,
    hours_contributed   numeric,
    is_shared           boolean,
    shared_with         integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
#variable_conflict use_column
BEGIN
    IF NOT (
        public.is_super_admin()
        OR public.is_admin()
        OR public.user_has_permission('solutions.societal.view')
    ) THEN
        RAISE EXCEPTION
            'You do not have access to the community engagement register. '
            'Ask for the View Community Engagements permission.';
    END IF;

    RETURN QUERY
    WITH conf AS (
        -- ONLY confirmed participants, ONLY approved engagements (D3, and the
        -- approval rule PR #3408 already established — respected here, not
        -- re-implemented).
        SELECT p.engagement_id,
               p.department_id,
               p.hours_contributed,
               COALESCE(p.institution_id, d.institution_id) AS institution_id
          FROM public.sh_community_engagement_participants p
          JOIN public.departments d ON d.id = p.department_id
          JOIN public.sh_community_engagements e ON e.id = p.engagement_id
         WHERE p.confirmation_status = 'confirmed'
           AND e.approval_status = 'approved'
    ),
    per_engagement AS (
        SELECT conf.engagement_id, count(*)::int AS confirmed_departments
          FROM conf GROUP BY conf.engagement_id
    )
    SELECT c.institution_id,
           COALESCE(i.display_name, i.name)::text,
           c.engagement_id,
           e.title,
           e.engagement_date,
           -- THE FULL NUMBER, not a share of it. D2.
           e.beneficiaries_count,
           -- Hours are this college's OWN contribution, because that is the
           -- thing each department confirmed. Beneficiaries are shared; effort
           -- is not.
           COALESCE(sum(c.hours_contributed), 0)::numeric,
           (pe.confirmed_departments - count(*)) > 0,
           (pe.confirmed_departments - count(*))::int
      FROM conf c
      JOIN per_engagement pe ON pe.engagement_id = c.engagement_id
      JOIN public.sh_community_engagements e ON e.id = c.engagement_id
      JOIN public.institutions i ON i.id = c.institution_id
     GROUP BY c.institution_id, i.display_name, i.name, c.engagement_id,
              e.title, e.engagement_date, e.beneficiaries_count,
              pe.confirmed_departments;
END;
$$;

COMMENT ON FUNCTION public.fn_community_college_totals() IS
  'Per-college view: one row per (college, approved initiative) where that '
  'college has at least one CONFIRMED participating department. Each row '
  'carries the FULL beneficiaries_count, marked shared — decision D2, '
  '2026-09-18 — so summing this over every college DELIBERATELY EXCEEDS '
  'fn_community_cluster_totals(). That discrepancy is the decision; a future '
  'reader who "fixes" it destroys it. hours_contributed is this college''s own '
  'confirmed hours, not the initiative''s total, because effort is what each '
  'department confirms. shared_with counts the confirmed participating '
  'departments belonging to OTHER colleges, so a two-department initiative '
  'inside one college reads is_shared = false. A named but unconfirmed '
  'department appears nowhere here (D3).';

-- SECURITY DEFINER lockdown for both read functions. anon AND PUBLIC are named
-- explicitly: authenticated is a member of PUBLIC, so a PUBLIC-only revoke
-- leaves the built-in anon grant standing. Each function carries its own
-- permission check in a decision position above, so the grant to authenticated
-- is not a blanket one.
REVOKE ALL ON FUNCTION public.fn_community_cluster_totals() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_community_cluster_totals() TO authenticated;

REVOKE ALL ON FUNCTION public.fn_community_college_totals() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_community_college_totals() TO authenticated;

DO $lockcheck$
BEGIN
    IF has_function_privilege('anon', 'public.fn_community_cluster_totals()', 'EXECUTE')
       OR has_function_privilege('anon', 'public.fn_community_college_totals()', 'EXECUTE') THEN
        RAISE EXCEPTION 'A community read function is still EXECUTE-able by anon.';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.fn_community_cluster_totals()', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.fn_community_college_totals()', 'EXECUTE') THEN
        RAISE EXCEPTION 'A community read function lost EXECUTE for authenticated.';
    END IF;
END
$lockcheck$;

-- ── 7. The permission key the UPDATE policy checks ──────────────────────────
--
-- Registered in lib/constants/permissions.ts in this same PR. A key registered
-- nowhere can never be switched on in Role Management, so the confirmation
-- step would be permanently admin-only and the feature would look built and be
-- unreachable — the class scripts/ci/check-ungrantable-permissions.mjs exists
-- to catch.
--
-- WHICH ROLES: exactly the roles that already hold solutions.societal.approve,
-- because confirming your own department's part is the same kind of act as
-- approving an entry — a head speaking for a department. The predicate tests
-- the VALUE, never `permissions ? 'key'`: `?` tests KEY EXISTENCE and returns
-- true for a key explicitly set to false, so a grant loop written that way
-- reports success while granting nothing.

DO $grant$
DECLARE
    v_roles text[];
    v_after int;
BEGIN
    SELECT array_agg(role_key ORDER BY role_key)
      INTO v_roles
      FROM public.custom_roles
     WHERE (permissions->>'solutions.societal.approve')::boolean IS TRUE;

    IF v_roles IS NULL OR array_length(v_roles, 1) = 0 THEN
        RAISE EXCEPTION
            'No role holds solutions.societal.approve = true, so there is '
            'nobody to grant the confirmation key to. Refusing rather than '
            'guessing a role list.';
    END IF;

    RAISE NOTICE 'Granting solutions.societal.confirm to: %', array_to_string(v_roles, ', ');

    UPDATE public.custom_roles
       SET permissions = permissions || jsonb_build_object('solutions.societal.confirm', true),
           updated_at = now()
     WHERE role_key = ANY (v_roles);

    SELECT count(*)
      INTO v_after
      FROM public.custom_roles
     WHERE role_key = ANY (v_roles)
       AND (permissions->>'solutions.societal.confirm')::boolean IS TRUE;

    IF v_after <> array_length(v_roles, 1) THEN
        RAISE EXCEPTION
            'Expected % roles to hold solutions.societal.confirm, found %.',
            array_length(v_roles, 1), v_after;
    END IF;
END
$grant$;

-- ── 8. End state, asserted rather than assumed ──────────────────────────────

DO $verify$
DECLARE
    v_qual text;
    v_check text;
BEGIN
    IF to_regclass('public.sh_community_engagement_participants') IS NULL THEN
        RAISE EXCEPTION 'The participants table was not created.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'sh_community_engagements'
           AND column_name = 'event_id'
    ) THEN
        RAISE EXCEPTION 'sh_community_engagements.event_id is absent (D1 not encoded).';
    END IF;

    -- D3 is a PROPERTY, so assert the property: the confirmation policy must be
    -- tied to the caller's own department and to nothing the caller can send.
    SELECT qual INTO v_qual
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'sh_community_engagement_participants'
       AND policyname = 'sh_ce_participants_update';

    IF v_qual IS NULL THEN
        RAISE EXCEPTION 'The confirmation UPDATE policy is missing.';
    END IF;
    IF v_qual NOT LIKE '%sh_user_department_id%' THEN
        RAISE EXCEPTION
            'The confirmation policy does not derive the department from the '
            'caller: %', v_qual;
    END IF;

    SELECT with_check INTO v_check
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'sh_community_engagement_participants'
       AND policyname = 'sh_ce_participants_update';

    IF v_check IS NULL OR v_check NOT LIKE '%sh_user_department_id%' THEN
        RAISE EXCEPTION
            'The confirmation policy has no WITH CHECK tying the resulting row '
            'to the caller''s department; a row could be updated out of it.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'sh_ce_participants_confirmation_paired'
           AND conrelid = 'public.sh_community_engagement_participants'::regclass
           AND convalidated
    ) THEN
        RAISE EXCEPTION 'The confirmation pairing check is absent or NOT VALID.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgname = 'trg_community_engagement_lead_participant'
           AND tgrelid = 'public.sh_community_engagements'::regclass
    ) THEN
        RAISE EXCEPTION 'The lead-participant trigger is absent.';
    END IF;

    RAISE NOTICE
        'Joint community initiatives: participants table, D1 link, D3 '
        'confirmation policy, pairing check and both read functions in place.';
END
$verify$;
