-- 20260810150000_create_leadership_booking_pages.sql
--
-- Gives every principal and HOD a DRAFT booking page, so the only step left is
-- the one that needs a human: switching it on.
--
-- WHY NOW, AND NOT BEFORE
--   scripts/meetings/provision-leadership-native.ts deliberately refused to do
--   this, and said why: "the handle locks at claim time and is admin-only to
--   change, so a machine-picked handle would trap the leader."
--
--   That objection was correct and is now gone. PR #2818 built the admin
--   override the host-facing message had been pointing at since June, and a
--   renamed address forwards from the old one rather than breaking shared links.
--   A machine-picked handle is no longer a trap; it is a default somebody can
--   correct in one click.
--
--   Meanwhile the roster kept drifting: 48 of 103 leaders have no page at all,
--   including active HODs like DR. VIJAYABASKARAN M, who simply became an HOD
--   after the one-off June provisioning run.
--
-- EVERY PAGE IS CREATED AS A DRAFT (is_public = false).
--   Publishing stays the leader's own decision, and the app requires an ACTIVE
--   Google connection before a page may go public (D20). Creating these public
--   would put empty booking pages in the directory — worse than none, because a
--   visitor lands and is told the person is not accepting bookings.
--
-- HANDLE GENERATION mirrors slugifyName() in
-- app/(routes)/meetings/availability/actions.ts exactly: lowercase, every run of
-- non-alphanumerics becomes one hyphen, trimmed, capped at 50. Same rule the UI
-- would have suggested, so a leader who later opens the page sees the address
-- they would have been offered anyway.
--
-- Collisions get a numeric suffix (-2, -3 …). Uniqueness is checked against
-- BOTH live handles and RETIRED ones (meeting_host_page_handles), because a
-- retired handle still forwards — reusing one would silently deliver a stranger
-- to the wrong person's calendar.
--
-- IDEMPOTENT: leaders who already have a page are skipped. Re-running creates
-- nothing.

BEGIN;

DO $$
DECLARE
  r            record;
  v_base       text;
  v_handle     text;
  v_n          int;
  v_created    int := 0;
  v_skipped    int := 0;
BEGIN
  FOR r IN
    SELECT p.id, p.full_name
    FROM profiles p
    LEFT JOIN institutions i ON i.id = p.institution_id
    WHERE p.role IN ('principal', 'hod')
      -- Same exclusions as the provisioning script and the 20260810120000
      -- backfill. Restated rather than referenced so they cannot drift apart.
      AND COALESCE(btrim(p.full_name), '') <> ''
      AND p.full_name !~* '\mtest\M'
      AND lower(btrim(p.full_name)) NOT IN ('hod', 'hod jkkn', 'principal')
      AND COALESCE(i.name, '') !~* 'testing'
      AND NOT EXISTS (SELECT 1 FROM meeting_host_pages hp WHERE hp.host_profile_id = p.id)
    ORDER BY p.full_name
  LOOP
    -- slugifyName(): lowercase → non-alphanumeric runs to '-' → trim → 50 chars
    v_base := left(btrim(regexp_replace(lower(r.full_name), '[^a-z0-9]+', '-', 'g'), '-'), 50);

    -- Too short for the CHECK (>= 3), or a reserved word: fall back to a form
    -- that is always valid. Better a dull address than a failed migration.
    IF v_base IS NULL OR length(v_base) < 3 OR v_base IN (
      'admin','api','app','auth','book','cancel','directory','help','jkkn',
      'login','logout','mail','meet','meetings','new','privacy','reschedule',
      'settings','static','support','terms','www'
    ) THEN
      v_base := 'host-' || left(replace(r.id::text, '-', ''), 8);
    END IF;

    -- Free? Check live AND retired handles: a retired one still forwards, so
    -- reusing it would send somebody's old link to the wrong person.
    v_handle := v_base;
    v_n := 1;
    WHILE EXISTS (SELECT 1 FROM meeting_host_pages       WHERE handle = v_handle)
       OR EXISTS (SELECT 1 FROM meeting_host_page_handles WHERE handle = v_handle)
    LOOP
      v_n := v_n + 1;
      -- Keep room for the suffix inside the 50-char limit.
      v_handle := left(v_base, 50 - (length(v_n::text) + 1)) || '-' || v_n::text;
      IF v_n > 50 THEN
        RAISE EXCEPTION 'Could not find a free handle for % after 50 tries', r.full_name;
      END IF;
    END LOOP;

    INSERT INTO meeting_host_pages (host_profile_id, handle, is_public)
    VALUES (r.id, v_handle, false);

    v_created := v_created + 1;
  END LOOP;

  SELECT count(*) INTO v_skipped
  FROM profiles p
  WHERE p.role IN ('principal','hod')
    AND EXISTS (SELECT 1 FROM meeting_host_pages hp WHERE hp.host_profile_id = p.id);

  RAISE NOTICE 'leadership booking pages: % draft page(s) created; % leader(s) already had one',
    v_created, v_skipped;
END $$;

-- Prove it, rather than assume. A loop that matched nobody looks exactly like
-- one that worked.
DO $$
DECLARE v_missing int; v_public_empty int;
BEGIN
  SELECT count(*) INTO v_missing
  FROM profiles p
  LEFT JOIN institutions i ON i.id = p.institution_id
  WHERE p.role IN ('principal','hod')
    AND COALESCE(btrim(p.full_name), '') <> ''
    AND p.full_name !~* '\mtest\M'
    AND lower(btrim(p.full_name)) NOT IN ('hod', 'hod jkkn', 'principal')
    AND COALESCE(i.name, '') !~* 'testing'
    AND NOT EXISTS (SELECT 1 FROM meeting_host_pages hp WHERE hp.host_profile_id = p.id);

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'Still % eligible leader(s) without a booking page — the loop did not cover everyone.', v_missing;
  END IF;

  -- Nothing here may go public. A page created public with no meeting types
  -- shows a visitor "not accepting bookings", which is worse than no page.
  SELECT count(*) INTO v_public_empty
  FROM meeting_host_pages hp
  WHERE hp.is_public
    AND NOT EXISTS (SELECT 1 FROM meeting_types mt
                    WHERE mt.host_profile_id = hp.host_profile_id
                      AND mt.is_active AND NOT COALESCE(mt.hidden, false));

  RAISE NOTICE 'every eligible leader now has a page; public-but-empty pages: % (unchanged by this migration)', v_public_empty;
END $$;

COMMIT;
