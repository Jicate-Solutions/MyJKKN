# CDC Consumer Switch → Unified `exam_topic_map` — Verify & Cutover Checklist

**Scope:** Redirect the 5 live CDC consumers of the legacy junction
`cdc_exam_topic_map` (keyed on `cdc_training_types.id`) to the unified
`exam_topic_map` (keyed on `exam_definition_id`), translating through
`exam_definitions.cdc_training_type_id`. Behaviour + output shape preserved
EXACTLY. **Do NOT drop `cdc_exam_topic_map` until every browser step below passes.**

Prod ref: `kvizhngldtiuufknvehv`. Today: 2026-07-06.

---

## 1. What changed (and what did NOT)

| File | Change |
|---|---|
| `app/(routes)/cdc/govt-readiness/page.tsx` | **CHANGED.** `loadFullTopicMap()` now reads `exam_topic_map` ⋈ `exam_definitions!inner`, filtered `cdc_training_type_id IS NOT NULL`, translating each mapping back to `{ exam_training_type_id: ed.cdc_training_type_id, topic_id }`. Exam columns still come from `cdc_training_types`; every downstream computation is untouched. |
| `lib/services/admin/cdc-admin-service.ts` | **CHANGED.** `listExamTopicMap` reads the unified junction via the same embed-join + translation. `addExamTopicMapping` / `removeExamTopicMapping` resolve `exam_definition_id` from the caller's `cdc_training_types` id (via `resolveExamDefinitionId`) before writing to `exam_topic_map`. Public contract (`{ exam_training_type_id, topic_id }`, `examTrainingTypeId` args) unchanged. Add returns a clear error (no silent success) if the training type has no linked exam_definition. |
| `app/api/admin/cdc/exam-topic-map/route.ts` | **UNCHANGED** (byte-identical to prod). It calls the service functions above, so its writes now land in `exam_topic_map` automatically. Its head-only gate (`is_cdc_head_or_super()`) and govt-exam validation still apply. |
| `app/(routes)/cdc/admin/exam-topic-map/page.tsx` | **UNCHANGED** (byte-identical). Reads the map via the API route and toggles via POST/DELETE to the route — both now flow to `exam_topic_map` through the service. |
| `app/(routes)/cdc/admin/exam-syllabus-topics/page.tsx` | **UNCHANGED** (byte-identical). Never touched the junction — it CRUDs `cdc_exam_syllabus_topics` only. Included for a complete mirror. |
| `types/admin/cdc.ts` | **UNCHANGED** (byte-identical). Contains no reference to the junction. Included for a complete mirror. |

**Admin-UI write redirect:** every write path
(`/cdc/admin/exam-topic-map` toggle → `POST/DELETE /api/admin/cdc/exam-topic-map`
→ `addExamTopicMapping` / `removeExamTopicMapping`) now targets `exam_topic_map`,
NOT `cdc_exam_topic_map`. No CDC code writes the legacy table after this switch.

**Read pattern preserved:** `exam_topic_map` and `exam_definitions` both have RLS
`SELECT USING (auth.uid() IS NOT NULL)` — identical config-master public-read to
the legacy junction, so the browser (RLS) client on the govt-readiness page reads
them without a service-role bypass. Writes remain gated head-only at the API route.

---

## 2. SQL parity proof — run BEFORE dropping the legacy table

Helper:
```bash
TOKEN=$(cat ~/.supabase/access-token)
q(){ curl -s -X POST "https://api.supabase.com/v1/projects/kvizhngldtiuufknvehv/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"query\":\"$1\"}"; }
```

### 2a. Exact (exam, topic) pair parity — MUST be 0 / 0
```sql
-- legacy rows NOT reproducible from the unified junction (expect 0):
SELECT count(*) AS legacy_only
FROM cdc_exam_topic_map l
WHERE NOT EXISTS (
  SELECT 1 FROM exam_topic_map u JOIN exam_definitions ed ON ed.id=u.exam_definition_id
  WHERE ed.cdc_training_type_id=l.exam_training_type_id AND u.topic_id=l.topic_id);

-- unified college rows NOT present in legacy (expect 0):
SELECT count(*) AS unified_only
FROM exam_topic_map u JOIN exam_definitions ed ON ed.id=u.exam_definition_id
WHERE ed.cdc_training_type_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM cdc_exam_topic_map l
    WHERE l.exam_training_type_id=ed.cdc_training_type_id AND l.topic_id=u.topic_id);
```
**Verified 2026-07-06: `legacy_only=0`, `unified_only=0`. Total pairs each side = 68.**

