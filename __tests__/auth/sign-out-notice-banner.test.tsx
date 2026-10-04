// @vitest-environment jsdom
/**
 * The "An admin signed you out of all devices on <date>." banner
 * (Director ruling 2 Oct 2026): shown once after the next sign-in, marked seen
 * as soon as it shows, and nothing at all when there is no notice.
 */
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignOutNoticeBanner } from '@/components/auth/sign-out-notice-banner';

const MESSAGE = 'An admin signed you out of all devices on 2 Oct 2026, 3:15 pm.';
const ID = '00000000-0000-4000-8000-000000000001';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function respond(json: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(json) });
}

describe('SignOutNoticeBanner', () => {
  it('shows the notice and marks it seen straight away', async () => {
    fetchMock.mockImplementation((_url: string, init?: { method?: string }) =>
      init?.method === 'POST'
        ? respond({ ok: true })
        : respond({ notice: { id: ID, signedOutAt: '2026-10-02T09:45:00Z', message: MESSAGE } })
    );
    render(<SignOutNoticeBanner endpoint='/api/auth/sign-out-notice' />);
    expect(await screen.findByText(MESSAGE)).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/sign-out-notice', expect.objectContaining({ method: 'POST', body: JSON.stringify({ id: ID }) }))
    );
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
  });

  it('once seen, the next visit shows nothing', async () => {
    fetchMock.mockImplementation(() => respond({ notice: null }));
    const { container } = render(<SignOutNoticeBanner endpoint='/api/parent/sign-out-notice' />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: 'POST' }));
  });

  it('a failed check shows nothing and breaks nothing', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error('offline')));
    const { container } = render(<SignOutNoticeBanner endpoint='/api/auth/sign-out-notice' />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
