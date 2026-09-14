/**
 * HR Recruitment — candidate catch-all dispatch.
 *
 * Sixteen dynamic route.ts files under
 * app/api/hr/recruitment/candidates/[id]/** were folded into one optional
 * catch-all to get back under the Vercel 2048-route cap. The fold is only safe
 * if every URL a caller already uses still lands on the same code with the same
 * verbs, so this file walks the original sixteen paths one by one.
 *
 * What it proves:
 *   1. each original path resolves to its own handler module;
 *   2. the verbs declared in the table are the verbs the module really exports
 *      (so a handler cannot be silently dropped or gain one in the move);
 *   3. the package sub-paths still capture packageId, and nothing else does;
 *   4. an unknown path is a miss (the route answers 404) and a verb the module
 *      never exported is a miss too (the route answers 405).
 */
import { describe, it, expect } from 'vitest';

import {
  CANDIDATE_ROUTES,
  HTTP_METHODS,
  exportedMethods,
  matchCandidateRoute,
  type HttpMethod,
} from '@/lib/api/hr/recruitment/candidates/dispatch';

/** Realistic ids — the values the old [id] / [packageId] folders received. */
const CANDIDATE_ID = '2f1c8c8e-0000-4000-8000-000000000001';
const PACKAGE_ID = '7b4d2a10-0000-4000-8000-0000000000ab';

/**
 * The sixteen routes as they existed before the fold: the slug segments that
 * followed the candidate id, the handler that owned them, and the verbs that
 * folder's route.ts exported. Written out by hand from the deleted files so it
 * is an independent record, not a re-read of the table under test.
 */
const ORIGINAL_ROUTES: ReadonlyArray<{
  url: string;
  slug: string[];
  key: string;
  methods: HttpMethod[];
  packageId?: string;
}> = [
  { url: '', slug: [], key: 'candidate', methods: ['GET', 'DELETE'] },
  { url: '/alumni-signal', slug: ['alumni-signal'], key: 'alumni-signal', methods: ['GET'] },
  { url: '/approve', slug: ['approve'], key: 'approve', methods: ['POST'] },
  { url: '/comments', slug: ['comments'], key: 'comments', methods: ['GET', 'POST'] },
  { url: '/onboard-to-staff', slug: ['onboard-to-staff'], key: 'onboard-to-staff', methods: ['POST'] },
  { url: '/onboarding/complete-step', slug: ['onboarding', 'complete-step'], key: 'onboarding-complete-step', methods: ['POST'] },
  { url: '/onboarding/start', slug: ['onboarding', 'start'], key: 'onboarding-start', methods: ['POST'] },
  { url: '/packages', slug: ['packages'], key: 'packages', methods: ['GET', 'POST'] },
  { url: '/packages/:packageId', slug: ['packages', PACKAGE_ID], key: 'package-detail', methods: ['GET'], packageId: PACKAGE_ID },
  { url: '/packages/:packageId/approve', slug: ['packages', PACKAGE_ID, 'approve'], key: 'package-approve', methods: ['POST'], packageId: PACKAGE_ID },
  { url: '/packages/:packageId/counter', slug: ['packages', PACKAGE_ID, 'counter'], key: 'package-counter', methods: ['POST'], packageId: PACKAGE_ID },
  { url: '/reject', slug: ['reject'], key: 'reject', methods: ['POST'] },
  { url: '/schedule-step-interview', slug: ['schedule-step-interview'], key: 'schedule-step-interview', methods: ['POST'] },
  { url: '/status', slug: ['status'], key: 'status', methods: ['PATCH'] },
  { url: '/step-comment', slug: ['step-comment'], key: 'step-comment', methods: ['PATCH'] },
  { url: '/withdraw', slug: ['withdraw'], key: 'withdraw', methods: ['POST'] },
];

const base = `/api/hr/recruitment/candidates/${CANDIDATE_ID}`;

describe('candidate catch-all dispatch', () => {
  it('folds exactly the sixteen original routes and no more', () => {
    expect(ORIGINAL_ROUTES).toHaveLength(16);
    expect(CANDIDATE_ROUTES).toHaveLength(16);
    expect(CANDIDATE_ROUTES.map((entry) => entry.key).sort()).toEqual(
      ORIGINAL_ROUTES.map((route) => route.key).sort(),
    );
  });

  describe.each(ORIGINAL_ROUTES)('$url', (route) => {
    it(`${base}${route.url} resolves to the ${route.key} handler`, () => {
      const match = matchCandidateRoute(route.slug);
      expect(match).not.toBeNull();
      expect(match!.entry.key).toBe(route.key);
    });

    it('keeps every verb the original file exported, and adds none', () => {
      const match = matchCandidateRoute(route.slug)!;
      // Declared in the table...
      expect([...match.entry.methods].sort()).toEqual([...route.methods].sort());
      // ...and actually exported by the moved module.
      expect(exportedMethods(match.entry).sort()).toEqual([...route.methods].sort());
      for (const method of route.methods) {
        expect(typeof match.entry.module[method]).toBe('function');
      }
    });

    it('captures packageId on the package sub-paths only', () => {
      const match = matchCandidateRoute(route.slug)!;
      if (route.packageId) {
        expect(match.captured).toEqual({ packageId: route.packageId });
      } else {
        expect(match.captured).toEqual({});
      }
    });

    it('rejects the verbs that file never exported', () => {
      const match = matchCandidateRoute(route.slug)!;
      const absent = HTTP_METHODS.filter((method) => !route.methods.includes(method));
      for (const method of absent) {
        expect(match.entry.module[method]).toBeUndefined();
      }
    });
  });

  it('treats a missing slug as the candidate route itself', () => {
    expect(matchCandidateRoute(undefined)!.entry.key).toBe('candidate');
    expect(matchCandidateRoute([])!.entry.key).toBe('candidate');
  });

  const UNROUTED: ReadonlyArray<{ label: string; slug: string[] }> = [
    { label: 'nonsense', slug: ['nonsense'] },
    { label: 'approve/twice', slug: ['approve', 'twice'] },
    { label: 'onboarding', slug: ['onboarding'] },
    { label: 'onboarding/stop', slug: ['onboarding', 'stop'] },
    { label: 'packages/:packageId/reject', slug: ['packages', PACKAGE_ID, 'reject'] },
    { label: 'packages/:packageId/approve/again', slug: ['packages', PACKAGE_ID, 'approve', 'again'] },
    { label: 'Approve', slug: ['Approve'] },
  ];

  it.each(UNROUTED)('misses the unrouted path /$label', ({ slug }) => {
    expect(matchCandidateRoute(slug)).toBeNull();
  });

  it('never lets a capture swallow an empty segment', () => {
    expect(matchCandidateRoute(['packages', '', 'approve'])).toBeNull();
  });

  it('gives a literal segment priority over a capture', () => {
    // packages/<uuid> is the detail route; packages on its own is the list.
    expect(matchCandidateRoute(['packages'])!.entry.key).toBe('packages');
    expect(matchCandidateRoute(['packages', PACKAGE_ID])!.entry.key).toBe('package-detail');
  });
});
