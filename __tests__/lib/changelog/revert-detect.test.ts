/**
 * What's New — a published write-up comes down by itself, for two reasons.
 *
 * ── WHY THIS FILE WAS REWRITTEN
 * Its previous version fixtured the written entry as
 * `subject: 'feat(billing): add a refund button (#3670)'` — THE RAW GIT
 * SUBJECT, a shape changelog_entries does not contain. The stored subject has
 * had its `type(scope):` prefix stripped and its first letter upper-cased, so
 * every assertion here passed against a data model the database does not have.
 * 303 green tests over dead code, recorded in
 * specs/whats-new/KNOWN-GAP-revert-detection.md.
 *
 * So the fixtures below carry the columns the table actually has, and matching
 * is by SHA. Nothing in the module under test compares a subject any more —
 * that was blocker 2 of the gap, and blocker 3 was that two modules' subjects
 * store as the SAME string once the prefix is gone, which would have taken down
 * an unrelated module's write-up the moment the detector started firing.
 *
 * The Director's bias is pinned in both directions: a MISSED takedown leaves a
 * stale card, which he accepted; a FALSE takedown silently deletes a correct
 * write-up with nothing on the page to say it happened, which he did not.
 */
import { describe, it, expect } from 'vitest';
import {
  findRevertTakedowns,
  findReportTakedowns,
  reportKey,
  type EntryRevertState,
  type WrittenHighlight,
} from '@/lib/changelog/revert-detect';

/** A published, machine-written write-up — the shape the cron reads. */
const approved = (over: Partial<WrittenHighlight> = {}): WrittenHighlight => ({
  app_key: 'myjkkn',
  sha: 'aaa111222333',
  status: 'approved',
  source: 'ai',
  reviewed_at: null,
  ...over,
});

describe('findRevertTakedowns', () => {
  it('takes down the write-up whose change a real git revert undid', () => {
    // The end-to-end shape: `git revert` wrote `This reverts commit bbb…` into
    // the body, the generator resolved that to this entry's sha, and the sync
    // stored it. Nothing here parses a subject.
    const entries: EntryRevertState[] = [
      { app_key: 'myjkkn', sha: 'aaa111222333', reverted_by_sha: 'bbb444555666' },
    ];
    const hits = findRevertTakedowns(entries, [approved()]);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      app_key: 'myjkkn',
      sha: 'aaa111222333',
      reason: 'reverted',
      reverted_by: 'bbb444555666',
    });
  });

  it('leaves every entry that was not reverted alone', () => {
    const entries: EntryRevertState[] = [
      { app_key: 'myjkkn', sha: 'aaa111222333', reverted_by_sha: null },
      { app_key: 'myjkkn', sha: 'ccc777888999' },
    ];
    expect(findRevertTakedowns(entries, [approved(), approved({ sha: 'ccc777888999' })])).toEqual([]);
  });

  it('does not cross application boundaries', () => {
    // A sha is unique inside ONE repository and nowhere else — the lesson
    // 20260907183500 records. A revert in a sibling app's repo must not take
    // down this app's write-up, even when the shas collide.
    const entries: EntryRevertState[] = [
      { app_key: 'otherapp', sha: 'aaa111222333', reverted_by_sha: 'bbb444555666' },
    ];
    expect(findRevertTakedowns(entries, [approved({ app_key: 'myjkkn' })])).toEqual([]);
  });

  it('never touches a draft or an already-skipped row', () => {
    const entries: EntryRevertState[] = [
      { app_key: 'myjkkn', sha: 'aaa111222333', reverted_by_sha: 'bbb444555666' },
    ];
    expect(findRevertTakedowns(entries, [approved({ status: 'draft' })])).toEqual([]);
    expect(findRevertTakedowns(entries, [approved({ status: 'skipped' })])).toEqual([]);
  });

  it('takes down a HUMAN-written write-up too', () => {
    // Deliberate asymmetry with the report rule below: a revert is a fact about
    // the branch. Whoever wrote the card, the thing it points at is gone.
    const entries: EntryRevertState[] = [
      { app_key: 'myjkkn', sha: 'aaa111222333', reverted_by_sha: 'bbb444555666' },
    ];
    const hits = findRevertTakedowns(
      entries,
      [approved({ source: 'human', reviewed_at: '2026-09-10T10:00:00Z' })]
    );
    expect(hits).toHaveLength(1);
  });

  it('refuses an entry that claims to revert itself', () => {
    const entries: EntryRevertState[] = [
      { app_key: 'myjkkn', sha: 'aaa111222333', reverted_by_sha: 'aaa111222333' },
    ];
    expect(findRevertTakedowns(entries, [approved()])).toEqual([]);
  });

  it('reports each write-up at most once', () => {
    const entries: EntryRevertState[] = [
      { app_key: 'myjkkn', sha: 'aaa111222333', reverted_by_sha: 'bbb444555666' },
      { app_key: 'myjkkn', sha: 'aaa111222333', reverted_by_sha: 'ddd000111222' },
    ];
    expect(findRevertTakedowns(entries, [approved()])).toHaveLength(1);
  });
});

describe('findReportTakedowns', () => {
  const counts = (n: number, sha = 'aaa111222333', app = 'myjkkn') =>
    new Map([[reportKey(app, sha), n]]);

  it('takes a write-up down once three distinct readers have flagged it', () => {
    const hits = findReportTakedowns([approved()], counts(3), 3);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ sha: 'aaa111222333', reason: 'reported', reports: 3 });
  });

  it('leaves it up at two', () => {
    // One annoyed reader must not be able to edit the page, and neither must
    // two — the threshold is the whole safeguard.
    expect(findReportTakedowns([approved()], counts(2), 3)).toEqual([]);
  });

  it('leaves alone a write-up nobody reported', () => {
    expect(findReportTakedowns([approved()], new Map(), 3)).toEqual([]);
  });

  it('never touches a row a person has already looked at', () => {
    // THE LOOP GUARD, and the reason the ruling is safe to automate: a super
    // admin restoring a write-up that still carries three reports would
    // otherwise be overruled by the cron on its next tick, every half hour, for
    // ever. reviewed_at is stamped by every human decision, restore included.
    const restored = approved({ reviewed_at: '2026-09-14T09:00:00Z', source: 'human' });
    expect(findReportTakedowns([restored], counts(5), 3)).toEqual([]);
  });

  it('never takes down every write-up because the threshold was misconfigured', () => {
    // A policy row edited to 0 would otherwise mean "0 reports is enough",
    // which empties the page in one run.
    expect(findReportTakedowns([approved()], new Map(), 0)).toEqual([]);
    expect(findReportTakedowns([approved()], counts(1), 0)).toHaveLength(1);
  });

  it('counts reports per application, not per sha', () => {
    const written = [approved({ app_key: 'myjkkn' }), approved({ app_key: 'otherapp' })];
    const hits = findReportTakedowns(written, counts(3, 'aaa111222333', 'otherapp'), 3);
    expect(hits.map((h) => h.app_key)).toEqual(['otherapp']);
  });
});
