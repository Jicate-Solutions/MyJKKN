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

  // -------------------------------------------------------------------------
  // The filter must answer the SAME question as the sweep it reports on.
  // findCandidatePassages() looks at is_active AND status='approved' AND
  // language='en'; anything looser names a different school.
  // -------------------------------------------------------------------------
  describe('agrees with the sweep about which passages count', () => {
    // Newest first. The draft was typed most recently — which is exactly what
    // the empty-night notice tells people to go and do — and it belongs to a
    // DIFFERENT school from the one whose approved English bank is in drought.
    const BANK = [
      {
        institution_id: 'other-school',
        is_active: true,
        status: 'draft',
        language: 'en',
        created_at: '2026-07-30',
      },
      {
        institution_id: 'other-school',
        is_active: true,
        status: 'approved',
        language: 'ta',
        created_at: '2026-07-29',
      },
      {
        institution_id: 'school-in-drought',
        is_active: true,
        status: 'approved',
        language: 'en',
        created_at: '2026-07-01',
      },
    ];

    /** Applies the eq filters the resolver actually sent, newest first. */
    function bankHandler(filters: Record<string, unknown>) {
      const rows = BANK.filter(
        (r) =>
          (filters['eq:is_active'] === undefined || r.is_active === filters['eq:is_active']) &&
          (filters['eq:status'] === undefined || r.status === filters['eq:status']) &&
          (filters['eq:language'] === undefined || r.language === filters['eq:language']) &&
          r.institution_id !== null,
      ).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      return { data: rows, error: null };
    }

    it("a newer DRAFT at another school does not steal the notice", async () => {
      const { admin } = makeAdmin({ rcltp_passages: bankHandler });
      await expect(resolveRcltpProgrammeInstitutionId(admin)).resolves.toBe('school-in-drought');
    });

    it('sends the same three filters the sweep uses', async () => {
      const { admin, calls } = makeAdmin({ rcltp_passages: bankHandler });
      await resolveRcltpProgrammeInstitutionId(admin);
      expect(calls[0]?.filters['eq:is_active']).toBe(true);
      expect(calls[0]?.filters['eq:status']).toBe('approved');
      expect(calls[0]?.filters['eq:language']).toBe('en');
      expect(calls[0]?.filters['not:institution_id:is']).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Scale — PostgREST puts .in() values in the query string, so an unchunked
// candidate list makes the request URL too long and the read fails outright
// (fetch failed). Because every read here logs and continues, that failure is
// SILENT: heads resolve empty and every notice falls to administrators while
// reporting a clean fallback. A 5-id test cannot see any of this.
// ---------------------------------------------------------------------------
describe('resolveRcltpNotifyTargets at production scale', () => {
  const IN_FILTER_CHUNK = 150;
  const CANDIDATES = Array.from({ length: 515 }, (_, i) => `user-${String(i).padStart(3, '0')}`);
  // Heads deliberately spread across every chunk boundary, including the last
  // short one, so dropping any chunk changes the answer.
  const HEADS_AT_INSTITUTION = new Set([
    CANDIDATES[0],
    CANDIDATES[149],
    CANDIDATES[150],
    CANDIDATES[300],
    CANDIDATES[514],
  ]);

  it('completes, chunks every .in(), and merges all 515 candidates without dropping one', async () => {
    const { admin, calls } = makeAdmin({
      custom_roles: () => ({ data: [HEAD_ROLE, OTHER_ROLE], error: null }),
      user_roles: () => ({
        data: CANDIDATES.map((id) => ({ user_id: id })),
        error: null,
      }),
      profiles: (f) => {
        const ids = f['in:id'] as string[] | undefined;
        if (ids) {
          return {
            data: ids
              .filter((id) => HEADS_AT_INSTITUTION.has(id))
              .map((id) => ({ id, is_super_admin: false })),
            error: null,
          };
        }
        if (f['in:role']) {
          // The same person, wired the legacy way too — proves de-duplication
          // survives the merge.
          return { data: [{ id: CANDIDATES[0], is_super_admin: false }], error: null };
        }
        return { data: [], error: null };
      },
    });

    const result = await resolveRcltpNotifyTargets(admin, { institutionId: 'inst-1' });

    expect(result.via).toBe('head');
    expect([...result.userIds].sort()).toEqual([...HEADS_AT_INSTITUTION].sort());
    expect(result.userIds.length).toBe(new Set(result.userIds).size);

    // 515 ids arrived as 4 requests, none of them over the chunk size.
    const idScans = calls.filter((c) => c.table === 'profiles' && c.filters['in:id']);
    expect(idScans.length).toBe(Math.ceil(CANDIDATES.length / IN_FILTER_CHUNK));
    for (const scan of idScans) {
      expect((scan.filters['in:id'] as string[]).length).toBeLessThanOrEqual(IN_FILTER_CHUNK);
    }
    // Every candidate was actually asked about — no silent truncation.
    const asked = idScans.flatMap((c) => c.filters['in:id'] as string[]);
    expect(asked.length).toBe(CANDIDATES.length);
    expect(new Set(asked).size).toBe(CANDIDATES.length);
  });

  it('one failed chunk does not lose the heads found in the others', async () => {
    let scan = 0;
    const { admin } = makeAdmin({
      custom_roles: () => ({ data: [HEAD_ROLE], error: null }),
      user_roles: () => ({ data: CANDIDATES.map((id) => ({ user_id: id })), error: null }),
      profiles: (f) => {
        const ids = f['in:id'] as string[] | undefined;
        if (!ids) return { data: [], error: null };
        scan++;
        if (scan === 2) return { data: null, error: { message: 'fetch failed' } };
        return {
          data: ids
            .filter((id) => HEADS_AT_INSTITUTION.has(id))
            .map((id) => ({ id, is_super_admin: false })),
          error: null,
        };
      },
    });

    const result = await resolveRcltpNotifyTargets(admin, { institutionId: 'inst-1' });
    expect(result.via).toBe('head');
    // Chunk 2 covers ids 150-299 and held CANDIDATES[150]; the rest still arrive.
    expect([...result.userIds].sort()).toEqual(
      [CANDIDATES[0], CANDIDATES[149], CANDIDATES[300], CANDIDATES[514]].sort(),
    );
  });
});
