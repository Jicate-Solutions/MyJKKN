import { describe, it, expect } from 'vitest';
import { cleanPreviousDegree, missingPreviousDegreeFields } from '@/lib/admission/previous-degree';

describe('missingPreviousDegreeFields — a PG applicant needs their degree (ruling 2026-09-30)', () => {
  it('lists every required field when nothing is filled', () => {
    expect(missingPreviousDegreeFields({})).toEqual([
      'previous_degree.degree_name',
      'last_school',
      'previous_degree.university',
      'previous_degree.year_of_passing',
      'previous_degree.score',
    ]);
  });

  it('treats whitespace as empty', () => {
    expect(
      missingPreviousDegreeFields({
        last_school: '   ',
        previous_degree: { degree_name: 'BDS', university: ' ', year_of_passing: '2025', score: '71' },
      }),
    ).toEqual(['last_school', 'previous_degree.university']);
  });

  it('is complete without any entrance exam details', () => {
    expect(
      missingPreviousDegreeFields({
        last_school: 'JKKN Dental College, Komarapalayam',
        previous_degree: { degree_name: 'BDS', university: 'TN Dr MGR Medical University', year_of_passing: '2025', score: '71.4' },
      }),
    ).toEqual([]);
  });
});

describe('cleanPreviousDegree', () => {
  it('returns null for a UG record whose form only carries the default score_type', () => {
    expect(cleanPreviousDegree({ score_type: 'percentage', degree_name: '', score: '  ' })).toBeNull();
  });

  it('trims values and drops blanks', () => {
    expect(cleanPreviousDegree({ degree_name: ' BDS ', score: '8.1', score_type: 'cgpa', entrance_rank: '' })).toEqual({
      degree_name: 'BDS',
      score: '8.1',
      score_type: 'cgpa',
    });
  });

  it('returns null for null input', () => {
    expect(cleanPreviousDegree(null)).toBeNull();
  });
});
