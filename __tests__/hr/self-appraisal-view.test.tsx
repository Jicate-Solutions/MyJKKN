// @vitest-environment jsdom
// =====================================================================
// HR appraisals — the self-appraisal, shown in words, not as JSON
// =====================================================================
// The head of department saw a person's self-appraisal as raw JSON. The
// shared view shows each area's band, the Collegiality example, the written
// answers as paragraphs, and anything unrecognised as plain "Label: value"
// lines, so nothing a person wrote is dropped or shown as code.
// =====================================================================

import '@/__tests__/setup-jsdom';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  HEAD_REVIEW_FIELDS,
  SelfAppraisalView,
  humaniseKey,
  plainValue,
} from '@/features/hr/appraisal/self-appraisal-view';

function areaBand(area: string): string {
  const cell = document.querySelector(`[data-area="${area}"]`);
  if (!cell) throw new Error(`no row for ${area}`);
  return cell.textContent ?? '';
}

describe('SelfAppraisalView', () => {
  it('shows every area with its band, and "Not rated" where none was given', () => {
    render(
      <SelfAppraisalView
        payload={{ ratings: { teaching: 'exceeds', research: 'meets', collegiality: 'below' } }}
      />,
    );
    expect(areaBand('teaching')).toBe('TeachingExceeds');
    expect(areaBand('research')).toBe('ResearchMeets');
    expect(areaBand('service')).toBe('ServiceNot rated');
    expect(areaBand('collegiality')).toBe('CollegialityBelow');
  });

  it('shows the written example under a Collegiality Below', () => {
    render(
      <SelfAppraisalView
        payload={{
          ratings: { collegiality: 'below' },
          collegiality_example: 'Missed three shared invigilation duties in March.',
        }}
      />,
    );
    expect(screen.getByText('Example given for the Below in Collegiality')).toBeInTheDocument();
    expect(
      screen.getByText('Missed three shared invigilation duties in March.'),
    ).toBeInTheDocument();
  });

  it('shows the written answers as labelled paragraphs, in form order, skipping empty ones', () => {
    render(
      <SelfAppraisalView
        payload={{
          challenges: 'Two sections without a second reviewer.',
          achievements: 'Published two papers.\nRan the NAAC file.',
          goals_next_year: '   ',
        }}
      />,
    );
    const headings = screen.getAllByRole('heading', { level: 5 }).map((h) => h.textContent);
    expect(headings).toEqual(['Achievements', 'Challenges']);
    expect(screen.getByText(/Published two papers\./).textContent).toBe(
      'Published two papers.\nRan the NAAC file.',
    );
    expect(screen.queryByText('Goals for next year')).not.toBeInTheDocument();
  });

  it('lists unknown keys plainly, never as JSON', () => {
    const { container } = render(
      <SelfAppraisalView
        payload={{
          achievements: 'Taught well.',
          self_rating: 7,
          courses_taught: ['Physics I', 'Optics'],
          extra: { hours: 12, note: 'weekends' },
          blank: '',
        }}
      />,
    );
    expect(screen.getByText('Other details')).toBeInTheDocument();
    const items = [...container.querySelectorAll('li')].map((li) => li.textContent);
    expect(items).toEqual([
      'Self rating: 7',
      'Courses taught: Physics I, Optics',
      'Extra: Hours: 12; Note: weekends',
    ]);
    expect(container.textContent).not.toMatch(/[{}"]/);
  });

  it('does not repeat the ratings, the example or a send-back note among the other details', () => {
    const { container } = render(
      <SelfAppraisalView
        payload={{
          ratings: { teaching: 'meets' },
          collegiality_example: 'x'.repeat(25),
          sent_back_reason: 'Redo March',
          sent_back_by: 'head',
          sent_back_at: '2026-09-01',
        }}
      />,
    );
    expect(screen.queryByText('Other details')).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('Redo March');
  });

  it.each([
    ['an empty payload', {}],
    ['a null payload', null],
    ['a payload with only blanks', { achievements: '', ratings: {} }],
  ])('says nothing has been written for %s', (_label, payload) => {
    render(<SelfAppraisalView payload={payload as Record<string, unknown> | null} />);
    expect(screen.getByText('Nothing written yet.')).toBeInTheDocument();
    expect(document.querySelector('[data-area]')).toBeNull();
  });

  it('shows a head of department review with its own fields and empty text', () => {
    render(
      <SelfAppraisalView
        payload={{
          ratings: { teaching: 'meets' },
          validation_notes: 'Evidence checked.',
          recommendations: 'Promotion candidate.',
        }}
        fields={HEAD_REVIEW_FIELDS}
      />,
    );
    expect(screen.getByText('Validation notes')).toBeInTheDocument();
    expect(screen.getByText('Evidence checked.')).toBeInTheDocument();
    expect(screen.getByText('Recommendations')).toBeInTheDocument();
    expect(screen.queryByText('Other details')).not.toBeInTheDocument();
  });
});

describe('plain-word helpers', () => {
  it('humanises keys', () => {
    expect(humaniseKey('goals_next_year')).toBe('Goals next year');
    expect(humaniseKey('x')).toBe('X');
  });
  it('turns values into plain words, and nesting past one level into a note', () => {
    expect(plainValue(true)).toBe('true');
    expect(plainValue([1, null, 'a'])).toBe('1, a');
    expect(plainValue({ a: { b: 1 } })).toBe('A: (further detail not shown)');
    expect(plainValue('  ')).toBeNull();
    expect(plainValue(undefined)).toBeNull();
  });
});
