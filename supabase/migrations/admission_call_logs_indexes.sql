-- Migration: Add plain btree index on admission_call_logs(call_sid)
-- Created: 2026-07-31 (Section E of the post-incident speed sweep)
-- Issue: admission_call_logs (21k rows) accumulated 1.42M sequential scans —
--        48% of ALL reads on the table were seq scans (28.7B tuples read).
--
-- Root cause: the Exotel sync cron (app/api/admission/calls/sync/route.ts via
--   TelephonyService) looks up every synced call by call_sid through PostgREST:
--     SELECT id, lead_id FROM admission_call_logs WHERE call_sid = $1 LIMIT 1
--   (pg_stat_statements queryid -4146493111173517723: 1,418,085 calls,
--    mean 4.9 ms, 6,933 s total exec time).
--   The ONLY existing call_sid index is PARTIAL:
--     idx_call_logs_call_sid_unique ... WHERE (call_sid !~ 'pending-%')
--   PostgREST uses prepared statements; once the plan cache switches to a
--   GENERIC plan the planner cannot prove $1 !~ 'pending-%', so the partial
--   index is unusable and every lookup falls back to a full seq scan.
--
-- Fix: a plain (non-partial, non-unique) btree index on call_sid that generic
--   plans can always use. The partial UNIQUE index is kept for integrity.
--
-- Proof (prod, 2026-07-31 ~22:20 IST, applied via CREATE INDEX CONCURRENTLY):
--   BEFORE (forced generic plan): Seq Scan, Rows Removed 20,961,
--     1,362 buffers, 6.43 ms; live avg over 50 executions = 5.165 ms
--   AFTER: Index Scan using idx_call_logs_call_sid, 4 buffers, 0.121 ms;
--     live avg over 50 executions = 0.030 ms  (~172x faster)
--   Index size: 1.3 MB. seq_scan baseline at fix time: 1,427,529.
--
-- Already applied to production CONCURRENTLY on 2026-07-31; IF NOT EXISTS
-- makes this a no-op there and a cheap (21k-row) build elsewhere.
-- Rollback: artifacts/ROLLBACK_admission-call-logs-index_2026-07-31.sql

CREATE INDEX IF NOT EXISTS idx_call_logs_call_sid
ON public.admission_call_logs USING btree (call_sid);

COMMENT ON INDEX public.idx_call_logs_call_sid IS
'Plain call_sid lookup index for PostgREST generic plans (Exotel sync hot path). The partial unique idx_call_logs_call_sid_unique cannot serve parameterized plans.';
