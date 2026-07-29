// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: () => ({}) }));

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'ev-1' }),
  useRouter: () => ({ replace, push: vi.fn() }),
}));

const eventState: { data: unknown; isLoading: boolean } = { data: null, isLoading: false };
vi.mock('@/hooks/events/use-general-events', () => ({
  useGeneralEvent: () => ({ data: eventState.data, isLoading: eventState.isLoading }),
}));

const accessState = { canManage: true, isLoading: false };
vi.mock('@/hooks/events/use-event-access', () => ({
  useEventAccess: () => ({ ...accessState, canView: true, isIncharge: false }),
}));

vi.mock(
  '@/components/events/shared/registration-form/registration-form-editor',
  () => ({ RegistrationFormEditor: () => <div data-testid="editor" /> })
);

import BuilderPage from '@/app/(routes)/events/[id]/registration-form/page';

const LECTURE = { id: 'ev-1', name: 'JKKN School of Influencer', event_type: 'lecture', config: {} };

beforeEach(() => {
  replace.mockClear();
  eventState.data = LECTURE;
  eventState.isLoading = false;
  accessState.canManage = true;
  accessState.isLoading = false;
});
afterEach(() => cleanup());

describe('general event registration-form builder page', () => {
  it('renders the editor for a manager', () => {
    render(<BuilderPage />);
    expect(screen.getByTestId('editor')).toBeInTheDocument();
  });

  it('redirects a non-manager back to the event', () => {
    accessState.canManage = false;
    render(<BuilderPage />);
    expect(replace).toHaveBeenCalledWith('/events/ev-1');
  });

  it('does NOT redirect while access is still loading', () => {
    accessState.canManage = false;
    accessState.isLoading = true;
    render(<BuilderPage />);
    expect(replace).not.toHaveBeenCalled();
  });

  it('does not redirect while the event is still loading', () => {
    eventState.data = null;
    eventState.isLoading = true;
    accessState.canManage = false;
    render(<BuilderPage />);
    expect(replace).not.toHaveBeenCalled();
  });
});