### 2b. Per-exam shared-vs-domain % — legacy vs unified (translated) MUST match
```sql
-- Run this twice: once against cdc_exam_topic_map (legacy), once against the
-- unified join below. The two result sets must be row-for-row identical.

-- UNIFIED (translated):
SELECT tt.display_name AS exam, count(*) total,
       count(*) FILTER (WHERE t.is_shared) shared,
       round(100.0*count(*) FILTER (WHERE t.is_shared)/count(*)) shared_pct
FROM exam_topic_map m
JOIN exam_definitions ed ON ed.id=m.exam_definition_id
JOIN cdc_training_types tt ON tt.id=ed.cdc_training_type_id
JOIN cdc_exam_syllabus_topics t ON t.id=m.topic_id
WHERE tt.is_active AND tt.exam_family IS NOT NULL AND tt.exam_family<>'' AND t.is_active
GROUP BY tt.display_name, tt.sort_order ORDER BY tt.sort_order;
```

**Verified ground truth (identical for both sources, 2026-07-06):**

| Exam | total | shared | shared % |
|---|---|---|---|
| TNPSC Group 2 (State Govt) | 10 | 8 | 80 |
| TNPSC Group 4 (State Govt) | 10 | 8 | 80 |
| RRB NTPC (Railways) | 9 | 8 | 89 |
| IBPS PO / Clerk (Banking) | 10 | 8 | 80 |
| SBI PO / Clerk (Banking) | 10 | 8 | 80 |
| SSC CGL | 8 | 8 | 100 |
| TN Police — TNUSRB | 11 | 8 | 73 |

### 2c. Overall tiles — MUST match
```sql
-- UNIFIED:
WITH rm AS (
  SELECT DISTINCT m.topic_id
  FROM exam_topic_map m
  JOIN exam_definitions ed ON ed.id=m.exam_definition_id
  JOIN cdc_training_types tt ON tt.id=ed.cdc_training_type_id
  WHERE tt.is_active AND tt.exam_family IS NOT NULL AND tt.exam_family<>'')
SELECT count(*) active_topics,
       count(*) FILTER (WHERE t.is_shared) shared_topics,
       round(100.0*count(*) FILTER (WHERE t.is_shared)/count(*)) overall_pct
FROM rm JOIN cdc_exam_syllabus_topics t ON t.id=rm.topic_id WHERE t.is_active;
```
**Verified ground truth (identical for both sources):** `active_topics=14`,
`shared_topics=8`, `overall_pct=57`.

---

## 3. Browser verification (production, after the code is deployed)

> Login as a **CDC head** or **super-admin** (write surfaces are head-only). The
> govt-readiness read view also renders for a `cdc_coordinator` (view-only, no
> curate links). Use `see-as-user` / the persona harness on prod (read-only) or a
> real head login; do NOT test from the `omm-dev` checkout.

### 3a. `/cdc/govt-readiness` — the computed-overlap page (the load-bearing one)
- [ ] Page loads (no 404, no error card, no console errors).
- [ ] **Summary tiles match §2c EXACTLY:** "Government exams" = **7**,
      "Syllabus topics mapped" = **14** (`8 shared · 6 domain-specific`),
      "Shared syllabus" = **57%**, "Widest-reaching topic" = **7 exams**
      (each of the 8 shared topics maps to all 7 govt exams).
- [ ] **Per-exam cards match the §2b table** — TNPSC G2/G4 80%, RRB 89%,
      IBPS 80%, SBI 80%, SSC CGL 100%, TN Police 73%.
- [ ] **Topic × exam overlap matrix** renders 14 topic rows × 7 exam columns; the
      check marks are in the same cells the legacy view showed (spot-check: every
      shared topic row is checked across all 7 exams; domain topics are checked
      for exactly one exam).
- [ ] Numbers here are **identical to what the page showed before the switch**
      (compare against a pre-deploy screenshot if available; otherwise §2 SQL is
      the authority).

