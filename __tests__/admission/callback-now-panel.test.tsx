// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mutate = vi.fn();
let hookState: any;

vi.mock('@/hooks/admission/use-callbacks-for-me', () => ({
  useCallbacksForMe: () => hookState,
  useCompleteCallback: () => ({ mutate, isPending: false, variables: undefined }),
}));

vi.mock('@/app/(routes)/admission/counselors/daily-view/_actions/callback-script', () => ({
  draftCallbackScript: vi.fn(),
}));

import { CallbackNowPanel } from '@/app/(routes)/admission/counselors/daily-view/_components/callback-now-panel';

const row = (over: Partial<any> = {}) => ({
  id: 'r1',
  caller_number: '+910000000001',
  lead_id: null,
  lead_name: null,
  priority: 'normal',
  missed_count_7d: 2,
  ever_connected: false,
  created_at: new Date(Date.now() - 90 * 60_000).toISOString(),
  escalation_level: 1,
  assigned_counselor_id: 'u1',
  assigned_name: 'Counsellor One',
  is_mine: true,
  ...over,
});

describe('CallbackNowPanel', () => {
  beforeEach(() => { mutate.mockReset(); cleanup(); });

  it('renders nothing when there are no waiting calls', () => {
    hookState = { data: { rows: [], total: 0, is_manager: false }, isLoading: false, error: null };
    const { container } = render(<CallbackNowPanel institutionId="i1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows each call with a tap-to-call link and an overdue label', () => {
    hookState = { data: { rows: [row()], total: 1, is_manager: false }, isLoading: false, error: null };
    render(<CallbackNowPanel institutionId="i1" />);
    expect(screen.getByText('Call back now (1)')).toBeInTheDocument();
    expect(screen.getByText('Unknown caller')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Call \+910000000001/ })).toHaveAttribute('href', 'tel:+910000000001');
    expect(screen.queryByText(/Counsellor One/)).not.toBeInTheDocument();
  });

  it('shows who holds each call to a manager, and Escalated past level 2', () => {
    hookState = {
      data: { rows: [row({ escalation_level: 2, lead_name: 'Priya K' })], total: 1, is_manager: true },
      isLoading: false,
      error: null,
    };
    render(<CallbackNowPanel institutionId="i1" />);
    expect(screen.getByText('Escalated')).toBeInTheDocument();
    expect(screen.getByText(/Counsellor One/)).toBeInTheDocument();
  });

  it('says how many are hidden beyond the first page', () => {
    hookState = { data: { rows: [row()], total: 140, is_manager: false }, isLoading: false, error: null };
    render(<CallbackNowPanel institutionId="i1" />);
    expect(screen.getByText('Showing the first 1 of 140.')).toBeInTheDocument();
  });

  it('marks a call done with the note', async () => {
    hookState = { data: { rows: [row()], total: 1, is_manager: false }, isLoading: false, error: null };
    render(<CallbackNowPanel institutionId="i1" />);
    fireEvent.change(screen.getByPlaceholderText(/What happened on the call/), { target: { value: 'Reached' } });
    fireEvent.click(screen.getByRole('button', { name: /Called back/ }));
    expect(mutate).toHaveBeenCalledWith({ id: 'r1', note: 'Reached' });
  });
});
