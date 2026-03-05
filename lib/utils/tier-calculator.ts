/**
 * Appathon 2.0 — Tiered Objectives + MRR Bonus scoring system
 *
 * Tier Levels (highest achieved, not cumulative):
 *   Level 1: App deployed & working (10 pts) — live_url exists
 *   Level 2: 5+ real users signed up (20 pts) — total_users >= 5
 *   Level 3: 10+ active users (30 pts) — active_users >= 10
 *   Level 4: Any revenue generated (40 pts) — mrr > 0 or paying_users > 0
 *   Level 5: ₹100+ MRR or 5+ paying users (50 pts)
 *
 * MRR Bonus (added on top of tier):
 *   ₹1–99 → +5 pts
 *   ₹100–499 → +10 pts
 *   ₹500–999 → +15 pts
 *   ₹1,000+ → +20 pts
 *
 * Total Score = Tier Base Points + MRR Bonus
 */

export interface TierResult {
  level: number;
  label: string;
  points: number;
}

export interface ScoringResult {
  tier: TierResult;
  mrrBonus: number;
  totalScore: number;
}

const TIER_LABELS: Record<number, string> = {
  0: 'Not Started',
  1: 'App Deployed',
  2: '5+ Users',
  3: '10+ Active',
  4: 'Revenue!',
  5: 'MRR Leader',
};

const TIER_COLORS: Record<number, string> = {
  0: 'bg-gray-100 text-gray-600',
  1: 'bg-blue-100 text-blue-700',
  2: 'bg-indigo-100 text-indigo-700',
  3: 'bg-purple-100 text-purple-700',
  4: 'bg-amber-100 text-amber-700',
  5: 'bg-green-100 text-green-700',
};

export function calculateTier(submission: {
  live_url?: string | null;
  total_users?: number | null;
  active_users?: number | null;
  mrr_amount?: number | null;
  paying_users_count?: number | null;
}): TierResult {
  const mrr = submission.mrr_amount ?? 0;
  const payingUsers = submission.paying_users_count ?? 0;
  const totalUsers = submission.total_users ?? 0;
  const activeUsers = submission.active_users ?? 0;
  const hasLiveUrl = !!submission.live_url;

  // Check from highest tier down
  if (mrr >= 100 || payingUsers >= 5) {
    return { level: 5, label: TIER_LABELS[5], points: 50 };
  }
  if (mrr > 0 || payingUsers > 0) {
    return { level: 4, label: TIER_LABELS[4], points: 40 };
  }
  if (activeUsers >= 10) {
    return { level: 3, label: TIER_LABELS[3], points: 30 };
  }
  if (totalUsers >= 5) {
    return { level: 2, label: TIER_LABELS[2], points: 20 };
  }
  if (hasLiveUrl) {
    return { level: 1, label: TIER_LABELS[1], points: 10 };
  }
  return { level: 0, label: TIER_LABELS[0], points: 0 };
}

export function calculateMRRBonus(mrrAmount: number): number {
  if (mrrAmount >= 1000) return 20;
  if (mrrAmount >= 500) return 15;
  if (mrrAmount >= 100) return 10;
  if (mrrAmount >= 1) return 5;
  return 0;
}

export function calculateScore(submission: {
  live_url?: string | null;
  total_users?: number | null;
  active_users?: number | null;
  mrr_amount?: number | null;
  paying_users_count?: number | null;
}): ScoringResult {
  const tier = calculateTier(submission);
  const mrrBonus = calculateMRRBonus(submission.mrr_amount ?? 0);
  return {
    tier,
    mrrBonus,
    totalScore: tier.points + mrrBonus,
  };
}

export function getTierColor(level: number): string {
  return TIER_COLORS[level] ?? TIER_COLORS[0];
}

export function getTierLabel(level: number): string {
  return TIER_LABELS[level] ?? TIER_LABELS[0];
}
