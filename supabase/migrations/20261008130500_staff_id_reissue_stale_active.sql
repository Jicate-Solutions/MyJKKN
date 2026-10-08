-- One-off: re-issue the staff IDs of the 11 ACTIVE staff whose code no longer
-- matched their institution / teaching type when 20261008120000 shipped.
--
-- These people were edited between 2026-09-01 and 2026-10-08, after IDs became
-- permanent but before anything reacted to an institution / category change
-- (DCH070 on a non-teaching person, NOTCET028 on a Main Office person, ...).
-- The trigger only fires on a FUTURE change of bucket, so it cannot reach them;
-- this file does the same thing once, for a fixed list the user reviewed.
--
-- PINNED, NOT PREDICATE-BASED. The list is explicit UUIDs with the code each
-- person held when it was reviewed. If anyone's code differs now (someone fixed
-- it by hand, or was already re-issued), the whole file aborts rather than
-- re-issuing a code nobody looked at.
--
-- Numbers are claimed from the same counters as everywhere else, in
-- date_of_joining order within each institution x teaching bucket. Old codes go
-- to staff_id_history (reason 'corrective_reissue') and staff.retired_staff_ids,
-- exactly as the trigger would have done.
--
-- trg_staff_autonumber is DISABLED for the rewrite because its manual-change
-- guard rejects any direct write to staff_id, this file's included. The other
-- two (trg_sync_staff_to_profiles, update_staff_updated_at) are disabled for
-- the same reason as in the 2026-08-28 backfill: a staff UPDATE rewrites the
-- linked profile, and none of that is wanted for an ID-only correction.
-- All three are re-enabled and verified in this same file.

ALTER TABLE public.staff DISABLE TRIGGER trg_staff_autonumber;
ALTER TABLE public.staff DISABLE TRIGGER trg_sync_staff_to_profiles;
ALTER TABLE public.staff DISABLE TRIGGER update_staff_updated_at;

DO $$
DECLARE
  r       record;
  v_new   text;
  v_moved integer := 0;
BEGIN
  FOR r IN
    SELECT s.id, s.staff_id, s.institution_id, s.is_active, ec.is_teaching, v.expected_old
    FROM (VALUES
      ('5e6277f9-5778-433f-922b-559fb9f138ef'::uuid, 'CET042'),
      ('d89b4573-0e69-419a-8fb0-4094fb9d49e5'::uuid, 'DCH070'),
      ('2161e47f-4d4b-462c-81f0-39c1e4cd6382'::uuid, 'NOTAATS003'),
      ('aa946d7f-adca-423e-bbbc-99ece30d1d5d'::uuid, 'NOTCET028'),
      ('ae8e1d74-99b1-43a8-b5d4-54a62d9902f6'::uuid, 'NOTCET029'),
      ('a502d0a8-beff-470d-844c-2c3f156ab18b'::uuid, 'NOTCOP004'),
      ('e3cc2f91-f436-4d5a-b0c5-c751b7a7d007'::uuid, 'NOTJIC002'),
      ('940a9f0a-16b3-4c11-a831-1970cc86c2f8'::uuid, 'NOTJIC011'),
      ('30e752c9-f0a2-4813-a74a-be4f70d93609'::uuid, 'NOTJMO048'),
      ('7c2d8b64-9fcd-40a0-b5e6-7cf191ab0464'::uuid, 'NOTJMO106'),
      ('344bc9af-fd0d-4b83-b3f6-8188444ceedd'::uuid, 'NOTJMO120')
    ) AS v(id, expected_old)
    JOIN public.staff s ON s.id = v.id
    JOIN public.employment_categories ec ON ec.id = s.category_id
    ORDER BY s.institution_id, ec.is_teaching, s.date_of_joining NULLS LAST, s.id
  LOOP
    IF r.staff_id IS DISTINCT FROM r.expected_old OR NOT coalesce(r.is_active, false) THEN
      RAISE EXCEPTION 'Staff % no longer matches the reviewed list (code %, expected %, active %); nothing was changed.',
        r.id, r.staff_id, r.expected_old, r.is_active;
    END IF;

    v_new := public.fn_next_staff_code(r.institution_id, r.is_teaching);

    -- The institution the old code came from is not recorded anywhere, so
    -- from_institution_id / from_is_teaching stay NULL rather than guessed.
    INSERT INTO public.staff_id_history (
      staff_uuid, staff_id, new_staff_id, reason,
      to_institution_id, to_is_teaching
    ) VALUES (
      r.id, r.staff_id, v_new, 'corrective_reissue',
      r.institution_id, r.is_teaching
    );

    UPDATE public.staff
       SET staff_id          = v_new,
           retired_staff_ids = nullif(btrim(coalesce(retired_staff_ids, '') || ' ' || r.staff_id), '')
     WHERE id = r.id;

    v_moved := v_moved + 1;
  END LOOP;

  IF v_moved <> 11 THEN
    RAISE EXCEPTION 'Expected to re-issue 11 staff IDs, re-issued %; nothing was changed.', v_moved;
  END IF;
END $$;

ALTER TABLE public.staff ENABLE TRIGGER trg_staff_autonumber;
ALTER TABLE public.staff ENABLE TRIGGER trg_sync_staff_to_profiles;
ALTER TABLE public.staff ENABLE TRIGGER update_staff_updated_at;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.staff'::regclass
       AND tgname IN ('trg_staff_autonumber', 'trg_sync_staff_to_profiles', 'update_staff_updated_at')
       AND tgenabled <> 'O'
  ) THEN
    RAISE EXCEPTION 'A staff trigger was left disabled; rolling back.';
  END IF;
END $$;
