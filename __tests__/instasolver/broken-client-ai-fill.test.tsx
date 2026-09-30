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
 */

import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { BrokenClient } from '@/app/(routes)/instasolver/broken/_components/broken-client';

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

let fillReply: Record<string, unknown> = NORMAL_FILL;
let sentReport: FormData | null = null;

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
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/instasolver/ai-fill') {
        return jsonResponse({ success: true, fill: fillReply });
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
  await screen.findByText(/Filled in below/);
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
