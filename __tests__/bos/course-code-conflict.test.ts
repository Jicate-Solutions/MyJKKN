/**
 * BoS course-code collision — the REFUSAL path.
 *
 * The reported defect is that uploading a course document is refused with a
 * message that names neither the record it clashes with nor a remedy, and that
 * some collisions are not refused at all — they pass an is_latest-only
 * pre-check and die on the database constraint as a bare 500.
 *
 * These cases are modelled on three real production states in
 * bos_course_syllabi (regulation 4dc273c5…, JKKN College of Arts and Science):
 *   - a live version-1 row      (24UCMDE7 / 24PCHE09 / 24PCHS01 — the tickets)
 *   - an archived-only row      (24UBAC12 — invisible to the list AND the check)
 *   - a superseded orphan row   (24UCHE05 — is_latest false with no successor)
 *
 * A new row is always inserted at version 1, so all three block it.
 */
import { describe, it, expect } from 'vitest';
import {
  pickConflictRow,
  courseCodeConflictMessage,
  type CourseCodeConflict,
} from '@/lib/utils/bos/course-code-conflict';

const liveRow: CourseCodeConflict = {
  id: 'a1',
  course_name: 'DISCIPLINE SPECIFIC ELECTIVE-CONSUMERISM & CONSUMER PROTECTION',
  version_number: 1,
  is_latest: true,
  is_archived: false,
  institution_name: 'JKKN College of Arts and Science (Aided)',
};

const archivedRow: CourseCodeConflict = {
  id: 'a2',
  course_name: 'MANAGEMENT INFORMATION SYSTEM',
  version_number: 1,
  is_latest: false,
  is_archived: true,
  institution_name: 'JKKN College of Arts and Science (Self)',
};

const supersededRow: CourseCodeConflict = {
  id: 'a3',
  course_name: 'FUNDAMENTALS OF SPECTROSCOPY',
  version_number: 1,
  is_latest: false,
  is_archived: false,
  institution_name: 'JKKN College of Arts and Science (Aided)',
};

describe('courseCodeConflictMessage', () => {
  it('names the clashing record, its version and its holder', () => {
    const msg = courseCodeConflictMessage('24UCMDE7', liveRow);
    expect(msg).toContain('24UCMDE7');
    expect(msg).toContain('DISCIPLINE SPECIFIC ELECTIVE-CONSUMERISM & CONSUMER PROTECTION');
    expect(msg).toContain('Version 1');
    expect(msg).toContain('JKKN College of Arts and Science (Aided)');
  });

  it('offers Revise as the remedy when the clashing record is live', () => {
    const msg = courseCodeConflictMessage('24PCHE09', liveRow);
    expect(msg).toContain('Revise');
    expect(msg).toContain('different course code');
  });

  it('says the code is held by an ARCHIVED record and how to reach it', () => {
    const msg = courseCodeConflictMessage('24UBAC12', archivedRow);
    expect(msg).toContain('archived');
    expect(msg).toContain('View History');
    // The whole point: an archived row is invisible in the list, so the refusal
    // has to say the code is still taken rather than look like a phantom.
    expect(msg).toContain('still holds its course code');
  });

  it('says the code is held by a SUPERSEDED version and how to reach it', () => {
    const msg = courseCodeConflictMessage('24UCHE05', supersededRow);
    expect(msg).toContain('superseded');
    expect(msg).toContain('View History');
  });

  it('every remedy names an action that exists on the row menu', () => {
    for (const row of [liveRow, archivedRow, supersededRow]) {
      const msg = courseCodeConflictMessage('24PCHS01', row);
      expect(msg).toMatch(/Revise|View History/);
    }
  });

  it('never returns the bare wording that produced the tickets', () => {
    for (const row of [liveRow, archivedRow, supersededRow]) {
      const msg = courseCodeConflictMessage('24PCHS01', row);
      // Both old messages read "…already exists in this regulation." and the
      // create path then said "Use revise endpoint", which is not a thing a
      // colleague can do. Neither may survive.
      expect(msg).not.toContain('already exists');
      expect(msg.toLowerCase()).not.toContain('endpoint');
    }
  });

  it('stays readable when the clashing row has no name or holder', () => {
    const msg = courseCodeConflictMessage('24UCMDE7', {
      id: 'a4',
      course_name: null,
      version_number: null,
      is_latest: true,
      is_archived: false,
      institution_name: null,
    });
    expect(msg).toContain('24UCMDE7');
    expect(msg).toContain('an existing course');
    expect(msg).not.toContain('null');
    expect(msg).not.toContain('undefined');
  });
});

describe('pickConflictRow', () => {
  it('reports nothing when the course code is genuinely free', () => {
    expect(pickConflictRow([])).toBeNull();
  });

  it('reports the live version when one exists alongside older ones', () => {
    const picked = pickConflictRow([
      { is_latest: false, version_number: 1 },
      { is_latest: true, version_number: 2 },
    ]);
    expect(picked).toEqual({ is_latest: true, version_number: 2 });
  });

  it('still reports a blocker when NO version is live — the mute-500 case', () => {
    const picked = pickConflictRow([
      { is_latest: false, version_number: 1 },
      { is_latest: false, version_number: 2 },
    ]);
    expect(picked).not.toBeNull();
    expect(picked?.version_number).toBe(2);
  });

  it('tolerates a row with no version number', () => {
    const picked = pickConflictRow([{ is_latest: false, version_number: null }]);
    expect(picked).not.toBeNull();
  });
});
