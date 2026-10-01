import { describe, expect, it } from 'vitest';
import {
  isAllowedDocumentFile,
  matchFilename,
  normalizeForMatch,
  type MatchCandidate,
} from '@/lib/services/cdc/document-matching';

const POOL: MatchCandidate[] = [
  { learner_id: 'a', name: 'Arun Kumar', register_number: '2026001', roll_number: '21CS001' },
  { learner_id: 'b', name: 'Priya S', register_number: '2026002', roll_number: '21CS002' },
  { learner_id: 'c', name: 'Kumar R', register_number: '2026003', roll_number: null },
  { learner_id: 'd', name: 'Long Number', register_number: '20260019', roll_number: null },
];

function matched(file: string): string | null {
  const r = matchFilename(file, POOL);
  return r.status === 'matched' ? r.candidate.learner_id : null;
}

describe('normalizeForMatch', () => {
  it('drops the extension, spaces, underscores, hyphens and parentheses', () => {
    expect(normalizeForMatch('2026001_Offer_Letter.pdf')).toBe('2026001OFFERLETTER');
    expect(normalizeForMatch('2026 001 (1).PDF')).toBe('20260011');
    expect(normalizeForMatch('2026-001.docx')).toBe('2026001');
  });
});

describe('matchFilename', () => {
  it('matches every filename shape in the specification', () => {
    expect(matched('2026001.pdf')).toBe('a');
    expect(matched('2026002_OfferLetter.pdf')).toBe('b');
    expect(matched('2026003_Offer_Letter.pdf')).toBe('c');
    expect(matched('2026001-OfferLetter.pdf')).toBe('a');
    expect(matched('Offer_2026002.pdf')).toBe('b');
    expect(matched('2026003_ABC_Technologies.pdf')).toBe('c');
  });

  it('prefers an exact register number, then an exact roll number', () => {
    expect(matchFilename('2026001.pdf', POOL)).toMatchObject({ status: 'matched', kind: 'register_exact' });
    expect(matchFilename('21CS002.pdf', POOL)).toMatchObject({ status: 'matched', kind: 'roll_exact' });
    expect(matchFilename('21-cs-001.pdf', POOL)).toMatchObject({ status: 'matched', kind: 'roll_exact' });
  });

  it('lets the longest contained identifier win instead of a shorter prefix', () => {
    // "20260019" contains "2026001" as a prefix — the longer number is the real match.
    expect(matched('20260019_OfferLetter.pdf')).toBe('d');
  });

  it('returns none for a file that names nobody', () => {
    expect(matchFilename('unknown_student.pdf', POOL).status).toBe('none');
    expect(matchFilename('2026999.pdf', POOL).status).toBe('none');
    expect(matchFilename('.pdf', POOL).status).toBe('none');
  });

  it('flags a filename that names two learners for manual review', () => {
    const r = matchFilename('2026001_2026002.pdf', POOL);
    expect(r.status).toBe('multiple');
    if (r.status === 'multiple') expect(r.candidates.map((c) => c.learner_id).sort()).toEqual(['a', 'b']);
  });

  it('flags two learners sharing one register number', () => {
    const dup = [...POOL, { learner_id: 'z', name: 'Clone', register_number: '2026001', roll_number: null }];
    expect(matchFilename('2026001.pdf', dup).status).toBe('multiple');
  });

  it('never matches on identifiers too short to be safe inside a longer name', () => {
    const short: MatchCandidate[] = [{ learner_id: 's', name: 'Short', register_number: '12', roll_number: null }];
    expect(matchFilename('Offer_2026_12.pdf', short).status).toBe('none');
    expect(matchFilename('12.pdf', short)).toMatchObject({ status: 'matched', kind: 'register_exact' });
  });
});

describe('isAllowedDocumentFile', () => {
  it('accepts the supported formats only', () => {
    ['a.pdf', 'a.PDF', 'a.doc', 'a.docx', 'a.jpg', 'a.jpeg', 'a.png'].forEach((f) => expect(isAllowedDocumentFile(f)).toBe(true));
    ['a.exe', 'a.html', 'a.svg', 'a', 'a.zip'].forEach((f) => expect(isAllowedDocumentFile(f)).toBe(false));
  });
});
