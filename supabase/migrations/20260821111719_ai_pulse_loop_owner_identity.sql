-- 20260821111719_ai_pulse_loop_owner_identity.sql
-- The 13 ai-pulse-* loops were registered with a placeholder owner address.
-- Krishnaveni A is the real owner (holds aiPulse:anomaly.review).
UPDATE public.loop_registry
   SET owner_email = 'krishnaveni_a@jkkn.ac.in',
       updated_at  = now()
 WHERE loop_key LIKE 'ai-pulse-%'
   AND owner_email = 'aieee@jkkn.ac.in';
