// @vitest-environment jsdom

/**
 * "Fill it for me" on the real report screen (repair round, 1 Oct 2026).
 *
 * The route and the parser are pinned in ai-fill.test.ts. This file renders
 * BrokenClient for real and clicks it, with only the network stubbed, to pin
 * what the two reviewers found in the client:
 *   - a "dangerous" box the person ticked must stay ticked when the AI says
 *     "normal" (the AI may turn it on, never off);
 *   - an AI question left unanswered at Send still flags the report for the
 *     estate office to sort;
 *   - the stored "own words" are the text the AI read, not a later edit;
 *   - a fill never overwrites words the person typed into a field by hand.
 *
 * Director ruling, 1 Oct 2026: the fill is a job on the Max lane, so the
 * screen queues it (POST) and polls for it (GET ?job=). The poll timings are
 * shrunk here so a test does not wait seconds; the last block pins the
 * waiting itself — "Filling it in…", the form usable meanwhile, and a late
 * result that fills only what the person left empty.
 */

import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { BrokenClient } from '@/app/(routes)/instasolver/broken/_components/broken-client';

// The first render of this screen is slow on a busy machine (cold jsdom +
// Radix); the default 5 s per test was flaky.
vi.setConfig({ testTimeout: 20_000 });

const poll = vi.hoisted(() => ({ firstMs: 5, laterMs: 5, switchAfterMs: 1000, giveUpAfterMs: 20_000 }));
vi.mock('@/lib/instasolver/ai-fill', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instasolver/ai-fill')>();
  return { ...actual, AI_FILL_POLL: poll };
});

vi.mock('@/lib/instasolver/to-jpeg', () => ({
  PHOTO_UNREADABLE: 'unreadable',
  toJpeg: async (f: File) => f
}));

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const NORMAL_FILL = {
  trade: 'Plumbing',
  place: 'Block A',
  urgency: 'normal',
  title: 'Leaking tap',
  description: 'The tap in the Block A washroom is leaking.',
  confidence: 0.9,
  one_question: null
};

const JOB_ID = '11111111-2222-4333-8444-555555555555';

let fillReply: Record<string, unknown> = NORMAL_FILL;
let sentReport: FormData | null = null;
/** How many GET polls answer "pending" before the job is done. */
let pendingPolls = 0;
/** When set, the job never finishes. */
let neverDone = false;
let polls = 0;
let posts = 0;

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as unknown as Response;
}

beforeEach(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = NoopResizeObserver;
  fillReply = NORMAL_FILL;
  sentReport = null;
  pendingPolls = 0;
  neverDone = false;
  polls = 0;
  posts = 0;
  poll.giveUpAfterMs = 20_000;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/instasolver/ai-fill' && init?.method === 'POST') {
        posts += 1;
        return jsonResponse({ success: true, status: 'pending', job_id: JOB_ID }, 202);
      }
      if (url === `/api/instasolver/ai-fill?job=${JOB_ID}`) {
        polls += 1;
        if (neverDone || polls <= pendingPolls) {
          return jsonResponse({ success: true, status: 'pending', job_id: JOB_ID }, 202);
        }
        return jsonResponse({ success: true, status: 'done', job_id: JOB_ID, fill: fillReply });
      }
      if (url === '/api/instasolver/broken') {
        sentReport = init?.body as FormData;
        return jsonResponse({ success: true, routed_to: 'Estate office', due_date: '2026-10-03' });
      }
      throw new Error(`unexpected fetch ${url}`);
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function dangerousBox() {
  return screen.getByRole('checkbox');
}

async function fillWith(text: string) {
  fireEvent.change(screen.getByLabelText(/Tell us what/), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: /Fill it for me/ }));
  await screen.findByText(/Filled in below/, undefined, { timeout: 5000 });
}

async function send() {
  fireEvent.click(screen.getByRole('button', { name: /Send report/ }));
  await waitFor(() => expect(sentReport).not.toBeNull());
  return sentReport as unknown as FormData;
}

