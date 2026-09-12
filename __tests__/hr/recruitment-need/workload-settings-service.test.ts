/**
 * Per-institution workload settings (Director decision 2026-09-12).
 *
 * Each college sets its own expected weekly teaching hours plus the amber and
 * red bands. The rows live in platform_policies with scope_type='institution'
 * under the same three keys the Senior Learner calendar Workload tab reads
 * (WORKLOAD_POLICY_KEYS in faculty-calendar-insights-service), so a value saved
 * here is the value that tab compares against.
 *
 * Only HR Admin and Super Admin may view or edit. HR Admin is usually a
 * SECONDARY role held through user_roles, so profile.role alone is not enough
 * (same trap as app/api/hr/dashboard).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  WORKLOAD_SETTING_KEYS,
  WorkloadSettingsService,
  canManageWorkloadSettings,
  parseInstitutionWorkloadSettings,
  resolveWorkloadSettingsAccess,
  validateWorkloadSettings,
} from '@/lib/services/hr/recruitment-need/workload-settings-service';

const INST_A = '11111111-1111-1111-1111-111111111111';
const INST_B = '22222222-2222-2222-2222-222222222222';

describe('WORKLOAD_SETTING_KEYS', () => {
  it('uses the exact policy keys the calendar Workload tab and the HR signal read', () => {
    expect(WORKLOAD_SETTING_KEYS).toEqual({
      expectedHours: 'hr_recruitment.workload_norm_hours',
      amberPct: 'hr_recruitment.threshold_amber_workload',
      redPct: 'hr_recruitment.threshold_red_workload',
    });
  });
});

describe('validateWorkloadSettings', () => {
  it('accepts a free (non-integer) expected-hours figure — institutions differ', () => {
    const r = validateWorkloadSettings({ expected_weekly_hours: 18.5, amber_pct: 100, red_pct: 120 });
    expect(r).toEqual({ ok: true, value: { expected_weekly_hours: 18.5, amber_pct: 100, red_pct: 120 } });
  });
  it('accepts numeric strings from a form', () => {
    const r = validateWorkloadSettings({ expected_weekly_hours: '16', amber_pct: '100', red_pct: '120' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.expected_weekly_hours).toBe(16);
  });
  it('rejects zero or negative expected hours', () => {
    expect(validateWorkloadSettings({ expected_weekly_hours: 0, amber_pct: 100, red_pct: 120 }).ok).toBe(false);
    expect(validateWorkloadSettings({ expected_weekly_hours: -3, amber_pct: 100, red_pct: 120 }).ok).toBe(false);
  });
  it('rejects red at or below amber (higher hours = worse, so red must be the higher band)', () => {
    const r = validateWorkloadSettings({ expected_weekly_hours: 16, amber_pct: 120, red_pct: 100 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/red/i);
    expect(validateWorkloadSettings({ expected_weekly_hours: 16, amber_pct: 100, red_pct: 100 }).ok).toBe(false);
  });
  it('rejects non-numbers and missing fields', () => {
    expect(validateWorkloadSettings({ expected_weekly_hours: 'abc', amber_pct: 100, red_pct: 120 }).ok).toBe(false);
    expect(validateWorkloadSettings({ amber_pct: 100, red_pct: 120 }).ok).toBe(false);
    expect(validateWorkloadSettings(null).ok).toBe(false);
  });
});

describe('parseInstitutionWorkloadSettings', () => {
  it('lists every institution, with nulls where no institution row exists (global seed is NOT inherited)', () => {
    const out = parseInstitutionWorkloadSettings(
      [{ id: INST_A, name: 'Dental' }, { id: INST_B, name: 'Nursing' }],
      [
        { policy_key: WORKLOAD_SETTING_KEYS.expectedHours, scope_type: 'institution', scope_id: INST_A, value: 18, is_active: true, updated_at: '2026-09-12T00:00:00Z' },
        { policy_key: WORKLOAD_SETTING_KEYS.amberPct, scope_type: 'institution', scope_id: INST_A, value: '100', is_active: true, updated_at: '2026-09-11T00:00:00Z' },
        { policy_key: WORKLOAD_SETTING_KEYS.redPct, scope_type: 'institution', scope_id: INST_A, value: 120, is_active: true, updated_at: null },
        { policy_key: WORKLOAD_SETTING_KEYS.expectedHours, scope_type: 'global', scope_id: null, value: 16, is_active: true, updated_at: null },
        { policy_key: WORKLOAD_SETTING_KEYS.expectedHours, scope_type: 'institution', scope_id: INST_B, value: 20, is_active: false, updated_at: null },
      ]
    );
    expect(out).toEqual([
      { institution_id: INST_A, institution_name: 'Dental', expected_weekly_hours: 18, amber_pct: 100, red_pct: 120, updated_at: '2026-09-12T00:00:00Z' },
      { institution_id: INST_B, institution_name: 'Nursing', expected_weekly_hours: null, amber_pct: null, red_pct: null, updated_at: null },
    ]);
  });
});

describe('canManageWorkloadSettings', () => {
  it('allows super admin and hr_admin (held as any role), refuses everyone else', () => {
    expect(canManageWorkloadSettings({ isSuperAdmin: true, roleKeys: [] })).toBe(true);
    expect(canManageWorkloadSettings({ isSuperAdmin: false, roleKeys: ['coo', 'hr_admin'] })).toBe(true);
    expect(canManageWorkloadSettings({ isSuperAdmin: false, roleKeys: ['administrator'] })).toBe(false);
    expect(canManageWorkloadSettings({ isSuperAdmin: false, roleKeys: ['hr_manager', 'principal'] })).toBe(false);
    expect(canManageWorkloadSettings({ isSuperAdmin: false, roleKeys: [] })).toBe(false);
  });
});

// ─── Supabase fakes ─────────────────────────────────────────────────────────

function sessionFake(opts: { profile?: any; roleKeys?: string[]; institutions?: any[]; policyRows?: any[] }) {
  const { profile = null, roleKeys = [], institutions = [], policyRows = [] } = opts;
  return {
    from(table: string) {
      const result =
        table === 'profiles' ? { data: profile, error: null }
        : table === 'user_roles' ? { data: roleKeys.map((k) => ({ custom_roles: { role_key: k } })), error: null }
        : table === 'institutions' ? { data: institutions, error: null }
        : table === 'platform_policies' ? { data: policyRows, error: null }
        : { data: null, error: { message: `unexpected table ${table}` } };
      const self: any = {};
      for (const m of ['select', 'eq', 'in', 'order']) self[m] = () => self;
      self.maybeSingle = () => Promise.resolve(result);
      self.then = (res: any, rej?: any) => Promise.resolve(result).then(res, rej);
      return self;
    },
  };
}

describe('resolveWorkloadSettingsAccess', () => {
  it('grants an hr_admin held only through user_roles (profile.role is something else)', async () => {
    const sb = sessionFake({ profile: { role: 'staff', is_super_admin: false }, roleKeys: ['hr_admin'] });
    expect(await resolveWorkloadSettingsAccess(sb as any, 'u1')).toEqual({ allowed: true });
  });
  it('grants a super admin', async () => {
    const sb = sessionFake({ profile: { role: 'super_admin', is_super_admin: true }, roleKeys: [] });
    expect(await resolveWorkloadSettingsAccess(sb as any, 'u1')).toEqual({ allowed: true });
  });
  it('refuses an administrator / principal / hr_manager with a plain-English reason', async () => {
    const sb = sessionFake({ profile: { role: 'administrator', is_super_admin: false }, roleKeys: ['hr_manager'] });
    const r = await resolveWorkloadSettingsAccess(sb as any, 'u1');
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toMatch(/don't have access/i);
  });
});

describe('WorkloadSettingsService.list', () => {
  it('reads institution-scoped rows for the three keys and returns one row per institution', async () => {
    const sb = sessionFake({
      institutions: [{ id: INST_A, name: 'Dental' }],
      policyRows: [
        { policy_key: WORKLOAD_SETTING_KEYS.expectedHours, scope_type: 'institution', scope_id: INST_A, value: 18, is_active: true, updated_at: null },
      ],
    });
    const out = await WorkloadSettingsService.list(sb as any);
    expect(out).toEqual([
      { institution_id: INST_A, institution_name: 'Dental', expected_weekly_hours: 18, amber_pct: null, red_pct: null, updated_at: null },
    ]);
  });
});

describe('WorkloadSettingsService.save', () => {
  function adminFake(existingKeys: string[]) {
    const updates: any[] = [];
    const inserts: any[] = [];
    const client = {
      from(_table: string) {
        const self: any = { _filters: {} as Record<string, unknown> };
        self.update = (payload: any) => { self._payload = payload; return self; };
        self.eq = (col: string, val: unknown) => { self._filters[col] = val; return self; };
        self.select = () => self;
        self.insert = (payload: any) => { inserts.push(payload); return Promise.resolve({ error: null }); };
        self.then = (res: any, rej?: any) => {
          updates.push({ payload: self._payload, filters: self._filters });
          const hit = existingKeys.includes(self._filters.policy_key as string);
          return Promise.resolve({ data: hit ? [{ id: 'row' }] : [], error: null }).then(res, rej);
        };
        return self;
      },
    };
    return { client, updates, inserts };
  }

  it('updates the institution row when it exists and inserts it when it does not', async () => {
    const { client, updates, inserts } = adminFake([WORKLOAD_SETTING_KEYS.expectedHours]);
    await WorkloadSettingsService.save(client as any, INST_A, { expected_weekly_hours: 18, amber_pct: 100, red_pct: 120 }, 'u1');

    expect(updates).toHaveLength(3);
    for (const u of updates) {
      expect(u.filters).toMatchObject({ scope_type: 'institution', scope_id: INST_A });
      expect(u.payload.updated_by).toBe('u1');
    }
    expect(updates.find((u) => u.filters.policy_key === WORKLOAD_SETTING_KEYS.expectedHours)?.payload.value).toBe(18);

    expect(inserts.map((i) => i.policy_key).sort()).toEqual(
      [WORKLOAD_SETTING_KEYS.amberPct, WORKLOAD_SETTING_KEYS.redPct].sort()
    );
    for (const i of inserts) {
      expect(i).toMatchObject({ scope_type: 'institution', scope_id: INST_A, data_type: 'number', is_active: true, updated_by: 'u1' });
    }
    expect(inserts.find((i) => i.policy_key === WORKLOAD_SETTING_KEYS.redPct)?.value).toBe(120);
  });

  it('never writes a global row', async () => {
    const { client, updates, inserts } = adminFake([]);
    await WorkloadSettingsService.save(client as any, INST_B, { expected_weekly_hours: 12, amber_pct: 90, red_pct: 110 }, 'u1');
    expect(updates.every((u) => u.filters.scope_type === 'institution')).toBe(true);
    expect(inserts.every((i) => i.scope_type === 'institution' && i.scope_id === INST_B)).toBe(true);
  });
});
