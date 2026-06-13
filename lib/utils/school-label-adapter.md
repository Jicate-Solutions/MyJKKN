# School Label Adapter — Reference

> Institution-aware UI vocabulary. Translates generic academic terms
> (Degree, Department, Program, Semester, Course) into school-specific
> terms (Stream, Wing, Class, Term, Subject) when the active institution
> is a **school**. Every other institution type sees the original English term.

Spec origin: `docs/myjkkn-jkkn-schools-phase-1/SPEC-jkkn-schools.md` §5.1

---

## 1. Why this exists

JKKN runs colleges **and** schools on the same MyJKKN codebase. Schools use
different words for the same academic entities:

| Generic (college) | School term |
|-------------------|-------------|
| Degree            | Stream      |
| Department        | Wing        |
| Program           | Class       |
| Semester          | Term        |
| Course            | Subject     |
| Course Mapping    | Subject Mapping |
| Class Co-ordinator | Class In-Charge |
| Class Chairman    | Academic Co-ordinator |

Rather than fork pages per institution type, the UI is written once in generic
terms and **translated at render time** based on the current institution type.

---

## 2. Architecture — two files, one source of truth

```
lib/utils/school-label-adapter.ts   ← LABEL_MAP + adaptLabel + adaptMenuLabels   (PURE, React-free)
        ▲
hooks/use-adaptive-labels.ts        ← useAdaptiveLabels()  wraps adaptLabel       (CLIENT-only hook)
```

| Piece | Kind | Role | Import from |
|-------|------|------|-------------|
| `LABEL_MAP` | data | the single dictionary of translations | (internal) |
| `adaptLabel(label, type)` | pure fn | translate ONE string | `@/lib/utils/school-label-adapter` |
| `adaptMenuLabels(pages, type)` | pure fn | translate a whole sidebar tree | `@/lib/utils/school-label-adapter` |
| `useAdaptiveLabels()` | hook | auto-injects current institution type | `@/hooks/use-adaptive-labels` |

**Why split?** The pure functions take `institutionType` as an argument and have
zero React dependency, so they stay out of the `'use client'` boundary and are
unit-testable / server-importable. The hook's only job is to read the current
institution type from React context (`useInstitutionType()`) — which can only
happen inside a hook — and feed it to `adaptLabel`.

---

## 3. API reference

### `adaptLabel(label: string, institutionType: InstitutionType): string`

The core translator. Two-step lookup with a fallback:

```ts
LABEL_MAP[institutionType]?.[label] ?? label
//        └ block for type    └ word   └ fallback to original
```

- Returns the school term if a mapping exists.
- Returns the **original word unchanged** if: the institution type has no block
  (any non-school), OR the word isn't in the map.
- **Never throws, never returns blank** — worst case you get your input back.
- Keys are **case- and number-sensitive**: `'Program'` and `'program'` and
  `'Programs'` are three separate entries.

```ts
adaptLabel('Programs', 'school')      // → 'Classes'
adaptLabel('Programs', 'institution') // → 'Programs'  (no school block)
adaptLabel('Faculty',  'school')      // → 'Faculty'   (not in map)
```

### `adaptMenuLabels(pages: any[], institutionType: InstitutionType): any[]`

Applies `adaptLabel` across the fixed **3-level sidebar tree**:

```
pages[] → group → menus[] → menu(.label) → submenus[] → sub(.label)
```

- Translates every `menu.label` and `sub.label`.
- Returns a **new tree** (via `.map()` + object spread) — the input is never
  mutated; all other fields (icon, href, permissions) are preserved.
- ⚠️ Assumes every `menu` has a `.submenus` array and every group has `.menus`.
  Not a general recursive walker — matched to the current fixed structure.

### `useAdaptiveLabels(): (label: string) => string`

Client hook. Reads the current institution type from context and returns a
ready-to-call translation function.

```ts
const label = useAdaptiveLabels();
label('Program'); // → 'Class' for schools, 'Program' otherwise
```

- Call **once** per component, at the top level (Rules of Hooks).
- Defaults to `'institution'` if no type is resolved.
- Swallows errors and returns the original label on failure (safe).

---

## 4. Usage patterns

### Pattern A — client component (forms, tables, buttons) → use the hook

