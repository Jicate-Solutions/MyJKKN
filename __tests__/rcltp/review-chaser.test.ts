import { describe, it, expect } from 'vitest';
import {
  CHASE_ESCALATE_AFTER_DAYS,
  CHASE_REMIND_AFTER_DAYS,
  QUESTION_APPROVE_PERMISSIONS,
  REMEDIAL_PLAN_APPROVE_PERMISSIONS,
  ageInDays,
  buildChaseNotice,
  dueStage,
  findPendingQuestionSets,
  findPendingRemedialPlans,
  resolveApprovers,
  resolveEscalationRecipients,
  type ChaseItem,
} from '@/lib/services/rcltp/review-chaser';

// ---------------------------------------------------------------------------
// Same minimal chainable PostgREST fake as __tests__/rcltp/notify-targets.test.ts,
// plus `is()` (used for the reviewed_at / approved_at null filters). Every
// builder method returns `this`; awaiting yields { data, error }.
// ---------------------------------------------------------------------------
type Filters = Record<string, unknown>;
type Handler = (filters: Filters) => { data: unknown; error: { message: string } | null };

function makeAdmin(handlers: Record<string, Handler>) {
  const calls: Array<{ table: string; filters: Filters }> = [];

  function builder(table: string) {
    const filters: Filters = {};
    const self: any = {
      select: () => self,
      order: () => self,
      limit: () => self,
      eq: (col: string, val: unknown) => {
        filters[`eq:${col}`] = val;
        return self;
      },
      neq: () => self,
      not: () => self,
      is: (col: string, val: unknown) => {
        filters[`is:${col}`] = val;
        return self;
      },
      in: (col: string, vals: unknown[]) => {
        filters[`in:${col}`] = vals;
        return self;
      },
      maybeSingle: () => {
        const handler = handlers[table];
        const result = handler
          ? handler(filters)
          : { data: null, error: { message: `no handler for ${table}` } };
        const rows = Array.isArray(result.data) ? result.data : [];
        return Promise.resolve({ data: rows[0] ?? null, error: result.error });
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
        calls.push({ table, filters });
        const handler = handlers[table];
        const result = handler
          ? handler(filters)
          : { data: null, error: { message: `no handler for ${table}` } };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return self;
  }

  return { admin: { from: (table: string) => builder(table) }, calls };
}

const NOW = Date.UTC(2026, 6, 30, 12, 0, 0);
const INST = 'inst-nattraja';
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

// ---------------------------------------------------------------------------
// Ages + the one-stage-per-item rule (decision 4, and what makes a first run
// against an existing backlog safe)
// ---------------------------------------------------------------------------
describe('dueStage', () => {
  it('says nothing before the reminder line', () => {
    expect(dueStage(CHASE_REMIND_AFTER_DAYS - 1)).toBe('');
  });

  it('reminds from the reminder line', () => {
    expect(dueStage(CHASE_REMIND_AFTER_DAYS)).toBe('remind');
    expect(dueStage(CHASE_ESCALATE_AFTER_DAYS - 1)).toBe('remind');
  });

  it('escalates from the escalation line — and only escalates', () => {
    expect(dueStage(CHASE_ESCALATE_AFTER_DAYS)).toBe('escalate');
    // The whole point: an item first seen at three weeks gets ONE message.
    expect(dueStage(21)).toBe('escalate');
  });

  it('measures age in whole days and never goes negative', () => {
    expect(ageInDays(daysAgo(7), NOW)).toBe(7);
    expect(ageInDays(new Date(NOW + 86_400_000).toISOString(), NOW)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Idempotency keys — the entire dedupe mechanism
// ---------------------------------------------------------------------------
describe('buildChaseNotice', () => {
  const item = (over: Partial<ChaseItem>): ChaseItem => ({
    stream: 'questions',
    itemId: 'passage-1',
    institutionId: INST,
    label: 'The Little Garden',
    pendingCount: 7,
    oldestCreatedAt: daysAgo(8),
    ageDays: 8,
    stage: 'remind',
    ...over,
  });

  it('keys on stream + stage + item id', () => {
    expect(buildChaseNotice(item({})).idempotencyKey).toBe(
      'rcltp-chase-questions-remind-passage-1',
    );
  });

  it('gives the same item a different key per stage, so each fires once', () => {
    const remind = buildChaseNotice(item({})).idempotencyKey;
    const escalate = buildChaseNotice(item({ stage: 'escalate', ageDays: 15 })).idempotencyKey;
    expect(remind).not.toBe(escalate);
  });

  it('is stable across runs — the key never carries the age or the date', () => {
    const a = buildChaseNotice(item({ ageDays: 8 })).idempotencyKey;
    const b = buildChaseNotice(item({ ageDays: 9 })).idempotencyKey;
    expect(a).toBe(b);
  });

  it('separates the two streams', () => {
    expect(buildChaseNotice(item({ stream: 'remedial_plan', itemId: 'plan-1' })).idempotencyKey).toBe(
      'rcltp-chase-remedial_plan-remind-plan-1',
    );
  });

  it('points each stream at its own review page', () => {
    expect(buildChaseNotice(item({})).url).toContain('/questions');
    expect(buildChaseNotice(item({ stream: 'remedial_plan' })).url).toContain('/remedial-plans');
  });
});

// ---------------------------------------------------------------------------
// Finders
// ---------------------------------------------------------------------------
describe('findPendingQuestionSets', () => {
  it('groups a whole draft set into ONE item, aged from the oldest row', async () => {
    const { admin } = makeAdmin({
      rcltp_part_b_questions: () => ({
        data: [
          { id: 'q1', passage_id: 'p1', institution_id: INST, created_at: daysAgo(9) },
          { id: 'q2', passage_id: 'p1', institution_id: INST, created_at: daysAgo(8) },
          { id: 'q3', passage_id: 'p1', institution_id: INST, created_at: daysAgo(8) },
        ],
        error: null,
      }),
      rcltp_passages: () => ({ data: [{ id: 'p1', title: 'The Little Garden' }], error: null }),
    });

    const items = await findPendingQuestionSets(admin, NOW);
    expect(items).toHaveLength(1);
    expect(items[0].pendingCount).toBe(3);
    expect(items[0].ageDays).toBe(9);
    expect(items[0].stage).toBe('remind');
    expect(items[0].label).toBe('The Little Garden');
  });

  it('stays silent while a set is younger than the reminder line', async () => {
    const { admin } = makeAdmin({
      rcltp_part_b_questions: () => ({
        data: [{ id: 'q1', passage_id: 'p1', institution_id: INST, created_at: daysAgo(4) }],
        error: null,
      }),
      rcltp_passages: () => ({ data: [], error: null }),
    });
    expect(await findPendingQuestionSets(admin, NOW)).toHaveLength(0);
  });

  it('reads only unreviewed, active drafts', async () => {
    const { admin, calls } = makeAdmin({
      rcltp_part_b_questions: () => ({ data: [], error: null }),
    });
    await findPendingQuestionSets(admin, NOW);
    const filters = calls.find((c) => c.table === 'rcltp_part_b_questions')!.filters;
    expect(filters['eq:status']).toBe('draft');
    expect(filters['eq:is_active']).toBe(true);
    expect(filters['is:reviewed_at']).toBe(null);
  });
});

describe('findPendingRemedialPlans', () => {
  it('chases an unapproved draft plan once it passes the line', async () => {
    const { admin } = makeAdmin({
      rcltp_remedial_plans: () => ({
        data: [{ id: 'plan-1', institution_id: INST, created_at: daysAgo(7), cycle_no: 2 }],
        error: null,
      }),
    });
    const items = await findPendingRemedialPlans(admin, NOW);
    expect(items).toHaveLength(1);
    expect(items[0].stage).toBe('remind');
    expect(items[0].label).toBe('cycle 2');
  });

  it('carries no learner name into the notice', async () => {
    const { admin } = makeAdmin({
      rcltp_remedial_plans: () => ({
        data: [{ id: 'plan-1', institution_id: INST, created_at: daysAgo(20), cycle_no: 2 }],
        error: null,
      }),
    });
    const [item] = await findPendingRemedialPlans(admin, NOW);
    const notice = buildChaseNotice(item);
    expect(item.stage).toBe('escalate');
    expect(notice.body).not.toContain('plan-1');
    expect(JSON.stringify(notice.metadata)).not.toContain('learner');
  });
});

// ---------------------------------------------------------------------------
// Who may approve — by permission, never by role name
// ---------------------------------------------------------------------------
const ROLE_HEAD = { id: 'r-head', role_key: 'principal', permissions: { 'rcltp.config.manage': true } };
const ROLE_APPROVER = {
  id: 'r-approver',
  role_key: 'school_faculty',
  permissions: { 'rcltp.question.approve': true, 'rcltp.config.manage': false },
};
const ROLE_UNRELATED = { id: 'r-none', role_key: 'accounts', permissions: { 'billing.view': true } };

function approverAdmin(profiles: Array<{ id: string; is_super_admin?: boolean }>) {
  return makeAdmin({
    custom_roles: () => ({ data: [ROLE_HEAD, ROLE_APPROVER, ROLE_UNRELATED], error: null }),
    user_roles: () => ({ data: [{ user_id: 'u-head' }, { user_id: 'u-approver' }], error: null }),
    profiles: () => ({ data: profiles, error: null }),
  });
}

describe('resolveApprovers', () => {
  it('accepts anyone holding ANY of the permissions', async () => {
    const { admin } = approverAdmin([{ id: 'u-head' }, { id: 'u-approver' }]);
    const ids = await resolveApprovers(admin, INST, QUESTION_APPROVE_PERMISSIONS);
    expect(ids.sort()).toEqual(['u-approver', 'u-head']);
  });

  it('scopes to the institution and to active accounts', async () => {
    const { admin, calls } = approverAdmin([{ id: 'u-head' }]);
    await resolveApprovers(admin, INST, REMEDIAL_PLAN_APPROVE_PERMISSIONS);
    const profileCall = calls.find((c) => c.table === 'profiles')!;
    expect(profileCall.filters['eq:institution_id']).toBe(INST);
    expect(profileCall.filters['eq:is_active']).toBe(true);
  });

  it('never puts a super admin in the reminder tier', async () => {
    const { admin } = approverAdmin([{ id: 'u-head' }, { id: 'u-super', is_super_admin: true }]);
    const ids = await resolveApprovers(admin, INST, QUESTION_APPROVE_PERMISSIONS);
    expect(ids).not.toContain('u-super');
  });

  it('chunks the profile lookup — a 515-id .in() is a URL long enough to fail', async () => {
    // Not hypothetical: rcltp.review is granted to the facilitator role (483
    // users), so the remedial-plan permission set resolves 515 candidate ids in
    // production and a single .in() over them fails with `fetch failed`.
    const many = Array.from({ length: 515 }, (_, i) => `u-${i}`);
    const { admin, calls } = makeAdmin({
      custom_roles: () => ({ data: [ROLE_HEAD], error: null }),
      user_roles: () => ({ data: many.map((id) => ({ user_id: id })), error: null }),
      profiles: (filters) => {
        const ids = (filters['in:id'] as string[]) ?? [];
        expect(ids.length).toBeLessThanOrEqual(150);
        return { data: ids.map((id) => ({ id })), error: null };
      },
    });

    const resolved = await resolveApprovers(admin, INST, REMEDIAL_PLAN_APPROVE_PERMISSIONS);
    const idLookups = calls.filter((c) => c.table === 'profiles' && c.filters['in:id']);
    expect(idLookups.length).toBeGreaterThan(1);
    expect(resolved).toHaveLength(515);
  });

  it('returns nobody when no active role grants the permission', async () => {
    const { admin } = makeAdmin({
      custom_roles: () => ({ data: [ROLE_UNRELATED], error: null }),
    });
    expect(await resolveApprovers(admin, INST, QUESTION_APPROVE_PERMISSIONS)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Decision 5 — overlap detected by comparing ID SETS
// ---------------------------------------------------------------------------
function escalationAdmin(headIds: string[], superAdminIds: string[]) {
  return makeAdmin({
    custom_roles: () => ({ data: [ROLE_HEAD], error: null }),
    user_roles: () => ({ data: headIds.map((id) => ({ user_id: id })), error: null }),
    profiles: (filters) =>
      filters['eq:is_super_admin'] === true
        ? { data: superAdminIds.map((id) => ({ id })), error: null }
        : { data: headIds.map((id) => ({ id })), error: null },
  });
}

describe('resolveEscalationRecipients', () => {
  it('escalates to system administrators when the head was already reminded', async () => {
    const { admin } = escalationAdmin(['u-head'], ['u-super-1', 'u-super-2']);
    const out = await resolveEscalationRecipients(admin, INST, ['u-head', 'u-approver']);
    expect(out.via).toBe('admin_same_person');
    expect(out.userIds.sort()).toEqual(['u-super-1', 'u-super-2']);
  });

  it('escalates to the head when the head adds someone new', async () => {
    const { admin } = escalationAdmin(['u-head'], ['u-super-1']);
    const out = await resolveEscalationRecipients(admin, INST, ['u-approver']);
    expect(out.via).toBe('head');
    expect(out.userIds).toEqual(['u-head']);
  });

  it('falls back to administrators when the school has no active head', async () => {
    const { admin } = escalationAdmin([], ['u-super-1']);
    const out = await resolveEscalationRecipients(admin, INST, ['u-approver']);
    expect(out.via).toBe('admin_fallback');
    expect(out.userIds).toEqual(['u-super-1']);
  });
});
