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
