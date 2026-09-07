// Deleting a series used to happen on the first click, with no confirmation
// and no undo. These cover the sentence the user is shown before it happens.
import { describe, it, expect } from 'vitest';
import { describeWhatIsLost } from '@/app/(routes)/meetings/series/_components/series-manager';

const base = { id: 's1', name: 'Monthly IQAC', units: [], attendees: [] } as any;

describe('describeWhatIsLost', () => {
  it('names both colleges and people when the series carries them', () => {
    const out = describeWhatIsLost({ ...base, units: [1, 2, 3], attendees: [1, 2] });
    expect(out).toContain('3 colleges');
    expect(out).toContain('2 required people');
  });

  it('uses singular forms for one of each', () => {
    const out = describeWhatIsLost({ ...base, units: [1], attendees: [1] });
    expect(out).toContain('1 college');
    expect(out).not.toContain('1 colleges');
    expect(out).toContain('1 required person');
    expect(out).not.toContain('1 required people');
  });

  it('mentions only what is actually attached', () => {
    const unitsOnly = describeWhatIsLost({ ...base, units: [1, 2], attendees: [] });
    expect(unitsOnly).toContain('2 colleges');
    expect(unitsOnly).not.toContain('required');

    const peopleOnly = describeWhatIsLost({ ...base, units: [], attendees: [1] });
    expect(peopleOnly).toContain('1 required person');
    expect(peopleOnly).not.toContain('college');
  });

  it('says so plainly when nothing is attached', () => {
    expect(describeWhatIsLost(base)).toBe('Nothing else is attached to it yet.');
  });

  it('never claims a count it does not have', () => {
    // A bare row (no units/attendees keys at all) must not read as "0 colleges".
    const bare = describeWhatIsLost({ id: 'x', name: 'y' } as any);
    expect(bare).toBe('Nothing else is attached to it yet.');
  });

  it('returns empty for no series, so the closed dialog renders nothing', () => {
    expect(describeWhatIsLost(null)).toBe('');
  });
});