```tsx
'use client';
import { useAdaptiveLabels } from '@/hooks/use-adaptive-labels';

export function ProgramForm() {
  const label = useAdaptiveLabels();              // once, at top

  return (
    <>
      <FormLabel>{label('Program')} Name</FormLabel>   {/* "Class Name" */}
      <Button>Add {label('Program')}</Button>          {/* "Add Class"  */}
      <p>Search {label('programs')}...</p>             {/* "Search classes..." */}
    </>
  );
}
```

### Pattern B — already hold the institution type (nav, loops) → use the pure fn

```tsx
import { adaptMenuLabels } from '@/lib/utils/school-label-adapter';

const { institutionType } = useInstitutionType();
const localized = adaptMenuLabels(rawMenuTree, institutionType);   // whole sidebar
```

```ts
import { adaptLabel } from '@/lib/utils/school-label-adapter';

items.map(i => adaptLabel(i.label, institutionType));   // hooks can't run in .map()
```

**Rule of thumb:** if you *can* call a hook, use `useAdaptiveLabels`. Drop to the
pure functions only inside loops, non-component code, or where the type is
already handed to you (the sidebar).

---

## 5. Where it's used (live map)

| Consumer | Uses | Path |
|----------|------|------|
| Program form | hook | `app/(routes)/organizations/programs/_components/program-form.tsx` |
| Semester form | hook | `app/(routes)/organizations/semesters/_components/semester-form.tsx` |
| Course form | hook | `app/(routes)/organizations/courses/_components/course-form.tsx` |
| Courses table | hook | `app/(routes)/organizations/courses/_components/courses-data-table.tsx` |
| Semesters table | hook | `app/(routes)/organizations/semesters/_components/semesters-data-table.tsx` |
| Course mapping form | `adaptLabel` | `app/(routes)/organizations/courses/mappings/_components/course-mapping-form.tsx` |
| Desktop sidebar | `adaptMenuLabels` | `components/Navbar/menu.tsx` |
| Mobile bottom nav | `adaptMenuLabels` | `components/BottomNav/bottom-navbar.tsx` |

---

## 6. Adding / changing a term

Edit **only** `LABEL_MAP` in `lib/utils/school-label-adapter.ts`. Add the exact
string(s) under the `school` block — both singular and plural if you use both:

```ts
const LABEL_MAP = {
  school: {
    'Sections': 'Houses',   // plural
    'Section':  'House',    // singular
  }
};
```

Every consumer picks it up automatically — no other file changes needed.

**Checklist when adding a noun:**
- [ ] Capitalized singular — `'Section': 'House'`
- [ ] Capitalized plural — `'Sections': 'Houses'`
- [ ] lowercase forms if used in count text — `'sections': 'houses'`
- [ ] `All <X>` filter label — `'All Sections': 'All Houses'`
- [ ] `Search <x>...` placeholder — `'Search sections...': 'Search houses...'`
- [ ] ID / Name column headers if any — `'Section ID': 'House ID'`

---

## 7. Rules & gotchas

- **Exact-match only.** No fuzzy/partial matching. `label('Program ')` (trailing
  space) won't match `'Program'`. Each casing/plural form is its own key.
- **School-only by design.** `LABEL_MAP` has just a `school` block. All other
  institution types fall through `?? label`, so adding a word can never affect
  colleges. This is intentional and safe.
- **One hook call per component.** `useAdaptiveLabels()` returns the same
  function each time; calling it twice is redundant work.
- **`adaptMenuLabels` is fixed 3-level.** A future 4th nesting level would be
  missed; a menu without `.submenus` would throw. Make it recursive before
  deepening the sidebar.
- **Never mutate the menu tree yourself** — `adaptMenuLabels` already returns a
  fresh copy; rely on that.

---

## 8. Testing

`adaptLabel` and `adaptMenuLabels` are pure — test without React:

```ts
import { adaptLabel } from '@/lib/utils/school-label-adapter';

expect(adaptLabel('Programs', 'school')).toBe('Classes');
expect(adaptLabel('Programs', 'institution')).toBe('Programs'); // passthrough
expect(adaptLabel('Unmapped', 'school')).toBe('Unmapped');      // fallback
```

The hook needs a React render with an institution-type context provider.

---

## 9. Related

- Institution type source: `hooks/use-institution-type.ts`
- Phase-1 schools spec: `docs/myjkkn-jkkn-schools-phase-1/SPEC-jkkn-schools.md` §5.1
- History: consolidated 2026-06-02 — renamed from `sidebar-label-adapter.ts`,
  and the redundant identity-map stub `hooks/use-institution-type-labels.ts`
  was deleted in favor of this single source of truth.
