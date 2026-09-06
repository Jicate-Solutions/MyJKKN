-- Migration: unify college exam→topic mappings into shared exam_topic_map (PR-C, DB step)
-- Date: 2026-07-06
-- ADDITIVE. Copies the 68 college mappings from the legacy cdc_exam_topic_map into the
-- shared exam_topic_map (keyed to exam_definitions via ed.cdc_training_type_id), making
-- exam_topic_map the single unified junction for BOTH school and college.
-- Does NOT modify cdc_exam_topic_map — CDC keeps reading its own table (unchanged) until the
-- consumer-code switch (separate PR, browser-verified). Idempotent (ON CONFLICT DO NOTHING).
-- Reversible: DELETE the college rows from exam_topic_map (those with a college exam_definition).

BEGIN;

INSERT INTO public.exam_topic_map (exam_definition_id, topic_id, sort_order)
SELECT ed.id, m.topic_id, m.sort_order
FROM public.cdc_exam_topic_map m
JOIN public.exam_definitions ed ON ed.cdc_training_type_id = m.exam_training_type_id
ON CONFLICT (exam_definition_id, topic_id) DO NOTHING;

COMMIT;
