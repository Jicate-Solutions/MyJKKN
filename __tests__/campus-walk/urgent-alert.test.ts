// __tests__/campus-walk/urgent-alert.test.ts
// ============================================================================
// D6, the urgent lane. The behaviour under test is not "does it call WhatsApp"
// — it is the thing D6 exists to guarantee: an unsafe condition either reaches
// a phone, or the failure to reach one is impossible to miss.
//
// So the failure paths get more coverage here than the happy path. Silence is
// the defect this lane was written to prevent.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendTextMessage = vi.fn();
const isWhatsAppConfigured = vi.fn(() => true);
const resolveDirectors = vi.fn();
const validateTargeting = vi.fn();
const createBellNotification = vi.fn();

vi.mock('@/lib/services/whatsapp/whatsapp-api-client', () => ({
  sendTextMessage: (...args: unknown[]) => sendTextMessage(...args),
  isWhatsAppConfigured: () => isWhatsAppConfigured(),
}));

vi.mock('@/lib/services/director-desk/handover-chase-service', () => ({
  resolveDirectors: (...args: unknown[]) => resolveDirectors(...args),
  validateTargeting: (...args: unknown[]) => validateTargeting(...args),
}));

vi.mock('@/lib/services/meetings/meeting-trigger-service', () => ({
  createBellNotification: (...args: unknown[]) => createBellNotification(...args),
}));

import {
  normaliseWhatsAppNumber,
  buildUrgentAlertText,
  resolveUrgentAlertTargets,
  sendUrgentConditionAlert,
} from '@/lib/campus-walk/urgent-alert';

/**
 * Minimal stand-in for the one query shape this module makes:
 *   from('profiles').select('id, phone_number').in('id', ids)
 * `rows` is the whole profiles table for the test; the stub filters it the way
 * PostgREST would.
 */
