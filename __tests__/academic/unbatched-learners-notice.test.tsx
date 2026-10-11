import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  UnbatchedLearnersNotice,
  UNBATCHED_NAMES_SHOWN
} from '@/app/(routes)/academic/attendance/mark/_components/unbatched-learners-notice';

// #4332 review (LOW 5): a whole unbatched section must not turn the notice
// into a wall of names above the marking grid.
const learners = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `l${i + 1}`,
    first_name: `Learner${i + 1}`,
    last_name: null,
    roll_number: `R${i + 1}`
  }));

describe('UnbatchedLearnersNotice name cap', () => {
  it('renders nothing for an empty list', () => {
    expect(renderToStaticMarkup(<UnbatchedLearnersNotice learners={[]} />)).toBe('');
  });

  it('shows every name, with no "more" suffix, up to the cap', () => {
    const html = renderToStaticMarkup(
      <UnbatchedLearnersNotice learners={learners(UNBATCHED_NAMES_SHOWN)} />
    );
    expect(html).toContain(`Learner${UNBATCHED_NAMES_SHOWN} (R${UNBATCHED_NAMES_SHOWN})`);
    expect(html).not.toContain('more');
  });

  it('shows the first 10 names then "+M more", and the full count in the heading', () => {
    const html = renderToStaticMarkup(<UnbatchedLearnersNotice learners={learners(25)} />);
    expect(UNBATCHED_NAMES_SHOWN).toBe(10);
    expect(html).toContain('25 learners in this section');
    expect(html).toContain('Learner10 (R10) +15 more');
    expect(html).not.toContain('Learner11 (R11)');
  });
});