describe('BrokenClient — the AI never overrules the person', () => {
  it('keeps a hand-ticked "dangerous" box ticked when the AI says normal, and sends it as dangerous', async () => {
    render(<BrokenClient />);
    fireEvent.click(dangerousBox());
    expect(dangerousBox()).toHaveAttribute('aria-checked', 'true');

    await fillWith('tap leaking in A block washroom, wire hanging near it');
    expect(dangerousBox()).toHaveAttribute('aria-checked', 'true');

    const body = await send();
    expect(body.get('dangerous')).toBe('true');
    expect(body.get('urgency')).toBe('dangerous');
  });

  it('still ticks the box when the AI says dangerous', async () => {
    fillReply = { ...NORMAL_FILL, urgency: 'dangerous' };
    render(<BrokenClient />);
    expect(dangerousBox()).toHaveAttribute('aria-checked', 'false');
    await fillWith('switch board sparking in A block');
    expect(dangerousBox()).toHaveAttribute('aria-checked', 'true');
  });

  it("does not overwrite a place or description the person typed by hand", async () => {
    render(<BrokenClient />);
    fireEvent.change(screen.getByLabelText(/Where is it/), {
      target: { value: 'Behind the canteen, near the tank' }
    });
    fireEvent.change(screen.getByLabelText('What’s wrong?'), {
      target: { value: 'Water pouring out of the pipe all morning' }
    });
    await fillWith('pipe broken behind canteen');
    expect(screen.getByLabelText(/Where is it/)).toHaveValue('Behind the canteen, near the tank');
    expect(screen.getByLabelText('What’s wrong?')).toHaveValue(
      'Water pouring out of the pipe all morning'
    );
  });

  it('a second fill replaces what the first fill wrote', async () => {
    render(<BrokenClient />);
    await fillWith('tap leaking in A block');
    expect(screen.getByLabelText(/Where is it/)).toHaveValue('Block A');
    fillReply = { ...NORMAL_FILL, place: 'Block C' };
    fireEvent.change(screen.getByLabelText(/Tell us what/), { target: { value: 'sorry, C block' } });
    fireEvent.click(screen.getByRole('button', { name: /Fill it for me/ }));
    await waitFor(() => expect(screen.getByLabelText(/Where is it/)).toHaveValue('Block C'));
  });
});

describe('BrokenClient — what is sent with an AI fill', () => {
  it('flags the report for the estate office when the AI question is left unanswered', async () => {
    fillReply = {
      ...NORMAL_FILL,
      confidence: 0.4,
      one_question: { field: 'place', text: 'Which block is this in?', options: ['Block A', 'Block B'] }
    };
    render(<BrokenClient />);
    await fillWith('tap leaking');
    expect(screen.getByText('Which block is this in?')).toBeInTheDocument();
    const body = await send();
    expect(body.get('needs_sorting')).toBe('true');
  });

  it('does not flag it when the AI asked nothing', async () => {
    render(<BrokenClient />);
    await fillWith('tap leaking in A block');
    const body = await send();
    expect(body.get('needs_sorting')).toBeNull();
  });

  it('stores the words the AI read, even if the box is edited after the fill', async () => {
    render(<BrokenClient />);
    await fillWith('A block la tap odanjuduchu');
    fireEvent.change(screen.getByLabelText(/Tell us what/), { target: { value: 'something else' } });
    const body = await send();
    expect(body.get('ai_filled')).toBe('true');
    expect(body.get('reporter_words')).toBe('A block la tap odanjuduchu');
  });
});

