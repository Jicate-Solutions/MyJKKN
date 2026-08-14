-- =============================================================================
-- Public programme catalogue — the one JKKN page an outsider can browse
-- without knowing a web address in advance.
--
-- Date:    2026-09-05 (version token; FILE ONLY — NOT APPLIED, Director-gated)
-- PR:      feat/public-programme-catalogue
-- Surface: app/(public)/programmes/page.tsx via
--          lib/services/programmes/public-programme-service.ts
--
-- WHY A NEW TABLE AND NOT A MARKER ON SOMETHING THAT EXISTS
-- ---------------------------------------------------------
-- Two existing structures looked like candidates and both were rejected:
--
--   * `programs` holds the degree programmes of the eight colleges. It is the
--     spine of the Organization module (institution > programme > semester >
--     section) and is joined by attendance, billing, timetables and the board
--     of studies. Adding an `is_public` marker there means every one of those
--     rows becomes one boolean away from being advertised on the open web, and
--     the flag would sit on a table hundreds of screens can already edit. That
--     is leak-by-omission, which this page must be incapable of.
--
--   * `cohorts` is the internal intake structure (School of Influence lives
--     there). Director ruling 2026-08-13: School of Influence is NOT a public
--     programme — it is for JKKN learners and senior learners only. Hanging the
--     public catalogue off cohorts would put the two one column apart.
--
-- So the catalogue gets its own table whose ONLY reason to exist is to be
-- published. Nothing lands here by inheriting a flag from somewhere else; a row
-- has to be written on purpose, and then published on purpose (`is_published`
-- DEFAULT false). Default closed at three layers: the column default, the RLS
-- policy, and the service-layer filter.
--
-- 🛑 SHIPS EMPTY ON PURPOSE. Director decision 2026-08-13: "Build the page now,
-- ready and waiting." JKKN has zero public programmes today; the first row will
-- be the forthcoming paid programme sold to companies. This migration seeds
-- NOTHING — an empty catalogue is the correct day-one state, and the page is
-- built to read as deliberate when empty.
--
-- NAMING. Director decision: these are "programmes", never "courses". `courses`
-- already means a unit inside a degree (3,919 rows, owned by the board of
-- studies module); colliding on that word would confuse menus, permission keys
-- and reports for years.
--
-- PRIVACY. Programme-level facts only. There is deliberately no column for a
-- contact person, a coordinator, an enrolled count or any other value that
-- could identify an individual — the schema cannot carry what the page must
-- not show.
--
-- NO SECURITY DEFINER FUNCTION IS ADDED. The page reads this table with the
-- ANON key, so the RLS policy below is a live database-side gate rather than a
-- decoration, and there is no RPC to lock down.
--
-- STATEMENT ORDER IS LOAD-BEARING. This file carries no BEGIN/COMMIT (house
-- rule: a reviewer's BEGIN … ROLLBACK rehearsal against production must
-- actually roll back), so the statements are ordered so that no intermediate
-- state is dangerous if the run stops part-way:
--   CREATE TABLE → ENABLE RLS → REVOKE → policies → GRANT → everything else.
-- Row level security is on before any grant exists, the anon/authenticated
-- default grants are stripped before a policy can expose anything, and the
-- SELECT grant is the LAST thing handed out. Stop after any statement and the
-- table is closed, never open.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.public_programmes (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Stable, human-readable identifier. Used in links and in any future
    -- detail page; never renumbered.
    slug              TEXT NOT NULL UNIQUE,

    -- What a reader sees.
    name              TEXT NOT NULL,
    summary           TEXT NOT NULL,   -- one line, plain English
    audience          TEXT NOT NULL,   -- who it is for, in the reader's words

    -- Price. Exactly one of "it is free" or "it costs this much"; neither set
    -- means the fee is not fixed yet and the page says so rather than guessing.
    is_free           BOOLEAN NOT NULL DEFAULT false,
    fee_amount        NUMERIC(12,2),
    fee_currency      TEXT NOT NULL DEFAULT 'INR',

    -- When it runs. Both nullable: a programme can be announced before its
    -- dates are fixed.
    starts_on         DATE,
    ends_on           DATE,

    -- Where to go next. Absolute https URL or an in-app path.
    apply_url         TEXT,

    -- THE GATE. Default false: a row is invisible until someone publishes it.
    is_published      BOOLEAN NOT NULL DEFAULT false,

    sort_order        INTEGER NOT NULL DEFAULT 0,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT public_programmes_slug_format
        CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT public_programmes_fee_non_negative
        CHECK (fee_amount IS NULL OR fee_amount >= 0),
    -- "Free" and "costs money" are mutually exclusive, so the page can never be
    -- handed a row that says both.
    CONSTRAINT public_programmes_free_has_no_fee
        CHECK (NOT (is_free AND fee_amount IS NOT NULL)),
    CONSTRAINT public_programmes_dates_ordered
        CHECK (starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on),
    -- A public page must never render an attacker-supplied destination. Only an
    -- absolute http(s) URL or a genuine in-app path may reach an href.
    --
    -- The second character of a path matters: '//evil.tld' is a PROTOCOL-
    -- RELATIVE URL, and '/\evil.tld' is normalised to the same thing by every
    -- browser. Both begin with '/', so a naive '^(https?://|/)' would accept
    -- them and the page would render a JKKN-branded link that navigates a
    -- visitor to somebody else's host. A path must therefore start with '/'
    -- followed by a character that is neither '/' nor a backslash.
    --
    -- The path arm compares characters instead of using a regex character
    -- class on purpose: a backslash inside a bracket expression is read
    -- differently depending on standard_conforming_strings, and this file is
    -- applied by hand. E'\\' is exactly one backslash under either setting.
    CONSTRAINT public_programmes_apply_url_scheme
        CHECK (
            apply_url IS NULL
            OR apply_url ~ '^https?://[^/]'
            OR (
                substr(apply_url, 1, 1) = '/'
                AND length(apply_url) >= 2
                AND substr(apply_url, 2, 1) <> '/'
                AND substr(apply_url, 2, 1) <> E'\\'
            )
        )
);

