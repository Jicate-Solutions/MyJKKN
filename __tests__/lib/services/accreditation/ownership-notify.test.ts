import { describe, it, expect } from 'vitest';
import {
  OWNERSHIP_URL,
  bodyOwnersAbove,
  describeSubject,
  idempotencyKeyFor,
  isBodyOwnerOverride,
  planOwnershipNotifications,
  type NotifyContext,
  type OwnerRow,
  type OwnershipEvent,
} from '@/lib/services/accreditation/ownership-notify';

// ---------------------------------------------------------------------------
// Fixtures. Shapes follow accreditation_metric_owners as probed live for the
// sibling digest (metric_code nullable; NULL = the whole body) and the trail
// table specified for accreditation_ownership_events.
// ---------------------------------------------------------------------------

const INST = '5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334';
const OTHER_INST = '29c221d1-b918-4c46-9d67-857273b0b553';

const RAJESH = 'aaaaaaaa-0000-4000-8000-000000000001'; // body owner / actor
const PRIYA = 'bbbbbbbb-0000-4000-8000-000000000002'; // new owner
const KUMAR = 'cccccccc-0000-4000-8000-000000000003'; // previous owner
const IQAC = 'dddddddd-0000-4000-8000-000000000004'; // IQAC officer
const ADMIN = 'eeeeeeee-0000-4000-8000-000000000005'; // a neutral actor

function event(over: Partial<OwnershipEvent> = {}): OwnershipEvent {
  return {
    id: 'evt-1',
    owner_row_id: 'own-1',
    institution_id: INST,
    body_code: 'NAAC',
    metric_code: '1.1.1',
    action: 'reassigned',
    from_user_id: KUMAR,
    to_user_id: PRIYA,
    actor_user_id: ADMIN,
    actor_is_body_owner: false,
    note: null,
    created_at: '2026-09-08T09:00:00Z',
    ...over,
  };
}

function owner(over: Partial<OwnerRow> & Pick<OwnerRow, 'id'>): OwnerRow {
  return {
    owner_user_id: RAJESH,
    institution_id: INST,
    body_code: 'NAAC',
    metric_code: null,
    ...over,
  };
}

const BODY_OWNER_ROW = owner({ id: 'own-body-naac', owner_user_id: RAJESH, metric_code: null });

function ctx(over: Partial<NotifyContext> = {}): NotifyContext {
  return {
    ownerRows: [BODY_OWNER_ROW],
    institutionNames: {
      [INST]: 'JKKN College of Engineering and Technology',
      [OTHER_INST]: 'JKKN Dental College',
    },
    personNames: {
      [RAJESH]: 'DR. RAJESH K.P',
      [PRIYA]: 'PRIYA S',
      [KUMAR]: 'KUMAR M',
      [IQAC]: 'IQAC OFFICER',
      [ADMIN]: 'EXECUTIVE ADMIN OFFICER',
    },
    iqacOfficerByInstitution: { [INST]: IQAC, [OTHER_INST]: IQAC },
    ...over,
  };
}

function byReason(plan: ReturnType<typeof planOwnershipNotifications>) {
  return Object.fromEntries(plan.map((p) => [p.reason, p]));
}

// ---------------------------------------------------------------------------
// The four parties
// ---------------------------------------------------------------------------

describe('planOwnershipNotifications — the four parties', () => {
  it('tells the person who just became the owner, by name and college', () => {
    const plan = planOwnershipNotifications([event()], ctx());
    const msg = plan.find((p) => p.userId === PRIYA);
    expect(msg).toBeDefined();
    expect(msg!.reason).toBe('new_owner');
    expect(msg!.title).toBe('You are now the owner of NAAC 1.1.1');
    expect(msg!.body).toContain(
      'EXECUTIVE ADMIN OFFICER has made you the owner of NAAC 1.1.1 at JKKN College of Engineering and Technology.',
    );
    expect(msg!.url).toBe(OWNERSHIP_URL);
  });

  it('tells the person who lost it that it moved and they can stop', () => {
    const plan = planOwnershipNotifications([event()], ctx());
    const msg = plan.find((p) => p.userId === KUMAR);
    expect(msg).toBeDefined();
    expect(msg!.reason).toBe('previous_owner');
    expect(msg!.body).toContain('has moved NAAC 1.1.1 at JKKN College of Engineering and Technology to PRIYA S.');
    expect(msg!.body).toContain('You no longer need to work on it.');
  });

  it('tells the body owner above that metric', () => {
    const plan = planOwnershipNotifications([event()], ctx());
    const msg = plan.find((p) => p.userId === RAJESH);
    expect(msg).toBeDefined();
    expect(msg!.reason).toBe('body_owner');
    expect(msg!.body).toContain('KUMAR M to PRIYA S');
    expect(msg!.body).toContain('You own NAAC at JKKN College of Engineering and Technology');
  });

  it('tells the IQAC officer for that college', () => {
    const plan = planOwnershipNotifications([event()], ctx());
    const msg = plan.find((p) => p.userId === IQAC);
    expect(msg).toBeDefined();
    expect(msg!.reason).toBe('iqac_officer');
    expect(msg!.title).toBe(
      'Ownership changed: NAAC 1.1.1 at JKKN College of Engineering and Technology',
    );
  });

  it('produces exactly the four, and no more', () => {
    const plan = planOwnershipNotifications([event()], ctx());
    expect(plan.map((p) => p.userId).sort()).toEqual([PRIYA, KUMAR, RAJESH, IQAC].sort());
  });
});

