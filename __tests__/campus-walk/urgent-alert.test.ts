// __tests__/campus-walk/urgent-alert.test.ts
// ============================================================================
// D6, the urgent lane. The behaviour under test is not "does it call WhatsApp"
// — it is the thing D6 exists to guarantee: an unsafe condition either reaches
// a phone, or the failure to reach one is impossible to miss.
//
// So the failure paths get more coverage here than the happy path. Silence is
// the defect this lane was written to prevent.
//
// Director ruling, 2026-09-04 ("always copy me, and re-alert on repeats") adds
// two more things that must not be allowed to go quiet: the Director is on
// EVERY unsafe alert, and a recurrence pages a phone again instead of reopening
// a ticket nobody hears about. The tests below pin both, plus the two ways they
// could be got wrong — paging one person twice, and letting a normal
// always-copy read as the routing hole that `usedFallback` is there to report.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendTextMessage = vi.fn();
const isWhatsAppConfigured = vi.fn(() => true);
const resolveDirectors = vi.fn();
const validateTargeting = vi.fn();
const createBellNotification = vi.fn();
const routeAccountable = vi.fn();
const mapStaffToProfilesLocal = vi.fn();

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

// The reopen path re-runs the SAME routing a fresh report gets; that function
// is campus-walk-service's and has its own coverage, so it is stubbed here to
// keep these tests about the alert rather than about routing.
vi.mock('@/lib/services/campus-walk/campus-walk-service', () => ({
  routeAccountable: (...args: unknown[]) => routeAccountable(...args),
  mapStaffToProfilesLocal: (...args: unknown[]) => mapStaffToProfilesLocal(...args),
}));

import {
  normaliseWhatsAppNumber,
  buildUrgentAlertText,
  resolveUrgentAlertTargets,
  resolveUrgentAlertRecipients,
  sendUrgentConditionAlert,
  undeliveredAlarmIdempotencyKey,
} from '@/lib/campus-walk/urgent-alert';
import { reopenAsRepeat } from '@/lib/campus-walk/repeats';

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

/**
 * Stand-in for the tables lib/campus-walk/repeats.ts touches on a reopen, plus
 * the `profiles` lookup the alert makes underneath it. `taskUpdates` records
 * every project_tasks update so a test can assert what was persisted, and how
 * many times.
 */
function fakeRepeatDb(opts: {
  task: Record<string, any>;
  profiles?: Array<{ id: string; phone_number: string | null }>;
  currentAccountableStaffId?: string | null;
}) {
  const taskUpdates: Array<Record<string, any>> = [];
  return {
    taskUpdates,
    from(table: string) {
      if (table === 'profiles') {
        return {
          select: () => ({
            in: (_col: string, ids: string[]) =>
              Promise.resolve({
                data: (opts.profiles ?? []).filter((r) => ids.includes(r.id)),
                error: null,
              }),
          }),
        };
      }
      if (table === 'project_tasks') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: opts.task, error: null }) }),
          }),
          update: (patch: Record<string, any>) => {
            taskUpdates.push(patch);
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      }
      if (table === 'project_task_assignees') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: opts.currentAccountableStaffId
                      ? { staff_id: opts.currentAccountableStaffId }
                      : null,
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as any;
}

/**
 * A closed, unsafe campus-walk ticket sitting on its 8th occurrence, so the
 * next reopen is the 9th — the Director's own example of the danger this
 * ruling exists for. `metadata` overrides MERGE into the defaults rather than
 * replacing them, so a test can flip one field without silently dropping
 * `source: 'campus-walk'` and tripping the wrong-lane guard.
 */
