# Aided — can a faculty member mark attendance on an unlinked timetable?

**Read-only investigation, 2026-08-05.** Institution: JKKN College of Arts and Science (Aided),
`a33138b6-4eea-4675-941f-1071bf88b127`. Production ref `kvizhngldtiuufknvehv`.

## 1. VERDICT

**Yes — all three sections are fully markable today. `timetables.section_id` is never
read by the marking path; the section is carried per-slot inside `timetable_data.section_ids`,
and the roster RPC is section-authoritative.** The "blocked" badge is a defect in the
*reporting* RPC only. Nothing in the marking flow fails.

This contradicts the premise in the brief. The brief's inference — "an unlinked timetable
makes its section look blocked, therefore marking is broken" — holds for the first clause
and fails for the second.

## 2. Code path

**Discovery.** `lib/services/academic/faculty-attendance-service.ts:170` selects timetables by
`.eq('is_active', true)` and institution only — no `section_id` and no `is_template` filter, so an
unlinked timetable is never excluded. Line **477** resolves the section:

```ts
const resolvedSectionId = timetable.section_id || slot.section_id || slot.section_ids?.[0] || null;
```

`timetables.section_id` is merely the *first* candidate. With it NULL, the chain falls through to
the slot's `section_ids[0]`. Lines **489–490** emit `sections: [{id: resolvedSectionId}]` and
`section_ids: slot.section_ids`.

**Navigation.** `_components/faculty-quick-attendance.tsx:169` builds the URL from the slot, not
the timetable: `const sectionId = period.sections?.[0]?.id || searchContext.section_id;`

**Mark page.** `app/(routes)/academic/attendance/mark/page.tsx:353` is the only hard failure —
and it is guarded on `timetable.timetable_type === 'section'`. The `timetables.section_id`
fallback at **323–327** carries the same guard. **All 25 Aided timetables are
`timetable_type = 'semester'`**, so both branches are dead code here; a NULL `section_id` is the
*expected* shape for a semester-level timetable, not an anomaly.

**Roster (the core).** `mark/page.tsx:905–914` calls `getStudentsForAttendance` with
`section_ids` from the slot. `lib/services/academic/attendance-roster-service.ts:626–660` forwards
these to the SECURITY DEFINER RPC `fn_attendance_roster`, whose filter is:

```sql
AND CASE WHEN p_section_ids IS NOT NULL THEN lp.section_id = ANY (p_section_ids)
         ELSE (p_degree_id IS NULL OR ...) END
```

with its own comment: *"Section is AUTHORITATIVE."* It keys on `learners_profiles.section_id`,
gated by institution + `academic.attendance.mark/view/reports`. **`timetables` is not in the
query at all.**

**Where the row lands.** `mark/page.tsx:1341–1348` resolves `effectiveSectionId` through the same
chain, terminating at `contextData.section_ids[0]` — the slot's section. `student_attendance.section_id`
is `NOT NULL`, and the slot supplies it.

## 3. Production evidence

**(a) The slots are wired; the column is not.** Every teaching slot in all three timetables carries
`slot_id`, `course_id`, `staff_ids` and a `section_ids` array resolving to the correct section
(program, semester and department all matching):

| Timetable | `timetables.section_id` | slot section | section | roster | marked rows |
|---|---|---|---|---|---|
| I B.Com | NULL | `54f6f44a…` | Commerce A | 54 | 0 |
| I B.A HISTORY | NULL | `f2cf7de7…` | History A | 38 | 0 |
| I M.SC CHEMISTRY | NULL | `cebfbd9a…` | Chemistry (PG) A | 2 | 0 |
| **II B.Com** | **NULL** | `2d4ee3d6…` | Commerce A | 53 | **28** |

Slots with an empty `section_ids` (14 of 42 in I B.Com, 27 of 84 in I B.A HISTORY) have no
`course_id` — they are free periods, not teaching slots.

**(b) Roster simulation** — the exact body of `fn_attendance_roster` returns **54 / 38 / 2**, matching
the learner counts precisely:

```sql
select s.section_name, count(lp.id) from sections s
left join learners_profiles lp on lp.section_id = s.id
 and lp.lifecycle_status='active'
 and lp.institution_id='a33138b6-4eea-4675-941f-1071bf88b127'
where s.id in ('54f6f44a-026f-450e-a24c-d505f19fdead',
               'f2cf7de7-2020-4e3f-a455-3e54bcad7aa1',
               'cebfbd9a-da76-4f86-b608-e49d939186e8')
group by 1;
```

**(c) The decisive test — unlinked timetables DO accumulate attendance.** All 19 real Aided
timetables were checked. **Eleven carry attendance; every one has `section_id IS NULL`**, and all
187 of their rows carry a real, resolving `section_id` (II MCA 29, II B.Com 28, II M.Com 26,
II M.Sc ZOOLOGY 22, III B.Sc ZOOLOGY 19, III B.Com 18, II B.Sc ZOOLOGY 9, II B.A HISTORY 8,
II M.A HISTORY 4, III B.A English 3, II B.A English 1 — spanning 2026-06-15 to 2026-07-31).

**The inverse also holds: the single Aided timetable that *has* `section_id` set (II M.Com,
`3d000c15`) has ZERO attendance rows.** Linkage correlates with *non*-marking here.

**(d) The reporting bug is real.** `fn_attendance_fresher_readiness`'s `tt` CTE reads
`WHERE t.section_id IN (SELECT sec_id FROM fresher)` — column only, never the slot. Replaying it
yields exactly **10 blocked sections / 164 learners**, matching the panel.

**Correction to the brief:** 7 of the 10, not 3, have slot-level timetable coverage. Four
(Chemistry 19, Zoology 17, Mathematics 11, English 3) are covered only by `is_template = true`
timetables. Three (Commerce PG 15, Zoology PG 4, History PG 1) have no coverage at all and are
genuinely blocked.

## 4. Minimal fix — reporting, not marking

Do **not** backfill `timetables.section_id`. That column is correctly NULL for semester-level
timetables; writing it would make `mark/page.tsx:323` start resolving sections from the timetable
instead of the slot, and could mis-scope multi-section sittings.

Fix the RPC. In `fn_attendance_fresher_readiness`, widen the `tt` CTE to union the slot-level link:

```sql
tt AS (
  SELECT t.section_id AS sec_id, ... FROM timetables t WHERE t.section_id IN (...)
  UNION ALL
  SELECT (jsonb_array_elements_text(slot->'section_ids'))::uuid, ...
  FROM timetables t, jsonb_each(t.timetable_data) d(day,dayslots),
       jsonb_each(d.dayslots) p(pkey,slot)
  WHERE jsonb_array_length(coalesce(slot->'section_ids','[]'::jsonb)) > 0
)
```

This is the same both-shapes treatment the adjacent `marked` CTE already applies to
`student_attendance`. It would move 7 of 10 sections out of `blocked`. **Described only — not applied.**

## 5. Could not determine

- **Why no one has marked these three.** The mechanism works and a structurally identical
  timetable (II B.Com) is marked daily. Zero rows is a usage fact, not a code fact; I found no
  technical blocker. I did not test the live UI as a real faculty persona.
- **Whether template timetables (`is_template = true`) surface for marking.** The team-member period query
  applies no `is_template` filter, which *suggests* they do, but I did not confirm at runtime —
  this decides whether the 4 template-only sections are markable.
- **Whether the assigned team members hold `academic.attendance.mark`.** `fn_attendance_roster`
  raises 42501 without it; I verified slot assignment exists but not the permission grants.
