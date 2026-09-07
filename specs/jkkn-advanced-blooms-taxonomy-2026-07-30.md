# JKKN Advanced Bloom's Taxonomy — Specification

**Status:** Draft for Director / IQAC ruling
**Date:** 2026-07-30 · **Revised:** 2026-08-05 — structure changed to *Bloom's six retained + three added* (Director's design); **A4 Performed Skill adopted, A5 reserved** after auditing against all three Bloom domains
**Revised:** 2026-08-15 — **`A5` is "Accountable AI Use" and is ACTIVE** (Director, 2026-08-15, confirming the 2026-08-06 rulings of record). Element counts corrected to **eleven**; §3, §8.2, §10 and §12 reconciled against the LIVE catalog, which was already ahead of this document.
**Revised:** 2026-08-15 (later same day) — **§8.4 and §10 row 4 corrected.** They claimed four of the
five UI surfaces were already three-way; measured on `jicate/main`, **none were**. §12's UI proof is
recorded as not-yet-satisfiable for the reason given there.
**Applies to:** Regulation R-2026 onward, all institutions
**Supersedes:** nothing. Extends the existing `blooms` / `finks` taxonomy configuration.

---

## 1. Name and definition

> **JKKN Advanced Bloom's Taxonomy (JABT)**
> Bloom's six levels and their verbs, retained unchanged, **plus five dimensions his taxonomy
> cannot assess** — Human Dimension, Caring, Learning How to Learn, Performed Skill, and
> Accountable AI Use.

**Mandatory attribution line.** This sentence must appear wherever JABT is formally defined
(syllabus front matter, IQAC papers, accreditation returns, published articles):

> JKKN Advanced Bloom's Taxonomy: Bloom's revised cognitive taxonomy (Bloom et al., 1956;
> Anderson & Krathwohl, 2001) retained in full, extended by three dimensions drawn from
> L. Dee Fink's Taxonomy of Significant Learning (*Creating Significant Learning Experiences*,
> 2003) — Human Dimension, Caring, and Learning How to Learn; by Performed Skill, operationalising
> Bloom's uncompleted psychomotor domain in three bands after Simpson (1972); and by Accountable
> AI Use, which has no precedent in either author.

**The distinction that keeps the name honest — and the four additions do not share one source:**
`A1`–`A3` are **Fink's**. `A4` is **Bloom's own** psychomotor domain, finally given assessable
bands. `A5` is **neither** — the thing it assesses did not exist when either author was writing.
The six levels remain Bloom's. JABT is JKKN's implementation. Never present `A1`–`A3` as Bloom's own.

### Why "Advanced" — and what the word does NOT claim

**"Advanced" means advanced beyond the standard single-taxonomy implementation. It does not mean
advanced beyond Bloom.** This must be stated whenever the name is challenged; it is the first
thing a reviewer will ask.

JABT advances on **standard practice**, not on Bloom's scholarship, in three specific ways:

1. It adds three learning dimensions that Bloom's cognitive taxonomy does not contain.
2. It raises metacognition from a knowledge *type* (revised Bloom, 2001) to a learning *goal*.
3. It attaches an **evidence rule** to every element (§5), which no version of Bloom's specifies.

If asked "advanced by whose assessment?", the answer is: *by comparison with our own prior
implementation, which used Bloom's cognitive levels alone.* Verifiable from the Appendix;
requires no external authority.

---

## 2. Structure — six retained, five added

Fink's taxonomy and Bloom's overlap on one half. That half is **already Bloom's**, so it is not
re-imported. Only the unmapped half is added.

### 2.1 The crosswalk (why only three come from Fink)

| Fink dimension | Bloom equivalent | Action |
|---|---|---|
| Foundational Knowledge | **K1 Remembering + K2 Understanding** | already covered — not added |
| Application Skills | **K3 Applying** | already covered — not added |
| Integration | **K4 Analyzing · K5 Evaluating · K6 Creating** | already covered — not added |
| **Human Dimension** | *(none)* | **ADDED** |
| **Caring** | *(none)* | **ADDED** |
| **Learning How to Learn** | *(none)* | **ADDED** |

### 2.2 The eleven elements of JABT

**Retained from Bloom's — verbs unchanged, K-codes unchanged:**

