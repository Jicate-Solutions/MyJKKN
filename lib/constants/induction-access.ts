// Client-safe constant (NO server imports) — shared by server code
// (student-validation-service, OAuth callback) and client code (nav hook).
// Spec: specs/pre-onboarding-induction-access-2026-06-29.md
//
// Pre-onboarding admission-funnel statuses that get RESTRICTED induction-only
// access (My Induction + per-session feedback + profile completion) before being
// onboarded to `active`. Single source of truth — the OAuth callback's
// auto-provision lookup, the proxy/callback gate, the client nav filter, and the
// `auto_link_profile_to_approved_learner` trigger (SQL, mirrored manually) all key
// off this same list.
export const INDUCTION_ELIGIBLE_LIFECYCLE_STATUSES = [
  'admitted',
  'reserved',
  'enquiry_submitted',
  'enquiry',
] as const;

export type InductionEligibleStatus =
  (typeof INDUCTION_ELIGIBLE_LIFECYCLE_STATUSES)[number];
