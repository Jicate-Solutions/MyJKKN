// @vitest-environment jsdom
// =====================================================================
// HR Appraisal — the rating control, driven the way a reviewer drives it
// =====================================================================
// The three screens (staff self-review, department head, committee) all
// render this one component, so exercising it here covers the actual UI a
// reviewer touches. Drives real clicks rather than asserting on props.
//
// Covers:
//   1. All four areas render, with Service spelled out so it is not
//      mistaken for length of employment.
//   2. Clicking a band records that band for that area only.
//   3. The Collegiality example box appears ONLY on a Below, and the
//      shortfall is stated.
//   4. A college can turn the safeguard off.
//   5. An earlier tier's rating is shown for reference.
// =====================================================================

import '@/__tests__/setup-jsdom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { RatingPicker } from '@/features/hr/appraisal/rating-picker';
import { resolveAreas, type AppraisalRatingMap } from '@/lib/hr/appraisal-ratings';

const AREAS = resolveAreas();

function setup(overrides: Partial<React.ComponentProps<typeof RatingPicker>> = {}) {
  const onChange = vi.fn();
  const onExample = vi.fn();
  const props: React.ComponentProps<typeof RatingPicker> = {
    idPrefix: 't',
    areas: AREAS,
    value: {},
    onChange,
    collegialityExample: '',
    onCollegialityExampleChange: onExample,
    policy: null,
    ...overrides,
  };
  render(<RatingPicker {...props} />);
  return { onChange, onExample };
}

describe('RatingPicker', () => {
  it('offers all four areas, each with three bands', () => {
    setup();
    for (const label of ['Teaching', 'Research', 'Service', 'Collegiality']) {
      expect(screen.getByRole('radiogroup', { name: label })).toBeInTheDocument();
    }
    const teaching = screen.getByRole('radiogroup', { name: 'Teaching' });
    expect(within(teaching).getAllByRole('radio')).toHaveLength(3);
  });

  it('says what Service means, so it is not read as length of employment', () => {
    setup();
    expect(
      screen.getByText(/Work done for the institution/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/not length of employment/i)).toBeInTheDocument();
  });

  it('records a click against that area only', () => {
    const { onChange } = setup();
    const research = screen.getByRole('radiogroup', { name: 'Research' });
    fireEvent.click(within(research).getByLabelText('Exceeds expectations'));
    expect(onChange).toHaveBeenCalledWith({ research: 'exceeds' });
  });

  it('keeps earlier choices when another area is rated', () => {
    const { onChange } = setup({ value: { teaching: 'meets' } });
    const service = screen.getByRole('radiogroup', { name: 'Service' });
    fireEvent.click(within(service).getByLabelText('Below expectations'));
    expect(onChange).toHaveBeenCalledWith({ teaching: 'meets', service: 'below' });
  });

  it('shows no example box until Collegiality is rated Below', () => {
    setup({ value: { collegiality: 'meets' } as AppraisalRatingMap });
    expect(screen.queryByLabelText(/Give an example/i)).not.toBeInTheDocument();
  });

  it('demands an example on a Below, and says how short it is', () => {
    setup({ value: { collegiality: 'below' } as AppraisalRatingMap });
    expect(screen.getByLabelText(/Give an example/i)).toBeInTheDocument();
    expect(screen.getByText(/At least 20 characters/i)).toBeInTheDocument();
  });

  it('stops complaining once a real example is written', () => {
    setup({
      value: { collegiality: 'below' } as AppraisalRatingMap,
      collegialityExample: 'Missed four of six departmental meetings this year.',
    });
    expect(screen.getByLabelText(/Give an example/i)).toBeInTheDocument();
    expect(screen.queryByText(/At least 20 characters/i)).not.toBeInTheDocument();
  });

  it('hides the box entirely where a college turned the safeguard off', () => {
    setup({
      value: { collegiality: 'below' } as AppraisalRatingMap,
      policy: { collegiality_below_requires_example: false },
    });
    expect(screen.queryByLabelText(/Give an example/i)).not.toBeInTheDocument();
  });

  it("shows an earlier tier's rating beside the area", () => {
    setup({ prior: { teaching: 'exceeds' }, priorLabel: 'Self' });
    expect(screen.getByText(/Self:/)).toBeInTheDocument();
  });

  it('does not let a locked review be changed', () => {
    const { onChange } = setup({ disabled: true });
    const teaching = screen.getByRole('radiogroup', { name: 'Teaching' });
    fireEvent.click(within(teaching).getByLabelText('Meets expectations'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
