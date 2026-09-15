/**
 * HR Recruitment — candidate sub-route dispatch table.
 *
 * Vercel caps a deployment at 2048 routes and production tipped over it. Every
 * dynamic route.ts costs two routes, so the sixteen files that used to live
 * under app/api/hr/recruitment/candidates/[id]/** were folded into a single
 * optional catch-all handler. Their code was moved VERBATIM into
 * ./handlers/*.ts — same exported method names, same signatures, same bodies —
 * and this table is the only new logic: it maps the URL segments that follow
 * the candidate id back to the module that used to own that folder.
 *
 * URLs and methods are therefore unchanged for every caller.
 *
 * Segment syntax: a plain segment is a literal, a leading colon captures a
 * value into params under that name (only :packageId is used, mirroring the
 * old [packageId] folder). Matching is first-match-wins over the array below,
 * which is authored literals-first so a literal can never be shadowed by a
 * capture at the same position.
 */

import type { NextRequest } from 'next/server';

import * as alumniSignal from './handlers/alumni-signal';
import * as approve from './handlers/approve';
import * as candidate from './handlers/candidate';
import * as comments from './handlers/comments';
import * as onboardToStaff from './handlers/onboard-to-staff';
import * as onboardingCompleteStep from './handlers/onboarding-complete-step';
import * as onboardingStart from './handlers/onboarding-start';
import * as packageApprove from './handlers/package-approve';
import * as packageCounter from './handlers/package-counter';
import * as packageDetail from './handlers/package-detail';
import * as packages from './handlers/packages';
import * as reject from './handlers/reject';
import * as scheduleStepInterview from './handlers/schedule-step-interview';
import * as status from './handlers/status';
import * as stepComment from './handlers/step-comment';
import * as withdraw from './handlers/withdraw';

/** The only verbs the folded family ever exported. */
export const HTTP_METHODS = ['GET', 'POST', 'PATCH', 'DELETE'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

/**
 * Params a folded handler receives. `packageId` is declared required because
 * the three package handlers require it; the candidate-level handlers are
 * assignable all the same (a wider context is accepted where a narrower one
 * was expected) and none of them reads it.
 */
export type CandidateRouteParams = { id: string; packageId: string };

export type CandidateRouteHandler = (
  request: NextRequest,
  context: { params: Promise<CandidateRouteParams> },
) => Promise<Response>;

export type CandidateHandlerModule = Partial<Record<HttpMethod, CandidateRouteHandler>>;

export interface CandidateRouteEntry {
  /** Stable identifier — also the handler module's file name. */
  readonly key: string;
  /** The original folder path under [id], for reviewers and for the tests. */
  readonly path: string;
  /** Segments after the candidate id. Empty = the old [id]/route.ts itself. */
  readonly segments: readonly string[];
  /** Declared for review; a test asserts it equals the module's real exports. */
  readonly methods: readonly HttpMethod[];
  readonly module: CandidateHandlerModule;
}

export const CANDIDATE_ROUTES: readonly CandidateRouteEntry[] = [
  { key: 'candidate', path: '', segments: [], methods: ['GET', 'DELETE'], module: candidate },
  { key: 'alumni-signal', path: 'alumni-signal', segments: ['alumni-signal'], methods: ['GET'], module: alumniSignal },
  { key: 'approve', path: 'approve', segments: ['approve'], methods: ['POST'], module: approve },
  { key: 'comments', path: 'comments', segments: ['comments'], methods: ['GET', 'POST'], module: comments },
  { key: 'onboard-to-staff', path: 'onboard-to-staff', segments: ['onboard-to-staff'], methods: ['POST'], module: onboardToStaff },
  { key: 'onboarding-complete-step', path: 'onboarding/complete-step', segments: ['onboarding', 'complete-step'], methods: ['POST'], module: onboardingCompleteStep },
  { key: 'onboarding-start', path: 'onboarding/start', segments: ['onboarding', 'start'], methods: ['POST'], module: onboardingStart },
  { key: 'packages', path: 'packages', segments: ['packages'], methods: ['GET', 'POST'], module: packages },
  { key: 'package-approve', path: 'packages/[packageId]/approve', segments: ['packages', ':packageId', 'approve'], methods: ['POST'], module: packageApprove },
  { key: 'package-counter', path: 'packages/[packageId]/counter', segments: ['packages', ':packageId', 'counter'], methods: ['POST'], module: packageCounter },
  { key: 'package-detail', path: 'packages/[packageId]', segments: ['packages', ':packageId'], methods: ['GET'], module: packageDetail },
  { key: 'reject', path: 'reject', segments: ['reject'], methods: ['POST'], module: reject },
  { key: 'schedule-step-interview', path: 'schedule-step-interview', segments: ['schedule-step-interview'], methods: ['POST'], module: scheduleStepInterview },
  { key: 'status', path: 'status', segments: ['status'], methods: ['PATCH'], module: status },
  { key: 'step-comment', path: 'step-comment', segments: ['step-comment'], methods: ['PATCH'], module: stepComment },
  { key: 'withdraw', path: 'withdraw', segments: ['withdraw'], methods: ['POST'], module: withdraw },
];

export interface CandidateRouteMatch {
  readonly entry: CandidateRouteEntry;
  /** Captured segments — only ever packageId. */
  readonly captured: Record<string, string>;
}

/**
 * Resolve the slug segments that follow the candidate id. A missing or empty
 * slug is the old [id]/route.ts. Returns null when no folded route owned that
 * path, which the route handler answers with the same 404 Next.js used to.
 */
export function matchCandidateRoute(slug: readonly string[] | undefined): CandidateRouteMatch | null {
  const segments = slug ?? [];

  for (const entry of CANDIDATE_ROUTES) {
    if (entry.segments.length !== segments.length) continue;

    const captured: Record<string, string> = {};
    let ok = true;

    for (let i = 0; i < entry.segments.length; i += 1) {
      const pattern = entry.segments[i];
      const actual = segments[i];
      if (pattern.startsWith(':')) {
        // A capture must not swallow an empty segment — Next.js would never
        // have routed //packages//approve to the [packageId] folder either.
        if (!actual) { ok = false; break; }
        captured[pattern.slice(1)] = actual;
      } else if (pattern !== actual) {
        ok = false;
        break;
      }
    }

    if (ok) return { entry, captured };
  }

  return null;
}

/** Verbs the entry's module actually exports, in the canonical order. */
export function exportedMethods(entry: CandidateRouteEntry): HttpMethod[] {
  return HTTP_METHODS.filter((method) => typeof entry.module[method] === 'function');
}
