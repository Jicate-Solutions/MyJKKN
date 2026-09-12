/**
 * The Issue Offer step: the transition the code has always allowed and no
 * screen ever offered.
 *
 * Four things are asserted here, and the unit path is the only way any of them
 * can be proven without writing to production. The repository's .env points at
 * the live project, so no test and no manual check in this PR issues a real
 * offer to a real person.
 *
 *   WHEN THE BUTTON SHOWS   mayIssueOffer admits `package_fixed` ONLY. The
 *                        transition map also admits `approved → offer_issued`,
 *                        and review round 1 found the button offered there in
 *                        both surfaces — which let HR issue an offer to one of
 *                        the 9 candidates with NO agreed salary package, into a
 *                        state approvePackage can never repair. The predicate
 *                        must stay narrower than the map, and every status it
 *                        admits must still be one the map admits.
 *
 *   THE TRANSITION MAP   package_fixed → offer_issued must be allowed (10 live
 *                        candidates sit at package_fixed with nowhere to go,
 *                        the oldest for 162 days), and a transition the map
 *                        does not admit must still be refused.
 *
 *   THE PERMISSION GATE  the status route used to check authentication only.
 *                        RecruitmentService.assertMayUpdateStatus is the gate
 *                        the route now runs first, and it MIRRORS the RLS UPDATE
 *                        policy — including the policy's `is_admin()` bypass,
 *                        whose absence in round 1 would have 403'd an
 *                        admin-role profile out of "Mark as Joined" (a control
 *                        with no permission gate of its own) that worked
 *                        yesterday.
 *
 *   THE DATABASE REFUSAL the gate and the policy are DIFFERENT predicates
 *                        (fn_my_hr_organization_ids vs
 *                        role_has_institution_access), so a caller the gate
 *                        admits can still be refused by RLS. postgrest-js
 *                        returns a PLAIN OBJECT, so `throw error` produced
 *                        400 "Unknown error" — the signature PR #3418 fixed for
 *                        approve/reject. It is now a named 403 (CLAUDE.md #27).
 *
 * Lives under __tests__/lib/ deliberately: the `Lib unit suite` gate runs
 * `__tests__/lib/` only, so a copy elsewhere would never execute in CI.
 */
import { describe, it, expect } from 'vitest';
import {
  RecruitmentService,
  RecruitmentForbiddenError,
  RecruitmentDbConflictError,
  CANDIDATE_FORWARD_TRANSITIONS,
} from '@/lib/services/hr/recruitment-service';
import { ISSUE_OFFER_STATUSES, mayIssueOffer } from '@/lib/hr/recruitment-issue-offer';
import type { CandidateStatus } from '@/types/hr-recruitment';

const CANDIDATE_ID = 'cand-1';
const MY_ORG = '11111111-1111-1111-1111-111111111111';
const OTHER_ORG = '22222222-2222-2222-2222-222222222222';
const ME = '33333333-3333-3333-3333-333333333333';

type Client = Parameters<typeof RecruitmentService.updateStatus>[0];

/**
 * Stand-in client for the transition map: answers the candidate read, then
 * records the UPDATE payload. `single()` returns the row the update would have
 * written, so updateStatus's own return value is exercised too.
 *
 * `updateError` makes the write come back refused, as PostgREST does — as a PLAIN
 * OBJECT, never an Error, which is the whole reason the refusal needed naming.
 */
function makeStatusClient(
  currentStatus: CandidateStatus,
  updateError?: { code: string; message: string }
) {
  const updates: Record<string, unknown>[] = [];
  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: ME } }, error: null }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: CANDIDATE_ID, status: currentStatus, hr_organization_id: MY_ORG },
            error: null,
          }),
        }),
      }),
      update: (payload: Record<string, unknown>) => {
        updates.push(payload);
        return {
          eq: () => ({
            select: () => ({
              single: async () =>
                updateError
                  ? { data: null, error: updateError }
                  : { data: { id: CANDIDATE_ID, ...payload }, error: null },
            }),
          }),
        };
      },
    }),
  } as unknown as Client;
  return { client, updates };
}

