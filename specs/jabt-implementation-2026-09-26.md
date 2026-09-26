# JKKN Advanced Bloom's Taxonomy (JABT): Implementation Spec

**Date:** 2026-09-26 · **Status:** DRAFT, for the Director's OK. Build nothing until approved.
**Consolidates:** `specs/jkkn-advanced-blooms-taxonomy-2026-07-30.md` (framework, now partly stale) and `specs/jabt-dynamic-taxonomy-2026-09-06.md` (registry, 13 decisions of record, D12 pending). The published reference `jabt-final-form.html` defines the final form (v3, "C + three bands", ruled 17 Aug, executed 21 Aug 2026).
**Supersedes:** §2, §3, §8.2, §8.4 and §10 of the 07-30 spec, which still describe the 11-element `A1–A5` model. Its evidence rule (§5), assessment placement (§4, §6) and coverage rule (§7) still apply, re-keyed to the 17 codes as in §2.3 below.
**Measured on:** `main` @ `1eb972ecf` and production `kvizhngldtiuufknvehv` (read-only, 2026-09-26).

---

## 0 · Summary

The definition is finished and live: 17 elements are seeded, 7 R-2026 regulations carry `jkkn_advanced`, and 15,175 lessons are labelled. The implementation is not finished. Three kinds of gap remain:

1. **Correctness defects (P0).** The live `fp_items` CHECK still only admits `A1–A5`. Four code paths silently drop `jkkn_advanced` or turn it into `finks`. Two OBE pages run on mock data and show the retired 11-element copy.
2. **Static consumers (P1–P2).** About 15 files hardcode `K1–K6` or the Fink vocabulary. This is the dynamic-registry build from the 09-06 spec, still unbuilt.
3. **Assessment surfaces (P3).** Three things are defined on paper but have nowhere in the product to be recorded: the PS bands, the evidence for AF and HD, and the AIU-a/b/c bands. The AIU trail table exists but has 0 rows.

This spec orders the three kinds of gap into shippable PRs.

---

## 1 · The framework (normative, from the final form)

### 1.1 Seventeen elements: three ladders and a flat rail

