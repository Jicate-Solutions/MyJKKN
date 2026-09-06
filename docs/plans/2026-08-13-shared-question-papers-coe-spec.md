# Shared Question Papers — COE schema spec

**Date:** 2026-08-13
**For:** JKKN COE team
**Decision:** link table; `ia_question_papers` and its UNIQUE constraint stay untouched.
**Context:** MyJKKN `/academic/mark-entry` (question-wise CIA entry) already resolves papers
by `course_code` across offerings. This closes the gap on the COE side so both systems
agree on what a paper is.

---

## 1. The problem

A course common to several programs — `24UGEN03` is the live example — is authored once.
But today:

- `ia_question_papers` is `UNIQUE (cia_setting_id, cia_round, course_offering_id, set_number)`.
- Generation inserts **one row per course offering**.
- COE's entry lookup filters on `course_offering_id`.

So a paper is bound to exactly one offering. MyJKKN resolves by `course_code` across all
offerings, so it finds the shared paper and its writes succeed (they are keyed by
`paper_id`, which `/api/v1/cia-marks/sync` honours). **COE's own entry screen does not.**
For the same course and round, MyJKKN shows the paper and COE shows "no paper" — the two
systems disagreeing about what a paper is, which is worse than either behaviour alone.

Requiring per-program generation would work, but it reintroduces the duplicate authoring
this feature exists to remove: the same questions, COs and K-levels keyed in N times, then
drifting apart.

## 2. The change

One new table. **No change to `ia_question_papers`, its UNIQUE constraint, or generation's
insert path.**

```sql
CREATE TABLE IF NOT EXISTS public.ia_question_paper_offerings (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paper_id           UUID NOT NULL REFERENCES public.ia_question_papers(id) ON DELETE CASCADE,
    course_offering_id UUID NOT NULL REFERENCES public.course_offerings(id) ON DELETE CASCADE,
    cia_round          INTEGER NOT NULL,
    institutions_id    UUID NOT NULL REFERENCES public.institutions(id),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by         UUID,

    -- One paper per offering per round. This is what stops two different shared
    -- papers both claiming the same offering, and it is the guarantee the array
    -- alternative would have had to rebuild after loosening the UNIQUE key.
    CONSTRAINT ia_qpo_unique_offering_round UNIQUE (course_offering_id, cia_round)
);

CREATE INDEX IF NOT EXISTS idx_ia_qpo_paper ON public.ia_question_paper_offerings(paper_id);
CREATE INDEX IF NOT EXISTS idx_ia_qpo_offering_round
    ON public.ia_question_paper_offerings(course_offering_id, cia_round);

COMMENT ON TABLE public.ia_question_paper_offerings IS
    'Additional course offerings served by a question paper authored under a different offering. Used for courses common to several programs (e.g. 24UGEN03). The authoring offering stays on ia_question_papers.course_offering_id and is NOT duplicated here.';
```

**Invariant:** the authoring offering lives on `ia_question_papers.course_offering_id` and
is never written to this table. A row here means "this paper *also* serves that offering".
Keeping them separate means existing lookups keep working untouched, and it stays obvious
which offering the paper was actually written for.

## 3. Lookup change

Everywhere COE resolves a paper for an offering — `app/api/pre-exam/internal-mark-entry`
and anything else filtering `ia_question_papers.course_offering_id`:

```
1. Direct:  ia_question_papers WHERE course_offering_id = ? AND cia_round = ? AND is_active
2. Else:    ia_question_paper_offerings WHERE course_offering_id = ? AND cia_round = ?
            → join to the paper
```

Direct wins when both exist: a program that authored its own paper uses its own, never a
shared one. Existing `cia_setting_id` preference and `set_number` ordering are unchanged
and apply after this resolution.

## 4. Populating the link

Generation (`POST /api/v1/ia/question-papers`) already walks the offerings for a
program + semester. For each offering:

- If **no** paper exists for that `course_code` + `examination_session_id` + `cia_round`
  anywhere in the institution → insert a paper as it does today.
- If one **does** exist under a different offering → insert a link row instead of a second
  paper.

That makes "author once" the default without anyone having to know the feature exists.

Worth deciding explicitly, and the reason this section is separate: whether an operator
can also link manually (a "share this paper with…" action). Automatic-on-generation covers
the real case; a manual path is only needed if papers get authored before the other
programs' offerings exist.

## 5. What MyJKKN needs back

Only one thing, and it is optional for correctness:

- `GET /api/v1/ia/question-papers` — include the linked offerings (or at least the linked
  `program_code`s) on each row. MyJKKN's banner currently names the paper's *authoring*
  program, which is correct but does not tell the user the paper is officially shared
  rather than borrowed.

MyJKKN needs **no** change to keep working: it resolves by `course_code` and writes by
`paper_id`, both of which are unaffected. This spec is about making COE agree.

## 6. Test checklist

- [ ] `24UGEN03` authored under program A; program B's offering resolves the same paper in COE's entry screen.
- [ ] Program B authors its own paper later → B now uses its own, A is unaffected.
- [ ] Marks entered from MyJKKN against the shared paper appear in COE for both offerings.
- [ ] Deleting the paper cascades the link rows and leaves no dangling reference.
- [ ] Attempting to link a second paper to an already-linked offering + round fails on the UNIQUE constraint.
- [ ] Generation run twice does not create duplicate papers or duplicate links.
- [ ] A course that is NOT shared is completely unaffected — no link rows, identical behaviour.

---

## Related, already agreed

- `question_marks` on `/api/v1/cia-marks/sync` — **shipped** 2026-08-13
  (`lib/cia/question-marks.ts`). Breakdown wins; a total written without a breakdown clears
  a stale one; R1–R3 validated server-side.
- Migration `20260812_add_question_marks_to_cia_marks.sql` — **still to be applied by hand**
  in the Supabase SQL editor. Until then every write fails with
  `column "question_marks" does not exist`.
- Absence = `cia_marks.grade = 'AAA'`. **Open question:** does the v1 sync's "record rejected
  if no component > 0 and `total_internal_marks` is 0" check exempt `AAA`? An absent learner
  is exactly that shape, so absent-only saves may currently bounce. Needs a smoke test.

## Still open on the COE side (not part of this spec)

- No v1 endpoint returns the mark-entry paper shape (`choice_group`,
  `parts[].num_to_answer`). MyJKKN derives it from `questions` + `template_parts`, which the
  detail endpoint already returns. Low priority — the server re-validates on save regardless.
- `GET /api/v1/cia-marks/report` emits only the 13 component codes, so saved `question_marks`
  cannot be read back. A faculty who saves 30 of 60 learners and returns the next day gets
  their component totals but not the per-question detail. The localStorage draft covers a
  single session only.
