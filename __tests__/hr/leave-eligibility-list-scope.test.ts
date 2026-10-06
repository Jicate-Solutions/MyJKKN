/**
 * The Eligibility page's "Granted & decided" table must list every organisation
 * the caller may read, not just their home one.
 *
 * The bug: the page asked for `listForOrg(<the viewer's own organisation>)`, so a
 * super admin or HR Head saw only the decisions made at their home institution
 * — 1 row at Main Office — while RLS already returns all 7 rows across 5
 * organisations to both of them (checked against the live database as each role).
 * Passing null now means "no organisation filter; let RLS decide".
 *
 * Run: npx vitest run __tests__/hr/leave-eligibility-list-scope.test.ts
 */
import { describe, expect, it } from 'vitest';

import { LeaveEligibilityService } from '@/lib/services/hr/leave-eligibility-service';

/** Records every filter applied and resolves to the given rows. */
function recordingClient(rows: Array<Record<string, unknown>>) {
  const filters: Array<[string, unknown]> = [];
  const chain: any = {
    select: () => chain,
    order: () => chain,
    limit: () => chain,
    eq: (col: string, val: unknown) => (filters.push([col, val]), chain),
    then: (res: any, rej: any) => Promise.resolve({ data: rows, error: null }).then(res, rej),
  };
  return { client: { from: () => chain } as any, filters };
}

const row = (id: string, org: string) => ({
  id,
  hr_organization_id: org,
  status: 'approved',
  employee_id: `e-${id}`,
  leave_type_id: 'lt',
  documents: [],
  member: { first_name: 'A', last_name: id, staff_id: `S${id}` },
  hr_leave_types: { leave_type_name: 'PH.D' },
});

describe('LeaveEligibilityService.listForOrg — which organisations it asks for', () => {
  it('null asks for every organisation: no hr_organization_id filter is sent', async () => {
    const { client, filters } = recordingClient([row('1', 'org-a'), row('2', 'org-b')]);
    const out = await LeaveEligibilityService.listForOrg(client, null);

    expect(filters.find(([col]) => col === 'hr_organization_id')).toBeUndefined();
    expect(out.map((r) => r.hr_organization_id)).toEqual(['org-a', 'org-b']);
  });

  it('an organisation id still narrows to that organisation', async () => {
    const { client, filters } = recordingClient([row('1', 'org-a')]);
    await LeaveEligibilityService.listForOrg(client, 'org-a');

    expect(filters).toContainEqual(['hr_organization_id', 'org-a']);
  });

  it('a status narrows independently of the organisation', async () => {
    const { client, filters } = recordingClient([]);
    await LeaveEligibilityService.listForOrg(client, null, 'revoked');

    expect(filters).toEqual([['status', 'revoked']]);
  });

  it('still names the staff member and the leave type on every row', async () => {
    const { client } = recordingClient([row('7', 'org-a')]);
    const [r] = await LeaveEligibilityService.listForOrg(client, null);

    expect(r).toMatchObject({ staff_name: 'A 7', staff_code: 'S7', leave_type_name: 'PH.D' });
  });
});
