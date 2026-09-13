/**
 * What's New — ruling 6: a write-up for a change that was UNDONE comes down.
 *
 * The Director accepted that not every revert is detectable. What he did not
 * accept — and what these tests exist to prevent — is the opposite error: a
 * write-up taken down for a change nobody reverted. A missed revert leaves a
 * stale card, which is the failure he agreed to live with; a false retraction
 * silently deletes a correct write-up and there is nothing on the page to say
 * it happened.
 *
 * The nastiest case in the whole feature is the RE-LAND. `Revert "Revert "X""`
 * means X is BACK, and a matcher that peels one layer reads it as an undo of
 * the revert — and then, worse, a matcher that just strips the first prefix
 * retracts the write-up for the feature that has just returned. Parity is the
 * rule, and it is pinned below.
 */
import { describe, it, expect } from 'vitest';
import {
  revertedSubject,
  revertMatchKey,
  findRetractions,
} from '@/lib/changelog/revert-detect';

describe('revertedSubject', () => {
  it('reads the original subject out of a git revert', () => {
    expect(revertedSubject('Revert "feat(billing): add a refund button"')).toBe(
      'feat(billing): add a refund button'
    );
  });

  it('tolerates the squash-merge pull-request suffix outside the quotes', () => {
    expect(revertedSubject('Revert "feat(billing): add a refund button" (#3712)')).toBe(
      'feat(billing): add a refund button'
    );
  });

  it('keeps a pull-request number that belongs to the ORIGINAL subject', () => {
    expect(revertedSubject('Revert "feat(billing): add a refund button (#3670)"')).toBe(
      'feat(billing): add a refund button (#3670)'
    );
  });

  it('treats a re-land as NOT a revert — this is the one that must not regress', () => {
    // The feature is back on the branch. Retracting its write-up here would
    // take a correct card off the page.
    expect(revertedSubject('Revert "Revert "feat(billing): add a refund button""')).toBeNull();
  });

  it('treats a revert of a re-land as a revert again (odd depth)', () => {
    expect(
      revertedSubject('Revert "Revert "Revert "feat(billing): add a refund button"""')
    ).toBe('feat(billing): add a refund button');
  });

  it('says nothing about the shapes it cannot see', () => {
    // Every one of these really does undo something. None is detectable from a
    // subject line, and the header of revert-detect.ts lists them as accepted
    // gaps rather than pretending otherwise.
    expect(revertedSubject('fix(billing): put the old behaviour back')).toBeNull();
    expect(revertedSubject('Revert: feat(billing): add a refund button')).toBeNull();
    expect(revertedSubject('revert "feat(billing): add a refund button"')).toBeNull();
    expect(revertedSubject('feat(billing): add a refund button')).toBeNull();
  });

  it('returns null for an empty quoted subject rather than matching everything', () => {
    expect(revertedSubject('Revert ""')).toBeNull();
  });
});

describe('revertMatchKey', () => {
  it('drops one trailing pull-request suffix and nothing else', () => {
    expect(revertMatchKey('feat(x): a thing (#3670)')).toBe('feat(x): a thing');
    expect(revertMatchKey('  feat(x): a thing  ')).toBe('feat(x): a thing');
    // An inline number is part of the sentence, not a merge marker.
    expect(revertMatchKey('feat(x): closes (#3670) properly')).toBe(
      'feat(x): closes (#3670) properly'
    );
  });
});

describe('findRetractions', () => {
  const written = [
    {
      sha: 'aaa1111',
      app_key: 'myjkkn',
      entry_date: '2026-09-01',
      subject: 'feat(billing): add a refund button (#3670)',
    },
  ];

  it('retracts the write-up whose change a later commit reverted', () => {
    const entries = [
      ...written,
      {
        sha: 'bbb2222',
        app_key: 'myjkkn',
        entry_date: '2026-09-05',
        subject: 'Revert "feat(billing): add a refund button (#3670)" (#3712)',
      },
    ];
    const hits = findRetractions(entries, written);
    expect(hits).toHaveLength(1);
    expect(hits[0].sha).toBe('aaa1111');
    expect(hits[0].reverted_by).toBe('bbb2222');
  });

  it('retracts a revert that landed the same day', () => {
    // changelog_entries carries a DATE, not a timestamp, and a same-day revert
    // is the commonest revert there is. A strictly-earlier test would miss most
    // real ones.
    const entries = [
      ...written,
      {
        sha: 'bbb2222',
        app_key: 'myjkkn',
        entry_date: '2026-09-01',
        subject: 'Revert "feat(billing): add a refund button (#3670)"',
      },
    ];
    expect(findRetractions(entries, written)).toHaveLength(1);
  });

  it('does not retract on a revert that predates the change', () => {
    const entries = [
      ...written,
      {
        sha: 'bbb2222',
        app_key: 'myjkkn',
        entry_date: '2026-08-20',
        subject: 'Revert "feat(billing): add a refund button (#3670)"',
      },
    ];
    expect(findRetractions(entries, written)).toEqual([]);
  });

  it('does not cross application boundaries', () => {
    // A subject line is unique inside ONE repository and nowhere else — the
    // same lesson 20260907183500 records for shas. A revert in another app's
    // repo must not take down this app's write-up.
    const entries = [
      ...written,
      {
        sha: 'bbb2222',
        app_key: 'otherapp',
        entry_date: '2026-09-05',
        subject: 'Revert "feat(billing): add a refund button (#3670)"',
      },
    ];
    expect(findRetractions(entries, written)).toEqual([]);
  });

  it('does not retract a re-landed change', () => {
    const entries = [
      ...written,
      {
        sha: 'bbb2222',
        app_key: 'myjkkn',
        entry_date: '2026-09-05',
        subject: 'Revert "feat(billing): add a refund button (#3670)"',
      },
      {
        sha: 'ccc3333',
        app_key: 'myjkkn',
        entry_date: '2026-09-06',
        subject: 'Revert "Revert "feat(billing): add a refund button (#3670)""',
      },
    ];
    // The single-layer revert at bbb2222 still retracts — it really did undo
    // the change on that day — but the re-land at ccc3333 adds nothing, and in
    // particular does not report ITSELF or bbb2222 as retractable.
    const hits = findRetractions(entries, written);
    expect(hits.map((h) => h.sha)).toEqual(['aaa1111']);
  });

  it('reports each write-up at most once even when reverted twice', () => {
    const entries = [
      ...written,
      {
        sha: 'bbb2222',
        app_key: 'myjkkn',
        entry_date: '2026-09-05',
        subject: 'Revert "feat(billing): add a refund button (#3670)"',
      },
      {
        sha: 'ddd4444',
        app_key: 'myjkkn',
        entry_date: '2026-09-07',
        subject: 'Revert "feat(billing): add a refund button"',
      },
    ];
    expect(findRetractions(entries, written)).toHaveLength(1);
  });

  it('never reports a revert commit as a retraction of itself', () => {
    const selfish = [
      {
        sha: 'bbb2222',
        app_key: 'myjkkn',
        entry_date: '2026-09-05',
        subject: 'Revert "Revert "x""',
      },
    ];
    expect(findRetractions(selfish, selfish)).toEqual([]);
  });
});
