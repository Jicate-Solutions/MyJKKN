/**
 * BUG-006182 (2026-09-19): "Certificate Submitted checklist is not visible for
 * newly admitted candidates."
 *
 * get_learner_checklist() shows a checklist only when the learner's
 * lifecycle_status is in the checklist's applies_to_lifecycle. The settings
 * screen (and the create API's default) offered 'lead', 'admitted' and
 * 'enrolled'. 'lead' and 'enrolled' are not lifecycle codes, and a newly
 * admitted candidate is in 'account' or 'reserved' (65 learners were
 * 'reserved' on 2026-09-28), which could not be chosen at all.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import {
  ADMISSION_CHECKLIST_LIFECYCLE_OPTIONS,
  DEFAULT_ADMISSION_CHECKLIST_LIFECYCLE,
  admissionChecklistLifecycleLabel,
} from '@/lib/constants/admission-checklist-lifecycle';

const REPO = path.resolve(__dirname, '..', '..');
const read = (p: string) => readFileSync(path.join(REPO, p), 'utf8');

// Every learners_profiles.lifecycle_status code (types/learner-profile.ts LifecycleStatus).
const LIFECYCLE_CODES = new Set([
  'enquiry', 'enquiry_submitted', 'pending', 'approved', 'account', 'reserved', 'admitted',
  'rejected', 'waitlisted', 'active', 'inactive', 'exited', 'graduated', 'alumni',
]);

describe('admission checklist lifecycle stages (BUG-006182)', () => {
  it('offers only real lifecycle_status codes', () => {
    for (const { value } of ADMISSION_CHECKLIST_LIFECYCLE_OPTIONS) {
      expect(LIFECYCLE_CODES.has(value)).toBe(true);
    }
  });

  it('can reach a newly admitted candidate: account, reserved and admitted are offered and on by default', () => {
    const offered = ADMISSION_CHECKLIST_LIFECYCLE_OPTIONS.map((o) => o.value);
    for (const stage of ['account', 'reserved', 'admitted'] as const) {
      expect(offered).toContain(stage);
      expect(DEFAULT_ADMISSION_CHECKLIST_LIFECYCLE).toContain(stage);
    }
  });

  it('labels a retired code as itself, so an old checklist still shows what it holds', () => {
    expect(admissionChecklistLifecycleLabel('reserved')).toBe('Reserved');
    expect(admissionChecklistLifecycleLabel('lead')).toBe('lead');
  });

  it('the settings screen and the create API no longer carry the non-existent codes', () => {
    const screen = read('app/(routes)/admission/settings/checklists/_components/checklists-manager.tsx');
    const api = read('app/api/admission/settings/checklists/route.ts');
    for (const src of [screen, api]) {
      expect(src).not.toMatch(/'lead'|'enrolled'/);
    }
    expect(screen).toContain('ADMISSION_CHECKLIST_LIFECYCLE_OPTIONS');
    expect(api).toContain('DEFAULT_ADMISSION_CHECKLIST_LIFECYCLE');
  });
});
