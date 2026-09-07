// Approval rules — the server-side gate between an AI/ingested draft and a
// learner. Pure functions only.

import { describe, expect, it } from 'vitest';
import { approvalBlockers, normaliseStem, OPTIONS_PER_ITEM } from './approve-rules';

const good = {
  stem: 'As trade <u>slackened</u>, we went over.',
  stem_ta: null,
  options: [
    { key: 'A', text: 'reduced' },
    { key: 'B', text: 'increased' },
    { key: 'C', text: 'improved' },
    { key: 'D', text: 'started' },
  ],
  answer: { correct: 'A' },
  bloom_level: 'K1',
};

describe('approvalBlockers', () => {
  it('passes a complete English draft', () => {
    expect(approvalBlockers(good, 'tn_hsc_english')).toEqual([]);
  });

  it('refuses a draft with no JABT level', () => {
    expect(approvalBlockers({ ...good, bloom_level: null }, 'tn_hsc_english')).toEqual([
      'a JABT level',
    ]);
    expect(approvalBlockers({ ...good, bloom_level: 'Easy' }, 'tn_hsc_english')).toEqual([
      'a JABT level',
    ]);
  });

  it('refuses a draft with no correct option, a pending answer, or an answer that names an empty option', () => {
    expect(approvalBlockers({ ...good, answer: null }, 'tn_hsc_english')).toEqual([
      'the correct option',
    ]);
    expect(
      approvalBlockers({ ...good, answer: { correct: null, pending: true } }, 'tn_hsc_english'),
    ).toEqual(['the correct option']);
    expect(
      approvalBlockers({ ...good, answer: { correct: 'A', pending: true } }, 'tn_hsc_english'),
    ).toEqual(['the correct option']);
    expect(approvalBlockers({ ...good, answer: { correct: 'E' } }, 'tn_hsc_english')).toEqual([
      'the correct option',
    ]);
  });

  it(`refuses fewer than the board's ${OPTIONS_PER_ITEM} options (English blueprint)`, () => {
    const three = { ...good, options: good.options.slice(0, 3), answer: { correct: 'A' } };
    expect(approvalBlockers(three, 'tn_hsc_english')).toEqual(['all four English options']);
  });

  it('does not count a blank, repeated or off-alphabet option', () => {
    const padded = {
      ...good,
      options: [
        { key: 'A', text: 'reduced' },
        { key: 'A', text: 'again' },
        { key: 'B', text: '   ' },
        { key: 'E', text: 'fifth' },
        { key: 'C', text: 'improved' },
      ],
    };
    expect(approvalBlockers(padded, 'tn_hsc_english')).toEqual(['all four English options']);
  });

  it('requires a Tamil stem for Physics only (decision 5)', () => {
    expect(approvalBlockers({ ...good, stem_ta: null }, 'tn_hsc_physics')).toEqual([
      'a Tamil stem',
    ]);
    expect(approvalBlockers({ ...good, stem_ta: 'மின் இருமுனை' }, 'tn_hsc_physics')).toEqual([]);
  });

  it('lists every gap at once so the reviewer fixes them in one pass', () => {
    expect(
      approvalBlockers(
        { stem: '', stem_ta: null, options: [], answer: null, bloom_level: null },
        'tn_hsc_english',
      ),
    ).toEqual(['an English stem', 'all four English options', 'the correct option', 'a JABT level']);
  });
});

describe('normaliseStem', () => {
  it('matches the ingester: underline markers, case, punctuation and spacing do not separate twins', () => {
    expect(normaliseStem('As trade <u>slackened</u>,   we  went over.')).toBe(
      normaliseStem('As trade __slackened__, we went over'),
    );
    expect(normaliseStem('As trade slackened, we went over.')).toBe('as trade slackened we went over');
  });
});
