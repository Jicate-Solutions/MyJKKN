-- ─── Events Platform Promotion · PR6 — Certificates + public verify, winners-photo split ───
-- 2026-06-23
-- Promotes the Marathon certificate flow into a shared, event-agnostic verification surface and
-- implements Director decision #6 (the "winners-photo split"):
--
--   • For WINNERS (award tier gold / silver / bronze): the public verify page shows
--     name + award + event + PHOTO.
--   • For PARTICIPANTS (any other tier): name + award + event, but NO photo.
--
-- CRITICAL: the photo gate is enforced SERVER-SIDE inside this SECURITY DEFINER RPC. The verify page is
-- anonymous / no-login, so a participant's photo URL must never be sent to the client at all — a
-- client-side `if` would still ship the URL in the JSON payload (visible in the Network tab). The RPC
-- therefore returns photo_url = NULL for non-winners, computed in SQL (CASE … END), not in the app.
--
-- No table renames here. Certificate data already lives inline on marathon_results
-- (certificate_id / certificate_url / rank_overall); the award tier is DERIVED from rank_overall
-- (rank 1→gold, 2→silver, 3→bronze, else participant) so no new column or backfill is required.
-- The participant photo is resolved from the linked learner profile (learners_profiles.student_photo_url)
-- or the external participant (event_external_participants.photo_url).

-- ── Public certificate verification RPC ─────────────────────────────────────
-- INTENTIONALLY PUBLIC: this RPC is the data source for the anonymous (no-login) certificate-verify
-- page at /p/verify/[certId]. It is GRANTed to anon ON PURPOSE (public cert verification, like a QR
-- code anyone can scan). It returns ONLY the safe, presentational fields — never PII such as phone,
-- email, or registration internals — and it gates the photo to winners only (decision #6).
CREATE OR REPLACE FUNCTION public.fn_verify_event_certificate(p_cert_id text)
RETURNS TABLE (
  valid          boolean,
  certificate_id text,
  participant_name text,
  award_tier     text,
  rank_overall   integer,
  event_name     text,
  event_date     date,
  venue          text,
  category       text,
  finish_time    text,
  generated_at   timestamptz,
  photo_url      text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      mr.certificate_id,
      mr.certificate_generated_at,
      mr.rank_overall,
      mr.finish_time,
      mr.is_dnf,
      mr.is_disqualified,
      reg.participant_name,
      reg.learner_id,
      reg.external_participant_id,
      cat.name           AS category_name,
      e.name             AS event_name,
      e.event_date::date AS event_date,
      e.venue            AS venue,
      -- Award tier derived purely from finishing rank.
      CASE
        WHEN mr.rank_overall = 1 THEN 'gold'
        WHEN mr.rank_overall = 2 THEN 'silver'
        WHEN mr.rank_overall = 3 THEN 'bronze'
        ELSE 'participant'
      END AS award_tier,
      -- Best-available photo for the registrant (internal learner first, then external).
      COALESCE(lp.student_photo_url, ext.photo_url) AS raw_photo_url
    FROM public.marathon_results mr
    JOIN public.events_registrations reg ON reg.id = mr.registration_id
    JOIN public.events e                 ON e.id  = mr.event_id
    LEFT JOIN public.event_categories cat        ON cat.id = reg.category_id
    LEFT JOIN public.learners_profiles lp        ON lp.id  = reg.learner_id
    LEFT JOIN public.event_external_participants ext ON ext.id = reg.external_participant_id
    WHERE mr.certificate_id = p_cert_id
      AND mr.is_dnf = false
      AND mr.is_disqualified = false
    LIMIT 1
  )
  SELECT
    true                       AS valid,
    b.certificate_id,
    b.participant_name,
    b.award_tier,
    b.rank_overall,
    b.event_name,
    b.event_date,
    b.venue,
    b.category_name            AS category,
    b.finish_time,
    b.certificate_generated_at AS generated_at,
    -- SERVER-SIDE PHOTO GATE (decision #6): only winners (gold/silver/bronze) get a photo;
    -- participants get NULL so the URL is never sent to the anonymous client.
    CASE
      WHEN b.award_tier IN ('gold', 'silver', 'bronze') THEN b.raw_photo_url
      ELSE NULL
    END AS photo_url
  FROM base b;
$$;

-- INTENTIONAL anon grant — this is the public, no-login cert-verify data source (see header comment).
-- Per the lock-anon discipline, the GRANT TO anon here is DELIBERATE, not the Supabase default; it is
-- the audit-trail signal that public read is intended for this function only.
REVOKE EXECUTE ON FUNCTION public.fn_verify_event_certificate(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_verify_event_certificate(text) TO anon, authenticated;

COMMENT ON FUNCTION public.fn_verify_event_certificate(text) IS
  'Public (anon) certificate verification for any event. Returns safe presentational fields only; '
  'photo_url is gated server-side to winners (gold/silver/bronze) per Events Promotion decision #6.';
