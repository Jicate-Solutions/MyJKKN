// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/hooks/events/use-tournament-registration-form', () => ({
  useRegistrationForm: () => ({
    data: { id: 'form-1', event_id: 'ev-1', is_enabled: true, sections: [] },
    isLoading: false,
  }),
  useSaveRegistrationForm: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { RegistrationFormEditor } from '@/app/(routes)/events/tournament/[id]/registration-form/_components/registration-form-editor';

afterEach(() => cleanup());

describe('RegistrationFormEditor standard fields', () => {
  it('shows the standard fields in both columns', () => {
    render(<RegistrationFormEditor eventId="ev-1" />);
    // One heading from the builder card, one from the preview list.
    expect(screen.getAllByText('Standard fields')).toHaveLength(2);
    expect(screen.getAllByText('Roster (name + jersey no)')).toHaveLength(2);
  });

  it('tells the organizer not to re-create them, in the builder card', () => {
    render(<RegistrationFormEditor eventId="ev-1" />);
    expect(screen.getByText(/re-create them/i)).toBeInTheDocument();
  });

  it('lists the standard fields in the preview column too', () => {
    render(<RegistrationFormEditor eventId="ev-1" />);
    // Builder card + preview list both render, so every label appears twice.
    expect(screen.getAllByText('Event / division')).toHaveLength(2);
    expect(screen.getAllByText('Phone, Email')).toHaveLength(2);
    expect(
      screen.getByText(/always collected, before your custom sections/i)
    ).toBeInTheDocument();
  });

  it('still renders the empty-state prompt for custom sections', () => {
    render(<RegistrationFormEditor eventId="ev-1" />);
    expect(screen.getByText(/No custom fields yet/i)).toBeInTheDocument();
  });
});
