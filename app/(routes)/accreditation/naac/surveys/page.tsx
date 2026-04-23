import { redirect } from 'next/navigation';

/**
 * NAAC Surveys landing — redirects to the default sub-page.
 *
 * /accreditation/naac/surveys previously 404'd because no page.tsx existed here.
 * Redirects to /accreditation/naac/surveys/consent — DPDPA consent is the
 * mandatory entry point for all survey participation.
 *
 * Part of the nav-landing sweep (follow-up to #348).
 */

/**
 * navMeta — this URL is a redirect target (e.g. from a "Surveys" CTA on the
 * NAAC dashboard or stale bookmarks) that bounces to /surveys/consent. Nav-
 * coverage detector (`scripts/assert-nav-coverage.mjs`) reads this to pass
 * discoverability without requiring a visible chip for the redirect landing.
 */
export const navMeta = {
  invokedFrom: '/accreditation/naac',
} as const;

export default function NaacSurveysIndex() {
  redirect('/accreditation/naac/surveys/consent');
}
