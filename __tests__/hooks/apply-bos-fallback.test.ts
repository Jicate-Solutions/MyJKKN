import { describe, it, expect } from 'vitest';
import { applyBOSFallback } from '@/lib/services/bos/bos-role-permissions';

// BUG-003340 — HOD at JKKN CAS (Self) could not see the BOS section in the sidebar.
// Root cause: applyBOSFallback seeded granular academic.bos-*.view keys but never set
// the parent 'bos.view' key required by MENU_PERMISSIONS['/bos'].

describe('applyBOSFallback — bos.view parent gate', () => {
  it('adds bos.view when seeding BOS permissions from defaults (no DB keys)', () => {
    const perms: Record<string, boolean> = {};
    applyBOSFallback(perms, ['hod']);

    expect(perms['academic.bos-experts.view']).toBe(true);
    expect(perms['bos.view']).toBe(true);
  });

  it('adds bos.view when DB already has academic.bos-* keys but bos.view is missing', () => {
    // Simulates a role whose DB JSONB was seeded with granular keys but predates bos.view.
    const perms: Record<string, boolean> = {
      'academic.bos-experts.view': true,
      'academic.bos-syllabus.view': true,
    };
    applyBOSFallback(perms, ['hod']);

    expect(perms['bos.view']).toBe(true);
  });

  it('does not set bos.view when there are no role keys (unrecognized/anonymous role)', () => {
    const perms: Record<string, boolean> = { 'billing.view': true };
    applyBOSFallback(perms, []);

    expect(perms['bos.view']).toBeUndefined();
  });

  it('does not overwrite an existing bos.view value', () => {
    const perms: Record<string, boolean> = {
      'academic.bos-experts.view': true,
      'bos.view': false,
    };
    applyBOSFallback(perms, ['hod']);

    // Already explicitly set to false — do not overwrite.
    expect(perms['bos.view']).toBe(false);
  });
});
