import { redirect } from 'next/navigation';

/**
 * Learner case-summary landing — redirects back to the parent case detail.
 *
 * /pde/learn/cases/[caseSlug]/summary previously 404'd because no page.tsx
 * existed at this depth. Its only child is [attemptId]/page.tsx — summaries
 * are always per-attempt, never per-case-only. A learner who lands here
 * without an attempt ID is most useful sent back to the parent case to
 * pick (or start) an attempt.
 *
 * Hardcoded redirect (not config-driven) because the target depends on the
 * [caseSlug] segment.
 *
 * Part of the PDE hub-page-404 sweep (follow-up to #1206).
 */
export default async function LearnCaseSummaryIndex({
  params,
}: {
  params: Promise<{ caseSlug: string }>;
}) {
  const { caseSlug } = await params;
  redirect(`/pde/learn/cases/${caseSlug}`);
}
