// @vitest-environment jsdom
/**
 * What's New — the rendered page.
 *
 * The one thing nothing else proves: that role scoping actually REMOVES entries
 * from what a reader sees. canSeeModule is unit-tested next door, but until this
 * file existed there was no test that its verdict reached the screen — the whole
 * feature could have rendered every entry to everyone and the suite stayed green.
 *
 * usePermissions is mocked (it queries Supabase); fetch is stubbed with a small
 * fixture rather than the real 700 KB payload, so these assertions do not move
 * when the changelog regenerates.
 */
import '@testing-library/jest-dom';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest';

const permissionsMock = vi.hoisted(() => ({
  current: { permissions: {} as Record<string, boolean>, isSuperAdmin: false, isLoading: false },
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => permissionsMock.current,
}));

import { WhatsNewView } from '@/components/changelog/whats-new-view';

const META = {
  generatedAt: '2026-09-06',
  ref: 'jicate/main',
  total: 3,
  first: '2026-09-01',
  latest: '2026-09-02',
  months: ['2026-09'],
  recentFrom: '2026-06-08',
  recentCount: 3,
  archiveCount: 0,
  contributors: [{ name: 'Boobalan', count: 2 }, { name: 'Janani', count: 1 }],
  modules: {
    billing: { label: 'Billing', perm: 'billing', href: '/billing' },
    hr: { label: 'HR', perm: 'hr', href: '/hr' },
    platform: { label: 'Platform', perm: null, href: null },
  },
};

const RECENT = [
  // `l` is the screen the change happened on. Present on the first entry,
  // absent on the other two — which is the real distribution: roughly a quarter
  // of entries carry one and the rest fall back to their module.
  { h: 'aaa1111', d: '2026-09-02', t: 'fixed', m: 'billing', s: 'A receipt total ignored the discount', a: 'Boobalan', l: '/billing/receipts/adjustments' },
  { h: 'bbb2222', d: '2026-09-02', t: 'new', m: 'hr', s: 'Bulk import for employee records', a: 'Janani' },
  // platform has no href of its own, so this one can link nowhere at all.
  { h: 'ccc3333', d: '2026-09-01', t: 'new', m: 'platform', s: 'Sign-in remembers your last screen', a: 'Boobalan' },
];

beforeEach(() => {
  permissionsMock.current = { permissions: {}, isSuperAdmin: false, isLoading: false };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve({
        // `ok` is load-bearing, not decoration: the hook refuses to parse a
        // non-2xx body. A stub without it does not resemble any real response.
        ok: true,
        status: 200,
        json: () => Promise.resolve(url.includes('part=meta') ? META : RECENT),
      } as Response)
    )
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('WhatsNewView — role scoping reaches the screen', () => {
  it('hides entries for modules the reader holds no permission in', async () => {
    // Holds a Billing permission and nothing else.
    permissionsMock.current = {
      permissions: { 'billing.receipts.view': true },
      isSuperAdmin: false,
      isLoading: false,
    };
    render(<WhatsNewView />);

    await waitFor(() =>
      expect(screen.getByText('A receipt total ignored the discount')).toBeInTheDocument()
    );
    // The HR entry must not be on the page at all — not merely dimmed.
    expect(screen.queryByText('Bulk import for employee records')).not.toBeInTheDocument();
    // Platform entries carry no permission, so everyone signed in sees them.
    expect(screen.getByText('Sign-in remembers your last screen')).toBeInTheDocument();
  });

  it('shows everything to a super admin', async () => {
    permissionsMock.current = { permissions: {}, isSuperAdmin: true, isLoading: false };
    render(<WhatsNewView />);

    await waitFor(() =>
      expect(screen.getByText('A receipt total ignored the discount')).toBeInTheDocument()
    );
    expect(screen.getByText('Bulk import for employee records')).toBeInTheDocument();
    expect(screen.getByText('Sign-in remembers your last screen')).toBeInTheDocument();
  });

  it('shows only platform entries to a reader with no permissions at all', async () => {
    render(<WhatsNewView />);

    await waitFor(() =>
      expect(screen.getByText('Sign-in remembers your last screen')).toBeInTheDocument()
    );
    expect(screen.queryByText('A receipt total ignored the discount')).not.toBeInTheDocument();
    expect(screen.queryByText('Bulk import for employee records')).not.toBeInTheDocument();
  });
});

describe('WhatsNewView — filters', () => {
  beforeEach(() => {
    permissionsMock.current = { permissions: {}, isSuperAdmin: true, isLoading: false };
  });

  it('the type chips narrow the list and report which is active', async () => {
    render(<WhatsNewView />);
    await waitFor(() =>
      expect(screen.getByText('A receipt total ignored the discount')).toBeInTheDocument()
    );

    const fixed = screen.getByRole('button', { name: 'Fixed' });
    expect(fixed).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(fixed);

    expect(fixed).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('A receipt total ignored the discount')).toBeInTheDocument();
    expect(screen.queryByText('Bulk import for employee records')).not.toBeInTheDocument();
  });

  it('search matches the change text', async () => {
    render(<WhatsNewView />);
    await waitFor(() =>
      expect(screen.getByText('A receipt total ignored the discount')).toBeInTheDocument()
    );

    fireEvent.change(screen.getByLabelText('Search changes'), { target: { value: 'bulk import' } });

    expect(screen.getByText('Bulk import for employee records')).toBeInTheDocument();
    expect(screen.queryByText('A receipt total ignored the discount')).not.toBeInTheDocument();
  });

  it('says so plainly when nothing matches', async () => {
    render(<WhatsNewView />);
    await waitFor(() =>
      expect(screen.getByText('A receipt total ignored the discount')).toBeInTheDocument()
    );

    fireEvent.change(screen.getByLabelText('Search changes'), {
      target: { value: 'zzz-no-such-change' },
    });

    expect(screen.getByText('No changes match that')).toBeInTheDocument();
  });
});