| Code | Level | Verbs (unchanged) |
|---|---|---|
| `K1` | Remembering | define, list, recall, name, identify |
| `K2` | Understanding | explain, describe, classify, summarize |
| `K3` | Applying | use, solve, demonstrate, execute, implement |
| `K4` | Analyzing | differentiate, compare, examine, break down |
| `K5` | Evaluating | justify, critique, judge, argue, assess |
| `K6` | Creating | design, construct, develop, formulate, produce |

**Added — five, all in use:**

| Code | Dimension | Source | What it asks |
|---|---|---|---|
| `A1` | Human Dimension | Fink | what the learner came to understand about themselves and others |
| `A2` | Caring | Fink | what the learner came to value, choose, or care about |
| `A3` | Learning How to Learn | Fink | whether the learner can carry on learning without being taught |
| `A4` | Performed Skill | **Bloom's own psychomotor domain** | whether they can do the physical act unaided, and adapt it |
| `A5` | Accountable AI Use | **neither — new** | whether they can direct an AI tool, catch its errors, and answer for the result. **Active, used sparingly — a Board of Studies opts a course in.** |

### 2.2a A4 bands (Simpson's seven, collapsed to three)

| Band | Covers Simpson stages | The distinction |
|---|---|---|
| `A4-a` Guided | Perception · Set · Guided Response | completes it **with help** |
| `A4-b` Independent | Mechanism · Complex Overt Response | completes it **reliably, alone** |
| `A4-c` Adaptive | Adaptation · Origination | **adjusts** when the case is not standard |

Seven stages is more than a bench examiner can judge reliably; three carries the information that
matters. A4-a/b/c map directly onto the practical mark scheme (§6.3): technique, result, and the
viva question *"what would you do if this failed?"*

**Eleven elements, all in use** — Bloom's six plus five added, exactly as seeded live. No existing K-code changes meaning. No re-tagging of the
9,262 existing K-code assignments is required.

**Why A5 is active (revised 2026-08-15).** It was first written *reserved*, on the reasoning that a
framework whose first coverage check had never run should not carry speculative elements. The
2026-08-06 rulings of record activated it, and the Director confirmed both the name and the active
status on 2026-08-15. The restraint moved rather than disappeared: A5 is **used sparingly — a Board
of Studies opts a course in**, it does not apply by default. **A4 remains adopted on evidence** — 41
first-year practicals and seven psychomotor stages nothing could assess.

### 2.3 Physical skill — resolved by A4, not by widening K3

**Superseded 2026-08-05.** An earlier draft handled physical skill by widening `K3`'s evidence
rule ("in a practical, Applying is evidenced by the performed act"). Audited against Simpson's
**seven** named psychomotor stages, that was plainly under-specified: one point cannot separate a
learner who imitates with help from one who adapts to an unfamiliar case, and JKKN has **41
first-year practicals** where exactly that difference matters.

**`A4` now carries the psychomotor domain.** `K3` returns to being *cognitive* application —
which is what Bloom meant by it.

---

## 3. Codes

| Code | Element | Origin | Status in DB |
|---|---|---|---|
| `K1`–`K6` | Bloom's six levels | Bloom | **live** — 9,262 taggings, 887 courses |
| `A1` | Human Dimension | Fink | **live** — already a valid code |
| `A2` | Caring | Fink | **live** |
| `A3` | Learning How to Learn | Fink | **live** |
| `A4` | Performed Skill | Bloom (psychomotor) | **live** — seeded (bands `A4-a/b/c`) |
| `A5` | Accountable AI Use | new | **live** — seeded, active |

The added codes are an **open series**, and the series has already been used once as designed:
`A4` entered on evidence in August 2026 without disturbing anything above it, and `A5` followed on
the 2026-08-06 rulings through the same mechanism. A sixth would enter as `A6`.

This is the reason the additions are *not* numbered `K7`–`K9`. `K1`–`K6` is a **hierarchy**
(`bos_taxonomy.is_hierarchical = true` for `blooms`); a `K7` would assert that Human Dimension
ranks above Creating, and a `K10` would rank above that. The `A` series is deliberately **flat and
unordered** — `A1` is not lower than `A3` — which is both true to Fink's model
(`is_hierarchical = false` for `finks`) and the only shape that can be extended safely.

