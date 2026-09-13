/**
 * Signal Weights + Per-Input Thresholds admin screens.
 *
 * WHY THIS TEST EXISTS: both screens read and write `platform_policies`, whose
 * key column is `policy_key`. The service asked for a column called `key`, so
 * Postgres answered "column platform_policies.key does not exist", the API
 * returned 500 and the screens showed an empty table with a Save button that
 * could never succeed. Every other policy reader in the repo uses `policy_key`.
 *
 * Both screens edit GLOBAL defaults. Now that the workload norm is set per
 * institution (rows with scope_type='institution'), an unscoped update would
 * overwrite every institution's value with one number — so the writes must be
 * pinned to the global row.
 */
import { describe, it, expect, vi } from 'vitest';
import { RecruitmentNeedAdminService } from '@/lib/services/hr/recruitment-need/admin-service';

function makeSupabase(rows: Array<Record<string, unknown>>) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const chain: any = {};
  for (const m of ['from', 'select', 'like', 'order', 'update', 'eq', 'is']) {
    chain[m] = vi.fn((...args: unknown[]) => {
      calls.push({ method: m, args });
      return chain;
    });
  }
  chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null }).then(res, rej);
  return { client: chain, calls };
}

describe('RecruitmentNeedAdminService policy reads use the real column name', () => {
  it('listThresholdPolicies selects policy_key (not key) and returns global rows', async () => {
    const { client, calls } = makeSupabase([
      { policy_key: 'hr_recruitment.threshold_amber_sfr', value: 80, description: 'Amber SFR' },
    ]);
    const out = await RecruitmentNeedAdminService.listThresholdPolicies(client);

    const select = calls.find((c) => c.method === 'select');
    expect(String(select?.args[0])).toContain('policy_key');
    expect(String(select?.args[0])).not.toMatch(/(^|[^_])key\b/);
    const like = calls.find((c) => c.method === 'like');
    expect(like?.args[0]).toBe('policy_key');
    const scope = calls.find((c) => c.method === 'eq' && c.args[0] === 'scope_type');
    expect(scope?.args[1]).toBe('global');

    expect(out).toEqual([
      { key: 'hr_recruitment.threshold_amber_sfr', value: 80, label: 'Amber SFR' },
    ]);
  });

  it('listWeightPolicies selects policy_key and returns global rows', async () => {
    const { client, calls } = makeSupabase([
      { policy_key: 'hr_recruitment.weight_sfr', value: 14.29, description: null },
    ]);
    const out = await RecruitmentNeedAdminService.listWeightPolicies(client);
    const like = calls.find((c) => c.method === 'like');
    expect(like?.args[0]).toBe('policy_key');
    const scope = calls.find((c) => c.method === 'eq' && c.args[0] === 'scope_type');
    expect(scope?.args[1]).toBe('global');
    expect(out[0]).toEqual({ key: 'hr_recruitment.weight_sfr', value: 14.29, label: 'sfr' });
  });

  it('updateThresholdPolicies writes by policy_key and only touches the global row', async () => {
    const { client, calls } = makeSupabase([]);
    await RecruitmentNeedAdminService.updateThresholdPolicies(client, [
      { key: 'hr_recruitment.threshold_amber_sfr', value: '80' },
    ]);
    const eqs = calls.filter((c) => c.method === 'eq').map((c) => c.args);
    expect(eqs).toContainEqual(['policy_key', 'hr_recruitment.threshold_amber_sfr']);
    expect(eqs).toContainEqual(['scope_type', 'global']);
    expect(eqs.some((a) => a[0] === 'key')).toBe(false);
  });

  it('updateWeightPolicies writes by policy_key and only touches the global row', async () => {
    const { client, calls } = makeSupabase([]);
    await RecruitmentNeedAdminService.updateWeightPolicies(client, [
      { key: 'hr_recruitment.weight_sfr', value: '100' },
    ]);
    const eqs = calls.filter((c) => c.method === 'eq').map((c) => c.args);
    expect(eqs).toContainEqual(['policy_key', 'hr_recruitment.weight_sfr']);
    expect(eqs).toContainEqual(['scope_type', 'global']);
    expect(eqs.some((a) => a[0] === 'key')).toBe(false);
  });
});
