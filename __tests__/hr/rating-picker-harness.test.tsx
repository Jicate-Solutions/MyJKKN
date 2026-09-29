// @vitest-environment jsdom
// =====================================================================
// HR appraisal — the rating control's two new parts, driven with clicks
// =====================================================================
//   1. Statements under each band: shown only when a college wrote some;
//      ticking one records its text for that area only.
//   2. Conditions first: a Below asks what the college did not provide,
//      only on the tiers that owe an answer, and only while the rule is on.
// =====================================================================

import '@/__tests__/setup-jsdom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RatingPicker } from '@/features/hr/appraisal/rating-picker';
import { resolveAreas } from '@/lib/hr/appraisal-ratings';

const AREAS = resolveAreas();

function setup(overrides: Partial<React.ComponentProps<typeof RatingPicker>> = {}) {
  const props: React.ComponentProps<typeof RatingPicker> = {
    idPrefix: 't',
    areas: AREAS,
    value: {},
    onChange: vi.fn(),
    collegialityExample: '',
    onCollegialityExampleChange: vi.fn(),
    policy: null,
    ...overrides,
  };
  render(<RatingPicker {...props} />);
  return props;
}

const WITH_STATEMENTS = {
  band_statements: {
    service: { exceeds: ['Took a session for a colleague at least once a term'] },
  },
};

describe('statements under each band', () => {
  it('shows nothing when the college has written none', () => {
    setup({ onTickedStatementsChange: vi.fn() });
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/second person could check/i)).not.toBeInTheDocument();
  });

  it('records a tick as the statement text, against that area only', () => {
    const onTicked = vi.fn();
    setup({ policy: WITH_STATEMENTS, tickedStatements: {}, onTickedStatementsChange: onTicked });
    fireEvent.click(screen.getByLabelText(/Took a session for a colleague/));
    expect(onTicked).toHaveBeenCalledWith({
      service: ['Took a session for a colleague at least once a term'],
    });
  });

  it('un-ticks cleanly', () => {
    const onTicked = vi.fn();
    setup({
      policy: WITH_STATEMENTS,
      tickedStatements: { service: ['Took a session for a colleague at least once a term'] },
      onTickedStatementsChange: onTicked,
    });
    fireEvent.click(screen.getByLabelText(/Took a session for a colleague/));
    expect(onTicked).toHaveBeenCalledWith({ service: [] });
  });

  it('shows them for reference only where the tier cannot tick', () => {
    setup({ policy: WITH_STATEMENTS });
    expect(screen.getByText(/Took a session for a colleague/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('ignores a tick on a locked form', () => {
    const onTicked = vi.fn();
    setup({
      policy: WITH_STATEMENTS,
      tickedStatements: {},
      onTickedStatementsChange: onTicked,
      disabled: true,
    });
    fireEvent.click(screen.getByLabelText(/Took a session for a colleague/));
    expect(onTicked).not.toHaveBeenCalled();
  });
});

describe('conditions first on a Below', () => {
  it('asks what the college did not provide when an owing tier rates Below', () => {
    setup({ value: { teaching: 'below' }, conditions: {}, onConditionsChange: vi.fn() });
    expect(screen.getByText(/what did the college not provide\? \(Teaching\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Pick at least one and write at least 10 characters/)).toBeInTheDocument();
  });

  it('is not asked of a Meets', () => {
    setup({ value: { teaching: 'meets' }, conditions: {}, onConditionsChange: vi.fn() });
    expect(screen.queryByText(/did the college not provide/i)).not.toBeInTheDocument();
  });

  it('is not asked on the self-appraisal (no answer owed there)', () => {
    setup({ value: { teaching: 'below' } });
    expect(screen.queryByText(/did the college not provide/i)).not.toBeInTheDocument();
  });

  it('is not asked where a college turned the rule off', () => {
    setup({
      value: { teaching: 'below' },
      conditions: {},
      onConditionsChange: vi.fn(),
      policy: { conditions_first_on_below: false },
    });
    expect(screen.queryByText(/did the college not provide/i)).not.toBeInTheDocument();
  });

  it('records a picked reason for that area', () => {
    const onConditions = vi.fn();
    setup({ value: { research: 'below' }, conditions: {}, onConditionsChange: onConditions });
    fireEvent.click(screen.getByLabelText('Training'));
    expect(onConditions).toHaveBeenCalledWith({ research: { missing: ['training'], note: '' } });
  });

  it('stops complaining once answered', () => {
    setup({
      value: { research: 'below' },
      conditions: { research: { missing: ['time'], note: 'No free period all term' } },
      onConditionsChange: vi.fn(),
    });
    expect(screen.queryByText(/Pick at least one/)).not.toBeInTheDocument();
  });
});
