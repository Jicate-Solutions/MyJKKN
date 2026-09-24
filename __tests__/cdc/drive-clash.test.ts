/**
 * CDC drive clash predicate — the room and the learner's day.
 *
 * Regression origin: on 17 Sep 2026 the Foxconn India and INDO-MIM drives were
 * both scheduled 10:00–16:00 in Senthuraja Hall on the same date. Nothing
 * warned anybody and 11 learners had said yes to both. `findDriveClashes` is
 * the predicate that would have caught it; it is pure, so it is pinned hard
 * here rather than through the route.
 */
import { describe, it, expect } from 'vitest';
import {
  findDriveClashes,
  formatClashTime,
  normalizeVenue,
  timeToMinutes,
  timesOverlap,
  type ClashCandidateDrive,
  type ClashOtherDrive,
} from '@/lib/services/cdc/drive-clash';

const HALL = 'Senthuraja Hall';

function other(over: Partial<ClashOtherDrive> = {}): ClashOtherDrive {
  return {
    id: 'other-1',
    title: 'INDO-MIM',
    status: 'willingness_open',
    drive_date: '2026-09-17',
    drive_start_time: '10:00:00',
    drive_end_time: '16:00:00',
    venue_label: HALL,
    willing_learner_ids: [],
    ...over,
  };
}

function candidate(over: Partial<ClashCandidateDrive> = {}): ClashCandidateDrive {
  return {
    id: null,
    drive_date: '2026-09-17',
    drive_start_time: '10:00',
    drive_end_time: '16:00',
    venue_label: HALL,
    ...over,
  };
}

describe('timeToMinutes', () => {
  it('parses HH:MM and HH:MM:SS', () => {
    expect(timeToMinutes('10:00')).toBe(600);
    expect(timeToMinutes('10:00:00')).toBe(600);
    expect(timeToMinutes('16:30:45')).toBe(990);
    expect(timeToMinutes('00:00')).toBe(0);
  });

  it('returns null for missing or unparseable values — unknown is not midnight', () => {
    expect(timeToMinutes(null)).toBeNull();
    expect(timeToMinutes('')).toBeNull();
    expect(timeToMinutes('not a time')).toBeNull();
    expect(timeToMinutes('25:00')).toBeNull();
    expect(timeToMinutes('10:70')).toBeNull();
  });
});

describe('normalizeVenue', () => {
  it('treats case and repeated spaces as the same room', () => {
    expect(normalizeVenue('Senthuraja Hall')).toBe('senthuraja hall');
    expect(normalizeVenue('  senthuraja   HALL ')).toBe('senthuraja hall');
  });

  it('returns null for nothing typed', () => {
    expect(normalizeVenue(null)).toBeNull();
    expect(normalizeVenue('   ')).toBeNull();
  });
});

describe('timesOverlap', () => {
  it('is half-open: back-to-back slots do not overlap', () => {
    expect(timesOverlap(600, 720, 720, 840)).toBe(false);
    expect(timesOverlap(720, 840, 600, 720)).toBe(false);
  });

  it('catches partial and full overlap', () => {
    expect(timesOverlap(600, 960, 900, 1020)).toBe(true);
    expect(timesOverlap(600, 960, 600, 960)).toBe(true);
    expect(timesOverlap(600, 960, 660, 720)).toBe(true);
  });

  it('treats an empty or reversed interval as occupying nothing', () => {
    expect(timesOverlap(600, 600, 500, 700)).toBe(false);
    expect(timesOverlap(900, 600, 500, 700)).toBe(false);
  });
});

describe('formatClashTime', () => {
  it('trims seconds for display', () => {
    expect(formatClashTime('10:00:00')).toBe('10:00');
    expect(formatClashTime('09:05')).toBe('09:05');
  });

  it('passes an unparseable value straight through', () => {
    expect(formatClashTime('whenever')).toBe('whenever');
  });
});

describe('findDriveClashes — venue', () => {
  it('flags the real 17 Sep shape: same hall, same day, same hours', () => {
    const report = findDriveClashes(
      candidate({ drive_date: '2026-09-17' }),
      [other({ id: 'indo-mim', title: 'INDO-MIM' })]
    );
    expect(report.has_clash).toBe(true);
    expect(report.venue).toHaveLength(1);
    expect(report.venue[0]).toMatchObject({
      drive_id: 'indo-mim',
      title: 'INDO-MIM',
      venue_label: HALL,
      start_time: '10:00',
      end_time: '16:00',
    });
  });

  it('does not flag the same day in a different room', () => {
    const report = findDriveClashes(candidate(), [other({ venue_label: 'KEC Main Auditorium' })]);
    expect(report.venue).toEqual([]);
  });

  it('does not flag the same room on a different day', () => {
    const report = findDriveClashes(candidate(), [other({ drive_date: '2026-09-18' })]);
    expect(report.venue).toEqual([]);
    expect(report.has_clash).toBe(false);
  });

  it('does not flag slots that touch but do not overlap', () => {
    const report = findDriveClashes(
      candidate({ drive_start_time: '16:00', drive_end_time: '18:00' }),
      [other()]
    );
    expect(report.venue).toEqual([]);
  });

  it('flags an overlap of a single minute', () => {
    const report = findDriveClashes(
      candidate({ drive_start_time: '15:59', drive_end_time: '18:00' }),
      [other()]
    );
    expect(report.venue).toHaveLength(1);
  });

  it('matches venues that differ only in case and spacing', () => {
    const report = findDriveClashes(
      candidate({ venue_label: '  senthuraja   hall ' }),
      [other()]
    );
    expect(report.venue).toHaveLength(1);
  });

  it('ignores a cancelled drive — a cancelled drive does not hold the room', () => {
    const report = findDriveClashes(candidate(), [
      other({ status: 'cancelled', willing_learner_ids: ['l-1'] }),
    ]);
    expect(report.has_clash).toBe(false);
    expect(report.venue).toEqual([]);
    expect(report.learners_affected).toBe(0);
  });

  it('never clashes with itself', () => {
    const report = findDriveClashes(
      candidate({ id: 'foxconn' }),
      [other({ id: 'foxconn', title: 'Foxconn India', willing_learner_ids: ['l-1'] })]
    );
    expect(report.has_clash).toBe(false);
  });
});

