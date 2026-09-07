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
  { h: 'aaa1111', d: '2026-09-02', t: 'fixed', m: 'billing', s: 'A receipt total ignored the discount', a: 'Boobalan' },
  { h: 'bbb2222', d: '2026-09-02', t: 'new', m: 'hr', s: 'Bulk import for employee records', a: 'Janani' },
  { h: 'ccc3333', d: '2026-09-01', t: 'new', m: 'platform', s: 'Sign-in remembers your last screen', a: 'Boobalan' },
];

beforeEach(() => {
  permissionsMock.current = { permissions: {}, isSuperAdmin: false, isLoading: false };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve({
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
