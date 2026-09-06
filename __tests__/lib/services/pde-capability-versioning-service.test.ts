import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Single Supabase mock shared by every test. The chained query builder is
// implemented with a tiny `thenable` factory so we can wire .from().select()
// .eq().is().order().limit().maybeSingle() / .single() and also
// .insert().select().single() and .update().eq() returns.
// ---------------------------------------------------------------------------

type Result = { data: any; error: any };

function makeBuilder(result: Result) {
  const builder: any = {};
  const passthrough = () => builder;
  const settle = () => Promise.resolve(result);
  builder.select = passthrough;
  builder.eq = passthrough;
  builder.is = passthrough;
  builder.order = passthrough;
  builder.limit = passthrough;
  builder.insert = passthrough;
  builder.update = passthrough;
  builder.delete = passthrough;
  builder.maybeSingle = settle;
  builder.single = settle;
  builder.then = (resolve: (v: Result) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

const fromSpy = vi.fn<[string], any>();
const rpcMock = vi.fn(async (_fn: string, _args: any) => ({ data: null, error: null }));
const supabaseMock: any = { from: fromSpy, rpc: rpcMock };

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => Promise.resolve(supabaseMock),
}));

// Re-import after mocks (vitest hoists vi.mock).
import { PDECapabilityVersioningService } from '@/lib/services/pde-capability-versioning-service';

beforeEach(() => {
  fromSpy.mockReset();
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: null, error: null });
});

// ---------------------------------------------------------------------------
// getActiveVersion
// ---------------------------------------------------------------------------

