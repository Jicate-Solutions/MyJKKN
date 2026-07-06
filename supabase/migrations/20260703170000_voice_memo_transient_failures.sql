-- 2026-07-03: persistent cross-run counter for transient-class analyze
-- failures (voice-memo pipeline). Fast lane: same-run health evidence
-- charges memo_analyze_attempts. Slow backstop: any chronic row whose
-- failures always look provider-wide accrues memo_transient_failures on
-- every uncharged failure; at the in-code threshold it converts to one
-- attempts charge (and resets), so every pathology parks eventually while
-- real outages (bounded duration, probes spread by rotation) never
-- accumulate enough to park valid rows.
-- Applied to prod via Management API 2026-07-03 (additive, inert for
-- deployed code). Companion to 20260703150000_voice_memo_analyze_attempts.
ALTER TABLE public.admission_call_logs
  ADD COLUMN IF NOT EXISTS memo_transient_failures integer NOT NULL DEFAULT 0;