COMMENT ON TABLE public.public_programmes IS
    'Programmes JKKN offers to people outside the institution. The only table '
    'read by app/(public)/programmes. Default closed: is_published starts false '
    'and nothing is shown until it is deliberately turned on. Programme-level '
    'facts only — no person is named here.';

COMMENT ON COLUMN public.public_programmes.is_published IS
    'THE PUBLIC GATE. false = invisible to everyone except an administrator. '
    'Filtered in the RLS policy AND again in PublicProgrammeService.';
COMMENT ON COLUMN public.public_programmes.audience IS
    'Who the programme is for, written for a reader who has never heard of JKKN.';
COMMENT ON COLUMN public.public_programmes.apply_url IS
    'Absolute https URL or an in-app path (leading /, second character neither / '
    'nor a backslash, so a protocol-relative URL cannot pose as a path). '
    'Enforced by CHECK so no other destination can reach a rendered href.';

-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY — immediately after CREATE TABLE, before any grant exists.
-- -----------------------------------------------------------------------------
ALTER TABLE public.public_programmes ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- STRIP THE SUPABASE DEFAULTS FIRST.
--
-- Supabase ships ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES TO anon,
-- authenticated, service_role, so this table is born with the full privilege set
-- — including TRUNCATE — granted to the anon key that sits in every page of
-- https://www.jkkn.ai AND to every signed-in session. TRUNCATE is NOT filtered
-- by row level security, so leaving the authenticated default in place would let
-- any signed-in account empty the public catalogue regardless of the policies
-- below. Strip both, then hand back exactly what each role needs.
-- -----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.public_programmes FROM anon, authenticated, PUBLIC;

-- Anyone, signed in or not, may read a PUBLISHED row. That is what the table is
-- for. An unpublished row is invisible through this policy to every caller.
DROP POLICY IF EXISTS public_programmes_select_published ON public.public_programmes;
CREATE POLICY public_programmes_select_published
    ON public.public_programmes
    FOR SELECT
    TO anon, authenticated
    USING (is_published);

-- Administrators read and write everything, published or not. No new permission
-- key is introduced: this PR ships the reader, not an admin screen, and an
-- ungrantable key would be a dark lane. The key arrives with the screen that
-- needs it.
DROP POLICY IF EXISTS public_programmes_admin_all ON public.public_programmes;
CREATE POLICY public_programmes_admin_all
    ON public.public_programmes
    FOR ALL
    TO authenticated
    USING (is_super_admin() OR is_admin())
    WITH CHECK (is_super_admin() OR is_admin());

