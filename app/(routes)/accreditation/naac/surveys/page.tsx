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
export default function NaacSurveysIndex() {
  redirect('/accreditation/naac/surveys/consent');
}
