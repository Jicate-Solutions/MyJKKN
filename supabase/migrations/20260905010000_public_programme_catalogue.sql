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
-- NO SECURITY DEFINER FUNCTION IS ADDED. The public page reads through the
-- service-role client (the same pattern as app/(public)/meet/page.tsx), so
-- there is no RPC to lock down. The published-only rule lives in exactly one
-- place in TypeScript and is mirrored by the anon RLS policy below.
--
-- No BEGIN/COMMIT in this file, so a reviewer's BEGIN … ROLLBACK rehearsal
-- against production actually rolls back.
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
    -- A public page must never render an attacker-supplied scheme. Only https,
    -- http or an in-app path may reach an href.
    CONSTRAINT public_programmes_apply_url_scheme
        CHECK (apply_url IS NULL OR apply_url ~ '^(https?://|/)')
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
    'Absolute https URL or an in-app path (leading /). Enforced by CHECK so no '
    'other scheme can reach a rendered href.';

-- The one read the public page makes: published rows in display order.
CREATE INDEX IF NOT EXISTS idx_public_programmes_published_order
    ON public.public_programmes (is_published, sort_order, starts_on);

-- -----------------------------------------------------------------------------
-- updated_at
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_public_programmes_updated_at ON public.public_programmes;
CREATE TRIGGER trg_public_programmes_updated_at
    BEFORE UPDATE ON public.public_programmes
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------
ALTER TABLE public.public_programmes ENABLE ROW LEVEL SECURITY;

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
-- GRANTS
--
-- Supabase ships ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES TO anon, so this
-- table is born with INSERT/UPDATE/DELETE granted to the anon key that sits in
-- every page of https://www.jkkn.ai. Strip that first, then hand back exactly
-- one privilege.
--
-- The GRANT SELECT TO anon is DELIBERATE and is the whole point of the table:
-- the catalogue is meant to be readable by a member of the public who is not
-- signed in. It is safe because the RLS policy above narrows that read to
-- published rows, and because no column here identifies a person.
-- -----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.public_programmes FROM anon, PUBLIC;

GRANT SELECT ON TABLE public.public_programmes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.public_programmes TO authenticated;
GRANT ALL ON TABLE public.public_programmes TO service_role;

-- -----------------------------------------------------------------------------
-- Assert what was just built, so a silent partial apply cannot look successful.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT (SELECT relrowsecurity FROM pg_class
            WHERE oid = 'public.public_programmes'::regclass) THEN
        RAISE EXCEPTION 'public_programmes: row level security is NOT enabled';
    END IF;

    IF NOT has_table_privilege('anon', 'public.public_programmes', 'SELECT') THEN
        RAISE EXCEPTION 'public_programmes: anon LOST SELECT (the public page reads nothing)';
    END IF;

    IF has_table_privilege('anon', 'public.public_programmes', 'INSERT')
       OR has_table_privilege('anon', 'public.public_programmes', 'UPDATE')
       OR has_table_privilege('anon', 'public.public_programmes', 'DELETE') THEN
        RAISE EXCEPTION 'public_programmes: anon STILL has a write privilege';
    END IF;

    IF NOT has_table_privilege('authenticated', 'public.public_programmes', 'SELECT') THEN
        RAISE EXCEPTION 'public_programmes: authenticated LOST SELECT';
    END IF;
END
$$;
