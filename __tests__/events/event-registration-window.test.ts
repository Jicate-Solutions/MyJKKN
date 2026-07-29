import { describe, expect, it } from 'vitest';
import { checkRegistrationWindow } from '@/lib/services/events/shared/event-registration-window';

const NOW = new Date('2026-07-29T10:00:00Z');

describe('checkRegistrationWindow', () => {
  it('is open when published with no dates set', () => {
    expect(checkRegistrationWindow({ status: 'planning' }, NOW)).toEqual({ open: true });
  });

  it.each(['draft', 'cancelled'])('is closed for status %s', (status) => {
    const result = checkRegistrationWindow({ status }, NOW);
    expect(result.open).toBe(false);
    if (!result.open) expect(result.reason).toBe('not_available');
  });

  it('is closed before the open date, naming the date', () => {
    const result = checkRegistrationWindow(
      { status: 'planning', registration_open_date: '2026-08-05T00:00:00Z' },
      NOW
    );
    expect(result.open).toBe(false);
    if (!result.open) {
      expect(result.reason).toBe('not_yet');
      expect(result.message).toContain('5 August 2026');
    }
  });

  it('is closed after the close date', () => {
    const result = checkRegistrationWindow(
      { status: 'planning', registration_close_date: '2026-07-01T00:00:00Z' },
      NOW
    );
    expect(result.open).toBe(false);
    if (!result.open) expect(result.reason).toBe('closed');
  });

  it('is open inside the window', () => {
    expect(
      checkRegistrationWindow(
        {
          status: 'planning',
          registration_open_date: '2026-07-01T00:00:00Z',
          registration_close_date: '2026-08-30T00:00:00Z',
        },
        NOW
      )
    ).toEqual({ open: true });
  });

  it('is open exactly on the open boundary', () => {
    expect(
      checkRegistrationWindow(
        { status: 'planning', registration_open_date: NOW.toISOString() },
        NOW
      )
    ).toEqual({ open: true });
  });

  it('treats an unparseable date as no limit rather than locking everyone out', () => {
    expect(
      checkRegistrationWindow({ status: 'planning', registration_open_date: 'not-a-date' }, NOW)
    ).toEqual({ open: true });
  });

  it('checks status before dates, so a draft inside its window is still closed', () => {
    const result = checkRegistrationWindow(
      {
        status: 'draft',
        registration_open_date: '2026-07-01T00:00:00Z',
        registration_close_date: '2026-08-30T00:00:00Z',
      },
      NOW
    );
    expect(result.open).toBe(false);
    if (!result.open) expect(result.reason).toBe('not_available');
  });
});
