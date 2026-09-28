// BUG-006152 (17 Sep): the attendance page kept 16 Sep after being left open
// overnight, and Mark opened the day before.
import { readFileSync } from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { rolledOverAttendanceDate } from '@/lib/utils/academic/attendance-auto-date';

describe('rolledOverAttendanceDate', () => {
  it('moves a date the page set by itself to today once the day has changed', () => {
    expect(rolledOverAttendanceDate('2026-09-16', '2026-09-16', '2026-09-17')).toBe('2026-09-17');
  });

  it('never replaces a date the viewer picked', () => {
    expect(rolledOverAttendanceDate('2026-09-10', '2026-09-16', '2026-09-17')).toBeNull();
  });

  it('does nothing on the same day or before the page has set a date', () => {
    expect(rolledOverAttendanceDate('2026-09-17', '2026-09-17', '2026-09-17')).toBeNull();
    expect(rolledOverAttendanceDate('', null, '2026-09-17')).toBeNull();
  });
});

describe('the attendance page re-checks the date on every return to the screen', () => {
  const page = readFileSync(
    path.resolve(__dirname, '../../../app/(routes)/academic/attendance/page.tsx'),
    'utf8',
  );
  it('listens for the screen coming back and uses the rollover rule', () => {
    expect(page).toMatch(/addEventListener\('visibilitychange'/);
    expect(page).toMatch(/rolledOverAttendanceDate\(/);
  });
});
