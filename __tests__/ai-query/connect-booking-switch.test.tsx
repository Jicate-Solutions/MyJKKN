// @vitest-environment jsdom
/**
 * The "Can book meetings" switch on /ai-query/connect (8 Oct 2026).
 * Switching on asks first and only then calls fn_ai_personal_key_set_booking;
 * switching off needs no confirmation; a key that cannot book shows the switch off.
 */
import '@testing-library/jest-dom';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const KEY_A = { id: 'key-a', name: 'Front desk', created_at: '2026-10-08T00:00:00Z', expires_at: '2026-12-01T00:00:00Z', last_used_at: null, status: 'working' };
let bookingIds: string[] = [];
const rpc = vi.fn(async (fn: string, args?: Record<string, unknown>) => {
  if (fn === 'fn_ai_personal_key_list') return { data: [KEY_A], error: null };
  if (fn === 'fn_ai_personal_key_booking_ids') return { data: bookingIds, error: null };
  if (fn === 'fn_ai_personal_key_set_booking') {
    bookingIds = args?.p_allow ? [String(args.p_key_id)] : [];
    return { data: { id: args?.p_key_id, can_book_meetings: args?.p_allow }, error: null };
  }
  return { data: null, error: null };
});
vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: () => ({ rpc }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

import { ConnectOutsideAi } from '@/app/(routes)/ai-query/connect/_components/connect-outside-ai';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ConnectOutsideAi />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  rpc.mockClear();
  bookingIds = [];
});
afterEach(() => cleanup());

const setCalls = () => rpc.mock.calls.filter(([fn]) => fn === 'fn_ai_personal_key_set_booking');

describe('Can book meetings switch', () => {
  it('asks before switching on, and does nothing on "Not now"', async () => {
    renderPage();
    const sw = await screen.findByRole('switch', { name: 'Can book meetings' });
    expect(sw).not.toBeChecked();

    fireEvent.click(sw);
    expect(await screen.findByText(/Let .Front desk. book meetings\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(setCalls()).toHaveLength(0);
  });

  it('switches on only after "Allow booking"', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('switch', { name: 'Can book meetings' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Allow booking' }));
    await waitFor(() => expect(setCalls()).toEqual([['fn_ai_personal_key_set_booking', { p_key_id: 'key-a', p_allow: true }]]));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Can book meetings' })).toBeChecked());
  });

  it('switches off at once, without asking', async () => {
    bookingIds = ['key-a'];
    renderPage();
    const sw = await screen.findByRole('switch', { name: 'Can book meetings' });
    await waitFor(() => expect(sw).toBeChecked());
    fireEvent.click(sw);
    await waitFor(() => expect(setCalls()).toEqual([['fn_ai_personal_key_set_booking', { p_key_id: 'key-a', p_allow: false }]]));
    expect(screen.queryByText(/book meetings\?/)).not.toBeInTheDocument();
  });

  it('tells people a key can book only if they allow it', async () => {
    renderPage();
    expect(await screen.findByText(/unless you let one of your keys book/)).toBeInTheDocument();
  });
});
