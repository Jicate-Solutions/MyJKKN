-- Campus Walk — private photo bucket
-- Spec: specs/campus-walk-2026-08-17.md (13 Director decisions, 5 guardrails)
--
-- WHAT THIS IS FOR
-- The Director walks the 28-acre campus, photographs a physical condition (a dirty
-- toilet, a broken light), and it is routed to whoever owns it. D13 splits the
-- outcome: a SYMPTOM is one action; a SYSTEM GAP ("there is no cleaning SOP") is
-- broader work. Both become project_tasks under the standing CAMPUS-OPS project.
--
-- WHY NOT grievance_tickets (reversal recorded 2026-08-19)
-- grievance_tickets looked like the natural home — it has assigned_to, real SLA
-- columns and a business-day deadline RPC. It is the wrong home. Nothing that counts
-- those rows filters by type, and one of the counters is a STAFF PERFORMANCE SCORE:
-- 20260722200000_hod_metrics_add_overdue_ages.sql computes an HOD's grievance
-- resolution percentage straight from COUNT(*) on that table. Filing facility photos
-- there would drag down a department head's rating and inflate the NAAC/UGC grievance
-- figures exported by app/api/b2a/grievance/dashboard. That is precisely the harm
-- guardrail G1 exists to prevent, so campus conditions never touch that table.
--
-- SPLIT FROM the AI classification lane (2026-09-03): this migration used to also
-- widen ai_job_types_lane_chk and seed the 'campus.walk_classify' job type in the
-- same transaction. That lane is optional and currently has no consumer outside this
-- repo (see the deployment note in 20261102020000_campus_walk_ai_lane.sql); this
-- bucket is not — it is what makes photo capture work at all. A CHECK-widen on a
-- shared, live table whose current contents cannot be verified from the repo must
-- never be able to roll back the one object that makes capture possible. They are
-- now two independent migrations, ORDERED so this one lands first: capture keeps
-- working even if the classification lane migration never ships.
--
-- Version 20261102010000 is above the highest version on jicate/main at split time
-- and clear of every version claimed by other open PRs (checked 2026-09-03):
-- parallel lanes otherwise all reach for the same "next" timestamp and collide.

-- ── Private bucket for walk photos ──────────────────────────────────────────
-- PRIVATE by design and non-negotiable (guardrail G4). A photo taken in a corridor,
-- a hostel or a washroom block can contain identifiable students and staff even when
-- the subject is a broken fitting. A public bucket would make every such photo
-- enumerable by URL. The upload route also strips EXIF before storing, so location
-- is captured explicitly and with intent rather than leaking through image metadata.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'campus-walk', 'campus-walk', false,
  10485760,  -- 10 MB, matching card-scans; a compressed phone photo is ~1-3 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- Service role only. The upload route runs server-side because it must hash and
-- dedupe before storing, and the Max-lane runner downloads with the service key.
-- No client-side policy is granted on purpose: a browser must never be able to
-- enumerate campus photos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'campus_walk_service_role_only'
  ) THEN
    CREATE POLICY campus_walk_service_role_only ON storage.objects
      FOR ALL TO service_role
      USING (bucket_id = 'campus-walk')
      WITH CHECK (bucket_id = 'campus-walk');
  END IF;
END $$;
