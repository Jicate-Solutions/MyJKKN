# SCF Free-Text Carry-Forward — Spec (Director-interviewed, 2026-07-19)

**Status: DECIDED — build immediately.** All 8 decisions below chosen by the
Director via AskUserQuestion interview, 2026-07-19 ~08:15 IST. Extends the live
checklist carry-forward (#1624) — does not replace it.

## One sentence

When a learner writes something real in the feedback box, the next check-in for
that course asks about it in their own terms — "you mentioned the session pace —
better this week?" — with the AI summarizing their words back **privately**, and
Senior Learners seeing only anonymous course-level counts.

## What exists today (verified on prod 2026-07-19)

- Checklist carry-forward LIVE since #1624: unmet checklist items re-asked next
  same-course session (Yes/Partly/No riding `[carry-forward: …]` markers in
  `free_text`). 2,034 answers total, ~200–235/day.
- `fn_scf_carryforward_for_learner(p_lookback_days=30)` — self-scoped SECDEF;
  pending-sessions × prior-flagged-rows join.
- Free-text population (14 days): 56,514 check-ins → 3,105 free texts → 724
  substantive (≥15 chars) → categories: understanding ~106, materials/lab ~55,
  pace ~10, mentions-a-person ~11, praise-flavored ~190. **Real volume ≈ 10–25
  concerns + ~14 praise/day.** "No"/"Nil"/"good" = nothing-to-add, never carried
  (established corpus semantics).

## Decisions (Director, 2026-07-19 interview)

| # | Question | Choice |
|---|---|---|
| 1 | What carries | **Problems + praise** — concerns get the "better this week?" re-ask; praise gets a one-line acknowledgment ("glad it worked for you last time"), no question |
| 2 | Texts mentioning a person (sir/madam…) | **Treat like any concern** — re-asked like everything else (channel consistency over special-casing) |
| 3 | Persistence | **Same rule as checklist carry** — appears at next check-in for that course until answered once; 30-day fade |
| 4 | Visibility | **Learner + anonymous counts for the Senior Learner** — counts of re-raised/resolved per course, never words, never names |
| 5 | Count floor | **≥3 learners** with active carries in the course before ANY count shows (trajectory-card privacy-floor doctrine) |
| 6 | Multiple concerns in one text | **One question per concern** (cap 3 per text) — precision over speed |
| 7 | AI not ready / down | **Skip silently** — an AI line renders only when a real one exists; never a template, never a raw quote (learner-notes fallback precedent) |
| 8 | Concern despite a 5/Clear rating | **Carry anyway** — words count on their own; rating and words are separate signals |
| 9 | Checklist banner wording (re-interview) | **Fix the inverted copy** — the banner listed unmet items after "you flagged", reading as if they HAPPENED; now "you flagged these as missing: …" |

> Re-interview 2026-07-19 ~09:45 IST (first submission was accidental): all 8
> original decisions re-asked via AskUserQuestion and CONFIRMED unchanged;
> decision 9 added from the Director's live screenshot of the inverted banner.

## Craft decisions (autonomous)

- **Nightly ₹0 classification+summary job** on the AI-jobs lane (registry type
  `scf.freetext_carry`, `interactive=false` — the chat drain never serves
  non-chat interactive types). Processes yesterday's substantive free texts
  (junk pre-filtered in SQL: the "no/nil/good/ok…" list + <15 chars). Output per
  text: `{kind: concern|praise|none, items: [≤3 × {summary ≤12 words}]}`.
- **Prompt-injection hardening:** learner text is DATA in the prompt; JSON-only
  output; summaries stripped of `[`/`]`, capped 120 chars, neutral tone.
- **Storage:** `scf_freetext_carry` — one row per extracted item (concern or
  praise), FK to the source `session_feedback` row; `answer`/`answered_at`
  columns filled when the learner responds. RLS deny-all direct; reads/writes
  via SECDEF fns only (learner-notes privacy model).
- **Answers are stored STRUCTURED** (per-concern row update via
  `fn_scf_answer_freetext_carry`) **and** stamped into `free_text` as
  `[freetext-carry "…": Yes|Partly|No]` markers — track-both, so the existing
  marker-reading analysis keeps working and the counts card never regresses to
  text-grepping.
- **Delivery:** extend `fn_scf_carryforward_for_learner` with a second result
  set / added columns carrying the pending items for each pending session;
  dialog renders one Yes/Partly/No block per concern + a one-line praise ack.
- **Senior Learner counts:** `fn_scf_freetext_carry_counts()` — facilitator-
  scoped (faculty_email join, same as session_feedback), returns per-course
  `{active, resolved, partly, not_better}` counts ONLY when distinct learners
  ≥ floor. Small card on the facilitator SCF page.
- **Config rows** (platform_policies, global): `scf.freetext_carry.enabled`
  (true — kill switch), `scf.freetext_carry.count_floor` (3),
  `scf.freetext_carry.max_concerns_per_text` (3).
- **Terminology:** learners / Senior Learners / sessions everywhere.

## Anonymity boundary (unchanged line, one deliberate addition)

Feedback CONTENT still never reaches Senior Learners — the ONLY new flow is
**course-level counts under a ≥3-learner floor** (Director decision 4+5, an
informed relaxation consistent with existing aggregate surfaces). The learner's
summarized words render ONLY inside their own check-in dialog (self-scoped
SECDEF). Leadership gets nothing new in v1.

## Measure (the loop)

- Adoption: % of re-asks answered; answer mix (Yes/Partly/No).
- Efficacy: share of concerns answered "Yes, better" within 2 re-asks.
- Guard: false-carry rate (praise/none misclassified as concern) — weekly spot
  sample of 20; >10% → tighten prompt.

## Explicitly out (v1)

- No leadership surface, no per-learner facilitator view, no escalation hook
  (the learner-notes queue is a separate unstaffed lane being fixed separately).
- No re-ask on the SAME session's text (nightly batch = next-day earliest).
- No retro-processing of texts older than 7 days at launch.
