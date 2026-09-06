# VAC Staging → Prod FK Mapping Audit

**Date:** 2026-06-11
**Staging:** Supabase project `hhprjbgknupaplivtoib`
**Prod:** Supabase project `kvizhngldtiuufknvehv`
**Mode:** Read-only audit. Zero writes issued to either database.

---

## Executive Summary (plain English)

- **The course content migrates almost cleanly.** Staging's reference UUIDs were copied from prod at some point, so they still line up: **7 of 8 institutions** and **52 of 53 programmes** referenced by VAC courses exist in prod with the *same UUIDs*. Courses + lessons + course-programme links can be copied with only two small fixes.
- **Two fixes needed before copy:** (1) 9 Engineering courses point at a hand-made test institution UUID (`a1111111-…`) that doesn't exist in prod — remap to prod's "JKKN College of Engineering and Technology" (`5de4fba1-4564-41ed-8c73-5d948b74b843`). (2) One programme — **B.A. Tamil** — doesn't exist in prod at all; it's referenced by exactly 1 course (`BA-TAM-SF-MATLAB`) and 1 link row. Director decision needed.
- **Do NOT migrate enrollments or learner progress.** Staging's 8 enrollments and 69 progress rows are test data: 4 fake user UUIDs (`1a111111-…` etc.) that don't exist even in staging's own auth table, plus `.local` test accounts. Only 2 real humans appear (director@jkkn.ac.in, krishnaveni_a@jkkn.ac.in), and their staging UUIDs ≠ their prod UUIDs (email remap possible but the rows are still test activity).
- **No collisions on prod.** Prod's existing VAC content is 1 course (`BDS-CR-101`, with 543 live enrollments and 1 lesson). No staging course shares its PK or its code. The 543 prod enrollments are untouched by a content copy.
- **Schema is near-identical.** Prod is a superset (extra `vac_lessons.case_scenario` jsonb — will be NULL for copied rows) with looser nullability. All staging values pass prod's CHECK constraints. One parity gap: prod **lacks** staging's `UNIQUE(code)` on `vac_courses`.

**Bottom line: courses/lessons/links = YES with 2 remaps; enrollments/progress = leave behind.**

---

## 1. Inventory

### Staging (`hhprjbgknupaplivtoib`)

| Table | Type | Rows |
|---|---|---|
| `vac_courses` | base table | **93** |
| `vac_lessons` | base table | **2,746** (all `is_published=true`) |
| `vac_course_programmes` | base table | **86** |
| `vac_enrollments` | base table | 8 (test data) |
| `vac_learner_progress` | base table | 69 (test data) |
| `vac_enrollments_with_details` | view | — |

Track distribution (the "6 CASE tracks" + matlab): `matlab` 86, `ai` 2, `ai_fluency` 1, `ai_capstone` 1, `ai_crossfunc` 1, `human_presence` 1, `human_principal` 1.

### Prod (`kvizhngldtiuufknvehv`)

Same 6 relations exist. Rows: `vac_courses` 1, `vac_lessons` 1, `vac_course_programmes` 0, `vac_enrollments` **543**, `vac_learner_progress` 0.

The 1 prod course: `128a9d24-1091-4bc8-ab24-0c77380fcb74` / `BDS-CR-101` / "BDS Clinical Reasoning" (JKKN Dental) — 543 enrollments (543 distinct users, 1 user orphan vs prod auth.users), 1 lesson ("Oral Lichen Planus — Mrs. Lalitha, 52F").

RLS is **enabled on all 5 base tables on both sides** — the migration session must write as service_role/postgres.

---

## 2. FK Map (declared constraints, identical on both sides)

| Table.column | References | Kind |
|---|---|---|
| `vac_lessons.course_id` | `vac_courses.id` | intra-VAC |
| `vac_course_programmes.course_id` | `vac_courses.id` | intra-VAC |
| `vac_course_programmes.programme_id` | `programs.id` | **external** |
| `vac_courses.programme_id` | `programs.id` | **external** |
| `vac_courses.institution_id` | `institutions.id` | **external** |
| `vac_enrollments.course_id` | `vac_courses.id` | intra-VAC |
| `vac_learner_progress.course_id` | `vac_courses.id` | intra-VAC |
| `vac_learner_progress.lesson_id` | `vac_lessons.id` | intra-VAC |

FK-LIKE columns **without** a declared constraint: `vac_enrollments.user_id`, `vac_learner_progress.user_id` (→ `auth.users`/`profiles` by convention). **Note:** no `vac_*` table has `created_by`/`updated_by` columns — the brief anticipated them, they don't exist.