describe('PDECapabilityVersioningService.getActiveVersion', () => {
  it('returns the active head row for a given slug', async () => {
    fromSpy.mockImplementationOnce(() =>
      makeBuilder({
        data: { id: 'cap-1', slug: 'agentic-prompting', version: 3, superseded_by: null },
        error: null,
      })
    );

    const row = await PDECapabilityVersioningService.getActiveVersion('agentic-prompting');
    expect(fromSpy).toHaveBeenCalledWith('pde_capabilities');
    expect(row).toEqual({
      id: 'cap-1',
      slug: 'agentic-prompting',
      version: 3,
      superseded_by: null,
    });
  });

  it('returns null when the slug has no rows', async () => {
    fromSpy.mockImplementationOnce(() => makeBuilder({ data: null, error: null }));
    const row = await PDECapabilityVersioningService.getActiveVersion('unknown-slug');
    expect(row).toBeNull();
  });

  it('returns null and warns when the query errors', async () => {
    fromSpy.mockImplementationOnce(() =>
      makeBuilder({ data: null, error: { message: 'boom' } })
    );
    const row = await PDECapabilityVersioningService.getActiveVersion('any');
    expect(row).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createNewVersion
// ---------------------------------------------------------------------------

describe('PDECapabilityVersioningService.createNewVersion', () => {
  it('inserts v(current+1) and points the old row at the new one', async () => {
    // read current
    fromSpy.mockImplementationOnce(() =>
      makeBuilder({
        data: {
          id: 'cap-old',
          slug: 'agentic-prompting',
          name: 'Agentic Prompting',
          description: 'desc',
          category: 'ai_fluency',
          level: 3,
          lesson_ids: null,
          prerequisite_ids: null,
          demonstration_rubric: null,
          evidence_types: null,
          finks_dimension: null,
          estimated_hours: 8,
          is_core: true,
          version: 1,
        },
        error: null,
      })
    );

    // insert new row
    fromSpy.mockImplementationOnce(() =>
      makeBuilder({
        data: {
          id: 'cap-new',
          slug: 'agentic-prompting-v2',
          version: 2,
          superseded_by: null,
        },
        error: null,
      })
    );

    // supersede pointer update
    fromSpy.mockImplementationOnce(() => makeBuilder({ data: null, error: null }));

    const newRow = await PDECapabilityVersioningService.createNewVersion({
      capabilityId: 'cap-old',
      newDef: { description: 'desc v2', valid_until: null },
    });

    expect(newRow.id).toBe('cap-new');
    expect(newRow.version).toBe(2);
    expect(newRow.slug).toBe('agentic-prompting-v2');
    expect(fromSpy).toHaveBeenCalledTimes(3);
  });

  it('throws when the base capability cannot be read', async () => {
    fromSpy.mockImplementationOnce(() =>
      makeBuilder({ data: null, error: { message: 'not found' } })
    );
    await expect(
      PDECapabilityVersioningService.createNewVersion({
        capabilityId: 'missing',
        newDef: { description: 'x' },
      })
    ).rejects.toThrow(/cannot read base capability/);
  });

  it('rolls back the insert when the supersede pointer update fails', async () => {
    fromSpy.mockImplementationOnce(() =>
      makeBuilder({
        data: {
          id: 'cap-old',
          slug: 'agentic-prompting',
          version: 1,
          name: 'X',
          description: 'Y',
          category: 'ai_fluency',
          level: 1,
        },
        error: null,
      })
    );
    fromSpy.mockImplementationOnce(() =>
      makeBuilder({
        data: { id: 'cap-new', slug: 'agentic-prompting-v2', version: 2, superseded_by: null },
        error: null,
      })
    );
    fromSpy.mockImplementationOnce(() =>
      makeBuilder({ data: null, error: { message: 'fk violation' } })
    );
    // rollback delete call
    fromSpy.mockImplementationOnce(() => makeBuilder({ data: null, error: null }));

    await expect(
      PDECapabilityVersioningService.createNewVersion({
        capabilityId: 'cap-old',
        newDef: {},
      })
    ).rejects.toThrow(/supersede-pointer update failed/);

    // we should have read+insert+update+delete = 4 calls
    expect(fromSpy).toHaveBeenCalledTimes(4);
  });
});

// ---------------------------------------------------------------------------
// listGrandfathered
// ---------------------------------------------------------------------------

describe('PDECapabilityVersioningService.listGrandfathered', () => {
  it('returns only rows whose snapshot version trails the live version', async () => {
    fromSpy.mockImplementationOnce(() =>
      makeBuilder({
        data: [
          {
            capability_id: 'cap-a',
            capability_version: 1,
            grandfathered: true,
            capability: { id: 'cap-a', slug: 'a', version: 2, superseded_by: null },
          },
          {
            capability_id: 'cap-b',
            capability_version: 1,
            grandfathered: false,
            capability: { id: 'cap-b', slug: 'b', version: 1, superseded_by: null },
          },
          {
            capability_id: 'cap-c',
            capability_version: 1,
            grandfathered: false,
            capability: { id: 'cap-c', slug: 'c', version: 1, superseded_by: 'cap-c-v2' },
          },
        ],
        error: null,
      })
    );

    const rows = await PDECapabilityVersioningService.listGrandfathered('learner-1');
    expect(rows.map((r) => r.capability_id).sort()).toEqual(['cap-a', 'cap-c']);
    expect(rows.find((r) => r.capability_id === 'cap-a')?.grandfathered).toBe(true);
    expect(rows.find((r) => r.capability_id === 'cap-c')?.grandfathered).toBe(false);
  });

  it('returns [] when the query errors', async () => {
    fromSpy.mockImplementationOnce(() =>
      makeBuilder({ data: null, error: { message: 'boom' } })
    );
    const rows = await PDECapabilityVersioningService.listGrandfathered('learner-1');
    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// resolveDisplayFor — all 3 versioning modes
// ---------------------------------------------------------------------------

describe('PDECapabilityVersioningService.resolveDisplayFor', () => {
  function wireCapabilityAndAttestation(opts: {
    capVersion: number;
    snapshotVersion: number | null;
    validUntil?: string | null;
    superseded_by?: string | null;
  }) {
    fromSpy.mockImplementationOnce(() =>
      makeBuilder({
        data: {
          id: 'cap-x',
          version: opts.capVersion,
          valid_until: opts.validUntil ?? null,
          superseded_by: opts.superseded_by ?? null,
        },
        error: null,
      })
    );
    fromSpy.mockImplementationOnce(() =>
      makeBuilder({
        data:
          opts.snapshotVersion === null
            ? null
            : { capability_version: opts.snapshotVersion, grandfathered: false },
        error: null,
      })
    );
  }

  it('grandfather_with_upgrade: stale snapshot stays valid, never expired', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { mode: 'grandfather_with_upgrade', show_version_tag: true, expire_after_years: null },
      error: null,
    });
    wireCapabilityAndAttestation({ capVersion: 3, snapshotVersion: 1 });

    const r = await PDECapabilityVersioningService.resolveDisplayFor('l-1', 'cap-x');
    expect(r.mode).toBe('grandfather_with_upgrade');
    expect(r.display_version).toBe(1);
    expect(r.expired).toBe(false);
    expect(r.show_tag).toBe(true);
  });

  it('auto_expire: stale snapshot OR past valid_until flags expired=true', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { mode: 'auto_expire', show_version_tag: true, expire_after_years: 2 },
      error: null,
    });
    wireCapabilityAndAttestation({ capVersion: 2, snapshotVersion: 1 });

    const r = await PDECapabilityVersioningService.resolveDisplayFor('l-1', 'cap-x');
    expect(r.mode).toBe('auto_expire');
    expect(r.expired).toBe(true);
    // when expired, display jumps to live version so the learner knows what to redo
    expect(r.display_version).toBe(2);
  });

  it('auto_expire: same version + future valid_until stays unexpired', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { mode: 'auto_expire', show_version_tag: false, expire_after_years: 2 },
      error: null,
    });
    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    wireCapabilityAndAttestation({
      capVersion: 1,
      snapshotVersion: 1,
      validUntil: farFuture,
    });

    const r = await PDECapabilityVersioningService.resolveDisplayFor('l-1', 'cap-x');
    expect(r.expired).toBe(false);
    expect(r.show_tag).toBe(false);
    expect(r.display_version).toBe(1);
  });

  it('version_tag_only: never expired, always shows snapshot version', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { mode: 'version_tag_only', show_version_tag: true, expire_after_years: null },
      error: null,
    });
    wireCapabilityAndAttestation({ capVersion: 5, snapshotVersion: 2 });

    const r = await PDECapabilityVersioningService.resolveDisplayFor('l-1', 'cap-x');
    expect(r.mode).toBe('version_tag_only');
    expect(r.expired).toBe(false);
    expect(r.display_version).toBe(2);
    expect(r.show_tag).toBe(true);
  });

  it('falls back gracefully when learner has no attestation row', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { mode: 'grandfather_with_upgrade', show_version_tag: true, expire_after_years: null },
      error: null,
    });
    wireCapabilityAndAttestation({ capVersion: 4, snapshotVersion: null });

    const r = await PDECapabilityVersioningService.resolveDisplayFor('l-1', 'cap-x');
    expect(r.display_version).toBe(4);
    expect(r.expired).toBe(false);
  });
});