describe('findDriveClashes — missing data cannot clash', () => {
  it('returns an empty report when the candidate has no date', () => {
    const report = findDriveClashes(candidate({ drive_date: null }), [other()]);
    expect(report.has_clash).toBe(false);
    expect(report.venue).toEqual([]);
    expect(report.learner_impact).toEqual([]);
    expect(report.learners_affected).toBe(0);
  });

  it('raises no VENUE clash when the candidate has no times', () => {
    const report = findDriveClashes(
      candidate({ drive_start_time: null, drive_end_time: null }),
      [other()]
    );
    expect(report.venue).toEqual([]);
  });

  it('raises no VENUE clash when only one of the two times is set', () => {
    expect(findDriveClashes(candidate({ drive_end_time: null }), [other()]).venue).toEqual([]);
    expect(findDriveClashes(candidate({ drive_start_time: null }), [other()]).venue).toEqual([]);
  });

  it('raises no VENUE clash when the candidate has no venue', () => {
    expect(findDriveClashes(candidate({ venue_label: null }), [other()]).venue).toEqual([]);
    expect(findDriveClashes(candidate({ venue_label: '   ' }), [other()]).venue).toEqual([]);
  });

  it('raises no VENUE clash when the OTHER drive has no times', () => {
    const report = findDriveClashes(candidate(), [
      other({ drive_start_time: null, drive_end_time: null }),
    ]);
    expect(report.venue).toEqual([]);
  });

  it('still counts learner impact when the times are unknown — the day is taken either way', () => {
    const report = findDriveClashes(
      candidate({ drive_start_time: null, drive_end_time: null, venue_label: null }),
      [other({ willing_learner_ids: ['l-1', 'l-2'] })]
    );
    expect(report.venue).toEqual([]);
    expect(report.learners_affected).toBe(2);
    expect(report.has_clash).toBe(true);
  });
});

describe('findDriveClashes — learner impact', () => {
  it('counts a learner on two clashing drives only once', () => {
    const report = findDriveClashes(candidate(), [
      other({ id: 'a', title: 'INDO-MIM', willing_learner_ids: ['l-1', 'l-2', 'l-3'] }),
      other({
        id: 'b',
        title: 'Zoho',
        venue_label: 'KEC Main Auditorium',
        willing_learner_ids: ['l-3', 'l-4'],
      }),
    ]);
    expect(report.learners_affected).toBe(4);
    expect(report.learner_impact).toEqual([
      { drive_id: 'a', title: 'INDO-MIM', willing_count: 3 },
      { drive_id: 'b', title: 'Zoho', willing_count: 2 },
    ]);
  });

  it('reports the 11 learners of the 17 Sep incident', () => {
    const elevenLearners = Array.from({ length: 11 }, (_, i) => `learner-${i + 1}`);
    const report = findDriveClashes(
      candidate({ id: 'foxconn', drive_date: '2026-09-17' }),
      [other({ id: 'indo-mim', title: 'INDO-MIM', willing_learner_ids: elevenLearners })]
    );
    expect(report.venue).toHaveLength(1);
    expect(report.learners_affected).toBe(11);
    expect(report.learner_impact[0].willing_count).toBe(11);
  });

  it('lists no learner impact for a drive nobody has said yes to', () => {
    const report = findDriveClashes(candidate({ venue_label: 'Other Room' }), [
      other({ willing_learner_ids: [] }),
    ]);
    expect(report.learner_impact).toEqual([]);
    expect(report.has_clash).toBe(false);
  });

  it('ignores drives on other dates entirely', () => {
    const report = findDriveClashes(candidate(), [
      other({ drive_date: '2026-09-16', willing_learner_ids: ['l-1'] }),
      other({ id: 'no-date', drive_date: null, willing_learner_ids: ['l-2'] }),
    ]);
    expect(report.has_clash).toBe(false);
    expect(report.learners_affected).toBe(0);
  });

  it('returns an empty report against an empty world', () => {
    const report = findDriveClashes(candidate(), []);
    expect(report).toEqual({
      venue: [],
      learner_impact: [],
      learners_affected: 0,
      has_clash: false,
    });
  });
});
