// @vitest-environment jsdom
// ============================================================================
// "Is this still happening?" — the second kind of reporter prompt
// (Director ruling by tap, 2026-09-16 08:45).
//
// The same box that asks "did our fix work?" now also asks, for an old
// report with no group and no fix, whether it is still happening. Same two
// answers and the same endpoint; different words, because the answer means
// something different: for a still_open prompt 'fixed' = "no, it works now"
// (the report closes) and 'not_fixed' = "yes, still happening" (it stays open).
//
// This pins the three things a wrong render would silently break:
//   1. a still_open prompt shows the "still happening?" words, never "Fixed";
//   2. tapping "No, it works now" posts answer:'fixed' — the closing answer;
//   3. a fix_check prompt is byte-for-byte unchanged (heading, buttons).
// Network is a fetch stub; no server, no database.
// ============================================================================

import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() }
}));

import { FixedForYouPrompts } from '@/app/(routes)/my-bug-reports/_components/fixed-for-you-prompts';

type Prompt = {
  id: string;
  bug_id: string;
  kind?: 'fix_check' | 'still_open';
  display_id: string;
  description: string;
  /** Already-sanitised relative path from the API; absent on older payloads. */
  href?: string | null;
  screenshot_url?: string | null;
  status: 'sent' | 'delivered' | 'answered';
  answer: 'fixed' | 'not_fixed' | null;
  expires_at: string;
};

const stillOpen: Prompt = {
  id: 'req-old',
  bug_id: 'bug-old',
  kind: 'still_open',
  display_id: 'BUG-004321',
  description: 'Attendance page shows blank list for section B',
  status: 'delivered',
  answer: null,
  expires_at: '2099-01-01T00:00:00Z'
};

const fixCheck: Prompt = {
  id: 'req-fix',
  bug_id: 'bug-fix',
  kind: 'fix_check',
  display_id: 'BUG-006001',
  description: 'Practical attendance failed to submit',
  status: 'delivered',
  answer: null,
  expires_at: '2099-01-01T00:00:00Z'
};