`K1`–`K6` and `A1`–`A3` already exist in production under their Bloom and Fink names.
**`A4` and `A5` were new codes requiring seeding** (§8.2). **Both are now seeded** — verified
against the live catalog 2026-08-15: all eleven codes present, replicated across 13 boards
(143 `bos_taxonomy_levels` rows).

### 3.1 Code mapping from the legacy `finks` taxonomy

| Legacy `finks` code | JABT code | Note |
|---|---|---|
| `FK` Foundational Knowledge | `K1` + `K2` | already Bloom's |
| `AP` Application Skills | `K3` | already Bloom's |
| `IN` Integration | `K4` · `K5` · `K6` | already Bloom's |
| `HD` Human Dimension | **`A1`** | added |
| `CA` Caring | **`A2`** | added |
| `LHL` Learning How to Learn | **`A3`** | added |

**No destructive migration.** The `blooms` and `finks` taxonomies keep their own codes and their
own rows; nothing existing is rewritten. A course is remapped only when its board moves to
`jkkn_advanced`, and then only that course. The 900 existing `HD`/`CA`/`LHL` taggings stay valid
under `finks` for as long as any board remains on it.

### 3.2 Verbs for the three added dimensions

Bloom's verb lists are unchanged. `bos_taxonomy_levels.verb_examples` is currently an **empty
array `{}`** for all Fink levels, so Senior Learners have no wording guidance for the additions. Seed:

| Code | Verbs |
|---|---|
| `A1` | act as · take responsibility for · respond to · judge one's own part · collaborate with |
| `A2` | choose to · commit to · defend · prioritise · sustain an interest in |
| `A3` | plan one's own learning · self-assess · seek out · revise an approach · question |
| `A4` | perform · handle · operate · dissect · titrate · adjust · improvise |
| `A5` | direct · check · correct · answer for · decline to use |

> ⚠️ Drafted for this spec; **not** checked against Krathwohl's published affective verbs.
> Requires academic review before seeding.

---

## 4. Where the three additions are assessed

| Element | Written external (3h) | Practical external (4h) | Internal (CA + Capstone) |
|---|:--:|:--:|:--:|
| `K1`–`K2` | ● | ● (viva) | ● |
| `K3` (cognitive) | ● | ● | ● |
| `K3` (performed act) | ○ | ● | ● |
| `K4`–`K6` | ● | ● | ● |
| **`A1`** | ○ | ◐ observed conduct | ● |
| **`A2`** | ○ | ◐ honest recording | ● |
| **`A3`** | ◐ unseen material only | ● unknown sample | ● |

**The three additions are essentially internal-assessment territory.** A written paper cannot
reach `A1` or `A2` at all, and reaches `A3` only through unseen material. That is the honest
ceiling of three hours with a pen, not a defect to fix.

---

## 5. Evidence rule

An element is only assessed when the learner produces **evidence that could not exist unless
they performed the act.**

| Element | Evidence that counts | Evidence that does NOT |
|---|---|---|
| `K1`–`K6` | written answer, worked solution, viva | — |
| `K3` in a practical | the performed act, observed or recorded | a description of the act |
| **`A1`** | observed conduct · a named-person interaction · a role taken | a reflection essay asserting growth |
| **`A2`** | a sustained choice · honest recording of an inconvenient result | a paragraph claiming to care |
| **`A3`** | work on material never taught · a revised approach with reasons | a description of study habits |

**The `A1` / `A2` rule is load-bearing.** Both are trivially faked in prose, and a language model
writes that prose best. They must be evidenced by **observation or by a real interaction with a
named person** — never by self-report alone.

---

## 6. What changes in assessment practice

### 6.1 Internal — already built
v3.5 template, live across 241 courses: one Concept Application per unit + five Capstone options
carrying the 10-mark internal, rubric `[1,2,2,2,3] = 10`. **The template does not change.** What
changes is the *distribution* — see §7.

### 6.2 Written external — no regulatory change
1. **Add cross-unit / case items** — reach `K4`–`K6` properly (currently almost unused).
2. **Add unseen-material items** — the only route to `A3` on paper.

### 6.3 Practical external — a mark scheme, not a regulation
Divide the existing practical total into what the examiner already observes:

