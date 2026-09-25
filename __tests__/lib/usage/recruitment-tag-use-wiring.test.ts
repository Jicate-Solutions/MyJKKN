import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FEATURE_KEYS } from '@/lib/usage/record';

/**
 * Adoption — tagging a colleague on a recruitment candidate's discussion (#4006).
 * Counted only when a NEW tag was created (a repeated tag counts nothing), after the
 * refusal branch, on the session client (fn_feature_used keys on auth.uid(); the
 * service-role client beside it would record nothing, silently). Comments are
 * stripped so prose cannot satisfy a check.
 */

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const src = stripComments(
  readFileSync(join(process.cwd(), 'lib/api/hr/recruitment/candidates/handlers/comment-mentions.ts'), 'utf8'),
);

describe('adoption — recruitment tag a colleague', () => {
  it('spells the key exactly as feature_registry holds it', () => {
    expect(FEATURE_KEYS.HR_RECRUITMENT_TAG_COLLEAGUE).toBe('hr.recruitment_tag_colleague');
  });

  it('records on the session client, only for a newly created tag, after the refusal', () => {
    const refusal = src.indexOf('if (outcome.grantError)');
    const record = src.search(
      /if \(outcome\.created\.length > 0\) \{\s*await recordFeatureUse\(\s*supabase,\s*FEATURE_KEYS\.HR_RECRUITMENT_TAG_COLLEAGUE\s*\)/,
    );
    expect(refusal).toBeGreaterThan(-1);
    expect(record).toBeGreaterThan(refusal);
    expect(src).toMatch(/const supabase = await getClient\(\)/);
    expect(src).not.toMatch(/recordFeatureUse\(\s*service/);
  });
});
