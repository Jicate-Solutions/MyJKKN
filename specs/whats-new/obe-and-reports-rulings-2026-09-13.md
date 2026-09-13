# Course targets, report-it, and the tick-box that turned out not to be dead

Interview 2026-09-13, 22:20 IST. Seven rulings, two of which correct earlier ones.

## Corrections to earlier rulings

**1. `learners_profiles.fees_confirmed` — DO NOT DELETE YET. Investigate first.**
His earlier ruling was delete. It cannot be executed: `pg_depend` reports **3
dependent objects** and the live function `trigger_detect_fee_dimension_change`
reads the column. The lane correctly refused to write the migration blind.

> **The finding is better than the one we started with.** I described this as a
> dead flag — `false` on all 7,427 rows, read by no screen. True but incomplete:
> it is *written by a trigger on every fee-dimension change and never read by a
> human*. So it is not unused machinery; it is a computed fact nobody can see —
> the same shape as `first_touch_at`, and a more interesting problem than
> "delete an unused column". Establish what the trigger computes before deciding.

**2. The write-up backlog cut-off is now REVISITABLE, not permanent.** Earlier he
capped write-ups at the last month (~800 of 4,957). Asked whether the excluded
~4,100 are permanently excluded, he chose to revisit once the writing is proven.
So the cut-off stands today and the decision returns to him after a month of
real output.

## New rulings

**3. Next priority is OBE course targets** — ahead of the multi-app groundwork and
ahead of the 32-column review. Self-contained, useful immediately, depends on
nothing else finishing. 6,832 records currently rebuilt by hand at accreditation
time.

**4. A HOD sees only their own department's courses; a Principal their college.**
Matches the platform's existing scoping, so nobody learns a new rule. Consequence
he accepted: nobody compares across departments except at the top.

**5. Show every course, MARK the incomplete ones** — do not hide them. He was
shown that an assessor might therefore see how much is missing, and chose it
anyway, consistent with his earlier "show misses, not only successes".

> **Interaction worth naming:** rulings 4 and 5 together mean the institution-wide
> completeness picture is visible only to Principals and super admins. If the
> person who could fix record-keeping across departments is IQAC rather than a
> Principal, they may not be able to see the problem. Worth checking who that is
> before building, rather than discovering it after.

**6. Three reports and a write-up comes down automatically.** The report-it table
is currently a TALLY only — its own comment says "nothing here changes a
highlight's status" — so this is new behaviour, not a tweak. One annoyed reader
cannot remove anything; three genuinely concerned ones can. A super admin can
restore it.

> **Implementation detail that must not be fudged:** ruling "a hidden write-up is
> NEVER rewritten" was made about a SUPER ADMIN hiding something — a human
> judgement. An auto-hide at three reports is a different event and must be
> recorded as such, or a restored write-up becomes permanently unwritable by the
> never-rewrite rule. Two distinct reasons, one status.

**7. The app-open recorder switches on per person immediately** — as soon as
someone opens an app once, they start seeing that app's news. No four-week
collection period. Simplest to explain and nobody is wrongly excluded;
the accepted cost is that nobody discovers an app they have never opened.