/**
 * The credits are a filter.
 *
 * Boobalan shipped two of the three fixture entries (one `fixed` in billing,
 * one `new` in platform) and Janani the third (`new` in hr) — so one name
 * narrows the list, and a name crossed with a kind narrows it further, without
 * the fixture needing to grow.
 *
 * The chip's accessible name is "<name> <count> changes": the initials circle
 * and the bare number are aria-hidden and the sr-only count spells it out.
 */
describe('WhatsNewView — picking a contributor', () => {
  beforeEach(() => {
    permissionsMock.current = { permissions: {}, isSuperAdmin: true, isLoading: false };
  });

  // `\s` not `\b`: the separator between the name and its count is the point of
  // the assertion. A button's accessible name is its contents joined, and
  // inline spans join with nothing between, so without the deliberate space in
  // the sr-only count this resolves to "Boobalan2 changes" — announced as one
  // word. The <span> these chips used to be had no computed name at all, so
  // nothing caught it until they became buttons.
  const chip = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}\\s`) });

  it('narrows the list to that person and reports itself pressed', async () => {
    render(<WhatsNewView />);
    await waitFor(() =>
      expect(screen.getByText('A receipt total ignored the discount')).toBeInTheDocument()
    );

    const boobalan = chip('Boobalan');
    expect(boobalan).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(boobalan);

    expect(boobalan).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('A receipt total ignored the discount')).toBeInTheDocument();
    expect(screen.getByText('Sign-in remembers your last screen')).toBeInTheDocument();
    expect(screen.queryByText('Bulk import for employee records')).not.toBeInTheDocument();
  });

  it('clears the filter when the same name is tapped again', async () => {
    render(<WhatsNewView />);
    await waitFor(() =>
      expect(screen.getByText('A receipt total ignored the discount')).toBeInTheDocument()
    );

    fireEvent.click(chip('Boobalan'));
    expect(screen.queryByText('Bulk import for employee records')).not.toBeInTheDocument();

    fireEvent.click(chip('Boobalan'));
    expect(chip('Boobalan')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Bulk import for employee records')).toBeInTheDocument();
  });

  it('switches rather than adds when a different name is tapped', async () => {
    render(<WhatsNewView />);
    await waitFor(() =>
      expect(screen.getByText('A receipt total ignored the discount')).toBeInTheDocument()
    );

    fireEvent.click(chip('Boobalan'));
    fireEvent.click(chip('Janani'));

    expect(chip('Boobalan')).toHaveAttribute('aria-pressed', 'false');
    expect(chip('Janani')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Bulk import for employee records')).toBeInTheDocument();
    expect(screen.queryByText('A receipt total ignored the discount')).not.toBeInTheDocument();
    expect(screen.queryByText('Sign-in remembers your last screen')).not.toBeInTheDocument();
  });

  it('composes with the kind filter instead of replacing it', async () => {
    render(<WhatsNewView />);
    await waitFor(() =>
      expect(screen.getByText('A receipt total ignored the discount')).toBeInTheDocument()
    );

    fireEvent.click(chip('Boobalan'));
    fireEvent.click(screen.getByRole('button', { name: 'New' }));

    // Boobalan's `new` one survives; his `fixed` one and Janani's `new` one do not.
    expect(screen.getByText('Sign-in remembers your last screen')).toBeInTheDocument();
    expect(screen.queryByText('A receipt total ignored the discount')).not.toBeInTheDocument();
    expect(screen.queryByText('Bulk import for employee records')).not.toBeInTheDocument();
  });

  it('counts the whole visible set, so a chip promises what picking it shows', async () => {
    render(<WhatsNewView />);
    await waitFor(() =>
      expect(screen.getByText('A receipt total ignored the discount')).toBeInTheDocument()
    );

    // Boobalan's chip says 2 before the filter, and must still say 2 after it —
    // a count that moved with the filter would advertise a number the list
    // below then contradicts.
    expect(chip('Boobalan')).toHaveAccessibleName('Boobalan 2 changes');
    fireEvent.click(chip('Boobalan'));
    expect(chip('Boobalan')).toHaveAccessibleName('Boobalan 2 changes');
    expect(chip('Janani')).toHaveAccessibleName('Janani 1 change');
  });

  it('names the person when the other filters leave them with nothing', async () => {
    render(<WhatsNewView />);
    await waitFor(() =>
      expect(screen.getByText('A receipt total ignored the discount')).toBeInTheDocument()
    );

    // Janani shipped nothing that was a fix, so this pair is genuinely empty.
    fireEvent.click(chip('Janani'));
    fireEvent.click(screen.getByRole('button', { name: 'Fixed' }));

    expect(screen.getByText('No changes match that')).toBeInTheDocument();
    expect(
      screen.getByText(/Janani has changes, but none that also match the other filters/)
    ).toBeInTheDocument();
  });
});

describe('WhatsNewView — a failed request', () => {
  it('shows the error card instead of crashing on a non-2xx', async () => {
    // The regression this guards: the hook used to call .json() without checking
    // the status, so an error body like { error: 'Unauthorized' } became `meta`.
    // It is an object, so it passed the `if (!meta)` guard, and reading
    // meta.modules on undefined threw during render — the app's generic crash
    // page, not this feature's own "could not be loaded" card. The route can
    // genuinely 500 now (it reads a table that a deploy might precede), so this
    // path is reachable in production, not hypothetical.
    permissionsMock.current = { permissions: {}, isSuperAdmin: true, isLoading: false };
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: 'Internal Server Error' }),
        } as Response)
      )
    );

    render(<WhatsNewView />);

    await waitFor(() =>
      expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument()
    );
  });
});

describe("WhatsNewView — a failed archive must not take the page with it", () => {
  /** meta that advertises an archive, so the "show earlier" control renders. */
  const META_WITH_ARCHIVE = { ...META, archiveCount: 4 };

  const ARCHIVE = [
    { h: 'ddd4444', d: '2026-05-30', t: 'fixed', m: 'billing', s: 'An older billing fix', a: 'Boobalan' },
  ];

  /** meta + recent always succeed; the archive fails until `failArchive` flips. */
  function stubFetch(state: { failArchive: boolean }) {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('part=archive')) {
          return state.failArchive
            ? Promise.resolve({
                ok: false,
                status: 500,
                json: () => Promise.resolve({ error: 'Internal Server Error' }),
              } as Response)
            : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(ARCHIVE) } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(url.includes('part=meta') ? META_WITH_ARCHIVE : RECENT),
        } as Response);
      })
    );
  }

  beforeEach(() => {
    permissionsMock.current = { permissions: {}, isSuperAdmin: true, isLoading: false };
  });

  it('keeps the entries that DID load when the archive fetch fails', async () => {
    // The regression, and it is a page-destroying one: the archive's catch wrote
    // the same `error` field the initial load uses, and the view early-returns on
    // `error`. So a reader who had the last 90 days on screen, filtered and
    // scrolled, clicked "show earlier", and watched all of it be replaced by a
    // card about the entries they did not have. The half that worked was thrown
    // away to report the half that did not.
    stubFetch({ failArchive: true });
    render(<WhatsNewView />);

    await waitFor(() =>
      expect(screen.getByText('A receipt total ignored the discount')).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /show changes before/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    // The whole point: still there, alongside the warning.
    expect(screen.getByText('A receipt total ignored the discount')).toBeInTheDocument();
    expect(screen.getByText('Bulk import for employee records')).toBeInTheDocument();
    expect(screen.getByText('Sign-in remembers your last screen')).toBeInTheDocument();
  });

  it('offers a retry that actually re-fetches, rather than telling the reader to refresh', async () => {
    // The second half of the bug. The catch left the in-flight latch set and
    // `wantArchive` true, so the control was permanently disabled and a second
    // click changed no effect dependency — nothing could re-run. The advice was
    // "Please refresh", which discards and re-fetches the half that succeeded.
    const state = { failArchive: true };
    stubFetch(state);
    render(<WhatsNewView />);

    await waitFor(() =>
      expect(screen.getByText('A receipt total ignored the discount')).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /show changes before/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    const retry = screen.getByRole('button', { name: /try again/i });
    expect(retry).not.toBeDisabled();

    state.failArchive = false;
    fireEvent.click(retry);

    await waitFor(() => expect(screen.getByText('An older billing fix')).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('WhatsNewView — every entry is a way in', () => {
  /**
   * The Director's complaint, 2026-09-13: "a normal user by reading what is
   * there in the what's new page will not be able to see where that change has
   * happened unless if there is some link to be clickable which takes him
   * directly to the page." Before this the whole list rendered ONE link, and
   * only once the reader had already filtered to a module.
   *
   * The three states below are the feature. The third — no link at all — is the
   * one worth pinning: a dead `#` would take focus, take a tap, and teach the
   * reader that the links on this page do not work.
   */
  beforeEach(() => {
    permissionsMock.current = { permissions: {}, isSuperAdmin: true, isLoading: false };
  });

  it('sends an entry with its own screen straight to that screen', async () => {
    render(<WhatsNewView />);
    await waitFor(() =>
      expect(screen.getByText('A receipt total ignored the discount')).toBeInTheDocument()
    );

    // Named after its own change, so sixty of these are distinguishable in a
    // screen reader's link list rather than sixty identical "Open this page".
    const link = screen.getByRole('link', {
      name: /Open this page: A receipt total ignored the discount/i,
    });
    expect(link).toHaveAttribute('href', '/billing/receipts/adjustments');
  });

  it('falls back to the module when the change has no single screen', async () => {
    render(<WhatsNewView />);
    await waitFor(() =>
      expect(screen.getByText('Bulk import for employee records')).toBeInTheDocument()
    );

    // Worded differently on purpose: "Open HR" promises the area, "Open this
    // page" promises the screen. A reader can tell which before spending a tap.
    const link = screen.getByRole('link', {
      name: /Open HR: Bulk import for employee records/i,
    });
    expect(link).toHaveAttribute('href', '/hr');
  });

  it('renders no link at all when neither the entry nor its module has one', async () => {
    render(<WhatsNewView />);
    await waitFor(() =>
      expect(screen.getByText('Sign-in remembers your last screen')).toBeInTheDocument()
    );

    expect(
      screen.queryByRole('link', { name: /Sign-in remembers your last screen/i })
    ).not.toBeInTheDocument();
    // And specifically not a dead anchor pointing at itself.
    const dead = screen.queryAllByRole('link').filter((a) => {
      const href = a.getAttribute('href');
      return href === '#' || href === '' || href === null;
    });
    expect(dead).toEqual([]);
  });
});