/**
 * Stand-in client for the gate. `perms` decides what user_has_permission
 * answers per key; `orgs` is what fn_my_hr_organization_ids returns; `admin`
 * is what is_admin() answers (the RLS policy's second bypass).
 */
function makeGateClient(opts: {
  perms?: Record<string, boolean>;
  orgs?: string[] | null;
  superAdmin?: boolean;
  admin?: boolean;
}) {
  const calls: string[] = [];
  const client = {
    rpc: async (name: string, args?: Record<string, unknown>) => {
      calls.push(name);
      if (name === 'user_has_permission') {
        const key = String(args?.permission_name ?? '');
        return { data: opts.perms?.[key] === true, error: null };
      }
      if (name === 'is_super_admin') return { data: opts.superAdmin === true, error: null };
      if (name === 'is_admin') return { data: opts.admin === true, error: null };
      if (name === 'fn_my_hr_organization_ids') return { data: opts.orgs ?? [], error: null };
      throw new Error(`unexpected rpc: ${name}`);
    },
    from: (table: string) => {
      throw new Error(`the gate must not read tables: ${table}`);
    },
  } as unknown as Client;
  return { client, calls };
}

const BOTH_KEYS = { 'hr.recruitment.edit': true, 'hr.recruitment.view': true };

/**
 * Await a gate call that MUST refuse, and hand back the refusal.
 *
 * Deliberately not `.catch((e) => e)`: that resolves to `void | Error`, so a gate
 * that wrongly ALLOWED the call would make every assertion below read a property
 * off `undefined` and the failure message would be about `reason`, not about the
 * gate having let someone through. Here an allow is its own named failure.
 */
async function refusal(p: Promise<void>): Promise<RecruitmentForbiddenError> {
  try {
    await p;
  } catch (err) {
    return err as RecruitmentForbiddenError;
  }
  throw new Error('the gate ALLOWED this call — it was expected to refuse');
}

describe('mayIssueOffer — where the button may be offered', () => {
  it('offers the control at package_fixed, the status that MEANS salary agreed', () => {
    expect(mayIssueOffer('package_fixed', { canEditRecruitment: true })).toBe(true);
  });

  it('does NOT offer the control at approved — no salary package is agreed there', () => {
    // The blocking bug of review round 1. `approved` is admitted by the
    // transition map, so the button "worked" — it moved one of the 9 candidates
    // with no package at all to offer_issued. And it is UNRECOVERABLE:
    // approvePackage advances the candidate only `if (parent.status ===
    // 'approved')`, so a later approvePackage marks the package approved and
    // leaves the person stranded at offer_issued with no salary ever fixed.
    expect(mayIssueOffer('approved', { canEditRecruitment: true })).toBe(false);
    expect(mayIssueOffer('approved', { isSuperAdmin: true })).toBe(false);
    expect(ISSUE_OFFER_STATUSES).not.toContain('approved');
  });

  it('offers it at no other status either, super admin included', () => {
    const everythingElse: CandidateStatus[] = [
      'submitted',
      'pending_approval',
      'approved',
      'offer_issued',
      'joined',
      'rejected',
      'withdrawn',
      'offer_rescinded',
      'no_show',
    ];
    for (const s of everythingElse) {
      expect(mayIssueOffer(s, { isSuperAdmin: true, canEditRecruitment: true }), s).toBe(false);
    }
  });

  it('requires the management key or super admin — a viewer sees nothing', () => {
    expect(mayIssueOffer('package_fixed', {})).toBe(false);
    expect(mayIssueOffer('package_fixed', { canEditRecruitment: false })).toBe(false);
    expect(mayIssueOffer('package_fixed', { isSuperAdmin: true })).toBe(true);
  });

  it('handles a null/undefined status without offering anything', () => {
    expect(mayIssueOffer(null, { isSuperAdmin: true })).toBe(false);
    expect(mayIssueOffer(undefined, { isSuperAdmin: true })).toBe(false);
  });

  it('never offers a status the server would refuse — the predicate ⊆ the map', () => {
    // The invariant that keeps the two rules from drifting apart in the OTHER
    // direction: narrower than the map is a product decision; wider than the map
    // is a button that 400s.
    for (const s of ISSUE_OFFER_STATUSES) {
      expect(CANDIDATE_FORWARD_TRANSITIONS[s] ?? [], s).toContain('offer_issued');
    }
  });
});

