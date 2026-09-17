# Data the institution collects and never shows — the Director's rulings

Interview 2026-09-13 evening, after a measured sweep found **32 populated columns
that never appear in a screen, hook or service**. His choices, verbatim options.

## Background — what was measured, and what the measurement got wrong

Of ~700 populated columns in tables with >50 rows, 32 never appear anywhere in
`app/`, `components/`, `hooks/` or `lib/services/`. They ARE often used in SQL and
RPCs — so they drive decisions — but no human ever sees them.

Two earlier attempts at this measurement were wrong and are recorded so nobody
repeats them: run 1's regex `[a-z_]{6,40}` excluded digits, so `logins_last_7_days`
could never match and produced five false positives; run 2 widened the search and
found FEWER (zero), which is impossible and is what exposed the bug. Only run 3,
excluding the generated `types/` directory (which contains every column and
therefore proves nothing), produced the real list.

**The method has a known blind spot.** `changelog_modules.href` — 65 populated
links the entry list never rendered — would NOT appear in this list, because href
IS referenced in code, just not where it mattered. So there are two shapes, and
only the first is findable by query:
- **never reaches a screen** — 32 found
- **reaches one screen, not the one that counts** — invisible to any grep, almost
  certainly larger

## Rulings

**1. Response time goes on the counsellor's own list.** `admission_leads.first_touch_at`
holds how fast each of 23,130 enquiries was first contacted. Eleven SQL files use
it; no counsellor has ever seen it. He chose the counsellor's own view over a
manager-only view and over a side-by-side comparison.

**2. `learners_profiles.fees_confirmed` is to be DELETED.** A flag on all 7,427
learners, `false` on every row, never set true, read by no screen. Not hidden
value — a dead field. Removing it stops anyone later building a report on a
column that is always "no".

**3. OBE course targets are HIGH priority, as accreditation evidence.**
`obe_course_outcomes` holds target percentages, taxonomy levels and attainment
thresholds across 6,832 rows. Assessors ask for exactly this and it is currently
rebuilt by hand at accreditation time.

**4. Both a full review AND an automatic check.** He picked two options: go
through all 32 properly and hand him a list, AND build something that flags
"collected but never shown" so it cannot silently accumulate again. The check
must handle the blind spot above or it will miss the href class entirely.

## Edge cases

**5. Response time counts REAL time, always — not working hours.** An enquiry at
23:00 Sunday answered at 09:00 Monday reads as ten hours. He was shown the
working-hours option and the risk in its text, and chose real time: the enquirer
genuinely waited all night, and that is the number that matters for admissions.

> **Mitigation applied without asking, because it costs nothing and respects the
> ruling:** show the arrival time next to the answer time — "Arrived 11:04pm Sun ·
> answered 9:12am Mon" — rather than a bare "10 hours". The raw facts let a reader
> make the fairness judgement themselves, without introducing a second computed
> number for people to argue about. **Watch for the predictable behaviour change:**
> a counsellor who sees their own real-time number and cannot pause the clock has
> an incentive to answer at midnight. If after-hours replies start climbing, that
> is this ruling working as designed, and worth revisiting then.

**6. Course targets show MISSES, not only successes.** A screen that shows only
successes is not evidence, and assessors notice. Misses appear alongside what was
done about them.

**7. A link to a page someone cannot open is HIDDEN for them.** No dead ends. The
cost he accepted: they never learn that part of the system exists.

**8. Click-throughs from What's New ARE recorded, at individual level.** He was
offered totals-only and chose full tracking: without it, nobody can say whether
announcing a change makes anyone use it.

> **One second-order effect worth naming, not re-asking.** `usage_events` records
> what people DO. This records what people READ, which the institution has not
> logged before. If staff come to believe their reading is watched, the rational
> response is to read less — which defeats the page. Two things reduce that:
> ruling 7 means click-through is measured only among people who could act (a
> clean denominator, not a polluted one), and the metric that matters is the RATE,
> which totals alone would give. If anyone raises it, totals-only remains available
> without losing the answer.

## Interaction worth knowing

Rulings 7 and 8 fit together well: because blocked links are hidden, a
click-through rate is computed over people who could actually act on the change.
That is a more honest denominator than counting everyone who saw the page.
