-- Add outcome-based discount fields to billing_discounts
ALTER TABLE billing_discounts
  ADD COLUMN IF NOT EXISTS is_outcome_based BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS outcome_criteria JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS outcome_verification JSONB DEFAULT '{}';

COMMENT ON COLUMN billing_discounts.is_outcome_based IS 'Whether discount is linked to learning outcomes';
COMMENT ON COLUMN billing_discounts.outcome_criteria IS 'JSON criteria: { competency_ids: string[], min_proficiency: string, min_score: number, evaluation_period_days: number }';
COMMENT ON COLUMN billing_discounts.outcome_verification IS 'JSON verification: { verified_by?: string, verified_at?: string, evidence_urls?: string[], status: pending|verified|rejected }';