`vac_courses.institution` is a plain **varchar label** (10 distinct values: the 8 college short-names + `Universal` ×5 + `All` ×1), not an FK. `Universal`/`All` rows are exactly the 6 with NULL `institution_id` — by design.

---

## 3. Per-table verdicts

### 3.1 `vac_courses` (93 rows) — verdict: **NEEDS-REMAP (minor — 2 fixes)**

**`institution_id`** — 87 non-null rows, 8 distinct UUIDs. Prod check: **7 of 8 exist in prod with byte-identical names → CLEAN-MAP**.

| Staging UUID | Name | Courses | In prod? |
|---|---|---|---|
| `b0b8a724-7c65-4f07-8047-2a38e8100ad5` | JKKN College of Arts and Science (Self) | 20 | ✅ same UUID+name |
| `a33138b6-4eea-4675-941f-1071bf88b127` | JKKN College of Arts and Science (Aided) | 14 | ✅ |
| `e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5` | JKKN Dental College and Hospital | 10 | ✅ |
| `9380358f-7020-4c23-89c3-e9538b47cf33` | JKKN College of Education | 10 | ✅ |
| `9c1554e8-12a2-4b76-a9d6-8242bb05eba1` | JKKN College of Allied Health Sciences | 9 | ✅ |
| `5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334` | JKKN College of Pharmacy | 8 | ✅ |
| `70e54e51-9b98-4e07-9534-a85310609bfd` | JKKN College of Nursing and Research | 7 | ✅ |
| `a1111111-1111-1111-1111-111111111111` | "JKKN College of Engineering" (staging test row) | **9** | ❌ → **NEEDS-REMAP** |

Name-based remap for the miss: prod has `5de4fba1-4564-41ed-8c73-5d948b74b843` = **"JKKN College of Engineering and Technology"** — unambiguous (only Engineering college among prod's 11 JKKN institutions). Supporting evidence: staging's own `programs` rows for the 5 BE/ME programmes already belong to an institution named "JKKN College of Engineering and Technology", and those programme UUIDs exist in prod under the same college.

**`programme_id`** — 86 non-null rows, 53 distinct UUIDs. Prod check (full 53-value VALUES-list probe): **52 of 53 exist in prod by UUID → CLEAN-MAP**. 18 of the 52 have *label drift only* (same UUID, prod renamed: e.g. staging `(BE) MEC` → prod `B.E. Mechanical Engineering`, staging `MDS` → prod `MDS (Prosthodontics)`, staging `(BSC) AECT` → prod `BSC (AECT)`) — no action needed, the UUID is the identity.

The 1 miss → **ORPHANED**: `a263dbc2-fc39-4f07-b44e-773a52a93f99` = **B.A. Tamil**, JKKN College of Arts and Science (Self). Prod name probe `ILIKE '%tamil%'` returns only "(B.Ed) - Pedagogy of Tamil" at College of Education — wrong college, wrong degree; **no natural-key match**. Blast radius: **1 course** (`BA-TAM-SF-MATLAB` "MATLAB for B.A. Tamil (Self)") + 1 `vac_course_programmes` row.

**Value-domain checks vs prod CHECK constraints:** `course_category` {add_on×91, value_add×2} ⊆ prod's `{add_on,value_add}` ✓; `nsqf_level` range 5–7 ⊆ prod 1–10 ✓; `nheqf_level` range 5–7 ⊆ prod 4–10 ✓.

**Collision:** staging has 0 courses with prod's PK `128a9d24-…` and 0 with code `BDS-CR-101` ✓.

### 3.2 `vac_lessons` (2,746 rows) — verdict: **CLEAN-MAP**

Only FK is intra-VAC (`course_id` → `vac_courses`), 0 orphans on staging — migrates together with courses, self-consistent. `ltl_phase` {learn×962, leverage×1784} ⊆ prod check `{learn,leverage,both}` ✓. Unique `(course_id, hour)` exists on both sides; staging satisfies it by construction and all staging course UUIDs are new to prod → no collision. Prod's extra `case_scenario` jsonb column will be NULL for copied rows (prod's 1 existing lesson uses it; staging has no equivalent data).

### 3.3 `vac_course_programmes` (86 rows) — verdict: **CLEAN-MAP except 1 orphan row**

`course_id` intra-VAC, 0 orphans ✓. `programme_id`: same 53-UUID set as `vac_courses.programme_id` (union-distinct = 53) → 52 CLEAN-MAP, **1 row orphaned** (the B.A. Tamil link). Unique `(course_id, programme_id)` — prod table is empty, no collision.

### 3.4 `vac_enrollments` (8 rows) — verdict: **ORPHANED — recommend DO NOT MIGRATE**

`course_id` intra-VAC ✓ (0 orphans). `user_id` (no declared FK) — 6 distinct users:

