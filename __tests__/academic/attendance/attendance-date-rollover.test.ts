// @vitest-environment jsdom
// BUG-006152 (17 Sep): the attendance page kept 16 Sep after being left open
// overnight, and Mark opened the day before.
import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rolledOverAttendanceDate } from '@/lib/utils/academic/attendance-auto-date';
import { useAttendanceDateRollover } from '@/hooks/academic/use-attendance-date-rollover';

describe('rolledOverAttendanceDate', () => {
  it('moves a date the page set by itself to today once the day has changed', () => {
    expect(rolledOverAttendanceDate('2026-09-16', '2026-09-16', '2026-09-17')).toBe('2026-09-17');
  });
  it('never moves a viewer-picked date, or on the same day, or before a date is set', () => {
    expect(rolledOverAttendanceDate('2026-09-16', null, '2026-09-17')).toBeNull();
    expect(rolledOverAttendanceDate('2026-09-17', '2026-09-17', '2026-09-17')).toBeNull();
    expect(rolledOverAttendanceDate('', null, '2026-09-17')).toBeNull();
  });
});

// The page's state + the hook, as the page wires them.
function usePage() {
  const [ctx, setCtx] = useState({ attendance_date: '', section_id: 's1' });
  const { setAutoDate, markViewerChoice } = useAttendanceDateRollover(setCtx);
  const viewerPicks = (date: string) => {
    markViewerChoice();
    setCtx((prev) => ({ ...prev, attendance_date: date }));
  };
  return { ctx, setAutoDate, viewerPicks };
}

const at = (iso: string) => vi.setSystemTime(new Date(iso));
const comeBack = () => act(() => { document.dispatchEvent(new Event('visibilitychange')); });

afterEach(() => vi.useRealTimers());

describe('the attendance page on a real return to the screen past midnight', () => {
  it('its own date moves to the new day', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    at('2026-09-16T23:50:00');
    const { result } = renderHook(usePage);
    act(() => result.current.setAutoDate('2026-09-16'));
    at('2026-09-17T08:30:00');
    comeBack();
    expect(result.current.ctx.attendance_date).toBe('2026-09-17');
    expect(result.current.ctx.section_id).toBe('s1');
  });

  it('a date the viewer picked is kept, even when it equals the date the page had set', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    at('2026-09-16T10:00:00');
    const { result } = renderHook(usePage);
    act(() => result.current.setAutoDate('2026-09-16'));
    act(() => result.current.viewerPicks('2026-09-16')); // re-picks the same day on purpose
    at('2026-09-17T08:30:00');
    comeBack();
    expect(result.current.ctx.attendance_date).toBe('2026-09-16');
  });

  it('a different date the viewer picked is kept', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    at('2026-09-16T10:00:00');
    const { result } = renderHook(usePage);
    act(() => result.current.setAutoDate('2026-09-16'));
    act(() => result.current.viewerPicks('2026-09-10'));
    at('2026-09-17T08:30:00');
    comeBack();
    expect(result.current.ctx.attendance_date).toBe('2026-09-10');
  });

  it('nothing changes on a return the same day', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    at('2026-09-17T08:00:00');
    const { result } = renderHook(usePage);
    act(() => result.current.setAutoDate('2026-09-17'));
    at('2026-09-17T15:00:00');
    comeBack();
    expect(result.current.ctx.attendance_date).toBe('2026-09-17');
  });
});
