// __tests__/instasolver/scan-page.test.tsx
// ============================================================================
// Director ruling (1 Oct 2026): a room without a sticker is reported through
// the normal InstaSolver broken-thing form, where the reporter picks the room.
// The scan page's not-found card must link straight to it.
// ============================================================================

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUser = vi.fn();
const loadResourceByToken = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
  createServiceRoleClient: () => ({}),
}));

vi.mock('@/lib/instasolver/resource-report', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instasolver/resource-report')>();
  return { ...actual, loadResourceByToken: (...a: unknown[]) => loadResourceByToken(...a) };
});

vi.mock('@/components/layout/content-layout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/navigation', () => ({ PageBreadcrumb: () => null }));
vi.mock('@/app/(routes)/instasolver/r/[token]/_components/scan-report-client', () => ({
  ScanReportClient: () => null,
}));

const TOKEN = 'res_0123456789abcdef0123456789abcdef';

async function render(token: string) {
  const { default: Page } = await import('@/app/(routes)/instasolver/r/[token]/page');
  const el = await Page({ params: Promise.resolve({ token }) });
  return renderToStaticMarkup(el);
}

describe('scan page — a sticker that leads nowhere points to the normal broken-thing form', () => {
  beforeEach(() => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    loadResourceByToken.mockReset();
  });

  it('the not-found card links to /instasolver/broken', async () => {
    loadResourceByToken.mockResolvedValue(null);
    const html = await render(TOKEN);
    expect(html).toContain('This sticker is not linked to a room or item any more');
    expect(html).toContain('href="/instasolver/broken"');
    expect(html).toContain('No sticker here? Report it from InstaSolver');
  });

  it('a code that is not a sticker code links there too', async () => {
    const html = await render('not-a-token');
    expect(html).toContain('href="/instasolver/broken"');
  });

  it('a signed-out visitor is told to sign in, not sent to the form', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const html = await render(TOKEN);
    expect(html).toContain('You are not signed in');
    expect(html).not.toContain('href="/instasolver/broken"');
  });
});
