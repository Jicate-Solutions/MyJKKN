'use client';

// Learner-initiated vacate request (own allocation). The form itself is shared
// with the warden's on-behalf entry point — see vacate-requests/_components/vacate-request-form.tsx.

import { VacateRequestForm } from '../../vacate-requests/_components/vacate-request-form';

/**
 * navMeta — documents that this page is invoked via a button click on the
 * parent listing page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 */
export const navMeta = {
  invokedFrom: '/campus-living/my-hostel',
} as const;

export default function VacateRequestFormPage() {
  return <VacateRequestForm backHref='/campus-living/my-hostel' backLabel='My Hostel' />;
}
