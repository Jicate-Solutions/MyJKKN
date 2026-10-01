/**
 * Moving a drive back one stage (2026-09-22).
 *
 * Pins: the one-step-back map, the coordinator's narrower window, and that
 * transitionDrive refuses a step back without a reason but otherwise accepts
 * a move the forward graph does not list.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  canCoordinatorRollback,
  canTransition,
  isRollback,
  previousDriveStatus,
  type CdcDriveStatus,
} from '@/types/cdc';

vi.mock('@/lib/services/cdc/eligibility-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/cdc/eligibility-service')>();
  return { ...actual, CdcEligibilityService: { getEligibility: async () => null } };
});

describe('previousDriveStatus / isRollback', () => {
  it('steps back exactly one stage along the main path', () => {
    const path: CdcDriveStatus[] = [
      'draft',
      'announced',
      'willingness_open',
      'eligibility_locked',
      'attendance_day',
      'results_announced',
      'closed',
    ];
    for (let i = 1; i < path.length; i++) {
      expect(previousDriveStatus(path[i])).toBe(path[i - 1]);
      expect(isRollback(path[i], path[i - 1])).toBe(true);
    }
    expect(previousDriveStatus('draft')).toBeNull();
    expect(previousDriveStatus('cancelled')).toBeNull();
  });

  it('never jumps more than one stage and never reverses a forward edge by accident', () => {
    expect(isRollback('results_announced', 'willingness_open')).toBe(false);
    expect(isRollback('closed', 'attendance_day')).toBe(false);
    expect(isRollback('cancelled', 'draft')).toBe(false);
    // the forward graph is untouched
    expect(canTransition('closed', 'results_announced')).toBe(false);
    expect(canTransition('attendance_day', 'eligibility_locked')).toBe(false);
  });
});

describe('canCoordinatorRollback', () => {
  it('allows only the two drive-day steps', () => {
    expect(canCoordinatorRollback('attendance_day', 'eligibility_locked')).toBe(true);
    expect(canCoordinatorRollback('results_announced', 'attendance_day')).toBe(true);
    expect(canCoordinatorRollback('closed', 'results_announced')).toBe(false);
    expect(canCoordinatorRollback('eligibility_locked', 'willingness_open')).toBe(false);
    expect(canCoordinatorRollback('willingness_open', 'announced')).toBe(false);
    // forward is never a coordinator's move
    expect(canCoordinatorRollback('attendance_day', 'results_announced')).toBe(false);
  });
});

function makeSupabase(drive: Record<string, unknown>, to: string) {
  const inserts: Record<string, unknown>[] = [];
  const client = {
    from(table: string) {
      if (table === 'cdc_drives') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: drive, error: null }) }) }),
          update: () => ({
            eq: () => ({ select: () => ({ single: async () => ({ data: { ...drive, status: to }, error: null }) }) }),
          }),
        };
      }
      if (table === 'cdc_drive_types') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { skip_states: null }, error: null }) }) }) };
      }
      if (table === 'cdc_drive_state_transitions') {
        return {
          insert: async (row: Record<string, unknown>) => {
            inserts.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { client: client as never, inserts };
}

describe('CdcDriveService.transitionDrive — moving back', () => {
  it('refuses a step back without a reason', async () => {
    const { CdcDriveService } = await import('@/lib/services/cdc/drive-service');
    const { client } = makeSupabase({ id: 'd1', status: 'attendance_day', drive_type_id: 'dt1' }, 'eligibility_locked');
    await expect(
      CdcDriveService.transitionDrive(client, 'd1', { to_status: 'eligibility_locked', reason: '  ' }, 'u1')
    ).rejects.toThrow(/reason is required/i);
  });

  it('accepts a step back with a reason and flags the audit row', async () => {
    const { CdcDriveService } = await import('@/lib/services/cdc/drive-service');
    const { client, inserts } = makeSupabase({ id: 'd1', status: 'closed', drive_type_id: 'dt1' }, 'results_announced');
    const out = await CdcDriveService.transitionDrive(
      client,
      'd1',
      { to_status: 'results_announced', reason: 'Offer letter for one learner was wrong' },
      'u1'
    );
    expect(out.status).toBe('results_announced');
    expect(inserts[0]).toMatchObject({
      from_status: 'closed',
      to_status: 'results_announced',
      reason: 'Offer letter for one learner was wrong',
      metadata: { rollback: true },
    });
  });

  it('still refuses moves that are neither forward nor one step back', async () => {
    const { CdcDriveService } = await import('@/lib/services/cdc/drive-service');
    const { client } = makeSupabase({ id: 'd1', status: 'closed', drive_type_id: 'dt1' }, 'draft');
    await expect(
      CdcDriveService.transitionDrive(client, 'd1', { to_status: 'draft', reason: 'x' }, 'u1')
    ).rejects.toThrow(/Invalid transition/);
  });
});