describe('RecruitmentService.updateStatus — the offer transition', () => {
  it('allows package_fixed → offer_issued, the step no screen ever called', async () => {
    const { client, updates } = makeStatusClient('package_fixed');

    const result = await RecruitmentService.updateStatus(client, CANDIDATE_ID, 'offer_issued');

    expect(updates).toHaveLength(1);
    expect(updates[0].status).toBe('offer_issued');
    expect(result.status).toBe('offer_issued');
  });

  it('still allows approved → offer_issued at the SERVICE layer, where the map rules', async () => {
    // The button is no longer offered at `approved` (see mayIssueOffer), but the
    // map is the server's own rule and other callers rely on it — narrowing it
    // here would be a second, unrelated change.
    const { client, updates } = makeStatusClient('approved');

    await RecruitmentService.updateStatus(client, CANDIDATE_ID, 'offer_issued');

    expect(updates[0].status).toBe('offer_issued');
  });

  it('stamps WHEN the offer went out and WHO sent it', async () => {
    // Review round 1, P6. Without these the desk kept reading "162 days" after
    // HR acted, because fn_my_desk_waiting's waiting_since had nothing else to
    // read. offer_issued_by comes from the caller's own session, never a payload.
    const { client, updates } = makeStatusClient('package_fixed');

    await RecruitmentService.updateStatus(client, CANDIDATE_ID, 'offer_issued');

    expect(updates[0].offer_issued_by).toBe(ME);
    expect(typeof updates[0].offer_issued_at).toBe('string');
    expect(new Date(updates[0].offer_issued_at as string).toString()).not.toBe('Invalid Date');
  });

  it('stamps the offer columns ONLY on the offer transition', async () => {
    const { client, updates } = makeStatusClient('offer_issued');

    await RecruitmentService.updateStatus(client, CANDIDATE_ID, 'joined');

    expect(updates[0]).not.toHaveProperty('offer_issued_at');
    expect(updates[0]).not.toHaveProperty('offer_issued_by');
  });

  it('issuing an offer sets no joining date — that is what Mark as Joined does', async () => {
    const { client, updates } = makeStatusClient('package_fixed');

    await RecruitmentService.updateStatus(client, CANDIDATE_ID, 'offer_issued');

    expect(updates[0]).not.toHaveProperty('actual_joining_date');
  });

  it('refuses a nonsense transition and names what was allowed', async () => {
    const { client, updates } = makeStatusClient('package_fixed');

    // 'joined' is reachable only from 'offer_issued' — skipping the offer is
    // exactly the shortcut the button exists to remove.
    await expect(
      RecruitmentService.updateStatus(client, CANDIDATE_ID, 'joined')
    ).rejects.toThrow(/not allowed/i);
    expect(updates).toEqual([]);
  });

  it('refuses re-issuing an offer to someone who already has one', async () => {
    const { client, updates } = makeStatusClient('offer_issued');

    await expect(
      RecruitmentService.updateStatus(client, CANDIDATE_ID, 'offer_issued')
    ).rejects.toThrow(/not allowed/i);
    expect(updates).toEqual([]);
  });
});

