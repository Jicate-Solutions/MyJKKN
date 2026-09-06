-- 2026-09-06: loop_audits.layer gains 'drill' — fire-drill evidence (Director tap 2026-09-06)
ALTER TABLE public.loop_audits DROP CONSTRAINT loop_audits_layer_check;
ALTER TABLE public.loop_audits ADD CONSTRAINT loop_audits_layer_check CHECK (layer = ANY (ARRAY['sim'::text,'walk'::text,'full'::text,'drill'::text]));
