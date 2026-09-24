import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FEATURE_KEYS } from '@/lib/usage/record';

/**
 * Adoption — the office side of the interview booking link (#3997). The one office
 * action is ringing back a person the link could not book. The call must sit AFTER
 * the guarded update succeeds (a refused or lost-race update is not a use) and on the
 * SESSION client: fn_feature_used keys on auth.uid(), so a service-role client would
 * record nothing, silently. Comments are stripped so prose cannot satisfy a check.
 */

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const FILE = 'app/(routes)/hr/recruitment/interviews/interview-booking-hr-actions.ts';
const src = stripComments(readFileSync(join(process.cwd(), FILE), 'utf8'));

const body = (fn: string) => {
  const start = src.indexOf(`export async function ${fn}(`);
  const next = src.indexOf('export async function', start + 1);
  return src.slice(start, next === -1 ? undefined : next);
};

describe('adoption — interview call-back handled', () => {
  it('spells the key exactly as feature_registry holds it', () => {
    expect(FEATURE_KEYS.HR_INTERVIEW_CALLBACK_HANDLE).toBe('hr.interview_callback_handle');
  });

  it('records the use on the session client, after the no-row refusal', () => {
    const fn = body('markCallbackRequestCalled');
    const refusal = fn.indexOf('return explainNoRowUpdated(supabase)');
    const record = fn.search(/recordFeatureUse\(\s*supabase,\s*FEATURE_KEYS\.HR_INTERVIEW_CALLBACK_HANDLE\s*\)/);
    expect(refusal).toBeGreaterThan(-1);
    expect(record).toBeGreaterThan(refusal);
    expect(fn).toMatch(/const supabase = await createClient\(\)/);
  });

  it('reopening a request is not a use', () => {
    expect(body('reopenCallbackRequest')).not.toMatch(/recordFeatureUse/);
  });
});
