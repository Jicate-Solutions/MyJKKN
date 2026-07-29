// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: () => ({}) }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'ev-1' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const authState: { profile: unknown; isLoading: boolean } = { profile: null, isLoading: false };
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ profile: authState.profile, isLoading: authState.isLoading }),
}));

const eventState: { data: unknown; isLoading: boolean } = { data: null, isLoading: false };
vi.mock('@/hooks/events/use-general-events', () => ({
  useGeneralEvent: () => ({ data: eventState.data, isLoading: eventState.isLoading }),
}));

const formState: { data: unknown } = { data: { is_enabled: true, sections: [] } };
vi.mock('@/hooks/events/use-tournament-registration-form', () => ({
  useRegistrationForm: () => ({ data: formState.data, isLoading: false }),
}));

const myRegState: { data: unknown; isLoading: boolean } = { data: null, isLoading: false };
vi.mock('@/hooks/events/use-my-event-registration', () => ({
  useMyEventRegistration: () => ({
    data: myRegState.data,
    isLoading: myRegState.isLoading,
    refetch: vi.fn(),
  }),
}));

import RegisterPage from '@/app/(routes)/events/[id]/register/page';

const PROFILE = {
  id: 'user-1',
  full_name: 'Sangeetha V',
  email: 'aimech@jkkn.ac.in',
};
const OPEN_EVENT = {
  id: 'ev-1',
  name: 'JKKN School of Influencer',
  status: 'planning',
  registration_open_date: null,
  registration_close_date: null,
};

beforeEach(() => {
  authState.profile = PROFILE;
  authState.isLoading = false;
  eventState.data = OPEN_EVENT;
  eventState.isLoading = false;
  formState.data = { is_enabled: true, sections: [] };
  myRegState.data = null;
  myRegState.isLoading = false;
  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 201,
    json: async () => ({ registration_id: 'reg-new' }),
  })) as unknown as typeof fetch;
});
afterEach(() => cleanup());

describe('event register page', () => {
  it('asks a signed-out visitor to sign in', () => {
    authState.profile = null;
    render(<RegisterPage />);
    expect(screen.getByText(/sign in with your jkkn account/i)).toBeInTheDocument();
  });

  it('shows who is registering, read-only', () => {
    render(<RegisterPage />);
    expect(screen.getByText('Sangeetha V')).toBeInTheDocument();
    expect(screen.getByText('aimech@jkkn.ac.in')).toBeInTheDocument();
  });

  it('says registration is not available for a draft event', () => {
    eventState.data = { ...OPEN_EVENT, status: 'draft' };
    render(<RegisterPage />);
    expect(screen.getByText(/not available/i)).toBeInTheDocument();
  });

  it('names the opening date before the window opens', () => {
    eventState.data = { ...OPEN_EVENT, registration_open_date: '2099-08-05T00:00:00Z' };
    render(<RegisterPage />);
    expect(screen.getByText(/registration opens on/i)).toBeInTheDocument();
  });

  it('says registration has closed after the window', () => {
    eventState.data = { ...OPEN_EVENT, registration_close_date: '2000-01-01T00:00:00Z' };
    render(<RegisterPage />);
    expect(screen.getByText(/registration has closed/i)).toBeInTheDocument();
  });

  it('renders a phone field and a submit button when open', () => {
    render(<RegisterPage />);
    expect(screen.getByLabelText(/phone/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /register/i })).toBeInTheDocument();
  });

  it('renders the organizer custom fields', () => {
    formState.data = {
      is_enabled: true,
      sections: [
        {
          id: 's1',
          title: 'About you',
          display_order: 0,
          fields: [
            {
              id: 'f1',
              field_key: 'why_join',
              field_label: 'Why do you want to join?',
              field_type: 'text',
              is_required: true,
              display_order: 0,
              options: null,
              condition: null,
            },
          ],
        },
      ],
    };
    render(<RegisterPage />);
    expect(screen.getByText('About you')).toBeInTheDocument();
    expect(screen.getByText(/why do you want to join\?/i)).toBeInTheDocument();
  });

  it('shows the existing registration read-only instead of the form', () => {
    myRegState.data = {
      id: 'reg-1',
      created_at: '2026-07-29T00:00:00Z',
      custom_fields: { why_join: 'Content creation' },
    };
    render(<RegisterPage />);
    expect(screen.getByText(/you're registered|you are registered/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^register$/i })).not.toBeInTheDocument();
  });

  it('posts the phone and custom answers, then confirms', async () => {
    render(<RegisterPage />);
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [url, init] = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } })
      .mock.calls[0];
    expect(url).toBe('/api/events/ev-1/register');
    expect(JSON.parse(init.body as string).phone).toBe('9876543210');
  });

  it('surfaces the server error message verbatim', async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 422,
      json: async () => ({ error: '"Why do you want to join?" is required' }),
    })) as unknown as typeof fetch;

    render(<RegisterPage />);
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    expect(
      await screen.findByText(/"Why do you want to join\?" is required/)
    ).toBeInTheDocument();
  });
});
