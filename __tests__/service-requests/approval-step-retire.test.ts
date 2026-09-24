import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Removing a step from a service type's approval flow used to DELETE the row —
 * unless past requests referenced it, in which case the delete was silently
 * skipped and the step stayed in the LIVE flow forever (Bonafide Certificate
 * (Engineering) carried a ghost third "Principal" step for two months; 197
 * requests went through it). A referenced step must be retired
 * (is_active=false) so history keeps its FK target while new requests and the
 * builder stop seeing it. Unreferenced steps are still deleted outright.
 */

type Row = Record<string, unknown>;

const state = {
  steps: [] as Row[],
  approvalsByStep: new Set<string>(),
  ops: [] as string[],
};

function builderFor(table: string) {
  const filters: Array<[string, unknown]> = [];
  let op: 'select' | 'update' | 'delete' | 'insert' = 'select';
  let payload: Row | Row[] | null = null;
  const b: Record<string, unknown> = {};
  const run = async () => {
    if (table === 'service_types') {
      if (op === 'update') state.ops.push('type:update');
      return { data: { id: 'st-1' }, error: null };
    }
    if (table === 'service_request_approvals') {
      const ids = (filters.find(([k]) => k === 'in:approval_step_id')?.[1] as string[]) ?? [];
      return { data: ids.filter((id) => state.approvalsByStep.has(id)).map((id) => ({ approval_step_id: id })), error: null };
    }
    // service_request_approval_steps
    if (op === 'select') {
      const active = filters.some(([k, v]) => k === 'eq:is_active' && v === true);
      return { data: state.steps.filter((s) => !active || s.is_active !== false), error: null };
    }
    if (op === 'update') {
      const id = filters.find(([k]) => k === 'eq:id')?.[1];
      const ids = (filters.find(([k]) => k === 'in:id')?.[1] as string[]) ?? (id ? [id as string] : []);
      for (const s of state.steps) if (ids.includes(s.id as string)) Object.assign(s, payload as Row);
      state.ops.push(`steps:update:${ids.join(',')}:${JSON.stringify(payload)}`);
      return { data: null, error: null };
    }
    if (op === 'delete') {
      const ids = (filters.find(([k]) => k === 'in:id')?.[1] as string[]) ?? [];
      state.steps = state.steps.filter((s) => !ids.includes(s.id as string));
      state.ops.push(`steps:delete:${ids.join(',')}`);
      return { data: null, error: null };
    }
    if (op === 'insert') {
      for (const r of payload as Row[]) state.steps.push({ id: `new-${state.steps.length}`, is_active: true, ...r });
      state.ops.push(`steps:insert:${(payload as Row[]).length}`);
      return { data: null, error: null };
    }
    return { data: null, error: null };
  };
  b.select = () => b;
  b.eq = (k: string, v: unknown) => { filters.push([`eq:${k}`, v]); return b; };
  b.in = (k: string, v: unknown) => { filters.push([`in:${k}`, v]); return b; };
  b.update = (p: Row) => { op = 'update'; payload = p; return b; };
  b.delete = () => { op = 'delete'; return b; };
  b.insert = (p: Row[]) => { op = 'insert'; payload = p; return b; };
  b.single = run;
  b.maybeSingle = run;
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => run().then(res, rej);
  return b;
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({ from: (table: string) => builderFor(table) }),
}));

import { ServiceTypeService } from '@/lib/services/service-requests/service-type-service';

vi.spyOn(ServiceTypeService, 'getServiceType').mockImplementation(async () => ({ id: 'st-1' }) as never);

const STEP = (id: string, order: number, role: string, user: string) => ({
  id, service_type_id: 'st-1', step_order: order, step_name: role, approver_role: role,
  approver_user_ids: [user], is_required: true, is_active: true,
});

beforeEach(() => {
  state.steps = [STEP('s1', 1, 'principal', 'u-principal'), STEP('s2', 2, 'faculty', 'u-saranya'), STEP('s3', 3, 'principal', 'u-principal')];
  state.approvalsByStep = new Set(['s1', 's2', 's3']);
  state.ops = [];
});

describe('updateServiceType — removing approval steps', () => {
  it('retires a removed step that past requests reference instead of leaving it live', async () => {
    await ServiceTypeService.updateServiceType('st-1', {
      approval_steps: [
        { step_order: 1, step_name: 'Facilitator', approver_role: 'faculty', approver_user_ids: ['u-saranya'], is_required: true },
        { step_order: 2, step_name: 'Principal', approver_role: 'principal', approver_user_ids: ['u-principal'], is_required: true },
      ],
    } as never);

    const s3 = state.steps.find((s) => s.id === 's3')!;
    expect(s3.is_active).toBe(false);                       // retired, not deleted
    expect(state.ops.some((o) => o.startsWith('steps:delete'))).toBe(false);
    expect(state.steps.find((s) => s.id === 's1')!.approver_role).toBe('faculty');
    expect(state.steps.find((s) => s.id === 's2')!.approver_role).toBe('principal');
  });

  it('still deletes a removed step nothing references', async () => {
    state.approvalsByStep = new Set(['s1', 's2']);
    await ServiceTypeService.updateServiceType('st-1', {
      approval_steps: [
        { step_order: 1, step_name: 'Facilitator', approver_role: 'faculty', approver_user_ids: ['u-saranya'], is_required: true },
        { step_order: 2, step_name: 'Principal', approver_role: 'principal', approver_user_ids: ['u-principal'], is_required: true },
      ],
    } as never);
    expect(state.steps.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(state.ops).toContain('steps:delete:s3');
  });

  it('matches incoming steps against ACTIVE rows only, so a retired step never absorbs an edit', async () => {
    state.steps[2].is_active = false; // s3 already retired earlier
    await ServiceTypeService.updateServiceType('st-1', {
      approval_steps: [
        { step_order: 1, step_name: 'Facilitator', approver_role: 'faculty', approver_user_ids: ['u-saranya'], is_required: true },
        { step_order: 2, step_name: 'Principal', approver_role: 'principal', approver_user_ids: ['u-principal'], is_required: true },
        { step_order: 3, step_name: 'HOD', approver_role: 'hod', approver_user_ids: ['u-hod'], is_required: true },
      ],
    } as never);
    // The new third step is INSERTED; the retired s3 is untouched.
    expect(state.ops).toContain('steps:insert:1');
    expect(state.steps.find((s) => s.id === 's3')!.approver_role).toBe('principal');
    expect(state.steps.find((s) => s.id === 's3')!.is_active).toBe(false);
  });
});
