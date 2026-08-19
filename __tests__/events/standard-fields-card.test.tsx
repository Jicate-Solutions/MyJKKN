// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  StandardFieldsCard,
  StandardFieldsPreview,
} from '@/app/(routes)/events/tournament/[id]/registration-form/_components/standard-fields-card';

afterEach(() => cleanup());

const EXPECTED_LABELS = [
  'Event / division',
  'Team name / Your name',
  'External (non-JKKN)',
  'School / club or College',
  'Gender, Age',
  'Roster (name + jersey no)',
  'Phone, Email',
];

describe('StandardFieldsCard', () => {
  it('lists every standard field the public form collects', () => {
    render(<StandardFieldsCard />);
    for (const label of EXPECTED_LABELS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('says when each conditional field appears', () => {
    render(<StandardFieldsCard />);
    expect(screen.getByText(/Individual events only/)).toBeInTheDocument();
    expect(screen.getByText(/Team events only/)).toBeInTheDocument();
    expect(screen.getByText(/Guests and external entrants/)).toBeInTheDocument();
  });

  it('warns the organizer not to re-create them as custom fields', () => {
    render(<StandardFieldsCard />);
    expect(screen.getByText(/re-create them/i)).toBeInTheDocument();
  });
});

describe('StandardFieldsPreview', () => {
  it('lists every standard field, same as the card', () => {
    render(<StandardFieldsPreview />);
    for (const label of EXPECTED_LABELS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('says the standard fields come before the custom sections', () => {
    render(<StandardFieldsPreview />);
    expect(
      screen.getByText(/always collected, before your custom sections/i)
    ).toBeInTheDocument();
  });

  it('renders no editable control, since the fields are fixed', () => {
    const { container } = render(<StandardFieldsPreview />);
    expect(container.querySelectorAll('input, select, textarea, button')).toHaveLength(0);
  });
});
