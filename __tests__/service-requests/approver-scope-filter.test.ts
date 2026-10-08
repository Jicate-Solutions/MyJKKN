import { describe, expect, it } from 'vitest';
import {
  buildApproverScopeFilter,
  splitAssignedSteps,
  type ApprovalStepRow,
} from '@/lib/services/service-requests/approver-scope-filter';

/**
 * The production shape that produced the bug report. MRS.SARANYA G is Faculty
 * at Engineering (institution 5de4fba1). Every row below carries
 * approver_role='faculty' — which is why a role-only match swept them all in.
 */
const SARANYA = '04bfa810-95ac-4b05-9004-17eabeb0c2c5';
const ENGINEERING = '5de4fba1-4564-41ed-8c73-5d948b74b843';
const BONAFIDE_ENG = 'f7ba87bf-fbac-4a36-b606-ea7479ba2dc1';
const HALL_TICKET_ALLIED = '3fa516ee-0059-4805-bf1d-aeca2f07489c';
const FEES_NO_DUE_NURSING = '0fa3552d-825a-47ac-9682-bcd0ef840f5e';

const PROD_STEPS: ApprovalStepRow[] = [
  // She IS named here — step TWO.
  {
    service_type_id: BONAFIDE_ENG,
    step_order: 2,
    approver_role: 'faculty',
    approver_user_ids: [SARANYA],
  },
  // Named steps belonging to other people, all still approver_role='faculty'.
  {
    service_type_id: FEES_NO_DUE_NURSING,
    step_order: 3,
    approver_role: 'faculty',
    approver_user_ids: ['702db832-52a1-4aae-ac23-9acd7bd80187'],
  },
  {
    service_type_id: FEES_NO_DUE_NURSING,
    step_order: 7,
    approver_role: 'faculty',
    approver_user_ids: ['f0a80a38-bc38-4f16-8a88-cdf464c07085'],
  },
  // A genuine legacy role step: nobody named, so the role decides.
  {
    service_type_id: HALL_TICKET_ALLIED,
    step_order: 1,
    approver_role: 'faculty',
    approver_user_ids: [],
  },
];

describe('splitAssignedSteps — agrees with canUserApprove', () => {
  it('drops a named step the user is not on, even when the role matches', () => {
    const { named, role } = splitAssignedSteps(PROD_STEPS, 'faculty', SARANYA);

    // Only her own named step survives; the two belonging to other faculty go.
    expect(named).toHaveLength(1);
    expect(named[0].service_type_id).toBe(BONAFIDE_ENG);
    expect(named[0].step_order).toBe(2);

    // A named step is NEVER also a role match — that is the rule the queue
    // used to break.
    expect(role.map((s) => s.service_type_id)).toEqual([HALL_TICKET_ALLIED]);
  });

  it('keeps a legacy role step when nobody is named', () => {
    const { named, role } = splitAssignedSteps(
      [{ service_type_id: 'x', step_order: 1, approver_role: 'faculty', approver_user_ids: [] }],
      'faculty',
      SARANYA
    );
    expect(named).toEqual([]);
    expect(role).toHaveLength(1);
  });

  it('admits a named user whose ROLE does not match the step', () => {
    // Step 1 of Bonafide (Engineering) is a `hod` step with named approvers.
    // A named person acts regardless of their own role.
    const { named } = splitAssignedSteps(
      [
        {
          service_type_id: BONAFIDE_ENG,
          step_order: 1,
          approver_role: 'hod',
          approver_user_ids: [SARANYA],
        },
      ],
      'faculty',
      SARANYA
    );
    expect(named).toHaveLength(1);
  });
});

describe('buildApproverScopeFilter — the reported bug', () => {
  it('does NOT match (Bonafide, step 1): she is only on step 2', () => {
    const filter = buildApproverScopeFilter(PROD_STEPS, 'faculty', SARANYA, ENGINEERING);

    // The pair must stay paired. The old cross product emitted
    // `current_approval_step.in.(1,2,3,7)` alongside every type id, so a
    // Bonafide request sitting at step 1 matched. It must not.
    expect(filter).toContain(`and(service_type_id.in.(${BONAFIDE_ENG}),current_approval_step.eq.2)`);
    expect(filter).not.toContain('current_approval_step.in.');
  });

  it('never pairs one step\'s type with another step\'s order', () => {
    const filter = buildApproverScopeFilter(PROD_STEPS, 'faculty', SARANYA, ENGINEERING)!;

    // Every emitted group names exactly one step_order, and the types listed in
    // it are only the types that actually carry that step_order.
    const groups = filter.split('),and(');
    for (const g of groups) {
      const step = /current_approval_step\.eq\.(\d+)/.exec(g)![1];
      const types = /service_type_id\.in\.\(([^)]*)\)/.exec(g)![1].split(',');
      for (const t of types) {
        expect(
          PROD_STEPS.some(
            (s) => s.service_type_id === t && String(s.step_order) === step
          )
        ).toBe(true);
      }
    }
  });

  it('pins role matches to the institution but leaves named matches unpinned', () => {
    const filter = buildApproverScopeFilter(PROD_STEPS, 'faculty', SARANYA, ENGINEERING)!;

    const named = filter
      .split('),and(')
      .find((g) => g.includes(BONAFIDE_ENG))!;
    const roleGroup = filter
      .split('),and(')
      .find((g) => g.includes(HALL_TICKET_ALLIED))!;

    // Naming someone is an explicit cross-institution choice.
    expect(named).not.toContain('institution_id');
    // A job-title match without the pin would pool every college's Faculty.
    expect(roleGroup).toContain(`institution_id.eq.${ENGINEERING}`);
  });

  it('returns null — not an empty filter — when the user approves nothing', () => {
    // A null that a caller treated as "no filter" would return every open
    // request in the system, so this contract matters more than it looks.
    // Note the role must ALSO miss: another Faculty still matches the legacy
    // Hall Ticket step, and correctly so — that step names nobody.
    expect(buildApproverScopeFilter(PROD_STEPS, 'librarian', 'someone-else')).toBe(null);
  });

  it('omits the institution clause when no institution is given', () => {
    // Cross-institutional callers (super_admin, institution_scope='all') pass
    // undefined and must not be pinned.
    const filter = buildApproverScopeFilter(PROD_STEPS, 'faculty', SARANYA, undefined)!;
    expect(filter).not.toContain('institution_id');
  });
});