// ---------------------------------------------------------------------------
// Skip the actor
// ---------------------------------------------------------------------------

describe('planOwnershipNotifications — the actor is never told what they did', () => {
  it('does not tell a body owner about their own change', () => {
    const plan = planOwnershipNotifications([event({ actor_user_id: RAJESH })], ctx());
    expect(plan.some((p) => p.userId === RAJESH)).toBe(false);
    expect(plan.map((p) => p.userId).sort()).toEqual([PRIYA, KUMAR, IQAC].sort());
  });

  it('does not tell someone who handed their own metric on', () => {
    const plan = planOwnershipNotifications([event({ actor_user_id: KUMAR })], ctx());
    expect(plan.some((p) => p.userId === KUMAR)).toBe(false);
  });

  it('does not tell the IQAC officer when the IQAC officer made the change', () => {
    const plan = planOwnershipNotifications([event({ actor_user_id: IQAC })], ctx());
    expect(plan.some((p) => p.userId === IQAC)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// De-duplication
// ---------------------------------------------------------------------------

describe('planOwnershipNotifications — one person, one message', () => {
  it('gives a person filling two roles exactly one message, the closest one', () => {
    // Rajesh owns the whole body AND is the person receiving this metric.
    const plan = planOwnershipNotifications([event({ to_user_id: RAJESH })], ctx());
    const forRajesh = plan.filter((p) => p.userId === RAJESH);
    expect(forRajesh).toHaveLength(1);
    expect(forRajesh[0].reason).toBe('new_owner');
  });

  it('gives the IQAC officer one message when they are also the body owner', () => {
    const context = ctx({
      ownerRows: [owner({ id: 'own-body-naac', owner_user_id: IQAC, metric_code: null })],
    });
    const plan = planOwnershipNotifications([event()], context);
    const forIqac = plan.filter((p) => p.userId === IQAC);
    expect(forIqac).toHaveLength(1);
    expect(forIqac[0].reason).toBe('body_owner');
  });

  it('does not duplicate a body owner recorded on two rows', () => {
    const context = ctx({
      ownerRows: [
        owner({ id: 'own-body-1', owner_user_id: RAJESH, metric_code: null }),
        owner({ id: 'own-body-2', owner_user_id: RAJESH, metric_code: null }),
      ],
    });
    const plan = planOwnershipNotifications([event()], context);
    expect(plan.filter((p) => p.userId === RAJESH)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// The Director's condition on body-owner override
// ---------------------------------------------------------------------------

describe('a body-owner override always reaches the IQAC officer', () => {
  it('includes the IQAC officer and says why', () => {
    const plan = planOwnershipNotifications(
      [event({ actor_user_id: RAJESH, actor_is_body_owner: true })],
      ctx(),
    );
    const msg = plan.find((p) => p.userId === IQAC);
    expect(msg).toBeDefined();
    expect(msg!.reason).toBe('iqac_officer');
    expect(msg!.body).toContain('changed an assignment that belonged to someone else');
  });

  it('still reaches the IQAC officer when the override clears the owner entirely', () => {
    const plan = planOwnershipNotifications(
      [
        event({
          action: 'cleared',
          to_user_id: null,
          actor_user_id: RAJESH,
          actor_is_body_owner: true,
        }),
      ],
      ctx(),
    );
    expect(plan.find((p) => p.userId === IQAC)).toBeDefined();
  });

  it('does not add the override sentence when the body owner is rearranging their own work', () => {
    const plan = planOwnershipNotifications(
      [event({ from_user_id: RAJESH, actor_user_id: RAJESH, actor_is_body_owner: true })],
      ctx(),
    );
    const msg = plan.find((p) => p.userId === IQAC);
    expect(msg).toBeDefined();
    expect(msg!.body).not.toContain('belonged to someone else');
  });

  it('isBodyOwnerOverride is false when the actor is not a body owner', () => {
    expect(isBodyOwnerOverride(event({ actor_is_body_owner: false }))).toBe(false);
    expect(isBodyOwnerOverride(event({ actor_is_body_owner: null }))).toBe(false);
  });

  it('isBodyOwnerOverride is false when nobody was overridden', () => {
    expect(
      isBodyOwnerOverride(
        event({ action: 'assigned', from_user_id: null, actor_user_id: RAJESH, actor_is_body_owner: true }),
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Which events count, and which do not
// ---------------------------------------------------------------------------

describe('planOwnershipNotifications — which events are announced', () => {
  it('says nothing about a "seen" read receipt', () => {
    expect(planOwnershipNotifications([event({ action: 'seen' })], ctx())).toEqual([]);
  });

  it('announces assigned, reassigned, cleared and declined', () => {
    for (const action of ['assigned', 'reassigned', 'cleared', 'declined'] as const) {
      const plan = planOwnershipNotifications([event({ action })], ctx());
      expect(plan.length).toBeGreaterThan(0);
    }
  });

  it('tells a cleared owner that nobody holds it now', () => {
    const plan = planOwnershipNotifications([event({ action: 'cleared', to_user_id: null })], ctx());
    const msg = plan.find((p) => p.userId === KUMAR);
    expect(msg!.body).toContain('Nobody is recorded as the owner right now.');
    expect(plan.some((p) => p.reason === 'new_owner')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Body-level changes, missing context, idempotency
// ---------------------------------------------------------------------------

describe('planOwnershipNotifications — edges', () => {
  it('has no body owner above a body-level change; the IQAC officer is the escalation', () => {
    const plan = planOwnershipNotifications([event({ metric_code: null })], ctx());
    expect(plan.some((p) => p.reason === 'body_owner')).toBe(false);
    expect(plan.some((p) => p.reason === 'iqac_officer')).toBe(true);
    expect(plan.find((p) => p.userId === PRIYA)!.title).toBe(
      'You are now the owner of NAAC (the whole body)',
    );
  });

  it('does not treat a body owner at another college as being above this metric', () => {
    const context = ctx({
      ownerRows: [owner({ id: 'own-other', owner_user_id: RAJESH, institution_id: OTHER_INST })],
    });
    expect(bodyOwnersAbove(event(), context.ownerRows)).toEqual([]);
  });

  it('does not treat a metric-level owner as the body owner', () => {
    const context = ctx({
      ownerRows: [owner({ id: 'own-metric', owner_user_id: RAJESH, metric_code: '1.1.1' })],
    });
    expect(bodyOwnersAbove(event(), context.ownerRows)).toEqual([]);
  });

  it('still sends when the college has no IQAC officer recorded', () => {
    const plan = planOwnershipNotifications([event()], ctx({ iqacOfficerByInstitution: {} }));
    expect(plan.some((p) => p.reason === 'iqac_officer')).toBe(false);
    expect(plan.map((p) => p.userId).sort()).toEqual([PRIYA, KUMAR, RAJESH].sort());
  });

  it('falls back to plain wording when a name or college is unknown', () => {
    const plan = planOwnershipNotifications([event()], ctx({ personNames: {}, institutionNames: {} }));
    const msg = plan.find((p) => p.userId === PRIYA)!;
    expect(msg.body).toContain('Somebody has made you the owner of NAAC 1.1.1 at your college.');
  });

  it('keys idempotency on the event and the recipient', () => {
    const plan = planOwnershipNotifications([event()], ctx());
    for (const p of plan) {
      expect(p.idempotencyKey).toBe(idempotencyKeyFor('evt-1', p.userId));
    }
    expect(new Set(plan.map((p) => p.idempotencyKey)).size).toBe(plan.length);
  });

  it('produces a distinct key set per event, so two changes never collide', () => {
    const plan = planOwnershipNotifications([event({ id: 'evt-1' }), event({ id: 'evt-2' })], ctx());
    expect(new Set(plan.map((p) => p.idempotencyKey)).size).toBe(plan.length);
    expect(plan).toHaveLength(8);
  });

  it('names the subject the way the reader holds it', () => {
    expect(describeSubject('NAAC', '1.1.1')).toBe('NAAC 1.1.1');
    expect(describeSubject('NAAC', null)).toBe('NAAC (the whole body)');
    expect(describeSubject(null, null)).toBe('an awarding body (the whole body)');
  });

  it('writes no exclamation marks into anything a person reads', () => {
    const plan = planOwnershipNotifications(
      [
        event(),
        event({ id: 'e2', action: 'cleared', to_user_id: null }),
        event({ id: 'e3', metric_code: null }),
        event({ id: 'e4', actor_user_id: RAJESH, actor_is_body_owner: true }),
      ],
      ctx(),
    );
    for (const p of plan) {
      expect(p.title).not.toContain('!');
      expect(p.body).not.toContain('!');
    }
  });
});
