/**
 * The session-feedback roll-up's error box said "You don't have access" for
 * EVERY failure. On 27 Sep the MBA HoD — who holds the leadership key — got
 * that line over "canceling statement due to statement timeout" on the
 * facilitator-coverage card. Only a real refusal may say "no access".
 */
import { describe, it, expect } from 'vitest';
import { loadErrorHeadline } from '@/app/(routes)/academic/session-feedback/_components/load-error-copy';

const DENIED = "You don't have access to the all-college dashboard — contact your administrator.";

describe('session-feedback load-error headline', () => {
  it('a timeout is not reported as an access problem', () => {
    const err = new Error('Failed to load facilitator coverage: canceling statement due to statement timeout');
    expect(loadErrorHeadline(err, DENIED)).not.toBe(DENIED);
    expect(loadErrorHeadline(err, DENIED)).toMatch(/couldn't load/);
  });

  it('a real refusal from the RPC still says no access', () => {
    const err = new Error('Failed to load faculty summary: fn_scf_admin_faculty_summary: not authorized');
    expect(loadErrorHeadline(err, DENIED)).toBe(DENIED);
  });

  it('an unauthenticated caller is an access problem too', () => {
    expect(loadErrorHeadline(new Error('fn_scf_admin_trend: not authenticated'), DENIED)).toBe(DENIED);
  });

  it('a non-Error value falls back to the neutral line', () => {
    expect(loadErrorHeadline(undefined, DENIED)).not.toBe(DENIED);
  });
});