-- -----------------------------------------------------------------------------
-- GRANTS — last, so nothing is reachable before its policy exists.
--
-- The GRANT SELECT TO anon is DELIBERATE and is the whole point of the table:
-- the catalogue is meant to be readable by a member of the public who is not
-- signed in, and the page reads it with the anon key so the policy above is a
-- live gate rather than a decoration. It is safe because that policy narrows the
-- read to published rows, and because no column here identifies a person.
--
-- TRUNCATE is granted to NOBODY but service_role: it is not filtered by row
-- level security, so it is the one privilege an administrator policy cannot
-- contain.
-- -----------------------------------------------------------------------------
GRANT SELECT ON TABLE public.public_programmes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.public_programmes TO authenticated;
GRANT ALL ON TABLE public.public_programmes TO service_role;

-- -----------------------------------------------------------------------------
-- Supporting objects. Deliberately AFTER the security statements — if the run
-- stops before these, the catalogue is merely slower and its updated_at stops
-- moving; if it stopped before the statements above, it would be open.
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_public_programmes_published_order
    ON public.public_programmes (is_published, sort_order, starts_on);

DROP TRIGGER IF EXISTS trg_public_programmes_updated_at ON public.public_programmes;
CREATE TRIGGER trg_public_programmes_updated_at
    BEFORE UPDATE ON public.public_programmes
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- Assert what was just built, so a silent partial apply cannot look successful.
--
-- CREATE TABLE IF NOT EXISTS silently no-ops against a pre-existing relation, so
-- these checks deliberately cover the SHAPE (the gate column and its default,
-- both policies, every CHECK constraint) and not only the grants. A table that
-- already existed under this name with a different shape fails here by name
-- rather than serving the wrong rows.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_missing text;
    v_checks  int;
BEGIN
    IF NOT (SELECT relrowsecurity FROM pg_class
            WHERE oid = 'public.public_programmes'::regclass) THEN
        RAISE EXCEPTION 'public_programmes: row level security is NOT enabled';
    END IF;

    -- The gate column must exist, be NOT NULL, and default to false. If a
    -- pre-existing table lacks the default, every future row is born public.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'public_programmes'
          AND column_name = 'is_published'
          AND is_nullable = 'NO'
          AND column_default = 'false'
    ) THEN
        RAISE EXCEPTION
            'public_programmes: is_published is not NOT NULL DEFAULT false — the gate is not closed by default';
    END IF;

    FOR v_missing IN
        SELECT p FROM unnest(ARRAY[
            'public_programmes_select_published',
            'public_programmes_admin_all'
        ]) AS p
        WHERE NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = 'public_programmes'
              AND policyname = p
        )
    LOOP
        RAISE EXCEPTION 'public_programmes: policy % is MISSING', v_missing;
    END LOOP;

    SELECT count(*) INTO v_checks
    FROM pg_constraint
    WHERE conrelid = 'public.public_programmes'::regclass
      AND contype = 'c'
      AND conname LIKE 'public_programmes_%';
    IF v_checks < 5 THEN
        RAISE EXCEPTION
            'public_programmes: expected 5 CHECK constraints, found % (a pre-existing table was reused)', v_checks;
    END IF;

    IF NOT has_table_privilege('anon', 'public.public_programmes', 'SELECT') THEN
        RAISE EXCEPTION 'public_programmes: anon LOST SELECT (the public page reads nothing)';
    END IF;

    IF has_table_privilege('anon', 'public.public_programmes', 'INSERT')
       OR has_table_privilege('anon', 'public.public_programmes', 'UPDATE')
       OR has_table_privilege('anon', 'public.public_programmes', 'DELETE')
       OR has_table_privilege('anon', 'public.public_programmes', 'TRUNCATE') THEN
        RAISE EXCEPTION 'public_programmes: anon STILL has a write privilege';
    END IF;

    IF NOT has_table_privilege('authenticated', 'public.public_programmes', 'SELECT') THEN
        RAISE EXCEPTION 'public_programmes: authenticated LOST SELECT';
    END IF;

    -- TRUNCATE bypasses row level security entirely — a signed-in account
    -- holding it could empty the public catalogue whatever the policies say.
    IF has_table_privilege('authenticated', 'public.public_programmes', 'TRUNCATE') THEN
        RAISE EXCEPTION
            'public_programmes: authenticated STILL has TRUNCATE (RLS does not filter it)';
    END IF;
END
$$;
