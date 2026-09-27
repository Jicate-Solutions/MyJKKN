/**
 * The "Reminded" column on /admin/adoption (ruling 10, Director 2026-09-24).
 *
 * fn_adoption_reminder_summary returns a row only for a feature that has ever
 * had a reminder. The page must read a missing row as "none yet" and never as
 * an error, must read bigint counts that arrive as strings, and must name the
 * Indian calendar day — a reminder sent at 00:30 IST went out "today", even
 * though it is still yesterday in UTC.
 */
import { describe, it, expect } from 'vitest';
import {
  lastSentLabel,
  reminderTotalsByFeature,
  reminderTotalsFor,
} from '@/lib/adoption/reminders';

describe('reminderTotalsByFeature', () => {
  it('turns rows into totals by feature, reading string counts as numbers', () => {
    const totals = reminderTotalsByFeature([
      { feature_key: 'guide.open', sent_count: '12', last_sent_at: '2026-09-25T05:03:00+00:00' },
      { feature_key: 'ai_pulse.open', sent_count: 3, last_sent_at: '2026-09-24T05:03:00+00:00' },
    ]);
    expect(reminderTotalsFor(totals, 'guide.open')).toEqual({
      sent: 12,
      lastSentAt: '2026-09-25T05:03:00+00:00',
    });
    expect(reminderTotalsFor(totals, 'ai_pulse.open').sent).toBe(3);
  });

  it('reads a feature with no row as zero, never undefined', () => {
    const totals = reminderTotalsByFeature([]);
    expect(reminderTotalsFor(totals, 'never.reminded')).toEqual({ sent: 0, lastSentAt: null });
  });

  it('survives a failed read (null data) and junk rows', () => {
    expect(reminderTotalsByFeature(null).size).toBe(0);
    const totals = reminderTotalsByFeature([
      { feature_key: '', sent_count: 5, last_sent_at: null },
      { feature_key: 'x', sent_count: 'not a number', last_sent_at: null },
    ]);
    expect(totals.has('')).toBe(false);
    expect(reminderTotalsFor(totals, 'x').sent).toBe(0);
  });

  it('adds up a repeated key and keeps the latest date', () => {
    const totals = reminderTotalsByFeature([
      { feature_key: 'a', sent_count: 2, last_sent_at: '2026-09-25T05:00:00+00:00' },
      { feature_key: 'a', sent_count: 3, last_sent_at: '2026-09-20T05:00:00+00:00' },
    ]);
    expect(reminderTotalsFor(totals, 'a')).toEqual({ sent: 5, lastSentAt: '2026-09-25T05:00:00+00:00' });
  });
});

describe('lastSentLabel', () => {
  it('says none yet when nothing was sent', () => {
    expect(lastSentLabel({ sent: 0, lastSentAt: null })).toBe('none yet');
    expect(lastSentLabel({ sent: 4, lastSentAt: 'garbage' })).toBe('none yet');
  });

  it('names the Indian calendar day', () => {
    // 19:00 UTC on the 24th is 00:30 IST on the 25th.
    expect(lastSentLabel({ sent: 1, lastSentAt: '2026-09-24T19:00:00Z' })).toBe('last sent 2026-09-25');
    expect(lastSentLabel({ sent: 1, lastSentAt: '2026-09-24T05:03:00Z' })).toBe('last sent 2026-09-24');
  });
});