function fakeDb(rows: Array<{ id: string; phone_number: string | null }>, opts?: { error?: string }) {
  return {
    from: () => ({
      select: () => ({
        in: (_col: string, ids: string[]) =>
          Promise.resolve(
            opts?.error
              ? { data: null, error: { message: opts.error } }
              : { data: rows.filter((r) => ids.includes(r.id)), error: null }
          ),
      }),
    }),
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  isWhatsAppConfigured.mockReturnValue(true);
  sendTextMessage.mockResolvedValue({ messages: [{ id: 'wamid.test' }] });
  resolveDirectors.mockResolvedValue({ ids: ['director-1'], source: 'director' });
  validateTargeting.mockImplementation((ids: unknown) =>
    Array.isArray(ids) && ids.length > 0
      ? { ok: true, userIds: ids }
      : { ok: false, userIds: [], reason: 'empty recipient list' }
  );
  createBellNotification.mockResolvedValue({ id: 'notif-1' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('normaliseWhatsAppNumber', () => {
  it('adds the country code to a bare 10-digit local number', () => {
    expect(normaliseWhatsAppNumber('9894116664')).toBe('919894116664');
  });

  it('accepts the shapes an operator actually types', () => {
    expect(normaliseWhatsAppNumber('+91 98941 16664')).toBe('919894116664');
    expect(normaliseWhatsAppNumber('091-9894116664')).toBe('919894116664');
    expect(normaliseWhatsAppNumber('  919894116664  ')).toBe('919894116664');
  });

  it('passes an already-international number through untouched', () => {
    expect(normaliseWhatsAppNumber('+1 415 555 0132')).toBe('14155550132');
  });

  it('refuses anything it cannot turn into a real number, rather than guessing', () => {
    // A wrong number is worse than a recorded failure: the failure gets
    // escalated, a wrong number looks delivered.
    expect(normaliseWhatsAppNumber(null)).toBeNull();
    expect(normaliseWhatsAppNumber('')).toBeNull();
    expect(normaliseWhatsAppNumber('n/a')).toBeNull();
    expect(normaliseWhatsAppNumber('12345')).toBeNull();
    expect(normaliseWhatsAppNumber('9999999999999999999')).toBeNull();
    expect(normaliseWhatsAppNumber('0000')).toBeNull();
  });
});

describe('buildUrgentAlertText', () => {
  it('leads with UNSAFE and the condition, so it reads on a lock screen', () => {
    const text = buildUrgentAlertText({ title: 'Exposed wire, Block C stairwell', dueDate: '2026-09-03' });
    expect(text.split('\n')[0]).toBe('UNSAFE — Exposed wire, Block C stairwell');
    expect(text).toContain('today');
    expect(text).toContain('2026-09-03');
  });

  it('includes where and what type only when they were captured', () => {
    const bare = buildUrgentAlertText({ title: 'Broken stair', dueDate: null });
    expect(bare).not.toContain('Where:');
    expect(bare).not.toContain('Type:');

    const full = buildUrgentAlertText({
      title: 'Broken stair',
      dueDate: '2026-09-03',
      category: 'Structural',
      locationHint: '11.4102, 77.6950',
    });
    expect(full).toContain('Where: 11.4102, 77.6950');
    expect(full).toContain('Type: Structural');
  });

  it('keeps D10 attribution — a condition, never a person', () => {
    const text = buildUrgentAlertText({ title: 'Gas smell near the kitchen', dueDate: '2026-09-03' });
    expect(text).toContain('Management walk');
  });
});

describe('resolveUrgentAlertTargets', () => {
  it('pages the accountable owner when they have a number', async () => {
    const db = fakeDb([{ id: 'staff-a', phone_number: '9894116664' }]);
    const res = await resolveUrgentAlertTargets(db, 'staff-a');
    expect(res.usedFallback).toBe(false);
    expect(res.targets).toEqual([
      { profileId: 'staff-a', phone: '919894116664', role: 'accountable' },
    ]);
    // The Director is a fallback, not a standing copy-to.
    expect(resolveDirectors).not.toHaveBeenCalled();
  });

  it('falls back to the Director when the owner has no usable number', async () => {
    const db = fakeDb([
      { id: 'staff-a', phone_number: null },
      { id: 'director-1', phone_number: '9000000001' },
    ]);
    const res = await resolveUrgentAlertTargets(db, 'staff-a');
    expect(res.usedFallback).toBe(true);
    expect(res.targets).toEqual([
      { profileId: 'director-1', phone: '919000000001', role: 'director_fallback' },
    ]);
    expect(res.reason).toBeNull();
  });

  it('falls back to the Director when no owner was resolved at all', async () => {
    const db = fakeDb([{ id: 'director-1', phone_number: '9000000001' }]);
    const res = await resolveUrgentAlertTargets(db, null);
    expect(res.usedFallback).toBe(true);
    expect(res.targets[0].role).toBe('director_fallback');
  });

  it('reports a reason, never an empty success, when nobody is reachable', async () => {
    const db = fakeDb([
      { id: 'staff-a', phone_number: null },
      { id: 'director-1', phone_number: null },
    ]);
    const res = await resolveUrgentAlertTargets(db, 'staff-a');
    expect(res.targets).toHaveLength(0);
    expect(res.reason).toContain('no Director has a usable phone number');
  });

  it('reports a reason when the Director cannot be targeted', async () => {
    resolveDirectors.mockResolvedValue({ ids: [], source: 'none' });
    const db = fakeDb([{ id: 'staff-a', phone_number: null }]);
    const res = await resolveUrgentAlertTargets(db, 'staff-a');
    expect(res.targets).toHaveLength(0);
    expect(res.reason).toContain('empty recipient list');
  });
});

describe('sendUrgentConditionAlert', () => {
  const base = {
    taskId: 'task-1',
    title: 'Exposed wire, Block C stairwell',
    dueDate: '2026-09-03',
  };

  it('sends to the accountable owner and reports delivery', async () => {
    const db = fakeDb([{ id: 'staff-a', phone_number: '9894116664' }]);
    const out = await sendUrgentConditionAlert(db, { ...base, accountableProfileId: 'staff-a' });

    expect(sendTextMessage).toHaveBeenCalledTimes(1);
    expect(sendTextMessage.mock.calls[0][0]).toBe('919894116664');
    expect(sendTextMessage.mock.calls[0][1]).toContain('UNSAFE');
    expect(out.delivered).toBe(1);
    expect(out.failureReason).toBeNull();
    expect(out.usedFallback).toBe(false);
    // Nothing went wrong, so nothing is escalated.
    expect(createBellNotification).not.toHaveBeenCalled();
  });

  it('raises a Director alarm when nobody could be reached', async () => {
    const db = fakeDb([
      { id: 'staff-a', phone_number: null },
      { id: 'director-1', phone_number: null },
    ]);
    const out = await sendUrgentConditionAlert(db, { ...base, accountableProfileId: 'staff-a' });

    expect(sendTextMessage).not.toHaveBeenCalled();
    expect(out.delivered).toBe(0);
    expect(out.failureReason).toBeTruthy();
    expect(createBellNotification).toHaveBeenCalledTimes(1);
    const alarm = createBellNotification.mock.calls[0][1] as any;
    expect(alarm.title).toContain('NOBODY WAS PAGED');
    expect(alarm.category).toBe('campus-walk:unsafe-alert-undelivered');
    // Keyed on the task alone, so a retried intake POST cannot double-alarm.
    expect(alarm.idempotencyKey).toBe('campus-walk-unsafe-alert-undelivered:task-1');
  });

  it('records a failure rather than sending when WhatsApp is not configured', async () => {
    isWhatsAppConfigured.mockReturnValue(false);
    const db = fakeDb([{ id: 'staff-a', phone_number: '9894116664' }]);
    const out = await sendUrgentConditionAlert(db, { ...base, accountableProfileId: 'staff-a' });

    expect(sendTextMessage).not.toHaveBeenCalled();
    expect(out.delivered).toBe(0);
    expect(out.failureReason).toContain('not configured');
    expect(createBellNotification).toHaveBeenCalledTimes(1);
  });

  it('treats a send that throws as undelivered, and escalates it', async () => {
    sendTextMessage.mockRejectedValue(new Error('429 rate limited'));
    const db = fakeDb([{ id: 'staff-a', phone_number: '9894116664' }]);
    const out = await sendUrgentConditionAlert(db, { ...base, accountableProfileId: 'staff-a' });

    expect(out.delivered).toBe(0);
    expect(out.attempts[0].ok).toBe(false);
    expect(out.attempts[0].error).toContain('429');
    expect(out.failureReason).toBe('every phone alert attempt failed to send');
    expect(createBellNotification).toHaveBeenCalledTimes(1);
  });

  it('never throws, whatever the database does', async () => {
    // A thrown error here would propagate into createWalkTask and lose an
    // already-created task; the whole module is built so it cannot.
    const exploding = {
      from: () => {
        throw new Error('connection reset');
      },
    } as any;
    const out = await sendUrgentConditionAlert(exploding, { ...base, accountableProfileId: 'staff-a' });
    expect(out.delivered).toBe(0);
    expect(out.failureReason).toBeTruthy();
  });

  it('does not leak the phone number into logs on a send failure', async () => {
    sendTextMessage.mockRejectedValue(new Error('boom'));
    const db = fakeDb([{ id: 'staff-a', phone_number: '9894116664' }]);
    await sendUrgentConditionAlert(db, { ...base, accountableProfileId: 'staff-a' });

    const logged = (console.error as any).mock.calls.flat().join(' ');
    expect(logged).not.toContain('919894116664');
    expect(logged).toContain('staff-a');
  });
});