| Sub-component | Element |
|---|---|
| Result / accuracy | `K3` performed |
| Technique & procedure | `K3` performed |
| Safety & specimen handling | `A1` |
| Honest recording of anomalies | `A2` |
| Viva: why this test, what if it failed | `K4`–`K6` + `A3` |

> ⚠️ **Blocker.** 0 of 24 first-semester practicals record an `exam_scheme`, and 6 (18 credits)
> name no experiments. §6.3 cannot be implemented until those are filled.

---

## 7. The coverage rule (the operative requirement)

> **Every course must carry at least one Concept Application in the added half — `A1`, `A2`, or
> `A3`. A course whose tasks all fall under `K1`–`K6` is, in practice, still running the old
> taxonomy.**

Verified against 8 sampled courses, 40 authored tasks (2026-08-05):

| | Bloom-covered (`K1`–`K6`) | Added half (`A1`/`A2`/`A3`) |
|---|---|---|
| As shipped | **33 of 40 (82.5%)** | 7 of 40 (17.5%) |
| After re-authoring 15 tasks | 21 of 40 | **19 of 40 (47.5%)** |

**Three of eight courses had nothing at all in the added half** — Invertebrata I, Principles of
Accountancy, GE Mathematics I. Closing that took an edit to 15 of 40 task wordings: no new
assessment, no extra student load, no regulatory change.

---

## 8. Data model and migration

### 8.1 New taxonomy row — config, not code
`bos_taxonomy` is per-institution with `UNIQUE (institutions_id, code)`. `jkkn_advanced` is free.

```sql
INSERT INTO bos_taxonomy (institutions_id, code, name, description, is_hierarchical, is_system, is_active)
SELECT i.id, 'jkkn_advanced', 'JKKN Advanced Bloom''s Taxonomy',
       'Bloom''s six levels retained unchanged, extended by Human Dimension, Caring and Learning How to Learn.',
       false, true, true
FROM institutions i
WHERE NOT EXISTS (
  SELECT 1 FROM bos_taxonomy t WHERE t.institutions_id = i.id AND t.code = 'jkkn_advanced'
);
```

> Use `WHERE NOT EXISTS`, **not** `ON CONFLICT` — see memory
> `feedback_seed_platform_policies_expression_unique_index` (42P10 on expression indexes).

### 8.2 Seed eleven levels — ✅ ALREADY DONE, verified live 2026-08-15
`bos_taxonomy_levels`: `K1`–`K6` copied verbatim from the institution's existing `blooms` rows
(same names, same `verb_examples`), then `A1`–`A5` at `sort_order` 7–11 with the verbs from §3.2.

> ✅ **This step has already been carried out.** The live catalog carries all eleven codes for
> `jkkn_advanced`, replicated across 13 boards — 143 rows, `A5` already named **"Accountable AI Use"**.
>
> ⚠️ **Correction to an earlier draft of this section:** it instructed seeding `A5` with
> `is_active = false`. **`bos_taxonomy_levels` has no `is_active` column** (its columns are `id,
> taxonomy_id, code, name, description, verb_examples, sort_order, created_at, updated_at`), so that
> instruction was never implementable. Activeness lives on the parent `bos_taxonomy` row, not on the
> level. A5's "used sparingly" restraint is therefore a **policy**, enforced by a Board of Studies
> opting a course in — not a flag on the level row.

`A4`'s three bands (`A4-a/b/c`) are **not** separate taxonomy levels — they are a band recorded on
the assessment, like a rubric score. One level row, three possible values.

### 8.3 🔴 Two CHECK constraints will reject `jkkn_advanced`

Both hard-code `('blooms','finks')`. Alter **before** any write, or every update fails:

```sql
ALTER TABLE obe_regulation_config DROP CONSTRAINT obe_regulation_config_taxonomy_type_check;
ALTER TABLE obe_regulation_config ADD CONSTRAINT obe_regulation_config_taxonomy_type_check
  CHECK (taxonomy_type = ANY (ARRAY['blooms','finks','jkkn_advanced']));

ALTER TABLE curriculum_lesson DROP CONSTRAINT chk_curriculum_lesson_primary_taxonomy;
ALTER TABLE curriculum_lesson ADD CONSTRAINT chk_curriculum_lesson_primary_taxonomy
  CHECK (primary_taxonomy IS NULL OR primary_taxonomy = ANY (ARRAY['blooms','finks','jkkn_advanced']));
```