describe('RecruitmentService.updateStatus — a refusal that came from the DATABASE', () => {
  it('turns the zero-row RLS refusal (PGRST116) into a named 403, not 400 "Unknown error"', async () => {
    // The residue the gate cannot cover: a `.edit`+`.view` holder who is staff of
    // the candidate's institution passes fn_my_hr_organization_ids, but the UPDATE
    // policy requires role_has_institution_access(institution_id) — a different
    // predicate. RLS filters the row, `.single()` matches zero rows, PostgREST
    // reports PGRST116 as a PLAIN OBJECT, and `throw error` reached a catch that
    // reads `err.message` off an Error. Result: 400 "Unknown error".
    const { client } = makeStatusClient('package_fixed', {
      code: 'PGRST116',
      message: 'JSON object requested, multiple (or no) rows returned',
    });

    const err = await RecruitmentService.updateStatus(
      client,
      CANDIDATE_ID,
      'offer_issued'
    ).then(
      () => { throw new Error('the write was expected to be refused'); },
      (e: unknown) => e
    );

    expect(err).toBeInstanceOf(RecruitmentForbiddenError);
    const forbidden = err as RecruitmentForbiddenError;
    expect(forbidden.reason).toBe('refused_by_database');
    expect(forbidden.dbCode).toBe('PGRST116');
    // Says WHAT was refused and WHO to contact (CLAUDE.md #27).
    expect(forbidden.message).toMatch(/status/i);
    expect(forbidden.message).toMatch(/role_has_institution_access/);
    expect(forbidden.message).toMatch(/HR administrator|HR team/);
    // and is a real Error, so a route's `err instanceof Error` branch can read it
    expect(forbidden).toBeInstanceOf(Error);
  });

  it('names an outright privilege refusal (42501) the same way', async () => {
    const { client } = makeStatusClient('package_fixed', {
      code: '42501',
      message: 'permission denied for table hr_recruitment_candidates',
    });

    const err = await RecruitmentService.updateStatus(
      client,
      CANDIDATE_ID,
      'offer_issued'
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(RecruitmentForbiddenError);
    expect((err as RecruitmentForbiddenError).reason).toBe('refused_by_database');
  });

  it('reports a constraint violation as a conflict, not as a permission refusal', async () => {
    const { client } = makeStatusClient('package_fixed', {
      code: '23503',
      message: 'insert or update on table violates foreign key constraint',
    });

    const err = await RecruitmentService.updateStatus(
      client,
      CANDIDATE_ID,
      'offer_issued'
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(RecruitmentDbConflictError);
    expect((err as RecruitmentDbConflictError).dbCode).toBe('23503');
  });

  it('re-throws anything it does not recognise, so a real bug stays loud', async () => {
    const { client } = makeStatusClient('package_fixed', {
      code: '08006',
      message: 'connection failure',
    });

    const err = await RecruitmentService.updateStatus(
      client,
      CANDIDATE_ID,
      'offer_issued'
    ).catch((e: unknown) => e);

    expect(err).not.toBeInstanceOf(RecruitmentForbiddenError);
    expect(err).not.toBeInstanceOf(RecruitmentDbConflictError);
    expect((err as { code: string }).code).toBe('08006');
  });
});

describe('RecruitmentService.assertMayUpdateStatus — the gate the route had none of', () => {
  it('lets a holder in their own HR organisation through', async () => {
    const { client } = makeGateClient({ perms: BOTH_KEYS, orgs: [MY_ORG] });

    await expect(
      RecruitmentService.assertMayUpdateStatus(client, { hr_organization_id: MY_ORG })
    ).resolves.toBeUndefined();
  });

  it('lets an is_admin() profile through, exactly as the RLS UPDATE policy does', async () => {
    // Review round 1, P5. The policy is
    //   is_super_admin() OR is_admin() OR (edit AND role_has_institution_access)
    // and user_has_permission() bypasses for is_super_admin ONLY. Without this
    // branch a profile whose ROLE is admin/administrator/super_admin, who is not
    // is_super_admin and holds neither recruitment key, could update a status
    // yesterday and gets a 403 today — and canMarkJoined on the candidate page
    // has no permission gate at all, so they SEE "Mark as Joined" and it breaks.
    const { client, calls } = makeGateClient({ perms: {}, orgs: [], admin: true });

    await expect(
      RecruitmentService.assertMayUpdateStatus(client, { hr_organization_id: OTHER_ORG })
    ).resolves.toBeUndefined();
    // Cluster-wide in the policy, so cluster-wide here: no org round-trip.
    expect(calls).not.toContain('fn_my_hr_organization_ids');
  });

  it('refuses a non-holder with missing_permission, not a 400', async () => {
    const { client } = makeGateClient({ perms: {}, orgs: [MY_ORG] });

    const err = await refusal(
      RecruitmentService.assertMayUpdateStatus(client, { hr_organization_id: MY_ORG })
    );
    expect(err).toBeInstanceOf(RecruitmentForbiddenError);
    expect(err.reason).toBe('missing_permission');
    // The sentence must say what is missing and who to ask (CLAUDE.md #27).
    expect(err.message).toMatch(/hr\.recruitment\.edit/);
  });

  it('refuses view-without-edit — the management key is the one that matters', async () => {
    const { client } = makeGateClient({
      perms: { 'hr.recruitment.view': true },
      orgs: [MY_ORG],
    });

    const err = await refusal(
      RecruitmentService.assertMayUpdateStatus(client, { hr_organization_id: MY_ORG })
    );
    expect(err.reason).toBe('missing_permission');
  });

  it('refuses edit-without-view too — both keys, defence in depth', async () => {
    const { client } = makeGateClient({
      perms: { 'hr.recruitment.edit': true },
      orgs: [MY_ORG],
    });

    const err = await refusal(
      RecruitmentService.assertMayUpdateStatus(client, { hr_organization_id: MY_ORG })
    );
    expect(err.reason).toBe('missing_permission');
  });

  it('refuses a holder from another HR organisation with outside_your_organisation', async () => {
    const { client } = makeGateClient({ perms: BOTH_KEYS, orgs: [OTHER_ORG] });

    const err = await refusal(
      RecruitmentService.assertMayUpdateStatus(client, { hr_organization_id: MY_ORG })
    );
    expect(err).toBeInstanceOf(RecruitmentForbiddenError);
    expect(err.reason).toBe('outside_your_organisation');
  });

  it('refuses a candidate with no HR organisation rather than admitting them', async () => {
    // hr_organization_id is NOT NULL on the table, so this is defensive — but a
    // null must never read as "matches everything".
    const { client } = makeGateClient({ perms: BOTH_KEYS, orgs: [MY_ORG] });

    const err = await refusal(
      RecruitmentService.assertMayUpdateStatus(client, {
        hr_organization_id: null as unknown as string,
      })
    );
    expect(err.reason).toBe('outside_your_organisation');
  });

  it('survives fn_my_hr_organization_ids returning null instead of an array', async () => {
    const { client } = makeGateClient({ perms: BOTH_KEYS, orgs: null });

    const err = await refusal(
      RecruitmentService.assertMayUpdateStatus(client, { hr_organization_id: MY_ORG })
    );
    expect(err).toBeInstanceOf(RecruitmentForbiddenError);
    expect(err.reason).toBe('outside_your_organisation');
  });

  it('lets a super admin act outside their own HR organisations, as every other branch does', async () => {
    const { client } = makeGateClient({ perms: BOTH_KEYS, orgs: [], superAdmin: true });

    await expect(
      RecruitmentService.assertMayUpdateStatus(client, { hr_organization_id: OTHER_ORG })
    ).resolves.toBeUndefined();
  });

  it('checks the permission BEFORE asking which organisations the caller has', async () => {
    // A non-holder must be refused without the org round-trip: the cheap,
    // universal tests first, the per-caller one only for those who pass them.
    const { client, calls } = makeGateClient({ perms: {}, orgs: [MY_ORG] });

    await RecruitmentService.assertMayUpdateStatus(client, {
      hr_organization_id: MY_ORG,
    }).catch(() => {});

    expect(calls).not.toContain('fn_my_hr_organization_ids');
  });
});
