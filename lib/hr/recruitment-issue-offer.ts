/**
 * When may the **Issue Offer** control be shown?
 *
 * A pure rule module (the pattern of lib/hr/leave-document-rule.ts) rather than a
 * method on RecruitmentService, for two reasons:
 *
 *   - BOTH surfaces need it — app/(routes)/hr/recruitment/candidates/[id]/page.tsx
 *     and app/(routes)/hr/recruitment/approvals/[jobId]/_components/
 *     workspace-candidates-tab.tsx — because fn_my_desk_waiting's per-row `href`
 *     sends some of these rows to the job workspace and the rest to the candidate
 *     page. Review round 1 found the same wrong status in BOTH copies of a
 *     duplicated predicate; one shared rule cannot drift.
 *   - Both of those are client components, and no client component in this module
 *     imports lib/services/hr/recruitment-service.ts (23 importers, every one an
 *     API route). Keeping the rule here keeps the service out of the browser
 *     bundle.
 */
import type { CandidateStatus } from '@/types/hr-recruitment';

/**
 * The statuses at which the Issue Offer control may be shown.
 *
 * `package_fixed` ONLY — deliberately NARROWER than the service's
 * forward-transition map, which also admits `approved → offer_issued`.
 *
 * WHY 'approved' IS EXCLUDED (review round 1, P1 — this was a blocking bug).
 * `package_fixed` MEANS salary-agreed. The Director ruled on 2026-08-28 that a
 * salary package may only be fixed AFTER the approval chain completes, and
 * `RecruitmentPackageService.approvePackage` is the only writer of that status
 * (lib/services/hr/recruitment-package-service.ts — the ruling is quoted there
 * at ~lines 121-128). Offering the button at `approved` let HR issue an offer to
 * one of the 9 candidates who have NO agreed salary package at all.
 *
 * And it was UNRECOVERABLE, not merely early. `approvePackage` advances the
 * candidate only `if (parent.status === 'approved')` — a deliberate guard so a
 * later package cannot drag someone BACKWARDS through the map. A candidate moved
 * to `offer_issued` first is no longer at `approved`, so when their package is
 * finally approved the package row flips to `approved` and the person is left
 * stranded at `offer_issued`, with no salary ever recorded as fixed and no
 * transition back.
 *
 * The transition map is the SERVER's rule about what is REACHABLE; this is the
 * PRODUCT's rule about what should be OFFERED. They may differ in this direction
 * only: every status here must be one the map admits to `offer_issued`, which
 * __tests__/lib/services/hr/recruitment-issue-offer.test.ts asserts against
 * CANDIDATE_FORWARD_TRANSITIONS — so the button can never be offered for a
 * transition the server would refuse.
 */
export const ISSUE_OFFER_STATUSES: readonly CandidateStatus[] = ['package_fixed'];

/**
 * Should the Issue Offer control be rendered for this candidate and viewer?
 *
 * Permission is read client-side for the AFFORDANCE only; the route re-checks it
 * and answers a named 403, so a stale client shows a button that fails loudly
 * rather than one that silently appears to work.
 */
export function mayIssueOffer(
  status: CandidateStatus | null | undefined,
  viewer: { isSuperAdmin?: boolean; canEditRecruitment?: boolean }
): boolean {
  if (!status || !ISSUE_OFFER_STATUSES.includes(status)) return false;
  return viewer.isSuperAdmin === true || viewer.canEditRecruitment === true;
}