describe('BrokenClient — waiting for the Max lane', () => {
  it('queues the job, shows "Filling it in…" and polls until the fill arrives', async () => {
    pendingPolls = 3;
    render(<BrokenClient />);
    fireEvent.change(screen.getByLabelText(/Tell us what/), { target: { value: 'tap leaking in A block' } });
    fireEvent.click(screen.getByRole('button', { name: /Fill it for me/ }));
    expect(await screen.findByRole('button', { name: /Filling it in…/ })).toBeInTheDocument();
    await screen.findByText(/Filled in below/, undefined, { timeout: 5000 });
    expect(posts).toBe(1);
    expect(polls).toBe(4);
    expect(screen.getByLabelText(/Where is it/)).toHaveValue('Block A');
  });

  it('keeps the form usable while waiting: a place typed meanwhile survives the late fill', async () => {
    pendingPolls = 5;
    render(<BrokenClient />);
    fireEvent.change(screen.getByLabelText(/Tell us what/), { target: { value: 'tap leaking' } });
    fireEvent.click(screen.getByRole('button', { name: /Fill it for me/ }));
    await screen.findByRole('button', { name: /Filling it in…/ });
    fireEvent.change(screen.getByLabelText(/Where is it/), { target: { value: 'Hostel B, ground floor' } });
    await screen.findByText(/Filled in below/, undefined, { timeout: 5000 });
    expect(screen.getByLabelText(/Where is it/)).toHaveValue('Hostel B, ground floor');
    // The empty field still gets the fill.
    expect(screen.getByLabelText('What’s wrong?')).toHaveValue(
      'The tap in the Block A washroom is leaking.'
    );
  });

  it('a kind of problem picked by hand while waiting is not replaced by the late fill', async () => {
    pendingPolls = 5;
    fillReply = { ...NORMAL_FILL, trade: 'Plumbing & water' };
    render(<BrokenClient />);
    fireEvent.change(screen.getByLabelText(/Tell us what/), { target: { value: 'tap leaking' } });
    fireEvent.click(screen.getByRole('button', { name: /Fill it for me/ }));
    await screen.findByRole('button', { name: /Filling it in…/ });
    fireEvent.click(screen.getByRole('button', { name: 'Civil & building' }));
    await screen.findByText(/Filled in below/, undefined, { timeout: 5000 });
    expect(screen.getByRole('button', { name: 'Civil & building' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Plumbing & water' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('drops a question about a place the person already typed, so Send is not flagged for sorting', async () => {
    pendingPolls = 3;
    fillReply = {
      ...NORMAL_FILL,
      one_question: { field: 'place', text: 'Which block is this in?', options: ['Block A', 'Block B'] }
    };
    render(<BrokenClient />);
    fireEvent.change(screen.getByLabelText(/Tell us what/), { target: { value: 'tap leaking' } });
    fireEvent.click(screen.getByRole('button', { name: /Fill it for me/ }));
    await screen.findByRole('button', { name: /Filling it in…/ });
    fireEvent.change(screen.getByLabelText(/Where is it/), { target: { value: 'Block C washroom' } });
    await screen.findByText(/Filled in below/, undefined, { timeout: 5000 });
    expect(screen.queryByText('Which block is this in?')).toBeNull();
    const body = await send();
    expect(body.get('needs_sorting')).toBeNull();
  });

  it('gives up after the wait with the plain-form message and leaves the form as it is', async () => {
    neverDone = true;
    poll.giveUpAfterMs = 300;
    render(<BrokenClient />);
    fireEvent.change(screen.getByLabelText(/Tell us what/), { target: { value: 'tap leaking' } });
    fireEvent.click(screen.getByRole('button', { name: /Fill it for me/ }));
    await screen.findByText("Couldn't fill it — please pick below.", undefined, { timeout: 3000 });
    expect(screen.getByRole('button', { name: /Fill it for me/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/Where is it/)).toHaveValue('');
  });

  it('stops polling once the report is sent', async () => {
    neverDone = true;
    render(<BrokenClient />);
    fireEvent.change(screen.getByLabelText(/Tell us what/), { target: { value: 'tap leaking' } });
    fireEvent.click(screen.getByRole('button', { name: /Fill it for me/ }));
    await screen.findByRole('button', { name: /Filling it in…/ });
    fireEvent.change(screen.getByLabelText(/Where is it/), { target: { value: 'Block A' } });
    fireEvent.change(screen.getByLabelText('What’s wrong?'), { target: { value: 'Tap leaking' } });
    await send();
    await screen.findByText(/Sent to Estate office/);
    const after = polls;
    await new Promise((r) => setTimeout(r, 60));
    expect(polls).toBeLessThanOrEqual(after + 1);
  });
});
