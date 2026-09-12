/**
 * CDC drive eligibility guard.
 *
 * Regression cover for the 2026-09-12 audit: every production drive had zero
 * eligibility rows, so opening one for willingness notified nobody and left every
 * learner marked "not eligible" — and nothing failed, because the notification
 * function treats an empty recipient list as "nobody to notify" and returns.
 * These tests pin the two halves of the fix: the readiness predicate, and the
 * transition refusing to open a drive that would reach no one.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isEligibilityReadyForWillingness,
  ELIGIBILITY_REQUIRED_MESSAGE,
} from '@/lib/services/cdc/eligibility-service';

describe('isEligibilityReadyForWillingness', () => {
  it('is false when the drive has no eligibility row at all', () => {
    expect(isEligibilityReadyForWillingness(null)).toBe(false);
    expect(isEligibilityReadyForWillingness(undefined)).toBe(false);
  });

  it('is false when a row exists but targets no program', () => {
    // The failure that matters: the notification INNER JOINs eligibility and
    // matches learners on program_id = ANY(program_ids). An empty array matches
    // nobody, which is the same silent dead-end as no row.
    expect(isEligibilityReadyForWillingness({ program_ids: [] })).toBe(false);
  });

  it('is false when program_ids is not an array', () => {
    expect(
      isEligibilityReadyForWillingness({ program_ids: null as unknown as string[] })
    ).toBe(false);
  });

  it('is true once at least one program is targeted', () => {
    expect(isEligibilityReadyForWillingness({ program_ids: ['prog-1'] })).toBe(true);
    expect(
      isEligibilityReadyForWillingness({ program_ids: ['prog-1', 'prog-2'] })
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The transition guard itself.
// ---------------------------------------------------------------------------

const getEligibility = vi.fn();

vi.mock('@/lib/services/cdc/eligibility-service', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/services/cdc/eligibility-service')
  >();
  return {
    ...actual,
    CdcEligibilityService: { getEligibility: (...a: unknown[]) => getEligibility(...a) },
  };
});

/**
 * Minimal Supabase stub: enough for transitionDrive's reads and writes.
 * `cdc_drives` select → the drive; `cdc_drive_types` select → no skip states;
 * update/insert → success.
 */
function makeSupabase(drive: Record<string, unknown>) {
  const updated = { ...drive, status: 'willingness_open' };
  return {
    from(table: string) {
      if (table === 'cdc_drives') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: drive, error: null }) }),
          }),
          update: () => ({
            eq: () => ({
              select: () => ({ single: async () => ({ data: updated, error: null }) }),
            }),
          }),
        };
      }
      if (table === 'cdc_drive_types') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { skip_states: null }, error: null }) }),
          }),
        };
      }
      if (table === 'cdc_drive_state_transitions') {
        return { insert: async () => ({ error: null }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as never;
}

describe('CdcDriveService.transitionDrive — willingness_open guard', () => {
  beforeEach(() => {
    getEligibility.mockReset();
  });

  it('refuses to open a drive that has no eligibility criteria', async () => {
    getEligibility.mockResolvedValue(null);
    const { CdcDriveService } = await import('@/lib/services/cdc/drive-service');

    await expect(
      CdcDriveService.transitionDrive(
        makeSupabase({ id: 'd1', status: 'announced', drive_type_id: 'dt1' }),
        'd1',
        { to_status: 'willingness_open' },
        'user-1'
      )
    ).rejects.toThrow(ELIGIBILITY_REQUIRED_MESSAGE);
  });

  it('refuses when criteria exist but target no program', async () => {
    getEligibility.mockResolvedValue({ program_ids: [] });
    const { CdcDriveService } = await import('@/lib/services/cdc/drive-service');

    await expect(
      CdcDriveService.transitionDrive(
        makeSupabase({ id: 'd1', status: 'announced', drive_type_id: 'dt1' }),
        'd1',
        { to_status: 'willingness_open' },
        'user-1'
      )
    ).rejects.toThrow(ELIGIBILITY_REQUIRED_MESSAGE);
  });

  it('allows the transition once criteria target a program', async () => {
    getEligibility.mockResolvedValue({ program_ids: ['prog-1'] });
    const { CdcDriveService } = await import('@/lib/services/cdc/drive-service');

    const result = await CdcDriveService.transitionDrive(
      makeSupabase({ id: 'd1', status: 'announced', drive_type_id: 'dt1' }),
      'd1',
      { to_status: 'willingness_open' },
      'user-1'
    );
    expect(result.status).toBe('willingness_open');
  });

  it('does not consult eligibility for unrelated transitions', async () => {
    const { CdcDriveService } = await import('@/lib/services/cdc/drive-service');

    await CdcDriveService.transitionDrive(
      makeSupabase({ id: 'd1', status: 'draft', drive_type_id: 'dt1' }),
      'd1',
      { to_status: 'announced' },
      'user-1'
    );
    expect(getEligibility).not.toHaveBeenCalled();
  });
});
