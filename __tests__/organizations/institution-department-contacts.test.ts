/**
 * BUG-003313 — "unable to insert Department Contacts".
 *
 * Department contacts typed on the institution create / edit form were never
 * saved: the service wrote to a table that did not exist and never read the
 * error, an edit deleted every existing row first, and the edit form read the
 * academic `departments` table, so it always came back blank.
 *
 * Pinned here with a recording stub of the Supabase client:
 *  - an edit UPSERTS named contacts on (institution_id, department_type) and
 *    never deletes the institution's other contacts;
 *  - a type whose name the person cleared is removed, and only that type;
 *  - a write error reaches the person instead of vanishing;
 *  - the edit form's read comes from institution_departments, and a failed
 *    read is an error, not an empty form that invites overwriting.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Call = { table: string; op: string; args: unknown[] };
let calls: Call[] = [];
let failOn: { table: string; op: string; message: string } | null = null;

function builder(table: string) {
  const record = (op: string, args: unknown[]) => {
    calls.push({ table, op, args });
  };
  const result = (op: string) =>
    failOn && failOn.table === table && failOn.op === op
      ? { data: null, error: { message: failOn.message } }
      : { data: table === 'institutions' ? { id: 'inst-1', name: 'X' } : [], error: null };
  let lastOp = 'select';
  const b: any = {
    select: (...a: unknown[]) => { record('select', a); lastOp = lastOp === 'update' ? 'update' : 'select'; return b; },
    insert: (...a: unknown[]) => { record('insert', a); lastOp = 'insert'; return b; },
    update: (...a: unknown[]) => { record('update', a); lastOp = 'update'; return b; },
    upsert: (...a: unknown[]) => { record('upsert', a); lastOp = 'upsert'; return Promise.resolve(result('upsert')); },
    delete: (...a: unknown[]) => { record('delete', a); lastOp = 'delete'; return b; },
    eq: (...a: unknown[]) => { record('eq', a); return b; },
    in: (...a: unknown[]) => { record('in', a); return Promise.resolve(result(lastOp)); },
    single: () => Promise.resolve(result(lastOp)),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(result(lastOp)).then(res, rej),
  };
  return b;
}

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({ from: (t: string) => builder(t) }),
}));
vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { OrganizationService, departmentContactChanges } from '@/lib/services/organization/organization-service';

beforeEach(() => {
  calls = [];
  failOn = null;
});

const contactCalls = () => calls.filter((c) => c.table === 'institution_departments');

describe('departmentContactChanges', () => {
  it('upserts named contacts, removes cleared ones, ignores absent types', () => {
    const r = departmentContactChanges('inst-1', {
      accounts: { contact_name: ' Priya ', email: 'p@jkkn.ac.in', mobile: '98', designation: 'Accountant' },
      placement: { contact_name: '   ' },
    });
    expect(r.upserts).toEqual([
      { institution_id: 'inst-1', department_type: 'accounts', contact_name: 'Priya', designation: 'Accountant', email: 'p@jkkn.ac.in', mobile: '98' },
    ]);
    expect(r.cleared).toEqual(['placement']);
  });
});

describe('updateInstitution — department contacts', () => {
  it('upserts on (institution_id, department_type) and never deletes the other contacts', async () => {
    await OrganizationService.updateInstitution('inst-1', {
      name: 'X',
      departments: { admission: { contact_name: 'Ravi', email: 'r@jkkn.ac.in' } },
    } as any);
    const cc = contactCalls();
    const upsert = cc.find((c) => c.op === 'upsert');
    expect(upsert?.args[1]).toEqual({ onConflict: 'institution_id,department_type' });
    expect(upsert?.args[0]).toEqual([
      expect.objectContaining({ institution_id: 'inst-1', department_type: 'admission', contact_name: 'Ravi' }),
    ]);
    expect(cc.some((c) => c.op === 'delete')).toBe(false);
  });

  it('removes only the type whose name was cleared', async () => {
    await OrganizationService.updateInstitution('inst-1', {
      name: 'X',
      departments: { transportation: { contact_name: '' } },
    } as any);
    const cc = contactCalls();
    expect(cc.some((c) => c.op === 'delete')).toBe(true);
    expect(cc.find((c) => c.op === 'in')?.args).toEqual(['department_type', ['transportation']]);
  });

  it('tells the person when the contacts were not saved', async () => {
    failOn = { table: 'institution_departments', op: 'upsert', message: 'permission denied for table institution_departments' };
    await expect(
      OrganizationService.updateInstitution('inst-1', {
        name: 'X',
        departments: { accounts: { contact_name: 'Priya' } },
      } as any)
    ).rejects.toThrow(/department contacts were not.*permission denied/);
  });
});

describe('getInstitution — the edit form reads the saved contacts', () => {
  it('reads institution_departments, not the academic departments table', async () => {
    await OrganizationService.getInstitution('inst-1');
    expect(calls.some((c) => c.table === 'institution_departments' && c.op === 'select')).toBe(true);
    expect(calls.some((c) => c.table === 'departments')).toBe(false);
  });

  it('a failed contacts read is an error, not a blank form', async () => {
    failOn = { table: 'institution_departments', op: 'select', message: 'relation does not exist' };
    await expect(OrganizationService.getInstitution('inst-1')).rejects.toThrow(/department contacts/);
  });
});
