/**
 * Learner Contribution Scoring — TypeScript types
 *
 * Matches the production table `learner_contribution_scores`.
 *
 * VISIBILITY (Director decision, 2026-07-30): the contribution/value RANKING is
 * ADMIN-ONLY. The table's `lcs_admin_select` RLS policy gates it on
 * `learners.contribution.view` (plus super-admin/admin bypass), so a faculty or
 * learner session simply reads zero rows. Callers must render nothing on an
 * empty read rather than adding a second, client-side hide — one gate, in the
 * database, is the whole enforcement story.
 *
 * The risk BAND (see types/learner-risk.ts) is deliberately the opposite: it is
 * visible to faculty and to the learner themselves.
 */

/** Ordered worst → best, matching the seeded tier bands. */
export type ContributionTier =
  | 'minimal'
  | 'emerging'
  | 'steady'
  | 'strong'
  | 'exceptional';

/**
 * Typed shape of `learner_contribution_scores.dimension_scores` (JSONB).
 *
 * Note these are a different set from the risk dimensions — contribution
 * measures what a learner puts IN, risk measures what is going wrong.
 */
export interface ContributionDimensionScores {
  events_leadership: number;
  events_participation: number;
  career_development: number;
  induction_engagement: number;
  pde_demonstrations: number;
}

export interface LearnerContributionScore {
  id: string;
  learner_id: string;
  institution_id: string | null;
  assessment_date: string; // DATE as ISO string
  contribution_score: number; // 0-100
  contribution_tier: ContributionTier;
  dimension_scores: ContributionDimensionScores;
  highlights: string[];
  created_at: string;
}
