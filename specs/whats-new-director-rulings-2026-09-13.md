# What's New — the Director's rulings, 2026-09-13

Captured in a tappable interview on 2026-09-13, following the multi-app spec
(`specs/whats-new-multi-app-changelog-spec-2026-09-12.md`). His words, his
choices. Where a choice cannot be built as stated, that is said plainly rather
than quietly reinterpreted.

## Settled earlier, not re-asked

| Question | Ruling |
|---|---|
| Same list everywhere, or per-app? | **"One shared list, seen from every app."** |
| Public, or sign-in? | **Sign-in only.** Irreversible in practice; he declined the public option. |
| How much gets written well? | **"Highlights written well, rest left plain."** |
| Merge ordering (Sept) | **"Create tables first, then merge."** Done. |

## Settled 2026-09-13

**1. Every app's news appears on ONE page.** Not just MyJKKN's own. Each line is
labelled with the app it came from. He chose this over the recommended
own-news-only option — so the page must stay readable as ten apps' changes merge
into one stream. Labelling and filtering by app are not optional extras here;
they are what makes this choice work.

**2. Only a MyJKKN super admin can hide a line.** Not the individual app teams.
One group, traceable, slower by design.

**3. Small apps are in, even with very few changes.** An app with 40 entries
shows its 40. REQUIRES relaxing `FIRST_SEED_FLOOR` (currently refuses any sync
under 1,000 entries, as a broken-import guard). Relax it PER APP — do not remove
it. MyJKKN's own floor stays, or the guard that protects 4,933 entries is gone.

**4. The weekly plain-English write-ups are AI-written and publish unreviewed.**
No approval queue. He was shown the accuracy risk in the option text and chose
this deliberately, optimising for zero ongoing work.

> **Mitigation I am applying without asking, because it costs him nothing:**
> every AI-written highlight renders the original developer line beneath it, in
> smaller type. A wrong rewrite is then always checkable against its source, and
> a reader who doubts a claim can see what actually shipped. This matters more
> under ruling 1 than it would have otherwise: unreviewed text about ANY of ten
> apps now reaches EVERY MyJKKN reader, and the page's whole purpose is to teach
> people what they can now do. A confident wrong claim there is worse than a
> terse accurate one. If a highlight is ever found to be wrong, ruling 2 applies
> — a super admin hides it.

**5. Security lines are visible to super admins only.** He first said "show only
to developers"; there is no developer role in MyJKKN (`Engineer` in
permissions.ts is the College of Engineering, an institution). Offered the
choice, he took super-admin-only over creating a six-person Engineering role.
So: a `security` category entry is filtered out for every other reader — this is
a SERVER-side filter through `fn_changelog_visible_modules()`'s pattern, never a
page-level hide.

**6. A leaver's name becomes "JKKN Engineering", looked up automatically from
staff records.** Not a manual list — he chose the automatic option knowing it is
more to build. The sync has ZERO references to staff tables today, so this is a
new dependency: the changelog will need to read employment status. Two cautions
for whoever builds it: (a) the existing `IDENTITY` map in
`scripts/generate-changelog.mjs` already maps email → display name and is the
right place to layer this, not a new mechanism; (b) the lookup must fail SAFE —
if staff records are unreachable, keep the existing name rather than blanking
every author on the page.

**7. A retired app keeps its history, labelled as retired.**

**8. A joining app brings only changes from the day it joins.** Not its full
back-history. So the flood-on-day-one problem does not arise, and
`CHANGELOG_REF`-style collection needs a per-app start date.

## Not asked, and why

**"Which of the 17 Hub names are ours?"** — the spec's own recommendation 1 is
to have each Hub entry declare itself with a column, which settles the question
permanently instead of asking a person to confirm 17 names from a phone once and
then again every time an app is added. Build that; do not ask him to count.

**Poor commit messages in sibling repositories.** A technical choice, decided
here: apply the same `title-rules.mjs` filters that MyJKKN's own history goes
through. If a repository's messages are so thin that almost nothing survives the
filters, that is a finding to report to that team, not a reason to lower the bar
for everyone.
