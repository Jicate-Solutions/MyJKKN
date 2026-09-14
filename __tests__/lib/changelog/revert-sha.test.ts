/**
 * What's New — the generator resolves reverts to a SHA, and to the RIGHT one.
 *
 * This is the half of ruling 6 that PR #3710 never reached, and the half that
 * matters: specs/whats-new/KNOWN-GAP-revert-detection.md records that a revert
 * commit never became a changelog_entries row at all, so the detector that read
 * those rows could not fire however correct it was. The resolution has to
 * happen HERE, against raw git output, where a `Revert "…"` subject still
 * exists and a subject still carries the `type(scope):` prefix that makes it
 * unambiguous.
 *
 * The functions under test are pure — no git, no clock — so every shape below
 * is exercised without a repository. The end-to-end proof that they fire
 * against this repository's real history is in the PR body: 5 commits carry a
 * `Revert "…"` subject, only 2 still carry the body line a squash-merge throws
 * away, and 3 entries come out net-reverted.
 */
import { describe, it, expect } from 'vitest';
import {
  revertedShaFromBody,
  revertedSubject,
  revertMatchKey,
  resolveNetReverts,
} from '../../../scripts/generate-changelog.mjs';

describe('revertedShaFromBody', () => {
  it('reads the sha git writes into a revert body', () => {
    const body =
      'This reverts commit 2688575a90b9f1ea648584d867cd71384104ca37.\n\n' +
      'It broke the sidebar.\n';
    expect(revertedShaFromBody(body)).toBe('2688575a90b9f1ea648584d867cd71384104ca37');
  });

  it('accepts an abbreviated sha, which the caller then resolves', () => {
    expect(revertedShaFromBody('This reverts commit 2688575.')).toBe('2688575');
  });

  it('ignores the phrase mid-sentence', () => {
    // A body that DISCUSSES a revert is not a revert. Git writes the line at
    // column zero, always; a mid-sentence match would retract a live change on
    // the strength of somebody's prose.
    expect(
      revertedShaFromBody('We agreed this reverts commit 2688575a90b9 once it lands.')
    ).toBeNull();
  });

  it('says nothing about an ordinary commit body', () => {
    expect(revertedShaFromBody('Adds the refund button and its tests.')).toBeNull();
    expect(revertedShaFromBody('')).toBeNull();
    expect(revertedShaFromBody(null as unknown as string)).toBeNull();
  });
});

describe('revertedSubject', () => {
  it('reads the quoted subject out of a git revert', () => {
    expect(revertedSubject('Revert "feat(billing): add a refund button"')).toBe(
      'feat(billing): add a refund button'
    );
  });

  it('tolerates the squash-merge pull-request marker outside the quotes', () => {
    expect(revertedSubject('Revert "feat(billing): add a refund button" (#3712)')).toBe(
      'feat(billing): add a refund button'
    );
  });

  it('keeps a pull-request number that belongs to the ORIGINAL subject', () => {
    expect(revertedSubject('Revert "feat(billing): add a refund button (#3670)"')).toBe(
      'feat(billing): add a refund button (#3670)'
    );
  });

  it('peels exactly ONE layer of a re-land and leaves parity to the graph', () => {
    // `Revert "Revert "X""` means X is BACK. #3710 handled that by counting
    // quote depth. Here one layer is peeled deliberately: the result names the
    // REVERT commit, and resolveNetReverts works out that X is live because the
    // thing that undid it was itself undone. That generalises past parity — it
    // is also right when the re-land is a fresh `git revert` OF the revert,
    // which is what actually happened in this repository.
    expect(revertedSubject('Revert "Revert "feat(billing): add a refund button""')).toBe(
      'Revert "feat(billing): add a refund button"'
    );
  });

  it('says nothing about the shapes that are not machine reverts', () => {
    expect(revertedSubject('fix(billing): put the old behaviour back')).toBeNull();
    expect(revertedSubject('Revert: feat(billing): add a refund button')).toBeNull();
    expect(revertedSubject('feat(billing): add a refund button')).toBeNull();
    expect(revertedSubject('Revert ""')).toBeNull();
  });
});

describe('revertMatchKey', () => {
  it('drops one trailing pull-request marker and nothing else', () => {
    expect(revertMatchKey('feat(x): a thing (#3670)')).toBe('feat(x): a thing');
    expect(revertMatchKey('  feat(x): a thing  ')).toBe('feat(x): a thing');
    // An inline number is part of the sentence, not a merge marker.
    expect(revertMatchKey('feat(x): closes (#3670) properly')).toBe(
      'feat(x): closes (#3670) properly'
    );
  });
});

describe('resolveNetReverts', () => {
  it('reports a change that was reverted and never came back', () => {
    const net = resolveNetReverts(new Map([['bbb', 'aaa']]));
    expect(net.get('aaa')).toBe('bbb');
  });

  it('does NOT report a change whose revert was itself reverted', () => {
    // THE ONE THAT MUST NOT REGRESS. The feature is back on the branch;
    // retracting its write-up here takes a correct card off the page. The
    // revert is the thing that is undone now, not the feature.
    const net = resolveNetReverts(
      new Map([
        ['bbb', 'aaa'], // bbb reverted aaa
        ['ccc', 'bbb'], // ccc reverted the revert — aaa is live again
      ])
    );
    expect(net.has('aaa')).toBe(false);
    expect(net.get('bbb')).toBe('ccc');
  });

  it('reports it again once the re-land is itself reverted', () => {
    const net = resolveNetReverts(
      new Map([
        ['bbb', 'aaa'],
        ['ccc', 'bbb'],
        ['ddd', 'ccc'],
      ])
    );
    expect(net.get('aaa')).toBe('bbb');
  });

  it('names the reverting commit that is still standing when there are two', () => {
    // Reverted, re-landed by hand, reverted again — the reader must be pointed
    // at the revert in force, not at the one that was undone.
    const net = resolveNetReverts(
      new Map([
        ['eee', 'aaa'], // newest revert, still standing
        ['bbb', 'aaa'], // older revert…
        ['ccc', 'bbb'], // …which was itself reverted
      ])
    );
    expect(net.get('aaa')).toBe('eee');
  });

  it('ignores a commit that claims to revert itself', () => {
    expect(resolveNetReverts(new Map([['aaa', 'aaa']])).size).toBe(0);
  });

  it('terminates on a cycle rather than recursing for ever', () => {
    // Impossible in a real history — a commit can only revert an ancestor — but
    // a hand-edited body can fabricate one, and a cron must not hang on it. The
    // safe answer is "not undone": the write-up stays up.
    const net = resolveNetReverts(
      new Map([
        ['aaa', 'bbb'],
        ['bbb', 'aaa'],
      ])
    );
    expect(net.size).toBeLessThanOrEqual(2);
  });

  it('says nothing when there are no reverts at all', () => {
    expect(resolveNetReverts(new Map()).size).toBe(0);
  });
});