`bos_regulation_taxonomies.taxonomy_type` is `varchar` with **no** check — it accepts the new
value silently. Enforcement is inconsistent across the schema; a matching check there is
recommended.

### 8.4 UI surfaces that branch binary
These read `isBlooms ? … : …`, so a third value renders as "Fink's" until each is made three-way.

> 🔴 **Corrected 2026-08-15.** An earlier revision of this section — and of §10 row 4 — implied that
> four of the five surfaces below had already been made three-way. **That was false.** It was
> inferred from grepping the `taxonomy_type ===` idiom alone, which never matches
> `useState<'blooms' | 'finks'>` or a ternary on a local variable. Measured on `jicate/main`:
> `git grep -l jkkn_advanced` returned **three files** — this spec, `supabase/SQL_FILE_INDEX.md`, and
> `supabase/migrations/20260908034127_fp_items_bloom_level.sql` — **none of them TypeScript**. No UI
> surface handled the third value at all.
>
> **Grep for the VALUE (`jkkn_advanced`), never for one branching idiom.**

| Surface | State |
|---|---|
| `app/(routes)/academic/obe/page.tsx` | ✅ **three-way** — PR #3089, the first UI surface anywhere to handle `jkkn_advanced` |
| `app/(routes)/academic/obe/regulation-config/page.tsx` | 🔴 **binary — the most consequential, because it WRITES the value.** `useState<'blooms' \| 'finks'>` (line 17), two `RadioGroup`s hard-coded to the legacy pair, and `taxonomyType === 'blooms' ? … : …` in the summary. A regulation set to `jkkn_advanced` renders with **neither radio selected** and a summary reading "Fink's". |
| `app/(routes)/bos/taxonomy/_components/taxonomy-badge.tsx` | 🔴 binary |
| `app/(routes)/bos/taxonomy/_components/board-taxonomy-table.tsx`, `taxonomy-form.tsx` | 🔴 binary |
| `types/obe.ts:4` — `export type TaxonomyType = 'blooms' \| 'finks'` | 🔴 **root cause.** Cannot be widened on its own: widening it breaks `regulation-config/page.tsx`'s `useState`, which narrows to the legacy pair. The two must be fixed together. |

**§12's UI proof is not satisfiable yet.** `/academic/obe` reads `useMockRegulationConfig` — a
hard-coded mock whose `taxonomy_type` is `'finks'` — so no stored regulation value reaches the page.
"Open `/academic/obe` with a regulation set to `jkkn_advanced`" cannot be performed until that
surface is wired to real config.

### 8.5 No data migration
All 9,262 K-code taggings keep their exact meaning. All 1,880 Fink taggings remain valid.

---

## 9. What does NOT change

- **Bloom's verbs.** Unchanged, in full. No Senior Learner retraining on the six levels.
- **K1–K6 on course outcomes.** Unchanged, for university and accreditation returns.
- **`blooms` and `finks` taxonomy rows.** JABT is a third option, not a replacement.
- **The v3.5 template and the 241 shipped kits.** "AI-Aware Assessment Kit" is the *deliverable*;
  JABT is the *framework*. No reprint.
- **No additional spend.**

---

## 10. Adoption sequence

