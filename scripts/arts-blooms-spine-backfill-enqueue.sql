-- arts-blooms-spine-backfill-enqueue.sql
-- Taxonomy-aware lesson spine (P0, 2026-07-24) — Arts-only Bloom backfill trigger.
--
-- WHAT: enqueues one `curriculum.lesson_spine_regen` task per ARTS 'blooms' course, so the
-- ₹0 Max lane (and cloud sweep) REGENERATES its spine as Bloom-primary. These are the ~778
-- Arts courses whose spine was minted Fink-primary before the taxonomy branch existed — the
-- bug the Director flagged. Regeneration is drafts-gated: nothing reaches a learner until a
-- human approves each draft on /academic/curriculum-review.
--
-- 🛑 RUN THIS ONLY AFTER the taxonomy-spine PR is MERGED + DEPLOYED. Before deploy, the cloud
--    ai-tasks-sweep still runs the OLD Fink-only registry code and would regenerate a task it
--    claims as Fink (wrong). After deploy, all four writers are Bloom-aware and consistent.
--
-- SCOPE: Arts-and-Science (Aided + Self) ONLY. Engineering (JKKN College of Engineering and
--    Technology, 280 blooms courses) is DELIBERATELY EXCLUDED — it waits on the Director's
--    offline accreditor confirmation. Do NOT remove that exclusion without that sign-off.
--
-- IDEMPOTENT: fn's inflight unique index (feature_key, dedupe_key WHERE status in
--    queued/submitting/submitted) means re-running never double-queues an in-flight course.
--    dedupe_key = course_id (a system backfill, not per-reviewer).

INSERT INTO public.ai_task_queue
  (feature_key, entity_id, requested_by, institution_id, context, dedupe_key, status)
SELECT
  'curriculum.lesson_spine_regen',
  c.id::text,
  (SELECT id FROM public.profiles WHERE is_super_admin = true ORDER BY created_at LIMIT 1),
  c.institution_id,
  jsonb_build_object('course_id', c.id, 'course_code', c.course_code),
  c.id::text,
  'queued'
FROM public.courses c
JOIN public.bos_course_syllabi s
  ON s.course_code = c.course_code AND s.institutions_id = c.institution_id
 AND s.is_latest = true AND s.is_archived = false
JOIN public.bos_regulation_taxonomies rt
  ON rt.regulation_id = s.regulation_id AND rt.institutions_id = s.institutions_id
 AND rt.taxonomy_type = 'blooms'
JOIN public.institutions i ON i.id = c.institution_id
WHERE c.is_active = true
  AND i.name ILIKE 'JKKN College of Arts and Science%'   -- Arts only; Engineering excluded
GROUP BY c.id, c.course_code, c.institution_id            -- one task per distinct course
ON CONFLICT (feature_key, dedupe_key)
  WHERE status IN ('queued','submitting','submitted')
  DO NOTHING;

-- After running, watch progress:
--   SELECT status, count(*) FROM ai_task_queue
--    WHERE feature_key='curriculum.lesson_spine_regen' GROUP BY 1;
-- and the drafts land (Bloom-primary) on /academic/curriculum-review for review.