function stubFetch(prompts: Prompt[]) {
  const posts: { url: string; body: any }[] = [];
  const fetchMock = vi.fn(async (input: any, init?: any) => {
    const url = String(input);
    if (url.endsWith('/api/bug-reports/feedback/mine')) {
      return new Response(JSON.stringify({ prompts }), { status: 200 });
    }
    if (url.startsWith('/api/bug-reports/feedback/') && init?.method === 'POST') {
      const body = JSON.parse(init.body);
      posts.push({ url, body });
      const kind = prompts.find((p) => url.endsWith(p.id))?.kind ?? 'fix_check';
      return new Response(JSON.stringify({ ok: true, answer: body.answer, kind }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return posts;
}

function renderBox() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <FixedForYouPrompts />
    </QueryClientProvider>
  );
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('FixedForYouPrompts — still_open kind', () => {
  it('asks "is this still happening?" and offers the two still-open answers, never "Fixed"', async () => {
    stubFetch([stillOpen]);
    renderBox();
    await screen.findByText('BUG-004321');
    expect(screen.getByText(/is this still happening\?/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /no, it works now/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /yes, still happening/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^fixed$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /still broken/i })).not.toBeInTheDocument();
  });

  it('"No, it works now" posts the closing answer (fixed) for that prompt', async () => {
    const posts = stubFetch([stillOpen]);
    renderBox();
    await screen.findByText('BUG-004321');
    fireEvent.click(screen.getByRole('button', { name: /no, it works now/i }));
    await waitFor(() => {
      const answer = posts.find((p) => p.body?.action === 'answer');
      expect(answer).toBeTruthy();
      expect(answer!.url).toBe('/api/bug-reports/feedback/req-old');
      expect(answer!.body.answer).toBe('fixed');
    });
  });

  it('"Yes, still happening" posts not_fixed', async () => {
    const posts = stubFetch([stillOpen]);
    renderBox();
    await screen.findByText('BUG-004321');
    fireEvent.click(screen.getByRole('button', { name: /yes, still happening/i }));
    await waitFor(() => {
      const answer = posts.find((p) => p.body?.action === 'answer');
      expect(answer!.body.answer).toBe('not_fixed');
    });
  });

  it('a fix-check prompt is unchanged: "may be fixed" heading, Fixed / Still broken buttons', async () => {
    stubFetch([fixCheck]);
    renderBox();
    await screen.findByText('BUG-006001');
    expect(screen.getByText(/may be fixed — does it work for you now\?/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^fixed$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /still broken/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /no, it works now/i })).not.toBeInTheDocument();
  });

  it('a prompt with no kind at all (older API) behaves as a fix check', async () => {
    stubFetch([{ ...fixCheck, kind: undefined }]);
    renderBox();
    await screen.findByText('BUG-006001');
    expect(screen.getByRole('button', { name: /^fixed$/i })).toBeInTheDocument();
  });

  it('mixed prompts get the neutral heading and each row keeps its own words', async () => {
    stubFetch([fixCheck, stillOpen]);
    renderBox();
    await screen.findByText('BUG-004321');
    expect(screen.getByText(/need a quick answer from you/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^fixed$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /no, it works now/i })).toBeInTheDocument();
  });
});

// ============================================================================
// "Which bug is this?" — the screenshot and the way back (2026-09-18).
//
// BUG-003162's whole description is "Two fab overlapping. Bug and work pulse."
// Four words, filed 2026-04-01. Nobody can answer "is this still happening?"
// from that. The card now shows the reporter's OWN screenshot and a link back
// to the page they reported from.
//
// The href arrives ALREADY SANITISED from the API (origin discarded — see
// lib/bug-reports/safe-report-href). What is pinned here is that the card
// renders what it is given, and renders nothing extra when given nothing.
// ============================================================================

const SHOT =
  'https://xyz.supabase.co/storage/v1/object/public/bug-reports/screenshots/bug-003162.png';

const withEvidence: Prompt = {
  ...stillOpen,
  id: 'req-evidence',
  bug_id: 'bug-evidence',
  display_id: 'BUG-003162',
  description: 'Two fab overlapping. Bug and work pulse.',
  href: '/dashboard',
  screenshot_url: SHOT
};

describe('FixedForYouPrompts — the reporter can tell which bug it is', () => {
  it('shows the screenshot, named by display_id so it is not a mystery image', async () => {
    stubFetch([withEvidence]);
    renderBox();
    await screen.findByText('BUG-003162');
    const img = screen.getByAltText('Screenshot you attached to BUG-003162') as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.getAttribute('src')).toBe(SHOT);
  });

  it('the alt text names the report, never the description (no PII echoed)', async () => {
    stubFetch([withEvidence]);
    renderBox();
    const img = await screen.findByAltText('Screenshot you attached to BUG-003162');
    expect(img.getAttribute('alt')).not.toMatch(/fab overlapping/i);
  });

  it('tapping the screenshot opens the full image in a new tab, safely', async () => {
    stubFetch([withEvidence]);
    renderBox();
    const img = await screen.findByAltText('Screenshot you attached to BUG-003162');
    const link = img.closest('a') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe(SHOT);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('offers the way back to the page, using the href the API gave it', async () => {
    stubFetch([withEvidence]);
    renderBox();
    const link = (await screen.findByText(
      /open the page where you reported this/i
    )) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/dashboard');
  });

  it('renders the link above the Yes/No buttons, not after them', async () => {
    stubFetch([withEvidence]);
    renderBox();
    const link = await screen.findByText(/open the page where you reported this/i);
    const button = screen.getByRole('button', { name: /yes, still happening/i });
    // Node.DOCUMENT_POSITION_FOLLOWING === 4
    expect(link.compareDocumentPosition(button) & 4).toBeTruthy();
  });

  it('a prompt with a screenshot but no href shows the image and no link', async () => {
    stubFetch([{ ...withEvidence, href: null }]);
    renderBox();
    await screen.findByAltText('Screenshot you attached to BUG-003162');
    expect(screen.queryByText(/open the page where you reported this/i)).not.toBeInTheDocument();
  });

  it('a prompt with an href but no screenshot shows the link and no image', async () => {
    stubFetch([{ ...withEvidence, screenshot_url: null }]);
    renderBox();
    await screen.findByText(/open the page where you reported this/i);
    expect(screen.queryByAltText(/screenshot you attached/i)).not.toBeInTheDocument();
  });

  it('a prompt with neither renders exactly as before: no image, no link', async () => {
    stubFetch([stillOpen]);
    renderBox();
    await screen.findByText('BUG-004321');
    expect(screen.queryByAltText(/screenshot you attached/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/open the page where you reported this/i)).not.toBeInTheDocument();
  });

  it('the Yes/No answers still post exactly as before when evidence is shown', async () => {
    const posts = stubFetch([withEvidence]);
    renderBox();
    await screen.findByText('BUG-003162');
    fireEvent.click(screen.getByRole('button', { name: /yes, still happening/i }));
    await waitFor(() => {
      const answer = posts.find((p) => p.body?.action === 'answer');
      expect(answer!.url).toBe('/api/bug-reports/feedback/req-evidence');
      expect(answer!.body.answer).toBe('not_fixed');
    });
  });

  it('a prompt with no display_id still gets real alt text', async () => {
    stubFetch([{ ...withEvidence, display_id: null as any }]);
    renderBox();
    await screen.findByAltText('Screenshot you attached to this report');
  });
});
