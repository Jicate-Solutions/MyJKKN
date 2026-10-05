/**
 * The attendance page's date must follow the calendar when nobody chose it.
 *
 * BUG-005727 / BUG-005728 (JKKN College of Arts and Science (Self), reported
 * 2026-08-07): "The MYJKKN portal is displaying an incorrect date … today's
 * date is 07-08-2026, but the portal is showing a different date." The
 * screenshot shows July 10th; the report's console log stops on 2026-07-10.
 * BUG-005653 (2026-08-04): the page showed 01.08.2026, log from 2026-08-01.
 *
 * /academic/attendance set attendance_date to today ONCE, on mount. A phone
 * tab or installed app left open is resumed, not reloaded, so it kept the day
 * it was first opened and My Classes listed that day's periods.
 */

import { describe, it, expect } from 'vitest';
import { rolledOverAttendanceDate } from '@/lib/utils/academic/attendance-default-date';

describe('rolledOverAttendanceDate', () => {
  it('BUG-005727: an untouched default from an earlier day moves to today', () => {
    expect(rolledOverAttendanceDate('2026-07-10', '2026-07-10', '2026-08-07')).toBe('2026-08-07');
  });

  it('keeps a date the user picked themselves', () => {
    expect(rolledOverAttendanceDate('2026-07-08', '2026-07-10', '2026-08-07')).toBeNull();
  });

  it('does nothing on the same day', () => {
    expect(rolledOverAttendanceDate('2026-08-07', '2026-08-07', '2026-08-07')).toBeNull();
  });

  it('does nothing before a default has been set', () => {
    expect(rolledOverAttendanceDate('', null, '2026-08-07')).toBeNull();
  });
});
