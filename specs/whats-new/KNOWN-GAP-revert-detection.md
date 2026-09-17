# KNOWN GAP: the revert detector cannot see a revert

**Status: SHIPPED AND DEAD.** Merged in PR #3710 on 2026-09-13. The code is
present, tested and reachable. It can never fire in production. Recorded here so
it is not mistaken for working machinery by the next person who reads it.

Director ruling 6 (2026-09-13, 18:45): *"If a change is later undone, its write-up
comes down automatically — nobody should be told to go try something that no
longer exists."* **NOT DELIVERED.**

## Two independent blockers, each sufficient on its own

**1. A revert commit never becomes a changelog entry.**
`scripts/generate-changelog.mjs:285`:

    const SUBJECT_RE = /^(feat|fix|perf|security)(?:\(([^)]+)\))?(!?):\s*(.+)$/;

`git revert` writes `Revert "feat(events): …"`. That does not start with a type
token, so it fails the match, is counted as `nonUserFacing`, and is dropped
before `changelog_entries` is written. **Nine real revert commits exist in this
repository's history and not one of them would survive this filter** — verified
against `git log`, e.g. `Revert "feat(ai-pulse): glue — redirects + sidebar nav +
cron schedule (#728)" (#744)`.

**2. The stored subject is not the git subject.**
`generate-changelog.mjs:412,454` strips the `type(scope):` prefix, strips
`(#nnnn)`, strips bug refs, redacts identifiers and upper-cases the first letter
before storing. So even if a revert entry existed, `revertMatchKey(w.subject)`
compares a stripped string against a quoted raw git subject. They can never be
equal.

| | value |
|---|---|
| git subject | `feat(events): every event asks its attendees how it went (#3712)` |
| stored `subject` | `Every event asks its attendees how it went` |
| a revert's match key | `feat(events): every event asks its attendees how it went` |

## Why the tests pass

`__tests__/lib/changelog/revert-detect.test.ts` fixtures the written entry as
`subject: 'feat(billing): add a refund button (#3670)'` — the raw git subject, a
shape that does not exist in the table. **303 green tests against a data model
the database does not have.** This is the repo's signature failure (object built,
entry point never wired) in its purest form: every unit is correct, the seam
between them is not.

## Why it was not fixed in #3710

The reliable revert signal is `This reverts commit <sha>` in the commit BODY, and
reaching it means widening `scripts/generate-changelog.mjs` and
`scripts/sync-changelog-db.mjs` — files that PR explicitly did not own. The fix
is a separate change, not an oversight in the merge.

## What the fix must do

1. Let revert commits through the generator — match `Revert "…"` and `revert(scope):`
   as a kind, or capture the body's `This reverts commit <sha>`.
2. **Match on SHA, not on text.** The body line carries the reverted commit's sha,
   which is exactly `changelog_entries.sha`. Text matching is what created both
   blockers.
3. **Add a `module_key` guard if text matching survives anywhere.** Because the
   `type(scope):` prefix is stripped on the way in, `feat(events): send a reminder`
   and `fix(billing): send a reminder` both store as `Send a reminder`. Today the
   loop matches on `app_key` and subject only. The moment blocker 1 is lifted, one
   revert would take down an unrelated module's write-up — and the Director's
   stated bias is that a false retraction is the worse failure.

## Also outstanding from the same family

**Auto-hide at three reports** (ruling 6 of the 22:20 interview, PR #3727) is NOT
implemented. #3710 predates that ruling and argues the opposite position honestly
in its own comments: *"A TALLY, not a ticket: nothing here changes a highlight's
status."* The tally is sound; the threshold does not exist.

When it is built: the retract pass already collapses "a machine took this down"
and "a human hid this" into one status (`skipped`), distinguished only by prose
inside `selection_reason`, which is not queryable. Ruling 5's never-rewrite check
keys on status alone — so a restored write-up would be permanently unwritable.
A distinct reason column is needed, and the revert retraction should use it too.