| Staging user_id | Identity (staging) | Exists in prod by UUID? | By email? |
|---|---|---|---|
| `1a111111-1111-…` | *(no auth.users / profiles row even on staging)* | ❌ | — |
| `2a222222-2222-…` | *(fake)* | ❌ | — |
| `3a333333-3333-…` | *(fake)* | ❌ | — |
| `4a444444-4444-…` | *(fake)* | ❌ | — |
| `a4f22369-…c8d3a` | director@jkkn.ac.in | ❌ | ✅ prod UUID `b2bcb548-6b4c-4c75-a6b3-72dd5e9a94f1` |
| `b4444444-4444-…` | test.student@jkkn.local | ❌ | ❌ not in prod |

UUID match: **0/6**. Email remap possible for **1/6**. 4 rows are orphans against staging's *own* auth.users. This is harness/test data, not real enrollment history. Prod already runs 543 real enrollments on this table — do not pollute it.

### 3.5 `vac_learner_progress` (69 rows) — verdict: **ORPHANED — recommend DO NOT MIGRATE**

`course_id`/`lesson_id` intra-VAC ✓ (0 orphans). `user_id` — 8 distinct (the 6 above plus):

| Staging user_id | Identity | In prod by UUID? | By email? |
|---|---|---|---|
| `503f9b92-…259b9` | krishnaveni_a@jkkn.ac.in | ❌ | ✅ prod UUID `5c259f52-5b64-476f-aa31-b9ac56b62fd2` |
| `5aa8cd3d-…61315` | test-superadmin@jkkn.local | ✅ **same UUID in prod** (test account seeded both sides) | ✅ |