describe('WhatsNewView — a link the reader cannot open is not shown', () => {
  /**
   * The Director's ruling, 2026-09-13 (edge case 3): a link to a page someone
   * cannot open is HIDDEN for them. "No dead ends."
   *
   * It was not implemented, and the failure was verified in a real browser on
   * production on 2026-09-14 as three roles:
   *   • superadmin  → "Open this page" on a Foundation entry landed on
   *     /cdc/admin/exam-topic-map and worked.
   *   • a learner   → the SAME row, the same link → "Access Denied — Required
   *     Permission: cdc.training.edit".
   *   • faculty     → an Admission entry's link → "None of your roles include
   *     the permission admission.consultants.commissions.view".
   *
   * REAL PATHS AND REAL KEYS, ON PURPOSE. These four routes and their permission
   * keys are read from lib/sidebarMenuLink.ts as it ships. Inventing a fixture
   * route would leave routeMatcher matching nothing, isPageAccessible returning
   * its allow-an-unmapped-path answer, and the whole assertion vacuous.
   *
   * THE ROLE IS THE POINT. `faculty` is a BUILT-IN role. proxy.ts consults
   * MENU_PERMISSIONS only for CUSTOM primary roles, so a middleware/route-level
   * test would wave faculty through every one of these paths and prove nothing —
   * which is exactly why this gate is built on isPageAccessible, the rule the
   * PAGE itself applies, and why this test drives it as faculty rather than as a
   * custom role.
   */
  const GATED_META = {
    ...META,
    total: 2,
    recentCount: 2,
    modules: {
      cdc: { label: 'CDC', perm: 'cdc', href: '/cdc' },
      admission: { label: 'Admission', perm: 'admission', href: '/admission' },
    },
  };

  const CDC_SUBJECT = 'The exam topic map gained a Foundation column';
  const ADMISSION_SUBJECT = 'Orphaned attributions are listed for review';

  const GATED_RECENT = [
    // Module cdc (visible on any cdc.* key); screen gated by cdc.training.edit.
    { h: 'ccc0001', d: '2026-09-02', t: 'new', m: 'cdc', s: CDC_SUBJECT, a: 'Boobalan', l: '/cdc/admin/exam-topic-map' },
    // Module admission; screen gated by admission.consultants.commissions.view,
    // and the module's own landing page gated by admission.dashboard.view.
    { h: 'aaa0002', d: '2026-09-02', t: 'fixed', m: 'admission', s: ADMISSION_SUBJECT, a: 'Janani', l: '/admission/consultants/attribution-orphans' },
  ];

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(url.includes('part=meta') ? GATED_META : GATED_RECENT),
        } as Response)
      )
    );
  });

  it('gives a BUILT-IN role the module link instead of a screen it would be refused', async () => {
    permissionsMock.current = {
      permissions: {
        // Enough to receive CDC news and to open /cdc — and deliberately NOT
        // cdc.training.edit, which is what /cdc/admin/exam-topic-map demands.
        'cdc.view': true,
      },
      isSuperAdmin: false,
      isLoading: false,
      // A built-in role, not a custom one. See the block comment above.
      userProfile: { role: 'faculty' },
    } as typeof permissionsMock.current;

    render(<WhatsNewView />);
    await waitFor(() => expect(screen.getByText(CDC_SUBJECT)).toBeInTheDocument());

    // The exact screen is gone…
    expect(
      screen.queryByRole('link', { name: new RegExp(`Open this page: ${CDC_SUBJECT}`, 'i') })
    ).not.toBeInTheDocument();
    // …replaced by the area, which this reader really can open.
    const link = screen.getByRole('link', {
      name: new RegExp(`Open CDC: ${CDC_SUBJECT}`, 'i'),
    });
    expect(link).toHaveAttribute('href', '/cdc');
    // Belt and braces: the denied path is nowhere in the document, under any
    // wording. A regex on the accessible name would miss a second anchor.
    expect(screen.queryAllByRole('link').map((a) => a.getAttribute('href'))).not.toContain(
      '/cdc/admin/exam-topic-map'
    );
  });

  it('shows NO link when the module landing page is closed to the reader too', async () => {
    permissionsMock.current = {
      permissions: {
        // Admission news reaches anyone holding any admission.* key. This reader
        // holds one — and holds neither the screen's key nor the module landing
        // page's admission.dashboard.view. The fallback must be re-tested, not
        // assumed, or this row simply moves the wall one click closer.
        'admission.leads.view': true,
      },
      isSuperAdmin: false,
      isLoading: false,
      userProfile: { role: 'faculty' },
    } as typeof permissionsMock.current;

    render(<WhatsNewView />);
    await waitFor(() => expect(screen.getByText(ADMISSION_SUBJECT)).toBeInTheDocument());

    // The row is still there — the reader is entitled to KNOW the change shipped.
    // It just stops offering a door that would be shut in their face.
    expect(
      screen.queryByRole('link', { name: new RegExp(ADMISSION_SUBJECT, 'i') })
    ).not.toBeInTheDocument();
    expect(screen.queryAllByRole('link').map((a) => a.getAttribute('href'))).not.toContain(
      '/admission/consultants/attribution-orphans'
    );
  });

  it('still sends a super admin to the exact screen', async () => {
    // The other half of the ruling: hiding links must not cost the people who
    // can open them. Nothing about the reported behaviour for superadmin changes.
    permissionsMock.current = {
      permissions: {},
      isSuperAdmin: true,
      isLoading: false,
      userProfile: { role: 'super_admin' },
    } as typeof permissionsMock.current;

    render(<WhatsNewView />);
    await waitFor(() => expect(screen.getByText(CDC_SUBJECT)).toBeInTheDocument());

    expect(
      screen.getByRole('link', { name: new RegExp(`Open this page: ${CDC_SUBJECT}`, 'i') })
    ).toHaveAttribute('href', '/cdc/admin/exam-topic-map');
    expect(
      screen.getByRole('link', { name: new RegExp(`Open this page: ${ADMISSION_SUBJECT}`, 'i') })
    ).toHaveAttribute('href', '/admission/consultants/attribution-orphans');
  });
});
