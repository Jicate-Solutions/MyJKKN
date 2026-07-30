import { describe, it, expect } from 'vitest';
import {
  permissionGranted,
  resolveRcltpNotifyTargets,
  resolveRcltpProgrammeInstitutionId,
  RCLTP_HEAD_PERMISSION,
} from '@/lib/services/rcltp/notify-targets';

// ---------------------------------------------------------------------------
// A minimal chainable PostgREST fake. Every builder method returns `this`, and
// the object is awaited to yield { data, error }. Each table is answered by a
// handler that sees the filters that were applied, so a test can assert the
// resolver scoped by institution rather than just returning everything.
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
      neq: (col: string, val: unknown) => {
        filters[`neq:${col}`] = val;
        return self;
      },
      not: (col: string, op: string, val: unknown) => {
        filters[`not:${col}:${op}`] = val;
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

const HEAD_ROLE = {
  id: 'role-head',
  role_key: 'principal',
  permissions: { 'rcltp.config.manage': true },
};
const OTHER_ROLE = {
  id: 'role-other',
  role_key: 'accounts',
  permissions: { 'billing.receipts.view': true },
};

// ---------------------------------------------------------------------------
// permissionGranted — flat first, nested as the compatibility net
// ---------------------------------------------------------------------------
describe('permissionGranted', () => {
  it('reads the canonical flat dotted key', () => {
    expect(permissionGranted({ 'rcltp.config.manage': true }, RCLTP_HEAD_PERMISSION)).toBe(true);
  });

  it('treats an explicit false as not granted', () => {
    expect(permissionGranted({ 'rcltp.config.manage': false }, RCLTP_HEAD_PERMISSION)).toBe(false);
  });

  it('accepts the string "true" some older rows carry', () => {
    expect(permissionGranted({ 'rcltp.config.manage': 'true' }, RCLTP_HEAD_PERMISSION)).toBe(true);
  });

  it('falls back to a nested bag when the flat key is absent', () => {
    expect(permissionGranted({ rcltp: { 'config.manage': true } }, RCLTP_HEAD_PERMISSION)).toBe(
      true,
    );
    expect(permissionGranted({ rcltp: { config: { manage: true } } }, RCLTP_HEAD_PERMISSION)).toBe(
      true,
    );
  });

  it('returns false for a missing key, null, or a non-object', () => {
    expect(permissionGranted({ 'rcltp.review': true }, RCLTP_HEAD_PERMISSION)).toBe(false);
    expect(permissionGranted(null, RCLTP_HEAD_PERMISSION)).toBe(false);
    expect(permissionGranted('nope', RCLTP_HEAD_PERMISSION)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveRcltpNotifyTargets — decisions 2 and 3
// ---------------------------------------------------------------------------
describe('resolveRcltpNotifyTargets', () => {
  it('decision 2 — tells the head when the school has one', async () => {
    const { admin, calls } = makeAdmin({
      custom_roles: () => ({ data: [HEAD_ROLE, OTHER_ROLE], error: null }),
      user_roles: () => ({ data: [{ user_id: 'head-1' }], error: null }),
      profiles: (f) =>
        f['in:id']
          ? { data: [{ id: 'head-1', is_super_admin: false }], error: null }
          : { data: [], error: null },
    });

    const result = await resolveRcltpNotifyTargets(admin, { institutionId: 'inst-1' });
    expect(result.via).toBe('head');
    expect(result.userIds).toEqual(['head-1']);
    expect(result.institutionId).toBe('inst-1');

    // Scoped to the asking institution, and only active profiles.
    const headScan = calls.find((c) => c.table === 'profiles' && c.filters['in:id']);
    expect(headScan?.filters['eq:institution_id']).toBe('inst-1');
    expect(headScan?.filters['eq:is_active']).toBe(true);

    // Roles are matched by permission, never by role name.
    expect(calls.find((c) => c.table === 'user_roles')?.filters['in:role_id']).toEqual([
      'role-head',
    ]);
  });

  it('also finds a head wired through the legacy profiles.role column', async () => {
    const { admin } = makeAdmin({
      custom_roles: () => ({ data: [HEAD_ROLE], error: null }),
      user_roles: () => ({ data: [], error: null }),
      profiles: (f) =>
        f['in:role']
          ? { data: [{ id: 'legacy-head', is_super_admin: null }], error: null }
          : { data: [], error: null },
    });

    const result = await resolveRcltpNotifyTargets(admin, { institutionId: 'inst-1' });
    expect(result.via).toBe('head');
    expect(result.userIds).toEqual(['legacy-head']);
  });

  it('decision 3 — falls back to administrators when the school has no active head', async () => {
    const { admin } = makeAdmin({
      custom_roles: () => ({ data: [HEAD_ROLE], error: null }),
      user_roles: () => ({ data: [{ user_id: 'head-1' }], error: null }),
      profiles: (f) =>
        f['eq:is_super_admin'] === true
          ? { data: [{ id: 'admin-1' }, { id: 'admin-2' }], error: null }
          : { data: [], error: null },
    });

    const result = await resolveRcltpNotifyTargets(admin, { institutionId: 'inst-1' });
    expect(result.via).toBe('admin_fallback');
    expect(result.userIds).toEqual(['admin-1', 'admin-2']);
    expect(result.institutionId).toBe('inst-1');
  });

  it('decision 3 — global material with no owning school goes to administrators', async () => {
    const { admin, calls } = makeAdmin({
      profiles: () => ({ data: [{ id: 'admin-1' }], error: null }),
    });

    const result = await resolveRcltpNotifyTargets(admin, { institutionId: null });
    expect(result.via).toBe('admin_fallback');
    expect(result.userIds).toEqual(['admin-1']);
    expect(result.institutionId).toBeNull();
    // No head lookup is attempted when nothing owns the material.
    expect(calls.some((c) => c.table === 'custom_roles')).toBe(false);
  });

  it('never counts a super admin as the school head', async () => {
    const { admin } = makeAdmin({
      custom_roles: () => ({ data: [HEAD_ROLE], error: null }),
      user_roles: () => ({ data: [{ user_id: 'sa-1' }], error: null }),
      // The same account answers both head scans (user_roles and the legacy
      // profiles.role column) and the administrator fallback.
      profiles: (f) =>
        f['in:id'] || f['in:role']
          ? { data: [{ id: 'sa-1', is_super_admin: true }], error: null }
          : { data: [{ id: 'sa-1' }], error: null },
    });

    const result = await resolveRcltpNotifyTargets(admin, { institutionId: 'inst-1' });
    expect(result.via).toBe('admin_fallback');
    expect(result.userIds).toEqual(['sa-1']);
  });

  it('never stays silent — a failed head read still reaches administrators', async () => {
    const { admin } = makeAdmin({
      custom_roles: () => ({ data: null, error: { message: 'boom' } }),
      profiles: () => ({ data: [{ id: 'admin-1' }], error: null }),
    });

    const result = await resolveRcltpNotifyTargets(admin, { institutionId: 'inst-1' });
    expect(result.via).toBe('admin_fallback');
    expect(result.userIds).toEqual(['admin-1']);
  });

  it('reports an empty recipient set rather than throwing', async () => {
    const { admin } = makeAdmin({
      custom_roles: () => ({ data: [], error: null }),
      profiles: () => ({ data: [], error: null }),
    });

    const result = await resolveRcltpNotifyTargets(admin, { institutionId: 'inst-1' });
    expect(result.via).toBe('admin_fallback');
    expect(result.userIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// resolveRcltpProgrammeInstitutionId — which school the empty-night notice is about
// ---------------------------------------------------------------------------
describe('resolveRcltpProgrammeInstitutionId', () => {
  it('returns the institution of the most recent active passage', async () => {
    const { admin, calls } = makeAdmin({
      rcltp_passages: () => ({ data: [{ institution_id: 'inst-9' }], error: null }),
    });
    await expect(resolveRcltpProgrammeInstitutionId(admin)).resolves.toBe('inst-9');
    expect(calls[0]?.filters['eq:is_active']).toBe(true);
    expect(calls[0]?.filters['not:institution_id:is']).toBeNull();
  });

  it('returns null when no school has any reading material yet', async () => {
    const { admin } = makeAdmin({ rcltp_passages: () => ({ data: [], error: null }) });
    await expect(resolveRcltpProgrammeInstitutionId(admin)).resolves.toBeNull();
  });

  it('returns null on a read failure instead of throwing', async () => {
    const { admin } = makeAdmin({
      rcltp_passages: () => ({ data: null, error: { message: 'boom' } }),
    });
    await expect(resolveRcltpProgrammeInstitutionId(admin)).resolves.toBeNull();
  });
});
