/**
 * CDC willingness window.
 *
 * Regression cover for the 2026-09-12 audit finding: `cdc_drives` carries two
 * independent switches for one behaviour — its `status`, and the optional
 * `willingness_window_open_at` / `_close_at` pair — and only `status` was ever
 * consulted. A coordinator who set a closing date got a drive that advertised
 * "closes today" on the learner's dashboard and then went on accepting answers
 * indefinitely, with nothing failing anywhere.
 *
 * The load-bearing case is the FIRST one: every drive in production today has
 * both bounds NULL, so honouring the dates must be a strict no-op for them.
 */

import { describe, it, expect } from 'vitest';
import {
  computeWillingnessWindowState,
  describeClosedWindow,
} from '@/lib/services/cdc/willingness-service';
import type { CdcDrive, CdcDriveStatus } from '@/types/cdc';

const NOW = new Date('2026-09-12T12:00:00Z');
const EARLIER = '2026-09-10T00:00:00Z';
const LATER = '2026-09-20T00:00:00Z';

/** Only the three fields the predicate reads. */
function drive(
  status: CdcDriveStatus,
  open_at: string | null = null,
  close_at: string | null = null
): Pick<CdcDrive, 'status' | 'willingness_window_open_at' | 'willingness_window_close_at'> {
  return {
    status,
    willingness_window_open_at: open_at,
    willingness_window_close_at: close_at,
  };
}

describe('computeWillingnessWindowState', () => {
  it('is open when the status is right and no dates are set — the production case', () => {
    // All four live drives on 2026-09-12 have NULL for both bounds. If this
    // ever returns anything but 'open', honouring the dates has silently
    // closed every real drive.
    expect(computeWillingnessWindowState(drive('willingness_open'), NOW)).toBe('open');
  });

  it('is closed by status regardless of the dates', () => {
    // Dates wide open, but the drive has moved on — status still wins.
    expect(
      computeWillingnessWindowState(drive('eligibility_locked', EARLIER, LATER), NOW)
    ).toBe('status');
    expect(computeWillingnessWindowState(drive('announced', EARLIER, LATER), NOW)).toBe(
      'status'
    );
    expect(computeWillingnessWindowState(drive('cancelled', EARLIER, LATER), NOW)).toBe(
      'status'
    );
  });

  it('is open inside both bounds', () => {
    expect(
      computeWillingnessWindowState(drive('willingness_open', EARLIER, LATER), NOW)
    ).toBe('open');
  });

  it('has not opened yet when now is before the opening bound', () => {
    expect(
      computeWillingnessWindowState(drive('willingness_open', LATER, null), NOW)
    ).toBe('not_yet_open');
  });

  it('is closed when now is past the closing bound — the bug this fixes', () => {
    // The exact shape that used to read as "open": status is willingness_open,
    // the advertised close date has passed, and a declaration still went through.
    expect(
      computeWillingnessWindowState(drive('willingness_open', null, EARLIER), NOW)
    ).toBe('closed');
  });

  it('treats a NULL bound as no limit on that side', () => {
    expect(
      computeWillingnessWindowState(drive('willingness_open', EARLIER, null), NOW)
    ).toBe('open');
    expect(
      computeWillingnessWindowState(drive('willingness_open', null, LATER), NOW)
    ).toBe('open');
  });

  it('stays open at the instant the closing bound is reached', () => {
    const closeAt = '2026-09-12T12:00:00Z';
    expect(
      computeWillingnessWindowState(drive('willingness_open', null, closeAt), NOW)
    ).toBe('open');
    expect(
      computeWillingnessWindowState(
        drive('willingness_open', null, closeAt),
        new Date('2026-09-12T12:00:01Z')
      )
    ).toBe('closed');
  });

  it('ignores an unparseable bound rather than locking the drive shut', () => {
    // A bad string must not silently close a drive nobody can then reopen.
    expect(
      computeWillingnessWindowState(drive('willingness_open', 'not-a-date', 'nonsense'), NOW)
    ).toBe('open');
  });
});

describe('describeClosedWindow', () => {
  it('does not tell the learner the drive is shut because its status is open', () => {
    // The contradiction the old single message produced: a drive whose dates
    // had passed reported "not open for this drive (status: willingness_open)".
    const msg = describeClosedWindow('closed', 'willingness_open');
    expect(msg).not.toContain('willingness_open');
    expect(msg.toLowerCase()).toContain('closed');
  });

  it('names the not-yet-open case separately', () => {
    const msg = describeClosedWindow('not_yet_open', 'willingness_open');
    expect(msg).not.toContain('willingness_open');
    expect(msg.toLowerCase()).toContain('not accepting responses yet');
  });

  it('still reports the status when the status is what closed it', () => {
    expect(describeClosedWindow('status', 'eligibility_locked')).toContain(
      'eligibility_locked'
    );
  });
});
