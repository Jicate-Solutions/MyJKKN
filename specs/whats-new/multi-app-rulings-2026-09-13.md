# The shared list across apps — the Director's rulings

Interview 2026-09-13, 19:25 IST, after PRs #3708/#3709/#3710 opened. Nine
rulings. One was re-asked because the first answer named something that does not
exist — that is recorded rather than quietly reinterpreted.

## Rulings

**1. An app declares itself on the Hub screen.** Not a code change. Today
`scripts/sync-changelog-db.mjs` carries an `APP_PROFILES` map and onboarding an
app is a MyJKKN pull request. **`public.applications` has 24 rows and NO
`app_key` column** — that column is the prerequisite for this ruling.

**2. Build the ingest door properly.** A single authenticated endpoint that
establishes which app is knocking before accepting anything. He rejected giving
nine sibling apps direct database access, and rejected MyJKKN pulling from nine
codebases. **Prerequisite: `api_keys` has no `app_key` and no reference to
`applications`, so it cannot currently say which application a key speaks for.**
PR #3709 ships the sibling half with `dry-run: true` because this door 404s.

**3. Each app's sections stay separate.** A sibling's "Billing" must NOT inherit
MyJKKN's Billing permission namespace. Today `changelog_modules` is keyed by
`key` alone and `perm` is what `fn_changelog_visible_modules()` gates on, so a
sibling could rewrite who sees MyJKKN's billing news — through an automated job
nobody watches. Re-key on `(app_key, key)` BEFORE any sibling joins.

**4. Sibling news is INGESTED NOW but NOT SHOWN to ordinary users yet.** He first
ruled "only people who actually use that app". MyJKKN has no such record: the only
per-user app table, `user_app_favorites`, holds **2 rows from 1 person**. Re-asked,
he chose to build the missing piece — record who opens which app from the Hub —
and let sibling news wait until that data exists.

> **Consequence, stated so nobody trips on it:** ruling "start multi-app now, in
> parallel" (2026-09-13 afternoon) still holds for INGESTION. Display to ordinary
> users is now gated on a usage signal that will take weeks to accumulate. These
> are not in conflict, but anyone reading only one of them will build the wrong
> thing. Build the recorder first; it is the long pole.

## Edge cases

**5. Same wording, one revert → take BOTH write-ups down.** If two changes share a
one-line description and one is undone, we cannot tell which — so both come down.
Occasionally removes a write-up for a change that was fine; nobody is ever told to
try something that no longer exists. This settles the ambiguity an adversarial
reviewer raised on PR #3710 (it claimed one revert "retracts EVERYTHING"; the
truth is it retracts everything with a MATCHING SUBJECT, which is now the ruled
behaviour rather than a defect).

**6. An app with no stated minimum size CANNOT sync.** PR #3709 already refuses,
and that refusal is now ruled correct, not an oversight. Whoever adds an app must
know this is required — it belongs in ruling 1's Hub screen as a required field.

**7. A super admin is told when an app goes quiet too long.** Each app gets an
expected rhythm. Same pattern he ruled for the write-ups. Precedent shown: three
Instagram pipeline jobs failed June→September while dashboards read healthy.

**8. A super admin can MUTE any app** — hiding its entries from the page without
touching its stored history, reversible the moment it is fixed. Deliberately does
not require the other app's team to be reachable.

**9. (from ruling 5's family)** Nothing here changes the standing rules: write-ups
publish unreviewed, a hidden one is never rewritten, every write-up carries a
report-it link, and failures alert a super admin.

## Four prerequisites, in build order

Rulings 1–4 each need something that does not exist. In dependency order:

1. `applications.app_key` — ruling 1, and everything keys off it
2. `api_keys` → application link — ruling 2's door cannot authenticate without it
3. `changelog_modules` re-keyed on `(app_key, key)` — ruling 3, MUST land before
   any sibling app writes, or the permission namespace is already contaminated
4. A Hub app-open recorder — ruling 4, and the longest pole by weeks
