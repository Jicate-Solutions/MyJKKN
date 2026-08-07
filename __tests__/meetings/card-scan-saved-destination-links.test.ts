import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// "Scanned Contacts" told the viewer "Only viewable here" for five of the nine
// destinations a card can land in. Three of those five DID have a full module
// page — they were invisible only because TABLE_HREF did not name them.
//
// This pins the outcome, not the row counts: production counts drift (nine
// panes write that database), so every assertion below is about the
// RELATIONSHIP between the map and the response — a linked destination must
// carry a usable href AND report only_view_here === false, and a genuinely
// screenless one must report only_view_here === true and no href. That holds
// whether the group has one card in it or a thousand.
//
// The mock supabase client is the whole environment: this route reads exactly
// one table with the session client, so nothing else needs standing in.
// ---------------------------------------------------------------------------

const getUser = vi.fn();
const limit = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser },
    from: () => ({
      select: () => ({
        order: () => ({ limit }),
      }),
    }),
  }),
}));

const { GET, TABLE_HREF, TABLE_LABEL } = await import('@/app/api/contacts/card-scan/saved/route');

/** A confirmed card that was successfully filed into `table`. */
function routedRow(table: string, jobId: string) {
  return {
    job_id: jobId,
    final_fields: { name: 'A Person', organization: 'Some Firm', mobile: '9843041971' },
    routed_to: null,
    event_label: null,
    routed_table: table,
    routed_row_id: '00000000-0000-0000-0000-000000000001',
    routing_status: 'routed',
    pending_parent: null,
    missing_fields: [],
    routing_error: null,
    networker_contact_id: null,
    created_at: '2026-08-07T09:00:00.000Z',
  };
}

/** Every destination that can appear as a group, one card each. */
const ALL_DESTINATIONS = Object.keys(TABLE_LABEL);

beforeEach(() => {
  getUser.mockReset();
  limit.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
  limit.mockResolvedValue({
    data: ALL_DESTINATIONS.map((t, i) => routedRow(t, `job-${i}`)),
    error: null,
  });
});

async function groupsByTable() {
  const res = await GET();
  const body = (await res.json()) as {
    ok: boolean;
    groups: {
      table: string;
      label: string;
      href: string | null;
      only_view_here: boolean;
      count: number;
      people: { job_id: string }[];
    }[];
  };
  expect(body.ok).toBe(true);
  return new Map(body.groups.map((g) => [g.table, g]));
}

describe('scanned-contacts destination links', () => {
  // The two this change wires up. Both were reachable module pages all along.
  it.each([
    ['sh_prospects', '/solutions/pipeline/list'],
    ['ss_mentors', '/startup-studio/mentors'],
  ])('%s links to its module page instead of saying "only viewable here"', async (table, href) => {
    const groups = await groupsByTable();
    const g = groups.get(table)!;

    expect(g.href).toBe(href);
    expect(g.only_view_here).toBe(false);
  });

  // The three that genuinely have nowhere to go. `ims_suppliers` is the
  // interesting one: /ims/settings/suppliers exists, but its declared
  // permission has no holder who can also scan a card, so linking it would
  // hand most scanners a page they are refused. Not linking is the honest
  // answer, and this test is what stops someone "fixing" it back.
  it.each(['ims_suppliers', 'internship_site_contacts', 'industry_partners'])(
    '%s still reports only_view_here, because it has no screen this viewer can open',
    async (table) => {
      const groups = await groupsByTable();
      const g = groups.get(table)!;

      expect(g.href).toBeNull();
      expect(g.only_view_here).toBe(true);
    },
  );

  it('never reports only_view_here and an href at the same time', async () => {
    const groups = await groupsByTable();

    for (const g of groups.values()) {
      expect(g.only_view_here).toBe(g.href === null);
    }
  });

  it('gives every destination a human label, linked or not', async () => {
    const groups = await groupsByTable();

    expect(groups.size).toBe(ALL_DESTINATIONS.length);
    for (const g of groups.values()) {
      expect(g.label).toBeTruthy();
      expect(g.label).not.toBe(g.table);
    }
  });

  it('links only to in-app paths, and only to destinations it can name', () => {
    for (const [table, href] of Object.entries(TABLE_HREF)) {
      expect(href.startsWith('/')).toBe(true);
      expect(href).not.toContain('//');
      expect(TABLE_LABEL[table]).toBeTruthy();
    }
  });

  it('calls the mentor list Startup Studio, matching the page it opens', () => {
    // `ss_` is Startup Studio; the routing picker calls it a support mentor,
    // which points the reader at a different module. A label that disagrees
    // with its own link is its own dead end.
    expect(TABLE_HREF.ss_mentors).toBe('/startup-studio/mentors');
    expect(TABLE_LABEL.ss_mentors).toMatch(/Startup Studio/i);
  });

  it('keeps a card that could not be filed out of the linked groups', async () => {
    // A pending/failed card has no module row, so it must never be counted
    // under a destination the viewer can click through to.
    limit.mockResolvedValue({
      data: [
        { ...routedRow('sh_prospects', 'job-pending'), routing_status: 'pending_parent', pending_parent: 'site' },
        routedRow('sh_prospects', 'job-ok'),
      ],
      error: null,
    });

    const groups = await groupsByTable();
    const g = groups.get('sh_prospects')!;

    expect(g.href).toBe('/solutions/pipeline/list');
    expect(g.people.map((p) => p.job_id)).toEqual(['job-ok']);
  });
});
