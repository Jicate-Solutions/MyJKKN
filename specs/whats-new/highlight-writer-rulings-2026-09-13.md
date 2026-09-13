# The plain-English writer — the Director's operating rulings

Interview 2026-09-13, 18:45 IST, after #3703 (the writer), #3705 (entry links)
and #3706 (rulings) merged and all four migrations were applied. State at the
time: 4,957 entries, 1,304 carrying their own page link, **0 write-ups written**.

## Rulings

**1. Backlog: the last month only, then stop.** Roughly 800 changes get a
plain-English version; the older ~4,100 stay as they are — readable, grouped,
linked, just not rewritten. He rejected both "only from now on" and "work
backwards through everything". Needs a hard cut-off date recorded in the code so
a re-run cannot creep further back.

**2. Cadence stays at twice an hour** (`13,43 * * * *`). He was shown the
once-a-day option and its argument — that the sync only runs each morning anyway,
and that a fault repeats 48 times a day before anyone notices — and kept the
existing schedule. There IS a per-run cap in `selectHighlights` (`scored.slice(0,
cap)`), so the 800-entry backlog drains gradually rather than in one spike. Do not
remove that cap.

**3. The multi-app work starts NOW, in parallel** — not after the writing is
proven on MyJKKN. His ruling "one shared list, seen from every app" has been
unbuilt since 12 Sep; `scripts/sync-changelog-db.mjs` still hardcodes
`const APP_KEY = 'myjkkn'`. He accepted the stated risk: debugging the writing and
the ten-app plumbing at the same time, and a bad reading style reaching ten apps
at once.

**4. Click-through answers ONE question: did announcing a change make anyone use
it?** Per change: how many people opened the page it points to *after* reading
about it. Not a popularity ranking, not a readership count. This requires joining
the link to the subsequent visit in `usage_events` — more work than counting
clicks, and he chose it knowingly.

## Edge cases

**5. A hidden write-up is NEVER rewritten.** Once a super admin hides it, that
change gets no further attempt. The change still appears in the plain list
beneath. Rationale he accepted: a second machine attempt at the same change is
likely to be wrong the same way.

**6. If a change is later undone, its write-up comes down automatically.** Nobody
should be told to go try something that no longer exists. He accepted that not
every revert is detectable, so some will slip through.

**7. Every write-up carries a report-it link.** One tap from any reader. This is
the review layer — it replaces the approval queue he declined, by moving the check
from one person doing weekly work to every reader doing nothing until something
looks wrong. It also yields an honest measure of how often the writing is wrong.

**8. A super admin is notified after repeated failures.** The page degrades
gracefully — changes still appear, just without write-ups — but somebody is told.
`app/api/cron/whats-new-highlight-drafts/route.ts:360` already has an alert path
(`no seat owner configured for the max lane`); extend that rather than building a
second one. Precedent he was shown: three Instagram pipeline jobs failed from June
to September while dashboards read healthy
([[project_ig_pipeline_silent_failures_2026_09_08]]).

## The interaction worth recording

Ruling 2 (twice an hour) and the standing ruling that write-ups **publish
unreviewed** together mean a fault would repeat 48 times a day into a page nobody
checks. Rulings 5, 7 and 8 close that on their own:
- **7** puts a check in front of every reader, continuously, at no ongoing cost
- **8** means a silent stop is not silent
- **5** means a wrong one, once pulled, stays pulled

So the cadence choice is safe as ruled — but only *because* those three exist. If
any of them is dropped in implementation, the cadence should be revisited.