| Family | Codes | Source | Shape | `sort_order` (live) |
|---|---|---|---|---|
| Cognitive | `K1` Remember · `K2` Understand · `K3` Apply · `K4` Analyze · `K5` Evaluate · `K6` Create | Bloom 1956 / Anderson & Krathwohl 2001, unchanged | hierarchy | 1–6 |
| Affective | `AF1` Receiving · `AF2` Responding · `AF3` Valuing (absorbs Fink's Caring) · `AF4` Organising · `AF5` Characterising | Krathwohl, Bloom & Masia 1964 | hierarchy | 7–11 |
| Psychomotor | `PS-a` Guided · `PS-b` Independent · `PS-c` Adaptive Performance | Simpson 1972, 7 stages collapsed to 3 | hierarchy | 12–14 |
| Flat rail | `HD` Human Dimension · `L2L` Learning How to Learn · `AIU` Accountable AI Use | Fink 2003 (HD, L2L); AIU is new | **unordered** | 15–17 |

- **The PS rungs are real levels.** A practical outcome is tagged `PS-*` directly. This replaces the old `A4-a/b/c` "band on an assessment" model.
- **AIU is one element with three marking bands.** `AIU-a` Supervised, `AIU-b` Accountable and `AIU-c` Discerning are rubric values recorded on an assessment. They are **not** taxonomy levels, so they never appear in `bos_taxonomy_levels`.

### 1.2 Activation by college family

Activation is expressed by seeding: an institution's level catalogue is its active set.

| Family | Institutions | Active set | Count |
|---|---|---|---|
| Clinical | Dental, Nursing, Allied Health, Pharmacy | K + AF + PS + AIU | 15 |
| Engineering, A&S (Aided), A&S (Self) | — | K + HD + L2L + PS + AIU | 12 |
| Education | — | all | 17 |
| Schools + non-academic | — | all (catalogue uniformity only; no regulation attaches) | 17 |

Live check: K and PS are seeded at 13 institutions, AF at 10, HD and L2L at 9, and AIU at 13. This is consistent with the table above.

**AIU weight.** AIU takes 2 of 25 internal marks in AI, cyber and data-science programmes, 1 in general computing, and 0 elsewhere. The marks come out of Activities 5, chosen per course by the Board of Studies. Today this rule exists **only in prose**. P1 moves it into data (D5).

### 1.3 Legacy mapping (read-only forever, D9)

| Legacy | JABT |
|---|---|
| Fink `FK` / `AP` / `IN` | `K1–K2` / `K3` / `K4–K6` |
| Fink `HD` | `HD` |
| Fink `CA` (Caring) | `AF3` |
| Fink `LHL` | `L2L` |
| 07-30 draft `A1` / `A2` / `A3` | `HD` / `AF3` / `L2L` |
| 07-30 draft `A4` (+`-a/b/c`) | `PS-a` / `PS-b` / `PS-c` |
| 07-30 draft `A5` | `AIU` |

**No data conversion** (D9). Old `blooms` and `finks` records stay readable. The `A1–A5` codes were never written to production data. `fp_items.advanced_dimension` has 0 non-null rows, so fixing its CHECK (P0-1) is safe.

### 1.4 Evidence rule (unchanged, normative)

An element is assessed only when the learner produces evidence that could not exist unless they performed the act.

| Element | Counts | Does not count |
|---|---|---|
| K1–K6 | written answer, worked solution, viva | — |
| PS-* | the performed act at the claimed band, observed or recorded | a description of the act |
| AF1–AF5, HD | observed conduct, a real interaction with a named person, a role taken | a self-report or reflection essay alone |
| L2L | work on material never taught, done live (D13 ①, pending) | a document alone |
| AIU | the recorded trail: AI output, then the learner's change, then the final answer | an assertion of checking |

Practical mark scheme mapping:

| Sub-component | Element |
|---|---|
| Result and technique | PS |
| Safety and honest recording | AF2 / AF3 |
| Viva | K4–K6 + L2L |

---

## 2 · Verified state (2026-09-26)

### 2.1 Production DB

| Fact | Value |
|---|---|
| `bos_taxonomy` rows | 13 × `jkkn_advanced`, 13 × `blooms`, 13 × `finks`, all `is_active=true`, one per institution |
| `bos_taxonomy_levels` for JABT | 17 codes, names identical across copies |
| `verb_examples` | populated for K1–K6 only (4–5 verbs). **All 11 added codes have an empty list** |
| `bos_taxonomy_levels` columns | `id, taxonomy_id, code, name, description, verb_examples, sort_order, created_at, updated_at`. There is no `weight` and no `retired_at` |
| Registry tables (`bos_taxonomy_publications`, `bos_taxonomy_institution_activation`) | **absent** |
| `bos_regulation_taxonomies` | 7 × `jkkn_advanced` (all R-2026), 7 × `blooms` (R-2008…R-2025), 1 × `finks` (R-2017) |
| `obe_regulation_config` | **0 rows**. The OBE config surface has never been used for real |
| CHECK `obe_regulation_config_taxonomy_type_check`, `chk_curriculum_lesson_primary_taxonomy` | admit `jkkn_advanced` ✅ |
| `curriculum_lesson.primary_taxonomy` | 15,175 `jkkn_advanced` · 20,755 `blooms` · 985 null |
| JABT lesson labels (`primary_bloom_level`) | K3 6,597 · K2 5,090 · K4 2,239 · AF3 575 · HD 343 · L2L 331. **0 at K1, K5, K6, AF1/2/4/5, PS, AIU** |
| JABT lessons `primary_fink_dimension` | still carries the Fink vocabulary (`application`, `caring`, …) beside the JABT label. This is intended provenance |
| 🔴 `fp_items.advanced_dimension` CHECK | `A1..A5`: **rejects every live JABT added code**. 0 non-null rows |
| `fp_items.bloom_level` | 5 × K1, 126 null |
| `aiu_prompt_trails` | table exists (columns `learner_id, institution_id, surface, prompt_sent, ai_output, learner_input, learner_final, changed, context`) — **0 rows** |

### 2.2 Code (`main` @ `1eb972ecf`)

- **Types.** `types/obe.ts` has the correct 17-element `AdvancedDimension` and `ADVANCED_DIMENSION_LABELS`. Its `BLOOMS_LEVEL_LABELS` are keyed `L1–L6`, not `K1–K6`. `ObeRegulationConfig` has no active-set field for `jkkn_advanced`.
- **Retired 11-element copy still visible to users.**
  - [app/(routes)/academic/obe/page.tsx:18-22](app/(routes)/academic/obe/page.tsx#L18-L22): `JABT_ELEMENT_COUNT = 11`, and A1–A5 named.
  - [supabase/migrations/20260908034127_fp_items_bloom_level.sql:143-152](supabase/migrations/20260908034127_fp_items_bloom_level.sql#L143-L152): the A1–A5 CHECK.
  - Comments at [curriculum-service.ts:136](lib/services/curriculum/curriculum-service.ts#L136) and [curriculum-lesson-spine-generate/route.ts:298](app/api/cron/curriculum-lesson-spine-generate/route.ts#L298).
- **Mock-backed.** Both `/academic/obe` and `/academic/obe/regulation-config` read `useMockRegulationConfig`. Saving writes only to local state.
- **Registry.** `lib/services/taxonomy/` does not exist. There is no `taxonomy.definition.manage` key and no `platform_policies` taxonomy switch.
- **Level editing is destructive.** The PUT at [app/api/bos/taxonomies/[id]/route.ts:137-158](app/api/bos/taxonomies/[id]/route.ts#L137-L158) replaces levels by **delete then insert**. That regenerates level ids and conflicts with D2 (retire, never delete).
- **Merged PRs:**
  - #3087: A5 = AIU, spec published.
  - #3089: OBE card three-way.
  - #3099: UI taught the third framework.
  - #3097: CHECK repo-drift repair.
  - #3154: AIU trail.
  - #3313: registry spec.
  - #3093 was closed.

---

## 3 · Defect register (P0: fix before any new build)

| # | Where | Defect | Effect |
|---|---|---|---|
| P0-1 | prod `fp_items.chk_fp_items_advanced_dimension` + migration `20260908034127:143-152` | CHECK admits `A1–A5` only | Tagging any Foundation item AF/PS/HD/L2L/AIU fails with 23514, an opaque 500 (memory: BOS Enum Drift) |
| P0-2 | [lib/ai-tasks/registry.ts:584](lib/ai-tasks/registry.ts#L584) | `tt === 'finks' \|\| tt === 'blooms' ? tt : null` | A JABT regulation is skipped and flagged "no taxonomy" in AI tasks |
| P0-3 | [lib/ai-tasks/registry.ts:650-651](lib/ai-tasks/registry.ts#L650-L651) | `=== 'blooms' ? 'blooms' : 'finks'` | JABT content is generated with the **Fink** prompt |
| P0-4 | [curriculum-lesson-spine-generate/route.ts:745](app/api/cron/curriculum-lesson-spine-generate/route.ts#L745) | `taxByKey` keeps only `finks` / `blooms` | Cron lesson spines for R-2026 get no taxonomy |
| P0-5 | same route, `:364` vs `:303` | `isBloom = taxonomy === 'blooms'` contradicts the `:303` Bloom-prompt branch for JABT | Mixed prompt and label handling within one run |
| P0-6 | [regulation-config/page.tsx:227-230](app/(routes)/academic/obe/regulation-config/page.tsx#L227-L230) | binary summary ternary; no active-levels card for `jkkn_advanced` | JABT summary reads "Fink's (Non-hierarchical - 6 Dimensions)" |
| P0-7 | [academic/obe/page.tsx:18-22](app/(routes)/academic/obe/page.tsx#L18-L22) | 11-element A1–A5 copy | Shows a retired framework to users |
| P0-8 | [bos/syllabus/_components/row-actions.tsx:506](app/(routes)/bos/syllabus/_components/row-actions.tsx#L506) | `isCas && taxonomyType === 'blooms'` | CAS R-2026 syllabi (JABT) miss the Bloom-branch behaviour. **Verify intent before changing** |

### P0 fix shape

- **P0-1.** Write a new migration, `2026092xxxxxxx_fp_items_advanced_dimension_jabt17.sql`. Do not edit the old file.

  ```sql
  ALTER TABLE fp_items DROP CONSTRAINT IF EXISTS chk_fp_items_advanced_dimension;
  ALTER TABLE fp_items ADD CONSTRAINT chk_fp_items_advanced_dimension CHECK (
    advanced_dimension IS NULL OR advanced_dimension = ANY (ARRAY[
      'AF1','AF2','AF3','AF4','AF5','PS-a','PS-b','PS-c','HD','L2L','AIU']));
  ```

  Precondition, asserted in a DO block: `count(*) WHERE advanced_dimension IS NOT NULL = 0`.

  Ships as a FILE. Apply it out of band in the SQL editor; `supabase db push` is broken here. Verify with `pg_get_constraintdef`.

  P1-4 later replaces this CHECK with a registry FK.
- **P0-2 to P0-5.** Introduce `normaliseTaxonomy(tt): 'blooms' | 'finks' | 'jkkn_advanced' | null` and use it at all four sites.
  - JABT generation uses the JABT prompt: K-levels plus the institution's active added codes. It must not fall back to either legacy prompt.
  - Unit tests cover each site with `jkkn_advanced` input.
- **P0-6 and P0-7.** Take the element list and counts from `ADVANCED_DIMENSION_LABELS` and `BLOOMS`, never from literals.
  - Add the `jkkn_advanced` active-levels card: K1–K6 always on; the AF, PS and rail toggles follow §1.2.
  - Keep the mock: wiring OBE to real config is P2-5. The page must at least render the right framework.
- **Scope.** One PR for P0-1 (migration), one for P0-2 to P0-5 (AI and cron), and one for P0-6 and P0-7 (OBE UI). P0-8 is investigated first and reported separately (minimum-viable scope).

---

## 4 · P1: the registry (the 09-06 spec, build detail)

The decisions of record (D1 to D13) carry over unchanged. This section turns them into contracts.

### P1-1 Migration (additive only)

```sql
-- 1. levels: weight + retire
ALTER TABLE bos_taxonomy_levels
  ADD COLUMN IF NOT EXISTS weight      numeric NULL,          -- D5; e.g. AIU default 0
  ADD COLUMN IF NOT EXISTS retired_at  timestamptz NULL,      -- D2; never DELETE
  ADD COLUMN IF NOT EXISTS family      text NULL
    CHECK (family IS NULL OR family IN ('cognitive','affective','psychomotor','rail')),
  ADD COLUMN IF NOT EXISTS is_hierarchical_rung boolean NOT NULL DEFAULT true; -- false for HD/L2L/AIU

-- 2. immutable published snapshots (D1, D4, D7)
CREATE TABLE IF NOT EXISTS bos_taxonomy_publications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taxonomy_code   text NOT NULL,                 -- 'jkkn_advanced'
  version_no      int  NOT NULL,
  snapshot        jsonb NOT NULL,                -- [{code,name,family,sort_order,weight,verb_examples,retired}]
  effective_date  date NOT NULL,                 -- future = queued
  published_by    uuid NOT NULL REFERENCES auth.users(id),
  note            text NOT NULL,                 -- the "why" (D4)
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taxonomy_code, version_no)
);
-- immutability trigger: block UPDATE/DELETE (same pattern as tg_aiu_prompt_trails_guard)

-- 3. per-college activation (D3)
CREATE TABLE IF NOT EXISTS bos_taxonomy_institution_activation (
  taxonomy_code   text NOT NULL,
  element_code    text NOT NULL,
  institutions_id uuid NOT NULL REFERENCES institutions(id),
  is_active       boolean NOT NULL DEFAULT true,
  weight_override numeric NULL,                  -- AIU 2/1/0 per programme family
  updated_by      uuid, updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (taxonomy_code, element_code, institutions_id)
);

-- 4. edit log (D4)
CREATE TABLE IF NOT EXISTS bos_taxonomy_edit_log (
  id bigserial PRIMARY KEY, taxonomy_code text NOT NULL, element_code text,
  action text NOT NULL CHECK (action IN ('add','rename','retire','reorder','weight','verbs','activate','deactivate','publish')),
  before jsonb, after jsonb, reason text NOT NULL,
  actor uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
```

**Seed (data-preserving, `WHERE NOT EXISTS`, never `ON CONFLICT`):**
- Backfill `family` and `is_hierarchical_rung` from the code prefix.
- Seed `bos_taxonomy_institution_activation` from today's 13-copy presence, so the §1.2 shape is reproduced exactly.
- Write `bos_taxonomy_publications` version 1 = today's 17 elements, effective 2026-08-21 (the executed date), with note "baseline — executed final form v3".

**RLS:**
- Read: `authenticated`.
- Write: only through SECURITY DEFINER RPCs gated on `taxonomy.definition.manage`.
- Every function gets `REVOKE EXECUTE FROM anon, PUBLIC; GRANT TO authenticated`.

The migration ships as a FILE and is applied out of band. Audit afterwards with a `pg_proc` LEFT JOIN, because hand-applied migrations land partially.

### P1-2 RPCs

| RPC | Purpose |
|---|---|
| `fn_taxonomy_stage_edit(code, element, action, payload, reason)` | Writes a draft change on `bos_taxonomy_levels`: add, rename, retire (sets `retired_at`), reorder, weight or verbs. Writes the edit log. Never deletes |
| `fn_taxonomy_publish(code, effective_date, note)` | Freezes the current draft into the next `version_no` snapshot |
| `fn_taxonomy_set_activation(code, element, institution, is_active, weight_override, reason)` | Per-college switch (D3) |
| `fn_taxonomy_current(code, at date, institution uuid)` | Returns the snapshot where `effective_date <= at` with the greatest `version_no`, filtered by activation |

### P1-3 Server registry: `lib/services/taxonomy/registry.ts`

```ts
export type TaxonomyElement = {
  code: string; name: string; family: 'cognitive'|'affective'|'psychomotor'|'rail';
  sortOrder: number; weight: number | null; verbs: string[]; hierarchical: boolean;
  retired: boolean;
};
export async function getTaxonomy(framework: string, opts?: { at?: Date; institutionId?: string })
  : Promise<{ publicationId: string; version: number; elements: TaxonomyElement[] }>;
export async function isValidElement(framework: string, code: string, opts?): Promise<boolean>;
```

- The registry is cached with `unstable_cache` plus a `'taxonomy'` tag. `fn_taxonomy_publish`'s API route calls `revalidateTag('taxonomy')`.
- **Fallback when the RPC errors or the flag is off.** Use `types/obe.ts` constants (`ADVANCED_DIMENSION_LABELS` + K1–K6), so behaviour is byte-identical to today.
- **Client side.** Use a `useTaxonomy(framework, institutionId)` React Query hook on `GET /api/taxonomy/[code]?at=&institutionId=`. The React Query key must include the user id (memory: cross-user cache leak).

### P1-4 Types

- `TaxonomyType` stays a union, since the framework list is closed by D9. **Element** codes become `string` validated by `isValidElement`.
- Rename `BLOOMS_LEVEL_LABELS` keys from `L1–L6` to `K1–K6`, with a compatibility alias kept for one release.
- Add `jabt_active_elements: string[]` to `ObeRegulationConfig`.
- Merge the two `FinksDimension` types into `types/legacy-taxonomy.ts`, marked read-only legacy.
- Later, as its own gated migration: replace the CHECKs on `fp_items.advanced_dimension` and `bloom_level` with a trigger that validates against the registry.

### P1-5 Definition page (extend `/bos/taxonomy`)

- **Framework detail tab "Definition"** (JABT only). It shows the elements grouped by family, laid out like the final-form diagram. It has the following controls:
  - add
  - rename
  - retire, with a confirmation that states "stays readable on history"
  - drag-reorder within a family
  - weight
  - verb editor
- **Queued changes** show a diff against the live publication and a **Publish on date** action (date-picker, required note).
- **History tab:** publications and the edit log, showing who, what, when and why.
- **Activation tab:** an institutions × elements matrix of switches, plus the AIU weight override.
- **Permission.** Add `taxonomy.definition.manage` to `PERMISSION_CATEGORIES`, granted to `super_admin` and the named owner (D4, name still open). The catalog-sync gate applies. The page stays behind `MENU_PERMISSIONS`.
- **Replace the destructive PUT.** Change `app/api/bos/taxonomies/[id]` for JABT to an upsert by `(taxonomy_id, code)`, so level ids stay stable. Delete-then-insert remains only for custom frameworks with no references.

### P1-6 Switch

Add a `platform_policies` row `taxonomy.registry.consumers`, containing jsonb `{ "onemark": false, "bos": false, "sop": false, "ia": false, "pde": false }`. It can be flipped without a deploy. Each consumer reads its own key.

---

## 5 · P2: consumer flips (one PR each, OneMark first, D8)

| Order | Consumer | Files | Change |
|---|---|---|---|
| 1 | OneMark paper | `lib/services/onemark/paper-service.ts:34-38,437` | `JABT_LEVELS` from the registry (cognitive family). Each paper stores `taxonomy_publication_id` (D1): add a nullable column on the paper table |
| 2 | OneMark draft | `draft-contract.ts:31`, `draft-request.ts:64`, `app/api/foundation/onemark/draft/route.ts:34` | Validate with `isValidElement`. The prompt lists registry elements |
| 3 | OneMark review | `review/_lib/approve-rules.ts:15` | Same |
| 4 | OneMark PDF + guide | `lib/onemark/pdf/types.ts:61`, `samples.ts`, `lib/foundation/guide/content.ts` | Labels from the snapshot |
| 5 | Curriculum | `curriculum-service.ts:83-121` (`BLOOM_OPTIONS`, `JABT_ADDED_LABELS`), `curriculum-review/page.tsx` | Options from the registry filtered by institution activation |
| 6 | BoS syllabus | `lib/utils/bos/syllabus-xlsx.ts:54`, `types/bos.ts:1028`, `components/bos/syllabus-form.tsx:324` | CO K-headers from the cognitive family. JABT export adds the added-half columns |
| 7 | SOP | `lib/sop/templates.ts` | Print the framework definition and the mandatory attribution line (§7) |
| 8 | IA question paper | `types/ia-question-paper.ts:362-369` | `K_LEVELS` from the registry |
| 9 (phase 2, D10) | PDE / VAC | `types/pde.ts:11`, `finks-radar.tsx`, `vac/_components/finks-profile.tsx`, `types/vac.ts:29-31` | A JABT radar across families. Fink history is rendered read-only via the §1.3 mapping |

Each flip is done when:
- its key is `true` in `platform_policies`,
- a test passes with the flag both on and off,
- an element added on a **staging** publication appears in that consumer without a deploy.

---

## 6 · P3: assessment surfaces (defined but nowhere to record them)

This phase needs its own interview before it is built. The shape is proposed here so that P1 does not preclude it.

| # | Surface | Proposal | Depends on |
|---|---|---|---|
| P3-1 | **Verb lists for the 11 added codes** (all empty live) | Seed after the open academic review against Krathwohl's published lists. The first-practical deadline makes this blocking for AF marks. Edit through the P1-5 verb editor, so no migration is needed | IQAC review |
| P3-2 | **Practical mark scheme** | Sub-component rows on the practical exam scheme, each tagged with an element code (PS, AF2/AF3, K4–K6, L2L), per §1.4 | COE exam scheme; 0 of 24 sem-1 practicals have one |
| P3-3 | **PS band recording** | Per-learner, per-practical `PS-a/b/c` observed band, recorded by the bench examiner | P3-2 |
| P3-4 | **AF / HD observation log** | Observation entries with element, observer, named person, date and note. Self-report is rejected by design (evidence rule) | — |
| P3-5 | **AIU band marking** | Rubric `AIU-a/b/c` on an assessment, linked to `aiu_prompt_trails` rows. Weight comes from the activation `weight_override` (2/1/0) | P1; trail must be populated |
| P3-6 | **AIU trail is empty** | `aiu_prompt_trails` has 0 rows while PDE coach and clinical-reasoning call `prompt-trail-service` best-effort. Find out why the writes don't land (RLS on insert, table applied after deploy, or silent catch) before building P3-5 | — |
| P3-7 | **Coverage rule report** | Each course has at least one Concept Application in the added half (AF/PS/HD/L2L/AIU per activation). Build an IQAC report per regulation and institution. Today 0 JABT lessons carry K1, K5, K6, AF1/2/4/5, PS or AIU | P1 |

---

## 7 · Mandatory attribution

Print this verbatim wherever JABT is formally defined: syllabus front matter, SOP, IQAC papers, accreditation returns and the definition page footer.

> JKKN Advanced Bloom's Taxonomy: Bloom's revised cognitive taxonomy (Bloom et al., 1956; Anderson & Krathwohl, 2001) retained in full; the affective domain after Krathwohl, Bloom & Masia (1964) as five rungs AF1–AF5, absorbing Caring from L. Dee Fink's Taxonomy of Significant Learning (*Creating Significant Learning Experiences*, 2003); Bloom's uncompleted psychomotor domain operationalised in three bands after Simpson (1972); Human Dimension and Learning How to Learn drawn directly from Fink (2003); and Accountable AI Use, which has no precedent in any of these authors.

Two things are never claimed:
- HD and L2L are never presented as Bloom's own.
- AF1–AF5 are never presented as JKKN's invention.

"Advanced" means advanced beyond the standard single-taxonomy implementation, not beyond Bloom.

Store the attribution in one constant, `lib/taxonomy/attribution.ts`. The old 07-30 attribution text (which names "Caring" and "Performed Skill" as additions) must not be reused.

---

## 8 · Verification

```sql
-- P0-1
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='chk_fp_items_advanced_dimension';
BEGIN; UPDATE fp_items SET advanced_dimension='AF3' WHERE id=(SELECT id FROM fp_items LIMIT 1); ROLLBACK;  -- must succeed

-- P1: baseline publication reproduces today
SELECT jsonb_array_length(snapshot) FROM bos_taxonomy_publications WHERE taxonomy_code='jkkn_advanced' AND version_no=1; -- 17
SELECT element_code, count(*) FILTER (WHERE is_active) FROM bos_taxonomy_institution_activation
 WHERE taxonomy_code='jkkn_advanced' GROUP BY 1;  -- K*/PS*/AIU 13, AF* 10, HD/L2L 9

-- P1: no function callable by anon
SELECT p.proname FROM pg_proc p WHERE p.proname LIKE 'fn_taxonomy_%'
  AND has_function_privilege('anon', p.oid, 'EXECUTE');  -- 0 rows

-- P1: nothing deleted
SELECT count(*) FROM bos_taxonomy_levels l JOIN bos_taxonomy t ON t.id=l.taxonomy_id WHERE t.code='jkkn_advanced'; -- >= 198 (13 inst., family-dependent)
```

**UI proof (required; green SQL is not done):**
1. As super admin, open `/bos/taxonomy` → JABT → Definition.
2. Stage a rename of a non-live test element and publish it for tomorrow. Confirm that today's OneMark paper wizard still shows the old name and a paper created after the effective date shows the new name.
3. On `/academic/obe/regulation-config`, JABT renders its own card and summary with no "Fink's" text.
4. A Foundation item can be tagged `AF3` without error.

---

## 9 · Open decisions

| # | Decision | Owner | Blocks |
|---|---|---|---|
| D12 | Freeze the 17 as final (after the Astra study) | Director | P1-5 retire/add UI going live (the registry itself can ship) |
| D13 | Astra evidence rules: L2L live-only, digital-PS in-room, CBT proctored-only | Director | P3 |
| D4 | Named learning-framework owner | Director | P1-5 permission grant |
| — | AIU weight review, as the first scheduled publication | Owner | P3-5 |
| — | Retire-cutover date for `blooms` / `finks` (D9) | Director | Phase 2 |
| — | AF1–AF5 verb academic review | IQAC | P3-1, first practical marking |
| — | Internal split 30 (CIA 15 + Activities 5 + Capstone 10) vs recorded 25/75 | COE / Director | P3-2, P3-5 |
| — | Is P0-8 (`row-actions.tsx:506`) intentional for CAS Bloom's only? | BoS dev | P0-8 |

---

## 10 · Delivery plan

| PR | Scope | Size | Gate |
|---|---|---|---|
| 1 | P0-1 `fp_items` CHECK migration (file + out-of-band apply) | XS | Director OK |
| 2 | P0-2 to P0-5 `normaliseTaxonomy` in AI tasks and cron + tests | S | — |
| 3 | P0-6 and P0-7 OBE pages render JABT from constants | S | — |
| 4 | P1-1 and P1-2 migration + RPCs + baseline seed | M | Director OK; verify §8 |
| 5 | P1-3 and P1-4 registry service, API, hook, types (flag off) | M | 4 |
| 6 | P1-5 and P1-6 definition page + non-destructive PUT + switch row | L | 5, D4 |
| 7–14 | P2 consumer flips, one each, in the §5 order | S each | 5 |
| 15+ | P3 after its own interview | — | D13, IQAC |

**Safety rails**
- Additive DDL only.
- No data conversion.
- Every flip is reversible without a deploy.
- Migrations ship as files and are applied out of band.
- Edit on `main` and never branch or commit by agent; the user commits and deploys.
- Production DB writes only after an explicit OK.