UUID match: **1/8** (and it's a `.local` test account). **53 of 69 rows** have user_ids orphaned against staging's own auth.users (the 4 fake UUIDs). Test data — leave behind.

### 3.6 `vac_enrollments_with_details` (view) — **do not copy**

Definitions differ: prod's view = staging's + one extra select column (`c.institution_id AS course_institution_id`). Prod's is the superset/newer. A migration must NOT overwrite prod's view.

---

## 4. Schema parity (staging vs prod)

| Table | Parity | Drift detail |
|---|---|---|
| `vac_courses` | ✅ same columns | Nullability only: staging `institution`,`duration_hours`,`weeks`,`fee` are NOT NULL; prod nullable (looser = safe). Column order differs (cosmetic). **Prod is missing staging's `UNIQUE(code)` index** (`vac_courses_code_key`). |
| `vac_lessons` | ⚠️ prod superset | Prod has extra `case_scenario` jsonb (+ partial index on it). Staging `duration_minutes` NOT NULL vs prod nullable. Copied rows get `case_scenario = NULL`. |
| `vac_course_programmes` | ✅ identical | — |
| `vac_enrollments` | ✅ identical | — |
| `vac_learner_progress` | ✅ same columns | `status` type: staging `varchar` vs prod `text` — compatible. |

Prod CHECK constraints (course_category, nsqf 1–10, nheqf 4–10, enrollment status/payment_status, progress status, ltl_phase): **every staging value passes** (verified by distinct-value pulls — see §3).

---

## 5. Collision check on prod

- **PK collision:** none. 0 staging `vac_courses.id` match prod's single course id; lessons/links reference only staging-minted course UUIDs (gen_random_uuid), so PK overlap is effectively nil — the migration session should still use `ON CONFLICT (id) DO NOTHING` as a belt-and-braces guard.
- **`code` collision:** none (no staging course has `BDS-CR-101`). But note prod has **no unique index on `code`** — a double-run of the migration would silently insert duplicate codes. Guard via PK conflict clause or pre-check.
- **Unique indexes on prod:** `vac_courses(id)`; `vac_lessons(id)`, `(course_id,hour)`; `vac_course_programmes(id)`, `(course_id,programme_id)`; `vac_enrollments(id)`, `(user_id,course_id)`; `vac_learner_progress(id)`, `(user_id,lesson_id)`. None conflict with staging data (all new course/lesson UUIDs; link table empty on prod).
- **Prod's live data:** `BDS-CR-101` + its 1 lesson + **543 enrollments stay untouched** by a content-only copy.

---

## 6. Proposed remap strategy (for the migration session)

1. **Copy order:** `vac_courses` → `vac_lessons` → `vac_course_programmes` (FK dependency order). Skip `vac_enrollments` + `vac_learner_progress` entirely (test data — §3.4/§3.5).
2. **Institution remap (exactly 1 entry):** inline `CASE`/translation CTE:
   - `a1111111-1111-1111-1111-111111111111` → `5de4fba1-4564-41ed-8c73-5d948b74b843` (JKKN College of Engineering and Technology). Affects 9 courses.
   - All 7 other institution UUIDs copy as-is (verified identical in prod).
3. **Programme handling:** 52/53 UUIDs copy as-is. For B.A. Tamil (`a263dbc2-…`): per Director's decision either (a) set `vac_courses.programme_id = NULL` for `BA-TAM-SF-MATLAB` and drop its 1 `vac_course_programmes` row, (b) create the B.A. Tamil programme in prod first, or (c) exclude the course. Option (a) is lowest-friction — the column is nullable and 6 other courses already ship with NULL programme_id.
4. **`case_scenario`:** leave NULL (column absent on staging).
5. **Idempotency:** `INSERT … ON CONFLICT (id) DO NOTHING` on all three tables; verify counts post-copy (expect prod: courses 1→94, lessons 1→2,747, links 0→85 or 86 depending on B.A. Tamil decision).
6. **Run as service_role/postgres** (RLS enabled on all targets). If applied via `exec_sql`, finish with `NOTIFY pgrst, 'reload schema';` per project convention.
7. **No view changes** — prod's `vac_enrollments_with_details` is newer; do not overwrite.
8. *(If enrollments were ever to migrate, the user translation is: staging `a4f22369-…` → prod `b2bcb548-…` (director@jkkn.ac.in); staging `503f9b92-…` → prod `5c259f52-…` (krishnaveni_a@jkkn.ac.in); `5aa8cd3d-…` same both sides; all others have no prod identity. Not recommended.)*

---

## 7. Director decisions needed

1. **B.A. Tamil programme** (1 course, `BA-TAM-SF-MATLAB`): NULL the programme link / create the programme in prod / exclude the course? (Recommend: NULL the link, keep the course.)
2. **Confirm Engineering remap** to "JKKN College of Engineering and Technology" (`5de4fba1-…`) for the 9 Engineering courses.
3. **Confirm exclusion** of `vac_enrollments` (8 test rows) and `vac_learner_progress` (69 test rows) from migration.
4. **`vac_courses` `UNIQUE(code)` on prod** — staging has it, prod doesn't. Add it during migration (cheap, prevents duplicate course codes; current prod data has no duplicates) or defer?
5. Prod's existing `BDS-CR-101` course will sit alongside the imported 93 — confirm it should remain as-is (its 543 enrollments depend on it).

---

*Read-only audit — zero writes issued to staging or prod. Probed 2026-06-11.*

---

## 8. Director decisions (locked 2026-06-12, AskUserQuestion interview) + execution record

| # | Question | Decision |
|---|---|---|
| 1 | B.A. Tamil orphan course (`BA-TAM-SF-MATLAB`) | **Exclude the course entirely** (−1 course, −30 lessons, −1 link) |
| 2 | Go-live mode (92 active + 86 priced on staging) | **Dark import** — every copied course arrives `is_active=false`; flip per college, no deploy |
| 3 | Universal courses (6, `institution_id IS NULL`) in PDE picker | **Visible to all colleges** — `fn_pde_list_vac_courses` updated (own institution OR universal) |
| 4 | `UNIQUE(code)` parity gap on prod | **Added during migration** (`vac_courses_code_key`) |
| 5 | Engineering remap (9 courses, `a1111111-…`) | **Confirmed** → `5de4fba1-…` JKKN College of Engineering and Technology |
| 6 | Test `vac_enrollments` (8) + `vac_learner_progress` (69) | **Confirmed excluded** |
| 7 | Prod `BDS-CR-101` (543 enrollments) | **Confirmed untouched** |
| 8 | Universal-courses flip timing / first pilot college | **Flip with first college; first = Arts & Science (Self)** |

**Executed 2026-06-12 ~08:40 IST** via `scripts/vac-migrate-staging-content.sh` (psql pooler, single prod transaction, `ON CONFLICT (id) DO NOTHING`). Post-migration verification — all expected values hit exactly:

```
courses 1→93 · lessons 1→2,717 · links 0→85
imported active = 0 (dark) · BDS-CR-101 active + 543 enrollments untouched
FK orphans = 0 on all four checks · engineering remapped = 9 · universal = 6
BA-TAM absent · vac_courses_code_key present
```

### Ready-to-run pilot flip (NOT executed — run at pilot briefing)

```sql
-- Flip Arts & Science (Self) VAC courses + the 6 universal tracks live (decision 8).
UPDATE vac_courses SET is_active = true, updated_at = now()
WHERE is_active = false
  AND (institution_id = 'b0b8a724-7c65-4f07-8047-2a38e8100ad5'  -- A&S (Self): 20 courses
       OR institution_id IS NULL);                               -- universal: 6 courses
-- Reverse: same statement with is_active = false.
```
