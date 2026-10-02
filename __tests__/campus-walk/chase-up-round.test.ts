// __tests__/campus-walk/chase-up-round.test.ts
// ============================================================================
// The chase-up reminders must fire again after a reporter's "Not fixed".
//
// Each rung's notification carries an idempotency key the database enforces
// with a unique index. Clearing metadata.campus_walk_chase.rungs_sent alone
// would let the sweep TRY again and then be silently swallowed by that index.
// The round suffix is what re-arms the ladder — and round 0 must keep the
// original key so reminders already sent in production still deduplicate.
// ============================================================================

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({}) }));
vi.mock('@/lib/services/meetings/meeting-trigger-service', () => ({ createBellNotification: vi.fn() }));
vi.mock('@/lib/services/director-desk/handover-chase-service', () => ({
  resolveDirectors: vi.fn(),
  validateTargeting: vi.fn(),
}));

import { chaseRungIdempotencyKey } from '@/lib/campus-walk/chase-up';

describe('chaseRungIdempotencyKey', () => {
  it('keeps the original key for a job that was never reopened', () => {
    expect(chaseRungIdempotencyKey('reminder_1', 'task-1', undefined)).toBe('campus-walk-chase:reminder_1:task-1');
    expect(chaseRungIdempotencyKey('reminder_1', 'task-1', 0)).toBe('campus-walk-chase:reminder_1:task-1');
  });

  it('gives every reopened round its own key, so each rung can fire once per round', () => {
    const r1 = chaseRungIdempotencyKey('escalate_director', 'task-1', 1);
    const r2 = chaseRungIdempotencyKey('escalate_director', 'task-1', 2);
    expect(r1).toBe('campus-walk-chase:escalate_director:task-1:r1');
    expect(r2).toBe('campus-walk-chase:escalate_director:task-1:r2');
    expect(r1).not.toBe(chaseRungIdempotencyKey('escalate_director', 'task-1', 0));
  });

  it('treats a junk round value as round 0', () => {
    expect(chaseRungIdempotencyKey('reminder_2', 't', 'abc')).toBe('campus-walk-chase:reminder_2:t');
    expect(chaseRungIdempotencyKey('reminder_2', 't', -3)).toBe('campus-walk-chase:reminder_2:t');
  });
});
