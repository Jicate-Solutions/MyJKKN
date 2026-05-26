# 07 — AI Agent Notes (Preventing Confusion)

**Audience:** AI coding agents (Claude Code, Cursor, Copilot, etc.) that will maintain MyJKKN after Phase 1 of JKKN Schools ships.
**Purpose:** Make the college/school translation boundary impossible to miss so you don't corrupt the data model, hallucinate tables, or produce mixed-language UIs.

---

## The one rule

**Data model, services, APIs, types, migrations, logs, tests, route paths, schemas** → always use **college vocabulary**.

**React components rendering user-visible strings** → translate via `useInstitutionKind()` → **school vocabulary** at render time.

The translation boundary is exactly: `.tsx` files that render user-visible strings. **Nowhere else.**

---

## Translation map

| Data-model term (stable) | School UI label (render-time) | College UI label (default) |
|---|---|---|
| `program`, `programs` | "Class", "Classes" | "Program", "Programs" |
| `semester`, `semesters` | "Term", "Terms" | "Semester", "Semesters" |
| `course`, `courses` | "Subject", "Subjects" | "Course", "Courses" |
| `degree` | "Stream" (rarely shown) | "Degree" |
| `department` | "Wing" (rarely shown) | "Department" |
| `faculty` | "Teacher" | "Faculty" |
| `section` | "Section" (unchanged) | "Section" |
| `student` | "Student" (unchanged) | "Student" |

All translations are sourced from `lib/constants/institution-kind-labels.ts`. Do not hardcode these strings anywhere in `.tsx` files — always read from `labels` via `useInstitutionKind()`.

---

## Where translation happens (only here)

```tsx
// ✅ CORRECT — translation at the render boundary
'use client';
import { useInstitutionKind } from '@/hooks/use-institution-kind';

export default function ProgramsPage() {
  const { labels, isSchool } = useInstitutionKind();

  return (
    <div>
      <h1>{labels.programPlural}</h1>        {/* "Programs" or "Classes" */}
      <button>Add {labels.program}</button>  {/* "Add Program" or "Add Class" */}
      {!isSchool && <DegreeFilter />}        {/* hidden for schools */}
    </div>
  );
}
```

---

## Where translation must NEVER happen

### ❌ Never translate in services

```ts
// ❌ WRONG — service hardcoded school label
export class ProgramsService {
  static async create(data: ProgramInput) {
    // ...
    toast.error('Failed to create class');   // leaks "class" to college users too
  }
}

// ✅ CORRECT — service uses stable college vocab, component catches and translates
export class ProgramsService {
  static async create(data: ProgramInput) {
    const { error } = await supabase.from('programs').insert(data);
    if (error) throw new Error('Failed to create program');  // stable
    // ...
  }
}

// In the component:
try {
  await ProgramsService.create(data);
} catch (e) {
  toast.error(`Failed to create ${labels.program}`);  // translates based on kind
}
```

### ❌ Never translate in database schemas or migrations

```sql
-- ❌ WRONG — "future AI" renames the column for "clarity"
ALTER TABLE programs RENAME COLUMN program_id TO class_id;

-- ✅ CORRECT — leave the column name alone. The UI translates.
-- No SQL change needed.
```

### ❌ Never translate in API routes

```
❌ WRONG:  app/api/organizations/classes/route.ts
✅ CORRECT: app/api/organizations/programs/route.ts   (serves both kinds)
```

### ❌ Never translate in hook names, type definitions, test fixtures

```ts
// ❌ WRONG
export function useClasses() { ... }
export interface Class { ... }
const mockClass = { ... }

// ✅ CORRECT
export function usePrograms() { ... }
export interface Program { ... }
const mockProgram = { ... }
```

### ❌ Never translate in logger calls or error messages

```ts
// ❌ WRONG — bug reporter captures "class" but code says "program"
logger.error('academic/classes', 'Failed to load class', error);

// ✅ CORRECT — logs always match the code they reference
logger.error('academic/programs', 'Failed to load program', error);
```

Debugging is easier when logs, grep, and bug reports all speak the same language as the source code.

---

## The 6 common AI confusion patterns

### 1. The grep mismatch

**Scenario:** A user files a bug: "the Class 6 page won't load."

❌ **Bad AI:**
```bash
grep -rn "class 6" app/
# Finds nothing relevant — 0 hits for "class 6" in code
grep -rn "classes" app/
# Finds CSS classnames, utility functions, completely unrelated
# AI concludes: "there's no classes module, let me create one"
```

✅ **Good AI:**
```
"User said 'Class 6'. That's a school UI label. The code-language
term is 'program'. Let me grep for programs."
```
```bash
grep -rn "programs" app/\(routes\)/organizations/
# Finds app/(routes)/organizations/programs/page.tsx — the real file
```

### 2. The "rename for clarity" trap

❌ **Bad AI:** Sees `program_id` in the schema, thinks: "we support schools now, this should be `class_id`" → writes a rename migration → breaks every service, test, and RLS policy that references `program_id`.

✅ **Good AI:** Knows the rule — data model stays in college vocabulary forever. The UI translates; the schema doesn't. Leaves `program_id` alone.

### 3. The hallucinated table

❌ **Bad AI:** User asks for "a list of all classes across schools." AI writes:
```ts
const { data } = await supabase.from('classes').select('*');  // ERROR: table "classes" does not exist
```

