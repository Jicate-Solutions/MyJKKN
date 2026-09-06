import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// "Scanned Contacts" told the viewer "Only viewable here" for five of the nine
// destinations a card can land in. Several of those DID have a full module page
// — they were invisible only because TABLE_HREF did not name them.
//
// The first attempt at this wired them for everybody, having checked the
// permission relation BACKWARDS: it confirmed that everyone holding
// `solutions.pipeline.view` could scan a card (holders ⊆ scanners) when the
// link is rendered TO scanners, so what must hold is scanners ⊆ holders.
// Measured on production 2026-08-07: 197 accounts can scan, ~20 held that key.
// So ~177 people were handed a link into a PermissionError page.
//
// The route therefore decides the href PER VIEWER. These tests are built around
// that: the load-bearing assertion is that the SAME destination yields an href
// for a viewer who holds its key and null for one who does not. That assertion
// can fail. The previous suite asserted `only_view_here === (href === null)`,
// which is computed from one expression on both sides and cannot fail — it was
// evidence of nothing.
//
// Nothing here asserts a live row count: production counts drift (nine panes
// write that database). Every assertion is about the relationship.
// ---------------------------------------------------------------------------

const getUser = vi.fn();
const limit = vi.fn();
const rpc = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser },
    from: () => ({ select: () => ({ order: () => ({ limit }) }) }),
    rpc,
  }),
}));

const { GET, TABLE_HREF } = await import('@/app/api/contacts/card-scan/saved/route');
const { MENU_PERMISSIONS } = await import('@/lib/sidebarMenuLink');

/** A confirmed card successfully filed into `table`. */
function routedRow(table: string, jobId: string) {
  return {
    job_id: jobId,
    final_fields: { name: 'A Person', organization: 'Some Firm', mobile: '9843041971' },
    routed_to: null,
    event_label: null,
    routed_table: table,
    routed_row_id: 'row-' + jobId,
    routing_status: 'routed',
    pending_parent: null,
    missing_fields: null,
    routing_error: null,
    networker_contact_id: 'nc-' + jobId,
    created_at: '2026-08-07T00:00:00Z',
  };
}

/**
 * Drive the route as a viewer holding exactly `heldKeys`.
 * `rpcFails` makes every permission lookup error, to exercise fail-closed.
 */
async function groupsFor(
  tables: string[],
  heldKeys: string[],
  opts: { rpcFails?: boolean } = {},
) {
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  limit.mockResolvedValue({ data: tables.map((t, i) => routedRow(t, 'j' + i)), error: null });
  rpc.mockImplementation(async (_fn: string, args: { permission_name: string }) => {
    if (opts.rpcFails) return { data: null, error: { message: 'lookup exploded' } };
    return { data: heldKeys.includes(args.permission_name), error: null };
  });

  const res = await GET();
  const json = await res.json();
  return json.groups as Array<{ table: string; href: string | null; only_view_here: boolean }>;
}

const keyFor = (table: string) => MENU_PERMISSIONS[TABLE_HREF[table]];

/** Destinations whose screen IS permission-gated — the interesting ones. */
const GATED = Object.keys(TABLE_HREF).filter((t) => !!keyFor(t));
/** Destinations whose route declares no permission at all. */
const UNGATED = Object.keys(TABLE_HREF).filter((t) => !keyFor(t));

beforeEach(() => {
  getUser.mockReset();
  limit.mockReset();
  rpc.mockReset();
});

describe('Scanned Contacts destination links', () => {
  // This is the assertion that can actually fail, and the one the previous
  // suite was missing. Data-driven off the map, so adding a destination never
  // requires editing an assertion.
  it.each(GATED)('%s links for a viewer who holds its key, and not for one who does not', async (table) => {
    const withKey = await groupsFor([table], [keyFor(table)]);
    expect(withKey[0].href).toBe(TABLE_HREF[table]);
    expect(withKey[0].only_view_here).toBe(false);

    const withoutKey = await groupsFor([table], []);
    expect(withoutKey[0].href).toBeNull();
    expect(withoutKey[0].only_view_here).toBe(true);
  });

  it('fails CLOSED when the permission lookup errors', async () => {
    // A missing link is safe; a link into a denial page is not.
    const groups = await groupsFor(GATED, GATED.map(keyFor), { rpcFails: true });
    for (const g of groups) {
      expect(g.href).toBeNull();
      expect(g.only_view_here).toBe(true);
    }
  });

  it('still links a destination whose route declares no permission', async () => {
    // Not gated by the route trie, so showing it is the status quo — silently
    // dropping a link that works today would be its own regression.
    for (const table of UNGATED) {
      const groups = await groupsFor([table], []);
      expect(groups[0].href).toBe(TABLE_HREF[table]);
    }
  });

  it('never links a destination that has no screen at all, however permissioned the viewer', async () => {
    const screenless = ['internship_site_contacts', 'industry_partners'].filter(
      (t) => !TABLE_HREF[t],
    );
    // Guard the guard: if a future PR wires one of these, this list shrinks
    // rather than the test lying.
    expect(screenless.length).toBeGreaterThan(0);

    const groups = await groupsFor(screenless, Object.values(MENU_PERMISSIONS));
    for (const g of groups) {
      expect(g.href).toBeNull();
      expect(g.only_view_here).toBe(true);
    }
  });

  it('asks the database once per distinct permission, not once per card', async () => {
    // Three cards into the same destination must not cost three lookups.
    const table = GATED[0];
    await groupsFor([table, table, table], [keyFor(table)]);
    const askedFor = rpc.mock.calls.map((c) => c[1].permission_name);
    expect(askedFor).toEqual([keyFor(table)]);
  });

  it('grants no href on the strength of a DIFFERENT destination permission', async () => {
    // Holding solutions.pipeline.view must not open the suppliers list.
    if (GATED.length < 2) return;
    const [a, b] = GATED;
    if (keyFor(a) === keyFor(b)) return;
    const groups = await groupsFor([a, b], [keyFor(a)]);
    const byTable = Object.fromEntries(groups.map((g) => [g.table, g]));
    expect(byTable[a].href).toBe(TABLE_HREF[a]);
    expect(byTable[b].href).toBeNull();
  });
});