### 3b. `/cdc/admin/exam-topic-map` — the matrix editor (write path)
- [ ] Page loads; matrix shows the 7 govt-exam columns and all active topic rows.
- [ ] Existing mappings render as filled cells matching §2b/§2c.
- [ ] **Toggle a cell OFF then ON** for one govt exam + one topic. After each
      toggle the cell state persists across a refresh (optimistic update reconciles
      with the server). Confirm the corresponding row lands in `exam_topic_map`
      (not the legacy table):
      ```sql
      SELECT ed.cdc_training_type_id, m.topic_id, m.created_at, m.updated_at
      FROM exam_topic_map m JOIN exam_definitions ed ON ed.id=m.exam_definition_id
      ORDER BY m.updated_at DESC LIMIT 5;
      ```
- [ ] **Confirm the legacy table did NOT receive the write** (its row count/max
      updated_at is unchanged by your toggles):
      ```sql
      SELECT count(*), max(updated_at) FROM cdc_exam_topic_map;
      ```
- [ ] After toggling, revisit `/cdc/govt-readiness` and confirm the computed %
      moved consistently, then restore the original mapping so parity in §2 holds.
- [ ] A `cdc_coordinator` (holds `cdc.training.edit` but not head) still gets a
      clean 403 from `POST/DELETE /api/admin/cdc/exam-topic-map` (gate unchanged).

### 3c. `/cdc/admin/exam-syllabus-topics` — unchanged CRUD (regression check)
- [ ] Loads and lists topics with the Shared / Domain badge (byte-identical file;
      just confirm no collateral breakage).

---

## 4. Cutover — DROP the legacy table (ONLY after §2 + §3 all pass)

**Preconditions (all must be true):**
1. §2a returned `0 / 0`; §2b and §2c matched the ground-truth tables above.
2. Every §3 checkbox is ticked on production.
3. No remaining reader/writer of `cdc_exam_topic_map` outside this session's 5
   files — confirm with a fresh sweep:
   ```bash
   git ls-tree jicate/main -r --name-only | xargs -I{} sh -c 'git show jicate/main:{} 2>/dev/null | grep -l cdc_exam_topic_map >/dev/null 2>&1 && echo {}' 2>/dev/null
   # or simpler:
   git grep -n "cdc_exam_topic_map" jicate/main -- '*.ts' '*.tsx'
   ```
   Expect ZERO hits after the switch is merged (this checklist's `LEGACY_EXAM_TOPIC_MAP_TABLE`
   constant is a string reference only; remove it too if a clean grep is desired).
4. No DB object depends on it:
   ```sql
   SELECT DISTINCT dependent.relname
   FROM pg_depend d
   JOIN pg_rewrite r ON r.oid=d.objid
   JOIN pg_class dependent ON dependent.oid=r.ev_class
   WHERE d.refobjid='public.cdc_exam_topic_map'::regclass AND dependent.relname<>'cdc_exam_topic_map';
   -- also check functions/triggers referencing it:
   SELECT proname FROM pg_proc WHERE prosrc ILIKE '%cdc_exam_topic_map%';
   ```

**Backup first, then drop (single migration, run centrally — NOT by this build):**
```sql
-- 1) Snapshot for rollback (retain until the switch has soaked in prod).
CREATE TABLE IF NOT EXISTS _archive_cdc_exam_topic_map_20260706 AS
  SELECT * FROM public.cdc_exam_topic_map;

-- 2) Drop the legacy junction.
DROP TABLE public.cdc_exam_topic_map;
```

**Rollback (if any §3 check fails):** do NOT drop. The unified junction is
additive and already live; simply keep both tables. If a code regression is found,
revert the 2 changed files — the legacy table is still intact and authoritative.

---

## 5. One-line summary for the orchestrator
Switch is a pure read/write redirect through `exam_definitions.cdc_training_type_id`
(proven 1:1, 68/68 pair parity, all computed %s byte-identical). Only 2 files carry
logic changes (`govt-readiness/page.tsx`, `cdc-admin-service.ts`); the other 4 are
byte-identical to prod. Drop `cdc_exam_topic_map` only after §2 SQL + §3 browser
checks pass; back it up to `_archive_cdc_exam_topic_map_20260706` first.