✅ **Good AI:**
```ts
const { data } = await supabase
  .from('programs')
  .select('*, institution:institutions(institution_kind)')
  .eq('institution.institution_kind', 'school');
```

### 4. The mixed-language component

❌ **Bad AI:**
```tsx
<h1>{labels.programPlural}</h1>      {/* "Classes" */}
<table>
  <thead>
    <tr>
      <th>Program Name</th>          {/* Hardcoded — should be {labels.program} */}
      <th>Semester</th>              {/* Hardcoded — should be {labels.semester} */}
    </tr>
  </thead>
</table>
```

School user sees a broken UI: "Classes" header, "Program Name" column.

✅ **Good AI:** Every user-visible string in the same component goes through `labels`.

**Self-check:** after writing a component, grep it for `Program|Semester|Course|Degree|Faculty`. If any match is a string literal (not a variable), fix it.

### 5. The duplicate module

❌ **Bad AI:** User says "add a school module". AI creates `app/(routes)/schools/` duplicating `app/(routes)/organizations/`.

✅ **Good AI:** Knows there is exactly ONE `organizations` module. `institution_kind` flips the UI labels and hides a couple of sidebar items. No duplication.

### 6. The SQL query with a fake column

❌ **Bad AI:** User searches "class 6" in a UI input. AI writes:
```sql
SELECT * FROM programs WHERE kind = 'class';  -- no such column
```

✅ **Good AI:**
```sql
SELECT p.* FROM programs p
JOIN institutions i ON p.institution_id = i.id
WHERE i.institution_kind = 'school' AND p.name ILIKE '%class 6%';
```

`institution_kind` lives on `institutions`, not on `programs`.

---

## Pre-flight self-check (run this mentally before editing)

Before touching any file that might involve organization terminology, ask:

1. **"Am I editing a `.tsx` file that renders user-visible strings?"**
   → Use `useInstitutionKind()` + `labels.*` for every user-visible word.
2. **"Am I editing a service, API route, type definition, migration, test, or logger call?"**
   → Use college vocabulary (`program`, `semester`, `course`). Do NOT translate.
3. **"Am I grepping for a user-reported term like 'class' or 'subject'?"**
   → Translate it first. User-"class" = code-`program`. User-"subject" = code-`course`.
4. **"Am I about to create a new table, column, or service?"**
   → Use college vocabulary. Extend `programs`, do NOT create `classes`.
5. **"Am I about to rename something 'for clarity' now that we support schools?"**
   → **STOP.** Re-read this file. The rule is: data model never changes, only the UI translates.
6. **"Am I writing a SQL query that filters by 'class' or 'subject'?"**
   → Use `institution_kind` on `institutions` + stable column names on the data tables.

---

## Glossary — user language → code language

When a user (or bug report, or Google Chat message) says... | Look in the code for...
---|---
"Class 6" / "Class 10" | A row in `programs` where `name ILIKE 'Class 6%'` and the institution is a school |
"Term 1" / "Term 2 2026-27" | A row in `semesters` where `name ILIKE 'Term 1%'` |
"Subjects" / "Math class" / "Tamil subject" | Rows in `courses` (and `course_mapping` for subject-to-class links) |
"Stream" (rare) | A row in `degrees` (the virtual "K-12 Program" degree) |
"Wing" / "Academic wing" (rare) | A row in `departments` (the virtual "Academic" department) |
"Teacher" / "Class teacher" / "Subject teacher" | Rows in `staff` with a `faculty`-type role |
"Section A" | Same as college — `sections` table |
"Student" | Same as college — `students` table |
"Principal" | An institution-level admin role in `profiles` + `user_roles` |
"Register" / "Attendance register" | The existing `daily_attendance` table — schools use it identically |
"Fee" / "School fees" | Existing billing module — `billing_invoices`, `billing_receipts` |

---

## Quick-reference card

Copy this into your working memory when starting any MyJKKN task:

```
┌─────────────────────────────────────────────────────────────────┐
│  MyJKKN Translation Boundary (after 2026-04-11 schools launch)  │
├─────────────────────────────────────────────────────────────────┤
│  DATA MODEL  →  always college vocabulary                        │
│    programs, semesters, courses, degrees, departments, faculty   │
│                                                                   │
│  UI COMPONENTS  →  translate via useInstitutionKind()            │
│    labels.program, labels.semester, labels.course, ...           │
│                                                                   │
│  USER SAYS  →  TRANSLATE BEFORE GREPPING                         │
│    "class"   →  programs                                         │
│    "term"    →  semesters                                        │
│    "subject" →  courses                                          │
│    "teacher" →  staff + faculty role                             │
│                                                                   │
│  GOLDEN RULE: There is no `classes` table. There is no           │
│  `subjects` table. There never will be. The UI translates.       │
└─────────────────────────────────────────────────────────────────┘
```

---

## When to invoke this file

Read `07-AI-AGENT-NOTES.md` BEFORE:

- Editing anything under `app/(routes)/organizations/`
- Editing anything under `lib/services/organization*`
- Writing a migration that touches `programs`, `semesters`, `courses`, `degrees`, `departments`, or `institutions`
- Responding to a bug report that mentions "class", "term", "subject", "teacher", "principal", or "K-12"
- Building a new feature that could affect school users differently from college users
- Renaming any entity or column "for clarity" (the rule is: don't)

If you're about to do any of the above without having read this file, stop and read it.