| # | Step | Owner | Blocked by |
|---|---|---|---|
| 1 | Director/IQAC ruling on the name and attribution line | Director | — |
| 2 | Academic review of the `A1`/`A2`/`A3` verb lists (§3.2) | IQAC + an academic lead for the learning framework | 1 |
| 3 | ~~Alter the two CHECK constraints; seed `bos_taxonomy` + eleven levels~~ ✅ **DONE** — both constraints admit `jkkn_advanced`, 143 level rows seeded (verified live 2026-08-15) | Dev | 1, 2 |
| 4 | Make the 5 UI surfaces three-way — **1 of 5 done** (PR #3089 made `app/(routes)/academic/obe/page.tsx` the first UI surface anywhere to handle `jkkn_advanced`; before it, none did). Four remain binary — `regulation-config/page.tsx` is next and matters most, because it WRITES the value. See §8.4 for the list and for the `types/obe.ts:4` root cause, which cannot be fixed independently of it. | Dev | 3 |
| 5 | Apply the §7 coverage rule to all 241 courses; re-author where the added half is empty | BoS | 1 |
| 6 | Correct the 177 mislabelled K6 outcomes | BoS | 1 |
| 7 | Fill 6 empty + 4 thin first-semester practicals (26 credits) | BoS | 1 |
| 8 | Record a practical exam scheme with §6.3 sub-components | CoE | 7 |
| 9 | Semester-1 report: added-half completion by school type and income band | IQAC | 3 |

---

## 11. Open decisions

1. ~~**Name confirmed?**~~ ✅ **CLOSED** — "JKKN Advanced Bloom's Taxonomy" / code `jkkn_advanced`, and `A5` = **"Accountable AI Use"**, active (Director, 2026-08-15).
2. **Default for R-2026, or opt-in per board?** (Today: 7 boards on `blooms`, 4 on `finks`.)
3. **Coverage minimum** — is one added-half task per course enough, or two of five?
4. **`A1`/`A2` in the practical** — mark-bearing, or observed-and-recorded but unweighted in
   year one?
5. **Internal split.** Kits print Internal 30 (CIA 15 + Activities 5 + Capstone 10); the 101
   recorded `exam_scheme` rows show 25/75. *The system does not currently say which applies.*

---

## 12. Verification

```sql
-- 1. taxonomy row exists per institution
SELECT count(*) FROM bos_taxonomy WHERE code='jkkn_advanced' AND is_active;

-- 2. eleven levels seeded, verbs non-empty
SELECT l.code, l.name, array_length(l.verb_examples,1) AS n_verbs
FROM bos_taxonomy_levels l JOIN bos_taxonomy t ON t.id=l.taxonomy_id
WHERE t.code='jkkn_advanced' ORDER BY l.sort_order;   -- expect 11 codes per board (13 boards = 143 rows)

-- 3. constraints accept the new value
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conname IN ('obe_regulation_config_taxonomy_type_check','chk_curriculum_lesson_primary_taxonomy');

-- 4. a regulation can be set to it (roll back after testing)
BEGIN; UPDATE obe_regulation_config SET taxonomy_type='jkkn_advanced'
       WHERE id=(SELECT id FROM obe_regulation_config LIMIT 1); ROLLBACK;
```

**UI proof (required — green SQL is not done):** open `/academic/obe` as a real role with a
regulation set to `jkkn_advanced` and confirm the card reads "JKKN Advanced", not "Fink's".
Per CLAUDE.md #2/#14 and `feedback_verify_behaviour_not_objects_after_migration`.

> ⚠️ **Not satisfiable yet (2026-08-15).** `/academic/obe` reads `useMockRegulationConfig`, a
> hard-coded mock whose `taxonomy_type` is `'finks'`. No stored regulation value reaches the page, so
> setting one to `jkkn_advanced` changes nothing on screen. The rendering itself is fixed (PR #3089,
> §8.4), but this proof stays **open** until the surface is wired to real config.

---

## Appendix — verified state, production `kvizhngldtiuufknvehv`

| Fact | Value | Read |
|---|---|---|
| Bloom K-code taggings | 9,262 across 887 courses (all cognitive) | 2026-07-30 |
| Fink dimension taggings | 1,880 across 146 courses | 2026-07-30 |
| Outcomes tagged K6 "Create" | 877 | 2026-07-30 |
| …opening with a bottom-rung verb | 177 (61 with "Explain" alone) | 2026-07-30 |
| Board-regulation taxonomy assignments | 7 `blooms`, 4 `finks` | 2026-07-30 |
| `obe_course_outcomes` | 6,040 rows; 4,823 carry a taxonomy level | 2026-07-30 |
| CO-PO attainment pipeline | mapping / marks / attainment tables — **0 rows each** | 2026-07-30 |
| Practical exam schemes recorded | 52; **0 with sub-components** | 2026-07-28 |
| First-semester practicals | 24; **0 with an exam scheme**; 6 name no experiments | 2026-07-28 |
| Sampled tasks in the added half | **7 of 40 (17.5%)** as shipped | 2026-08-05 |
| Courses carrying the v3.5 layer | 241 | 2026-07-30 |