function closedUnsafeTask(overrides: Record<string, any> = {}) {
  const { metadata: metadataOverrides, ...rest } = overrides;
  return {
    id: 'task-1',
    project_id: 'proj-1',
    title: 'Exposed wire, Block C stairwell',
    status_key: 'done',
    owner_staff_id: 'staff-row-a',
    ...rest,
    metadata: {
      source: 'campus-walk',
      kind: 'symptom',
      unsafe: true,
      category: 'Electrical',
      occurrence_count: 8,
      geo: { lat: 11.4102, lng: 77.695 },
      ...(metadataOverrides ?? {}),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  routeAccountable.mockResolvedValue({
    accountableProfileId: 'staff-a',
    accountableStaffId: 'staff-row-a',
    routedToEaoNoOwner: false,
    onApprovedLeave: false,
    leaveOriginalProfileId: null,
    leaveOriginalStaffId: null,
    dueDate: '2026-09-04',
  });
  mapStaffToProfilesLocal.mockResolvedValue(new Map([['staff-row-a', 'staff-a']]));
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
    // This function resolves the PRIMARY recipient only. The 2026-09-04
    // always-copy ruling lives one layer up, in
    // resolveUrgentAlertRecipients — keeping it out of here is what lets
    // `usedFallback` go on meaning "the owner was unreachable".
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

// ============================================================================
// Director ruling, 2026-09-04 — "always copy me, and re-alert on repeats".
// ============================================================================

describe('resolveUrgentAlertRecipients — the Director is always copied', () => {
  it('adds the Director alongside a reachable Accountable', async () => {
    const db = fakeDb([
      { id: 'staff-a', phone_number: '9894116664' },
      { id: 'director-1', phone_number: '9000000001' },
    ]);
    const res = await resolveUrgentAlertRecipients(db, 'staff-a');

    expect(res.targets).toEqual([
      { profileId: 'staff-a', phone: '919894116664', role: 'accountable' },
      { profileId: 'director-1', phone: '919000000001', role: 'director_copy' },
    ]);
    // The owner WAS reachable. The routing table has no hole, so the flag that
    // reports one must stay down even though a Director is on the message.
    expect(res.usedFallback).toBe(false);
    expect(res.directorCopied).toBe(true);
    expect(res.directorCopyReason).toBeNull();
  });

  it('pages the Director once, not twice, when they are the Accountable', async () => {
    resolveDirectors.mockResolvedValue({ ids: ['staff-a'], source: 'director' });
    const db = fakeDb([{ id: 'staff-a', phone_number: '9894116664' }]);
    const res = await resolveUrgentAlertRecipients(db, 'staff-a');

    expect(res.targets).toEqual([
      { profileId: 'staff-a', phone: '919894116664', role: 'accountable' },
    ]);
    expect(res.directorCopied).toBe(false);
    // Already on the message as the owner — that is a correct outcome, not a
    // copy that went missing, so nothing is reported as wrong.
    expect(res.directorCopyReason).toBeNull();
  });

  it('does not copy a Director who is already the fallback recipient', async () => {
    const db = fakeDb([
      { id: 'staff-a', phone_number: null },
      { id: 'director-1', phone_number: '9000000001' },
    ]);
    const res = await resolveUrgentAlertRecipients(db, 'staff-a');

    expect(res.targets).toEqual([
      { profileId: 'director-1', phone: '919000000001', role: 'director_fallback' },
    ]);
    // The two situations stay distinguishable: this one means the owner could
    // not be paged. `director_fallback` keeps the meaning it had before the
    // ruling, and the always-copy case has its own role value.
    expect(res.usedFallback).toBe(true);
    expect(res.directorCopied).toBe(false);
  });

  it('still pages the Accountable when the Director copy cannot be resolved', async () => {
    resolveDirectors.mockRejectedValue(new Error('director lookup down'));
    const db = fakeDb([{ id: 'staff-a', phone_number: '9894116664' }]);
    const res = await resolveUrgentAlertRecipients(db, 'staff-a');

    expect(res.targets).toHaveLength(1);
    expect(res.targets[0].role).toBe('accountable');
    expect(res.directorCopied).toBe(false);
    // Recorded, not swallowed: "always copy me" quietly not happening is
    // exactly the kind of silence this lane exists to prevent.
    expect(res.directorCopyReason).toContain('director lookup down');
  });

  it('records a reason when no Director has a usable number', async () => {
    const db = fakeDb([
      { id: 'staff-a', phone_number: '9894116664' },
      { id: 'director-1', phone_number: 'n/a' },
    ]);
    const res = await resolveUrgentAlertRecipients(db, 'staff-a');

    expect(res.targets).toHaveLength(1);
    expect(res.directorCopied).toBe(false);
    expect(res.directorCopyReason).toContain('no Director has a usable phone number');
  });
});

describe('sendUrgentConditionAlert — always-copy, end to end', () => {
  const base = {
    taskId: 'task-1',
    title: 'Exposed wire, Block C stairwell',
    dueDate: '2026-09-03',
  };

  it('sends to both the owner and the Director, one message each', async () => {
    const db = fakeDb([
      { id: 'staff-a', phone_number: '9894116664' },
      { id: 'director-1', phone_number: '9000000001' },
    ]);
    const out = await sendUrgentConditionAlert(db, { ...base, accountableProfileId: 'staff-a' });

    expect(sendTextMessage).toHaveBeenCalledTimes(2);
    expect(sendTextMessage.mock.calls.map((c) => c[0])).toEqual(['919894116664', '919000000001']);
    expect(out.delivered).toBe(2);
    expect(out.usedFallback).toBe(false);
    expect(out.directorCopied).toBe(true);
    expect(out.failureReason).toBeNull();
    // The persisted record keeps the two Director situations apart.
    expect(out.attempts.map((a) => a.role)).toEqual(['accountable', 'director_copy']);
  });

  it('a delivered copy does not mask an owner whose send failed', async () => {
    sendTextMessage.mockImplementation((to: string) =>
      to === '919894116664' ? Promise.reject(new Error('phone off')) : Promise.resolve({})
    );
    const db = fakeDb([
      { id: 'staff-a', phone_number: '9894116664' },
      { id: 'director-1', phone_number: '9000000001' },
    ]);
    const out = await sendUrgentConditionAlert(db, { ...base, accountableProfileId: 'staff-a' });

    expect(out.delivered).toBe(1);
    expect(out.attempts.find((a) => a.role === 'accountable')?.ok).toBe(false);
    expect(out.attempts.find((a) => a.role === 'director_copy')?.ok).toBe(true);
    // A phone DID ring, so this is not the "nobody was paged" case and the
    // alarm stays down — pinned deliberately, because it is the one place the
    // always-copy ruling costs something: the person who must ACT was not
    // reached, and only the attempts array above says so. Raising NOBODY WAS
    // PAGED here would be false; raising a new alarm is a recipient decision
    // and therefore the Director's, not this module's.
    expect(out.failureReason).toBeNull();
    expect(createBellNotification).not.toHaveBeenCalled();
  });
});

describe('re-alerting on a recurrence', () => {
  it('says which time it is, from the second occurrence onward', () => {
    const first = buildUrgentAlertText({ title: 'Exposed wire', dueDate: '2026-09-04' });
    expect(first).not.toContain('Reported again');

    const ninth = buildUrgentAlertText({
      title: 'Exposed wire',
      dueDate: '2026-09-04',
      occurrenceNumber: 9,
    });
    expect(ninth.split('\n')[0]).toBe('UNSAFE — Exposed wire');
    expect(ninth.split('\n')[1]).toBe('Reported again — 9th time.');

    expect(
      buildUrgentAlertText({ title: 'x', dueDate: null, occurrenceNumber: 2 })
    ).toContain('2nd time');
    expect(
      buildUrgentAlertText({ title: 'x', dueDate: null, occurrenceNumber: 11 })
    ).toContain('11th time');
  });

  it('keeps the original filing on the exact idempotency key it always had', () => {
    // Alarms already persisted must still suppress a retry of the POST that
    // created them, so occurrence 1 (and an absent occurrence) is unchanged.
    expect(undeliveredAlarmIdempotencyKey('task-1')).toBe(
      'campus-walk-unsafe-alert-undelivered:task-1'
    );
    expect(undeliveredAlarmIdempotencyKey('task-1', 1)).toBe(
      'campus-walk-unsafe-alert-undelivered:task-1'
    );
  });

  it('scopes later occurrences so an old alarm cannot silence a new one', () => {
    expect(undeliveredAlarmIdempotencyKey('task-1', 9)).toBe(
      'campus-walk-unsafe-alert-undelivered:task-1:occurrence-9'
    );
    // Same event, retried -> same key -> the DB index collapses it to one row.
    expect(undeliveredAlarmIdempotencyKey('task-1', 9)).toBe(
      undeliveredAlarmIdempotencyKey('task-1', 9)
    );
    // Different reopen -> different key -> not suppressed.
    expect(undeliveredAlarmIdempotencyKey('task-1', 9)).not.toBe(
      undeliveredAlarmIdempotencyKey('task-1', 10)
    );
  });

  it('raises the ninth alarm under the ninth key when nobody was reached', async () => {
    const db = fakeDb([
      { id: 'staff-a', phone_number: null },
      { id: 'director-1', phone_number: null },
    ]);
    await sendUrgentConditionAlert(db, {
      taskId: 'task-1',
      title: 'Exposed wire',
      dueDate: '2026-09-04',
      accountableProfileId: 'staff-a',
      occurrenceNumber: 9,
    });

    expect(createBellNotification).toHaveBeenCalledTimes(1);
    const alarm = createBellNotification.mock.calls[0][1] as any;
    expect(alarm.idempotencyKey).toBe('campus-walk-unsafe-alert-undelivered:task-1:occurrence-9');
    expect(alarm.metadata.occurrence_number).toBe(9);
  });
});

describe('reopenAsRepeat — a recurrence pages a phone again', () => {
  it('fires the alert, naming the occurrence, and records the outcome', async () => {
    const db = fakeRepeatDb({
      task: closedUnsafeTask(),
      currentAccountableStaffId: 'staff-row-a',
      profiles: [
        { id: 'staff-a', phone_number: '9894116664' },
        { id: 'director-1', phone_number: '9000000001' },
      ],
    });

    const result: any = await reopenAsRepeat(db, {
      taskId: 'task-1',
      reopenedByProfileId: 'director-1',
    });

    expect(result.ok).toBe(true);
    expect(result.occurrenceCount).toBe(9);

    // The phone rang — this is the whole point of the ruling.
    expect(sendTextMessage).toHaveBeenCalled();
    const text = sendTextMessage.mock.calls[0][1] as string;
    expect(text).toContain('UNSAFE');
    expect(text).toContain('Reported again — 9th time.');
    // D10 attribution survives a recurrence: a condition, never a person.
    expect(text).toContain('Management walk');

    expect(result.urgentAlert.delivered).toBe(2);
    expect(result.urgentAlert.directorCopied).toBe(true);

    // Durable, not just returned: the outcome is on the task.
    const alertWrite = db.taskUpdates.find((u: any) => u.metadata?.urgent_alert);
    expect(alertWrite).toBeTruthy();
    expect(alertWrite.metadata.urgent_alert.delivered).toBe(2);
    // The reopen's own bookkeeping is not clobbered by that follow-up write.
    expect(alertWrite.metadata.occurrence_count).toBe(9);
    expect(alertWrite.metadata.occurrences).toHaveLength(1);
  });

  it('fires ONE alert for one reopen — one message per person, not per retry', async () => {
    const db = fakeRepeatDb({
      task: closedUnsafeTask(),
      currentAccountableStaffId: 'staff-row-a',
      profiles: [
        { id: 'staff-a', phone_number: '9894116664' },
        { id: 'director-1', phone_number: '9000000001' },
      ],
    });

    await reopenAsRepeat(db, { taskId: 'task-1', reopenedByProfileId: 'director-1' });

    // Two recipients, two messages. Not four, and not one per recipient per
    // guarded step inside the reopen.
    expect(sendTextMessage).toHaveBeenCalledTimes(2);
    const dialled = sendTextMessage.mock.calls.map((c) => c[0]);
    expect(new Set(dialled).size).toBe(dialled.length);
    // Nothing failed, so no "nobody was paged" alarm was raised either.
    expect(createBellNotification).not.toHaveBeenCalled();
  });

  it('does not page anyone when the recurrence is not unsafe', async () => {
    const db = fakeRepeatDb({
      task: closedUnsafeTask({ metadata: { unsafe: false } }),
      currentAccountableStaffId: 'staff-row-a',
      profiles: [{ id: 'staff-a', phone_number: '9894116664' }],
    });

    const result: any = await reopenAsRepeat(db, {
      taskId: 'task-1',
      reopenedByProfileId: 'director-1',
    });

    expect(result.ok).toBe(true);
    expect(sendTextMessage).not.toHaveBeenCalled();
    expect(result.urgentAlert).toBeUndefined();
    // Only the reopen itself was written — no alert-outcome follow-up.
    expect(db.taskUpdates).toHaveLength(1);
  });

  it('reopens even when the alert reaches nobody, and says so', async () => {
    const db = fakeRepeatDb({
      task: closedUnsafeTask(),
      currentAccountableStaffId: 'staff-row-a',
      profiles: [],
    });

    const result: any = await reopenAsRepeat(db, {
      taskId: 'task-1',
      reopenedByProfileId: 'director-1',
    });

    // The reopen is not rolled back by a failed page — but the failure is
    // returned, alarmed and persisted rather than swallowed.
    expect(result.ok).toBe(true);
    expect(result.occurrenceCount).toBe(9);
    expect(result.urgentAlert.delivered).toBe(0);
    expect(result.urgentAlert.failureReason).toBeTruthy();
    expect(createBellNotification).toHaveBeenCalledTimes(1);
    const alarm = createBellNotification.mock.calls[0][1] as any;
    expect(alarm.idempotencyKey).toBe('campus-walk-unsafe-alert-undelivered:task-1:occurrence-9');
  });
});
