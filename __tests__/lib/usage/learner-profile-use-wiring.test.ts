import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FEATURE_KEYS } from '@/lib/usage/record';

/**
 * Adoption — learners.create_profile is recorded where profiles are really created.
 * Every call sits after the successful write and on the SIGNED-IN client:
 * fn_feature_used keys on auth.uid(), so the service-role client beside it would
 * record nothing, silently. Bulk paths count once per upload, not per row.
 * Comments are stripped so prose cannot satisfy a check.
 */

const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const read = (rel: string) => strip(readFileSync(join(process.cwd(), rel), 'utf8'));
const CALL = /recordFeatureUse\(\s*supabase,\s*FEATURE_KEYS\.LEARNERS_CREATE_PROFILE\s*\)/;

describe('adoption — learner profile creation', () => {
  it('spells the key exactly as feature_registry holds it', () => {
    expect(FEATURE_KEYS.LEARNERS_CREATE_PROFILE).toBe('learners.create_profile');
  });

  it('admission convert records after the profile is linked, never on svc', () => {
    const src = read('app/api/admission/bridge/convert/route.ts');
    const linkFailed = src.indexOf('Failed to link profile to lead');
    expect(linkFailed).toBeGreaterThan(-1);
    expect(src.search(CALL)).toBeGreaterThan(linkFailed);
    expect(src).not.toMatch(/recordFeatureUse\(\s*svc/);
  });

  it('bulk upload records once, only when a profile was inserted', () => {
    const src = read('app/api/learners/bulk-upload-profiles/route.ts');
    expect(src).toMatch(
      /if \(\(result\.new_profiles_inserted \?\? 0\) > 0\) \{\s*await recordFeatureUse\(\s*supabase,\s*FEATURE_KEYS\.LEARNERS_CREATE_PROFILE/,
    );
    expect(read('lib/services/bulk-learner-upload-service.ts')).toMatch(/new_profiles_inserted/);
  });

  it('enquiry import records once, only when at least one enquiry was inserted', () => {
    const src = read('app/api/learners/enquiries/import/route.ts');
    const insertError = src.indexOf('if (insertError)');
    const guarded = src.search(
      /if \(successCount > 0\) \{\s*await recordFeatureUse\(\s*supabase,\s*FEATURE_KEYS\.LEARNERS_CREATE_PROFILE/,
    );
    expect(insertError).toBeGreaterThan(-1);
    expect(guarded).toBeGreaterThan(insertError);
  });

  it('the enquiry form records after each create, never after an update', () => {
    const src = read('app/(routes)/learners/enquiries/_components/enquiry-form.tsx');
    const calls = src.match(/void recordFeatureUse\(createClientSupabaseClient\(\), FEATURE_KEYS\.LEARNERS_CREATE_PROFILE\)/g) ?? [];
    const creates = src.match(/LearnerProfileService\.createLearnerProfile\(/g) ?? [];
    expect(creates.length).toBe(3);
    expect(calls.length).toBe(3);
    expect(src).not.toMatch(/updateLearnerProfile\([^)]*\);\s*\n[^\n]*\n?\s*void recordFeatureUse/);
  });

  it('bulk enquiries record once, only when at least one was created', () => {
    const src = read('app/(routes)/learners/enquiries/_components/bulk-upload-enquiries.tsx');
    expect(src).toMatch(
      /if \(results\.upload_summary\.enquiries_created > 0\) \{\s*void recordFeatureUse\(createClientSupabaseClient\(\), FEATURE_KEYS\.LEARNERS_CREATE_PROFILE\)/,
    );
  });

  it('the profile-create hook records on success', () => {
    const src = read('hooks/use-learner-profiles.ts');
    expect(src).toMatch(
      /onSuccess: \(\) => \{\s*void recordFeatureUse\(createClientSupabaseClient\(\), FEATURE_KEYS\.LEARNERS_CREATE_PROFILE\)/,
    );
  });
});
