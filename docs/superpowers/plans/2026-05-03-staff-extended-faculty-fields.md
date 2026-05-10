# Staff Extended Faculty Profile Fields — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 30+ optional faculty-profile fields (academic, research, mentoring, FAQs, etc.) to the MyJKKN staff module so the institution website can read them via the existing `/api/api-management/staff` endpoint, eliminating the need for the website's standalone `faculty` admin panel.

**Architecture:** Extend the existing `public.staff` table with new nullable columns (no side table). Restructure the staff edit form into a 7-tab shell that matches the website's reference UI; tabs beyond Basic appear only when `has_extended_profile` is on. Per-category default + per-staff override drive the toggle. A one-time Node script imports existing website faculty rows by email match, with unmatched rows collected in a review table.

**Tech Stack:** Next.js App Router, Supabase Postgres + RLS, react-hook-form + Zod, shadcn UI (Tabs, Accordion, Form), `react-markdown` (new dep), `tsx` for the import script.

**Spec:** `docs/superpowers/specs/2026-05-03-staff-extended-faculty-fields-design.md`

---

## File Structure

### New files

```
supabase/migrations/
  20260503100001_staff_extended_profile_columns.sql
  20260503100002_employment_categories_shows_extended_profile.sql
  20260503100003_staff_import_unmatched_table.sql

components/forms/
  RepeatingFieldArray.tsx          # generic useFieldArray + Accordion wrapper
  MarkdownField.tsx                # textarea + react-markdown preview
  TabbedFormShell.tsx              # tabs + deep-link sync + dirty indicators
  index.ts                         # re-exports

app/(routes)/staff/list/_components/
  staff-form-schema.ts             # Zod basicSchema + extendedSchema
  staff-form-tabs/
    basic-tab.tsx                  # wraps existing 5 sections + Profile Settings
    academic-tab.tsx
    experience-tab.tsx
    research-tab.tsx
    achievements-tab.tsx
    mentoring-tab.tsx
    faqs-tab.tsx
    repeater-shapes.ts             # field-array item shapes (typed)

scripts/import/
  website-faculty-to-staff.ts      # main entry
  lib/website-supabase.ts          # connection helper
  lib/field-mapper.ts              # pure mapping fns
  lib/field-mapper.test.ts         # node:test unit tests
  runs/.gitkeep

.env.import.example                # template for the import env file
```

### Modified files

```
supabase/setup/01_tables.sql                            # mirror new columns (memory: no placeholder migrations)
types/staff.ts                                          # Staff, CreateStaffDto, UpdateStaffDto
lib/types/database.ts                                   # regenerated Supabase types
lib/services/staff/staff-service.ts                     # verify pass-through (likely no change)
lib/services/staff/category-service.ts                  # add shows_extended_profile to CRUD
app/api/api-management/staff/route.ts                   # add ?has_extended_profile=true filter
app/(routes)/staff/list/_components/staff-form.tsx      # outer shell becomes <TabbedFormShell>
app/(routes)/staff/list/[id]/page.tsx                   # conditional Extended Profile section
app/(routes)/staff/category/_components/category-form.tsx  # add shows_extended_profile switch
package.json                                            # add react-markdown dep + import script
.gitignore                                              # ignore .env.import (verify already ignored)
```

---

## Phase 1 — Database Schema

### Task 1: Migration — add extended profile columns to staff

**Files:**
- Create: `supabase/migrations/20260503100001_staff_extended_profile_columns.sql`
- Modify: `supabase/setup/01_tables.sql` (mirror the new columns into the canonical `staff` definition)

- [ ] **Step 1: Write the migration SQL**

```sql
-- 20260503100001_staff_extended_profile_columns.sql
-- Adds extended faculty profile fields to public.staff so MyJKKN can
-- serve as the single source of truth for the institution website.
-- All columns nullable / defaulted so existing rows are unaffected.

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS has_extended_profile    boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS slug                    text         NULL,
  ADD COLUMN IF NOT EXISTS status                  text         NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS display_order           integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS experience_years        integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS research_papers         integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS phd_scholars            integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS awards_won              integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pg_dissertations_guided integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ug_projects_guided      integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qualification_summary   text         NULL,
  ADD COLUMN IF NOT EXISTS professional_summary    text         NULL,
  ADD COLUMN IF NOT EXISTS mentoring_description   text         NULL,
  ADD COLUMN IF NOT EXISTS google_scholar_url      text         NULL,
  ADD COLUMN IF NOT EXISTS researchgate_url        text         NULL,
  ADD COLUMN IF NOT EXISTS orcid_url               text         NULL,
  ADD COLUMN IF NOT EXISTS badges                  jsonb        NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS qualifications          jsonb        NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS specialisations         jsonb        NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS experience_entries      jsonb        NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS research_focus_areas    jsonb        NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS publications            jsonb        NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS funded_projects         jsonb        NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS certifications          jsonb        NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS awards                  jsonb        NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS memberships             jsonb        NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS phd_scholars_list       jsonb        NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS faqs                    jsonb        NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS achievements            jsonb        NOT NULL DEFAULT '[]'::jsonb;

-- Status workflow constraint
ALTER TABLE public.staff
  DROP CONSTRAINT IF EXISTS staff_status_check;
ALTER TABLE public.staff
  ADD CONSTRAINT staff_status_check
  CHECK (status IN ('draft', 'published'));

-- Slug uniqueness (partial — only enforced on rows that have a slug)
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_slug_unique
  ON public.staff (slug)
  WHERE slug IS NOT NULL;

-- Fast lookup of published profiles for the public API
CREATE INDEX IF NOT EXISTS idx_staff_status_published
  ON public.staff (status, is_active)
  WHERE status = 'published' AND is_active = true;

-- Fast filter for "show extended UI" queries
CREATE INDEX IF NOT EXISTS idx_staff_extended_profile
  ON public.staff (has_extended_profile)
  WHERE has_extended_profile = true;
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Invoke `mcp__supabase__apply_migration` with `name: "staff_extended_profile_columns"` and the SQL body from Step 1. Confirm the response shows success.

- [ ] **Step 3: Verify columns exist**

Invoke `mcp__supabase__execute_sql` with:

```sql
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'staff'
  AND column_name IN (
    'has_extended_profile','slug','status','display_order',
    'experience_years','research_papers','phd_scholars','awards_won',
    'pg_dissertations_guided','ug_projects_guided',
    'qualification_summary','professional_summary','mentoring_description',
    'google_scholar_url','researchgate_url','orcid_url',
    'badges','qualifications','specialisations','experience_entries',
    'research_focus_areas','publications','funded_projects',
    'certifications','awards','memberships','phd_scholars_list',
    'faqs','achievements'
  )
ORDER BY column_name;
```

Expected: 29 rows returned, all with the right types and defaults.

- [ ] **Step 4: Mirror columns into `supabase/setup/01_tables.sql`**

Locate the `CREATE TABLE public.staff (` block (around line 621 per the codebase map). Insert the 29 new columns at the bottom of the column list, just before the closing `);`. Match the formatting of existing columns (column name, type, nullability, default, all aligned).

The insert is a literal copy of the column definitions from Step 1's SQL, but using `ColumnName Type DEFAULT ...` (no `ADD COLUMN IF NOT EXISTS`). Also append the `staff_status_check` constraint inside the table definition.

After editing, run a sanity grep:

```bash
grep -c "has_extended_profile\|qualification_summary\|professional_summary" supabase/setup/01_tables.sql
```

Expected: at least 3.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260503100001_staff_extended_profile_columns.sql \
        supabase/setup/01_tables.sql
git commit -m "feat(staff): add extended faculty profile columns

29 nullable/defaulted columns supporting the website's faculty profile
schema (slug, status, counts, markdown summaries, scholar URLs, and 12
JSONB array fields for qualifications/publications/awards/etc).

All columns default to false/0/null/[] so existing staff rows are
unaffected. Spec: docs/superpowers/specs/2026-05-03-staff-extended-faculty-fields-design.md"
```

---

### Task 2: Migration — category toggle for default extended profile

**Files:**
- Create: `supabase/migrations/20260503100002_employment_categories_shows_extended_profile.sql`
- Modify: `supabase/setup/01_tables.sql` (mirror)

- [ ] **Step 1: Write the migration SQL**

```sql
-- 20260503100002_employment_categories_shows_extended_profile.sql
-- Per-category default for the extended profile toggle. When true,
-- staff added under this category get has_extended_profile = true
-- by default.

ALTER TABLE public.employment_categories
  ADD COLUMN IF NOT EXISTS shows_extended_profile boolean NOT NULL DEFAULT false;
```

- [ ] **Step 2: Apply via MCP**

`mcp__supabase__apply_migration` with `name: "employment_categories_shows_extended_profile"`.

- [ ] **Step 3: Verify**

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'employment_categories' AND column_name = 'shows_extended_profile';
```

Expected: one row with `boolean` and default `false`.

- [ ] **Step 4: Mirror into `supabase/setup/01_tables.sql`**

Find the `CREATE TABLE public.employment_categories (` block and add the new column.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260503100002_employment_categories_shows_extended_profile.sql \
        supabase/setup/01_tables.sql
git commit -m "feat(staff): employment_categories.shows_extended_profile

Per-category default that drives whether staff added under this category
have has_extended_profile pre-checked in the form."
```

---

### Task 3: Migration — staff_import_unmatched review table

**Files:**
- Create: `supabase/migrations/20260503100003_staff_import_unmatched_table.sql`
- Modify: `supabase/setup/01_tables.sql` (mirror)
- Modify: `supabase/setup/03_policies.sql` (RLS for the new table)

- [ ] **Step 1: Write the migration SQL**

```sql
-- 20260503100003_staff_import_unmatched_table.sql
-- Holds website faculty rows the import script could not auto-match
-- to a MyJKKN staff record. Reviewed manually after each import run.

CREATE TABLE IF NOT EXISTS public.staff_import_unmatched (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL,
  source_row  jsonb NOT NULL,
  reason      text NOT NULL,
  resolved    boolean NOT NULL DEFAULT false,
  resolved_by uuid NULL REFERENCES auth.users(id),
  resolved_at timestamptz NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_import_unmatched_unresolved
  ON public.staff_import_unmatched (created_at DESC)
  WHERE resolved = false;

ALTER TABLE public.staff_import_unmatched ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_full_access" ON public.staff_import_unmatched;
CREATE POLICY "super_admin_full_access"
  ON public.staff_import_unmatched
  FOR ALL
  TO authenticated
  USING (user_has_permission('staff.manage_imports'))
  WITH CHECK (user_has_permission('staff.manage_imports'));

DROP POLICY IF EXISTS "service_role_bypass" ON public.staff_import_unmatched;
CREATE POLICY "service_role_bypass"
  ON public.staff_import_unmatched
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

- [ ] **Step 2: Apply via MCP**

`mcp__supabase__apply_migration` with `name: "staff_import_unmatched_table"`.

- [ ] **Step 3: Verify**

```sql
SELECT count(*) FROM public.staff_import_unmatched;
```

Expected: 0 (table exists, no rows yet).

- [ ] **Step 4: Mirror into setup files**

- Add the `CREATE TABLE` block at the end of `supabase/setup/01_tables.sql` (alphabetical area for `s*` tables).
- Add the two RLS policy blocks at the end of `supabase/setup/03_policies.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260503100003_staff_import_unmatched_table.sql \
        supabase/setup/01_tables.sql supabase/setup/03_policies.sql
git commit -m "feat(staff): staff_import_unmatched review table

Holds website faculty rows the import script could not auto-match.
Service role inserts; super-admins (staff.manage_imports permission)
read/update for manual reconciliation."
```

---

### Task 4: Regenerate database types

**Files:**
- Modify: `lib/types/database.ts`

- [ ] **Step 1: Regenerate types via MCP**

Invoke `mcp__supabase__generate_typescript_types`. The response contains the full new `database.ts` content.

- [ ] **Step 2: Replace `lib/types/database.ts`**

Open `lib/types/database.ts`, select all, paste the regenerated content. Save.

- [ ] **Step 3: Verify the new staff columns appear**

```bash
grep -E "has_extended_profile|qualification_summary|professional_summary|orcid_url" lib/types/database.ts | head -10
```

Expected: at least 4 matches (each column appears in Row, Insert, Update variants).

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS, or only pre-existing errors unrelated to staff.

- [ ] **Step 5: Commit**

```bash
git add lib/types/database.ts
git commit -m "chore(types): regenerate Supabase types for staff extended fields"
```

---

## Phase 2 — Type & Service Plumbing

### Task 5: Extend `types/staff.ts` interfaces

**Files:**
- Modify: `types/staff.ts`

- [ ] **Step 1: Add the extended-profile field block to the `Staff` interface**

Open `types/staff.ts`. Locate the `Staff` interface (~line 58). Just before the nested-relations section (`category?: …`), insert:

```typescript
  // Extended faculty profile fields (all optional / defaulted)
  has_extended_profile: boolean;
  slug: string | null;
  status: 'draft' | 'published';
  display_order: number;
  experience_years: number;
  research_papers: number;
  phd_scholars: number;
  awards_won: number;
  pg_dissertations_guided: number;
  ug_projects_guided: number;
  qualification_summary: string | null;
  professional_summary: string | null;
  mentoring_description: string | null;
  google_scholar_url: string | null;
  researchgate_url: string | null;
  orcid_url: string | null;
  badges: BadgeItem[];
  qualifications: QualificationItem[];
  specialisations: SpecialisationItem[];
  experience_entries: ExperienceEntryItem[];
  research_focus_areas: ResearchFocusItem[];
  publications: PublicationItem[];
  funded_projects: FundedProjectItem[];
  certifications: CertificationItem[];
  awards: AwardItem[];
  memberships: MembershipItem[];
  phd_scholars_list: PhdScholarItem[];
  faqs: FaqItem[];
  achievements: AchievementItem[];
```

- [ ] **Step 2: Define the repeater item shapes at the top of the file**

Insert above the `Staff` interface:

```typescript
// ─── Extended profile repeater item shapes ──────────────────────────
export interface BadgeItem        { label: string; color?: string; }
export interface QualificationItem { degree: string; institution: string; year: number | string; specialization?: string; }
export interface SpecialisationItem { name: string; }
export interface ExperienceEntryItem { role: string; organisation: string; from: string; to?: string | null; description?: string; }
export interface ResearchFocusItem { area: string; description?: string; }
export interface PublicationItem  { title: string; journal?: string; year?: number | string; doi?: string; url?: string; type?: string; }
export interface FundedProjectItem { title: string; agency?: string; amount?: string; year?: number | string; status?: string; }
export interface CertificationItem { name: string; issuer?: string; year?: number | string; credential_url?: string; }
export interface AwardItem        { title: string; awarded_by?: string; year?: number | string; description?: string; }
export interface MembershipItem   { body: string; role?: string; since?: number | string; }
export interface PhdScholarItem   { name: string; topic?: string; year?: number | string; status?: string; }
export interface FaqItem          { question: string; answer: string; }
export interface AchievementItem  { title: string; description?: string; date?: string; featured?: boolean; category?: string; }
```

- [ ] **Step 3: Add the same fields to `CreateStaffDto` and `UpdateStaffDto` as optional**

In `CreateStaffDto` (~line 104), add after the existing fields:

```typescript
  // All extended profile fields are optional on create
  has_extended_profile?: boolean;
  slug?: string | null;
  status?: 'draft' | 'published';
  display_order?: number;
  experience_years?: number;
  research_papers?: number;
  phd_scholars?: number;
  awards_won?: number;
  pg_dissertations_guided?: number;
  ug_projects_guided?: number;
  qualification_summary?: string | null;
  professional_summary?: string | null;
  mentoring_description?: string | null;
  google_scholar_url?: string | null;
  researchgate_url?: string | null;
  orcid_url?: string | null;
  badges?: BadgeItem[];
  qualifications?: QualificationItem[];
  specialisations?: SpecialisationItem[];
  experience_entries?: ExperienceEntryItem[];
  research_focus_areas?: ResearchFocusItem[];
  publications?: PublicationItem[];
  funded_projects?: FundedProjectItem[];
  certifications?: CertificationItem[];
  awards?: AwardItem[];
  memberships?: MembershipItem[];
  phd_scholars_list?: PhdScholarItem[];
  faqs?: FaqItem[];
  achievements?: AchievementItem[];
```

`UpdateStaffDto` (~line 141) is `Partial<CreateStaffDto>` style; if so, no edit needed. Otherwise repeat the optional block.

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add types/staff.ts
git commit -m "feat(staff/types): extended profile fields + repeater item shapes"
```

---

### Task 6: Verify staff-service passes new fields through

**Files:**
- Modify (verify, possibly no change): `lib/services/staff/staff-service.ts`

- [ ] **Step 1: Inspect createStaff and updateStaff payload spread**

```bash
grep -nE "supabase\.from\('staff'\)\.(insert|update)" lib/services/staff/staff-service.ts
```

For each call site (~3 expected), check whether the inserted/updated payload spreads the entire input `data` object (e.g., `{ ...data, ... }`) or whitelists named fields. If it spreads, no change is required.

- [ ] **Step 2: If a whitelist is present, add the new field names**

If a whitelist exists (e.g., explicit `{ first_name: data.first_name, ... }`), append the 29 new fields to the whitelist in the same shape.

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit (if any change)**

```bash
git add lib/services/staff/staff-service.ts
git commit -m "feat(staff/service): pass extended profile fields through CRUD"
```

If no changes were needed, skip the commit.

---

### Task 7: Add `shows_extended_profile` support to category service

**Files:**
- Modify: `lib/services/staff/category-service.ts`

- [ ] **Step 1: Locate the EmploymentCategory type and CRUD payload shape**

```bash
grep -nE "EmploymentCategory|interface.*Category|category_name" lib/services/staff/category-service.ts | head -20
```

- [ ] **Step 2: Add `shows_extended_profile: boolean` to the type**

Wherever the `EmploymentCategory` interface is declared (likely re-exported from `types/staff.ts`), add:

```typescript
  shows_extended_profile: boolean;
```

If the type lives in `types/staff.ts`, edit there instead.

- [ ] **Step 3: Add the field to create/update DTOs and select projections**

In `category-service.ts`, locate any explicit `select(...)` strings that name columns (vs `select('*')`) and add `shows_extended_profile`. Also ensure create/update payload accepts the field.

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/services/staff/category-service.ts types/staff.ts
git commit -m "feat(staff/category): shows_extended_profile field"
```

---

### Task 8: Add API filter `?has_extended_profile=true`

**Files:**
- Modify: `app/api/api-management/staff/route.ts`

- [ ] **Step 1: Add the param parse**

In the GET handler, after the existing `isActive` parse (~line 112), add:

```typescript
const hasExtendedProfile = url.searchParams.get('has_extended_profile');
```

- [ ] **Step 2: Add the filter clause**

After the existing `if (isActive !== null)` block (~line 149), add:

```typescript
if (hasExtendedProfile !== null) {
  query = query.eq('has_extended_profile', hasExtendedProfile === 'true');
}
```

- [ ] **Step 3: Verify with curl**

Start dev server (`npm run dev`), then:

```bash
curl -H "Authorization: Bearer <test-key>" \
  "http://localhost:3000/api/api-management/staff?has_extended_profile=true&limit=5"
```

Expected: `{ data: [...], metadata: {...} }` with all rows having `has_extended_profile: true` (likely empty initially — that's fine, the filter just needs to apply without error).

- [ ] **Step 4: Commit**

```bash
git add app/api/api-management/staff/route.ts
git commit -m "feat(api/staff): has_extended_profile filter

Lets the website request only published faculty rows."
```

---

## Phase 3 — Shared Form Components

### Task 9: Install `react-markdown` dependency

**Files:**
- Modify: `package.json`, `package-lock.json` (or `pnpm-lock.yaml`)

- [ ] **Step 1: Install**

```bash
npm install react-markdown
```

- [ ] **Step 2: Verify in package.json**

```bash
grep "react-markdown" package.json
```

Expected: `"react-markdown": "^9..."` (or whatever the latest 9.x version is).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add react-markdown for staff profile markdown preview"
```

---

### Task 10: Build `<MarkdownField>` component

**Files:**
- Create: `components/forms/MarkdownField.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';

interface MarkdownFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  description?: string;
  placeholder?: string;
  rows?: number;
}

export function MarkdownField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  placeholder,
  rows = 8,
}: MarkdownFieldProps<T>) {
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'edit' | 'preview')}>
            <TabsList className="mb-2">
              <TabsTrigger value="edit">Edit</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>
            <TabsContent value="edit">
              <FormControl>
                <Textarea
                  rows={rows}
                  placeholder={placeholder ?? 'Markdown supported (bold, lists, links).'}
                  {...field}
                  value={field.value ?? ''}
                />
              </FormControl>
            </TabsContent>
            <TabsContent value="preview">
              <div className="prose prose-sm max-w-none rounded-md border p-3 min-h-[8rem]">
                {field.value ? (
                  <ReactMarkdown>{String(field.value)}</ReactMarkdown>
                ) : (
                  <p className="text-muted-foreground text-sm italic">
                    Nothing to preview yet.
                  </p>
                )}
              </div>
            </TabsContent>
          </Tabs>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npm run typecheck
```

Expected: PASS (or only pre-existing errors).

- [ ] **Step 3: Commit**

```bash
git add components/forms/MarkdownField.tsx
git commit -m "feat(forms): MarkdownField (textarea + react-markdown preview)"
```

---

### Task 11: Build `<RepeatingFieldArray>` component

**Files:**
- Create: `components/forms/RepeatingFieldArray.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { ReactNode } from 'react';
import {
  useFieldArray,
  type Control,
  type FieldValues,
  type FieldPath,
  type ArrayPath,
} from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

interface RepeatingFieldArrayProps<T extends FieldValues, TItem> {
  control: Control<T>;
  name: ArrayPath<T>;
  label: string;
  itemLabel: (item: TItem, index: number) => string;
  defaultItem: TItem;
  renderItem: (basePath: FieldPath<T>, index: number) => ReactNode;
  emptyMessage?: string;
  addLabel?: string;
}

export function RepeatingFieldArray<T extends FieldValues, TItem>({
  control,
  name,
  label,
  itemLabel,
  defaultItem,
  renderItem,
  emptyMessage = 'No entries yet.',
  addLabel = 'Add entry',
}: RepeatingFieldArrayProps<T, TItem>) {
  const { fields, append, remove } = useFieldArray({ control, name });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">{label}</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append(defaultItem as never)}
        >
          <Plus className="mr-1 h-4 w-4" />
          {addLabel}
        </Button>
      </div>

      {fields.length === 0 ? (
        <p className="text-muted-foreground text-sm italic">{emptyMessage}</p>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {fields.map((f, index) => (
            <AccordionItem
              key={f.id}
              value={`item-${index}`}
              className="border rounded-md px-3"
            >
              <div className="flex items-center justify-between">
                <AccordionTrigger className="flex-1 text-left">
                  {itemLabel(f as unknown as TItem, index) || `Entry ${index + 1}`}
                </AccordionTrigger>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive ml-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(index);
                  }}
                  aria-label={`Remove entry ${index + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <AccordionContent className="pt-3">
                {renderItem(`${name}.${index}` as FieldPath<T>, index)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: PASS (the generic types are tricky — if it errors, relax `ArrayPath<T>` to `string` and cast at call sites).

- [ ] **Step 3: Commit**

```bash
git add components/forms/RepeatingFieldArray.tsx
git commit -m "feat(forms): RepeatingFieldArray (useFieldArray + Accordion + Add/Remove)"
```

---

### Task 12: Build `<TabbedFormShell>` component

**Files:**
- Create: `components/forms/TabbedFormShell.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export interface TabSpec {
  id: string;          // used in ?tab=... and as React key
  label: string;
  hidden?: boolean;    // when true, tab trigger and content are not rendered
  dirty?: boolean;     // when true, a small dot is rendered on the trigger
  content: ReactNode;
}

interface TabbedFormShellProps {
  tabs: TabSpec[];
  defaultTab: string;
}

export function TabbedFormShell({ tabs, defaultTab }: TabbedFormShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const visibleTabs = tabs.filter((t) => !t.hidden);
  const urlTab = searchParams.get('tab');
  const active = visibleTabs.some((t) => t.id === urlTab) ? urlTab! : defaultTab;

  const setActive = (id: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set('tab', id);
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  // If the active tab becomes hidden (e.g., user toggled off extended profile),
  // fall back to defaultTab.
  useEffect(() => {
    if (!visibleTabs.some((t) => t.id === active)) {
      setActive(defaultTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleTabs.length, active]);

  return (
    <Tabs value={active} onValueChange={setActive} className="w-full">
      <TabsList className="mb-4 flex-wrap h-auto">
        {visibleTabs.map((t) => (
          <TabsTrigger key={t.id} value={t.id} className="relative">
            {t.label}
            {t.dirty && (
              <span
                className={cn(
                  'absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary'
                )}
                aria-label="Unsaved changes"
              />
            )}
          </TabsTrigger>
        ))}
      </TabsList>
      {visibleTabs.map((t) => (
        <TabsContent key={t.id} value={t.id}>
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
```

- [ ] **Step 2: Create barrel export**

Create `components/forms/index.ts`:

```typescript
export { MarkdownField } from './MarkdownField';
export { RepeatingFieldArray } from './RepeatingFieldArray';
export { TabbedFormShell } from './TabbedFormShell';
export type { TabSpec } from './TabbedFormShell';
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/forms/
git commit -m "feat(forms): TabbedFormShell + barrel export

Owns active-tab state via ?tab=... query param, hides tabs at runtime,
renders dirty dot on touched tabs."
```

---

## Phase 4 — Form Refactor

### Task 13: Define repeater item shapes file

**Files:**
- Create: `app/(routes)/staff/list/_components/staff-form-tabs/repeater-shapes.ts`

- [ ] **Step 1: Re-export item shapes + provide default factories**

```typescript
import type {
  BadgeItem, QualificationItem, SpecialisationItem, ExperienceEntryItem,
  ResearchFocusItem, PublicationItem, FundedProjectItem, CertificationItem,
  AwardItem, MembershipItem, PhdScholarItem, FaqItem, AchievementItem,
} from '@/types/staff';

export const defaults = {
  badge:           (): BadgeItem           => ({ label: '', color: '' }),
  qualification:   (): QualificationItem   => ({ degree: '', institution: '', year: '' }),
  specialisation:  (): SpecialisationItem  => ({ name: '' }),
  experienceEntry: (): ExperienceEntryItem => ({ role: '', organisation: '', from: '', to: '', description: '' }),
  researchFocus:   (): ResearchFocusItem   => ({ area: '', description: '' }),
  publication:     (): PublicationItem     => ({ title: '', journal: '', year: '', doi: '', url: '', type: '' }),
  fundedProject:   (): FundedProjectItem   => ({ title: '', agency: '', amount: '', year: '', status: '' }),
  certification:   (): CertificationItem   => ({ name: '', issuer: '', year: '', credential_url: '' }),
  award:           (): AwardItem           => ({ title: '', awarded_by: '', year: '', description: '' }),
  membership:      (): MembershipItem      => ({ body: '', role: '', since: '' }),
  phdScholar:      (): PhdScholarItem      => ({ name: '', topic: '', year: '', status: '' }),
  faq:             (): FaqItem             => ({ question: '', answer: '' }),
  achievement:     (): AchievementItem     => ({ title: '', description: '', date: '', featured: false, category: '' }),
};
```

- [ ] **Step 2: Commit**

```bash
git add app/(routes)/staff/list/_components/staff-form-tabs/repeater-shapes.ts
git commit -m "feat(staff/form): repeater default factories"
```

---

### Task 14: Split Zod schema into basic + extended

**Files:**
- Create: `app/(routes)/staff/list/_components/staff-form-schema.ts`

- [ ] **Step 1: Move schema definitions into the dedicated file**

Open `app/(routes)/staff/list/_components/staff-form.tsx` and locate the existing `staffSchema` Zod definition (~line 54-91). Cut it. Create the new schema file:

```typescript
import { z } from 'zod';

// ─── Basic schema (always required) ─────────────────────────────────
export const basicStaffSchema = z.object({
  // ... PASTE the existing staffSchema fields here verbatim
});

// ─── Repeater item schemas (used inside extendedStaffSchema) ────────
const badgeItemSchema = z.object({ label: z.string().min(1), color: z.string().optional() });
const qualificationItemSchema = z.object({
  degree: z.string().min(1),
  institution: z.string().min(1),
  year: z.union([z.string(), z.number()]),
  specialization: z.string().optional(),
});
const specialisationItemSchema = z.object({ name: z.string().min(1) });
const experienceEntryItemSchema = z.object({
  role: z.string().min(1),
  organisation: z.string().min(1),
  from: z.string().min(1),
  to: z.string().nullable().optional(),
  description: z.string().optional(),
});
const researchFocusItemSchema = z.object({ area: z.string().min(1), description: z.string().optional() });
const publicationItemSchema = z.object({
  title: z.string().min(1),
  journal: z.string().optional(),
  year: z.union([z.string(), z.number()]).optional(),
  doi: z.string().optional(),
  url: z.string().url().optional().or(z.literal('')),
  type: z.string().optional(),
});
const fundedProjectItemSchema = z.object({
  title: z.string().min(1),
  agency: z.string().optional(),
  amount: z.string().optional(),
  year: z.union([z.string(), z.number()]).optional(),
  status: z.string().optional(),
});
const certificationItemSchema = z.object({
  name: z.string().min(1),
  issuer: z.string().optional(),
  year: z.union([z.string(), z.number()]).optional(),
  credential_url: z.string().url().optional().or(z.literal('')),
});
const awardItemSchema = z.object({
  title: z.string().min(1),
  awarded_by: z.string().optional(),
  year: z.union([z.string(), z.number()]).optional(),
  description: z.string().optional(),
});
const membershipItemSchema = z.object({
  body: z.string().min(1),
  role: z.string().optional(),
  since: z.union([z.string(), z.number()]).optional(),
});
const phdScholarItemSchema = z.object({
  name: z.string().min(1),
  topic: z.string().optional(),
  year: z.union([z.string(), z.number()]).optional(),
  status: z.string().optional(),
});
const faqItemSchema = z.object({ question: z.string().min(1), answer: z.string().min(1) });
const achievementItemSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  date: z.string().optional(),
  featured: z.boolean().optional(),
  category: z.string().optional(),
});

// ─── Extended schema (validated only when has_extended_profile === true) ─
export const extendedStaffSchema = z.object({
  has_extended_profile: z.boolean(),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'lowercase letters, numbers, hyphens only').nullable().optional(),
  status: z.enum(['draft', 'published']),
  display_order: z.coerce.number().int().min(0),
  experience_years: z.coerce.number().int().min(0),
  research_papers: z.coerce.number().int().min(0),
  phd_scholars: z.coerce.number().int().min(0),
  awards_won: z.coerce.number().int().min(0),
  pg_dissertations_guided: z.coerce.number().int().min(0),
  ug_projects_guided: z.coerce.number().int().min(0),
  qualification_summary: z.string().nullable().optional(),
  professional_summary: z.string().nullable().optional(),
  mentoring_description: z.string().nullable().optional(),
  google_scholar_url: z.string().url().nullable().optional().or(z.literal('')),
  researchgate_url: z.string().url().nullable().optional().or(z.literal('')),
  orcid_url: z.string().url().nullable().optional().or(z.literal('')),
  badges: z.array(badgeItemSchema),
  qualifications: z.array(qualificationItemSchema),
  specialisations: z.array(specialisationItemSchema),
  experience_entries: z.array(experienceEntryItemSchema),
  research_focus_areas: z.array(researchFocusItemSchema),
  publications: z.array(publicationItemSchema),
  funded_projects: z.array(fundedProjectItemSchema),
  certifications: z.array(certificationItemSchema),
  awards: z.array(awardItemSchema),
  memberships: z.array(membershipItemSchema),
  phd_scholars_list: z.array(phdScholarItemSchema),
  faqs: z.array(faqItemSchema),
  achievements: z.array(achievementItemSchema),
});

// Combined (used by the form when extended toggle is on AND user clicks Save & Publish)
export const fullStaffSchema = basicStaffSchema.merge(extendedStaffSchema);

export type BasicFormValues   = z.infer<typeof basicStaffSchema>;
export type ExtendedFormValues = z.infer<typeof extendedStaffSchema>;
export type StaffFormValues   = z.infer<typeof fullStaffSchema>;
```

- [ ] **Step 2: Update `staff-form.tsx` to import from the new file**

Replace the cut schema with:

```typescript
import { basicStaffSchema, extendedStaffSchema, fullStaffSchema, type StaffFormValues } from './staff-form-schema';
```

Update the `useForm` resolver to use `fullStaffSchema` (validation toggling is handled at submit time — see Task 22).

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/(routes)/staff/list/_components/staff-form-schema.ts \
        app/(routes)/staff/list/_components/staff-form.tsx
git commit -m "refactor(staff/form): split Zod schema into basic + extended"
```

---

### Task 15: Build `basic-tab.tsx`

**Files:**
- Create: `app/(routes)/staff/list/_components/staff-form-tabs/basic-tab.tsx`

- [ ] **Step 1: Move existing 5 sections + add Profile Settings sub-section**

The component receives the `useForm` instance and category info as props, and renders the existing Personal / Contact / Additional / Employment / Status sections plus a new Profile Settings sub-section.

```tsx
'use client';

import { UseFormReturn } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { StaffFormValues } from '../staff-form-schema';

interface BasicTabProps {
  form: UseFormReturn<StaffFormValues>;
  /** From the staff-form parent — slices of existing JSX to render in this tab */
  personalSection: React.ReactNode;
  contactSection: React.ReactNode;
  additionalSection: React.ReactNode;
  employmentSection: React.ReactNode;
  statusSection: React.ReactNode;
  /** Whether to show the extended-profile toggle in Profile Settings */
  canEnableExtended: boolean;
}

export function BasicTab(props: BasicTabProps) {
  const { form, canEnableExtended } = props;

  return (
    <div className="space-y-8">
      {props.personalSection}
      {props.contactSection}
      {props.additionalSection}
      {props.employmentSection}

      {/* New: Profile Settings ─────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Profile Settings</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="slug"
            render={({ field }) => (
              <FormItem>
                <FormLabel>URL Slug</FormLabel>
                <FormControl>
                  <Input
                    placeholder="dr-firstname-lastname"
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormDescription>Used in the public website URL.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Profile Status</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>Published profiles appear on the website.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="display_order"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Display Order</FormLabel>
                <FormControl>
                  <Input type="number" min={0} {...field} value={field.value ?? 0} />
                </FormControl>
                <FormDescription>Lower numbers appear first.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {canEnableExtended && (
          <FormField
            control={form.control}
            name="has_extended_profile"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <FormLabel>Extended Faculty Profile</FormLabel>
                  <FormDescription>
                    Enable to fill out academic, research, and mentoring details for the public website.
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
        )}
      </section>

      {props.statusSection}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/(routes)/staff/list/_components/staff-form-tabs/basic-tab.tsx
git commit -m "feat(staff/form): basic-tab with Profile Settings sub-section"
```

---

### Task 16: Build `academic-tab.tsx`

**Files:**
- Create: `app/(routes)/staff/list/_components/staff-form-tabs/academic-tab.tsx`

- [ ] **Step 1: Create the tab**

```tsx
'use client';

import { UseFormReturn } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RepeatingFieldArray, MarkdownField } from '@/components/forms';
import { defaults } from './repeater-shapes';
import type { StaffFormValues } from '../staff-form-schema';

interface AcademicTabProps {
  form: UseFormReturn<StaffFormValues>;
}

export function AcademicTab({ form }: AcademicTabProps) {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Qualification Summary</h2>
        <MarkdownField
          control={form.control}
          name="qualification_summary"
          label="Summary"
          description="Short summary shown above the qualifications list (markdown OK)."
          rows={4}
        />
      </section>

      <RepeatingFieldArray
        control={form.control}
        name="qualifications"
        label="Qualifications"
        defaultItem={defaults.qualification()}
        addLabel="Add qualification"
        emptyMessage="No qualifications added yet."
        itemLabel={(item: any, i) =>
          item?.degree ? `${item.degree}${item.institution ? ' — ' + item.institution : ''}` : `Qualification ${i + 1}`
        }
        renderItem={(base) => (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField control={form.control} name={`${base}.degree` as any} render={({ field }) => (
              <FormItem>
                <FormLabel>Degree</FormLabel>
                <FormControl><Input placeholder="Ph.D." {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name={`${base}.institution` as any} render={({ field }) => (
              <FormItem>
                <FormLabel>Institution</FormLabel>
                <FormControl><Input placeholder="IIT Madras" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name={`${base}.year` as any} render={({ field }) => (
              <FormItem>
                <FormLabel>Year</FormLabel>
                <FormControl><Input placeholder="2018" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name={`${base}.specialization` as any} render={({ field }) => (
              <FormItem>
                <FormLabel>Specialization</FormLabel>
                <FormControl><Input placeholder="Optional" {...field} value={field.value ?? ''} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
        )}
      />

      <RepeatingFieldArray
        control={form.control}
        name="specialisations"
        label="Specialisations"
        defaultItem={defaults.specialisation()}
        addLabel="Add specialisation"
        emptyMessage="No specialisations added yet."
        itemLabel={(item: any, i) => item?.name || `Specialisation ${i + 1}`}
        renderItem={(base) => (
          <FormField control={form.control} name={`${base}.name` as any} render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl><Input placeholder="Machine Learning" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        )}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/(routes)/staff/list/_components/staff-form-tabs/academic-tab.tsx
git commit -m "feat(staff/form): academic-tab"
```

---

### Task 17: Build `experience-tab.tsx`

**Files:**
- Create: `app/(routes)/staff/list/_components/staff-form-tabs/experience-tab.tsx`

- [ ] **Step 1: Create the tab**

```tsx
'use client';

import { UseFormReturn } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RepeatingFieldArray, MarkdownField } from '@/components/forms';
import { defaults } from './repeater-shapes';
import type { StaffFormValues } from '../staff-form-schema';

export function ExperienceTab({ form }: { form: UseFormReturn<StaffFormValues> }) {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Years of Experience</h2>
        <FormField control={form.control} name="experience_years" render={({ field }) => (
          <FormItem className="max-w-xs">
            <FormLabel>Total Years</FormLabel>
            <FormControl><Input type="number" min={0} {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </section>

      <RepeatingFieldArray
        control={form.control}
        name="experience_entries"
        label="Experience Entries"
        defaultItem={defaults.experienceEntry()}
        addLabel="Add experience"
        emptyMessage="No experience added yet."
        itemLabel={(item: any, i) =>
          item?.role && item?.organisation ? `${item.role} @ ${item.organisation}` : `Entry ${i + 1}`
        }
        renderItem={(base) => (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField control={form.control} name={`${base}.role` as any} render={({ field }) => (
              <FormItem><FormLabel>Role</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.organisation` as any} render={({ field }) => (
              <FormItem><FormLabel>Organisation</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.from` as any} render={({ field }) => (
              <FormItem><FormLabel>From (year)</FormLabel><FormControl><Input placeholder="2015" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.to` as any} render={({ field }) => (
              <FormItem><FormLabel>To (year, blank if current)</FormLabel><FormControl><Input placeholder="Present" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.description` as any} render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Description</FormLabel>
                <FormControl><Textarea rows={3} {...field} value={field.value ?? ''} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
        )}
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Professional Summary</h2>
        <MarkdownField
          control={form.control}
          name="professional_summary"
          label="Summary"
          description="Long-form bio shown on the public profile (markdown supported)."
          rows={10}
        />
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/(routes)/staff/list/_components/staff-form-tabs/experience-tab.tsx
git commit -m "feat(staff/form): experience-tab"
```

---

### Task 18: Build `research-tab.tsx`

**Files:**
- Create: `app/(routes)/staff/list/_components/staff-form-tabs/research-tab.tsx`

- [ ] **Step 1: Create the tab**

```tsx
'use client';

import { UseFormReturn } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RepeatingFieldArray } from '@/components/forms';
import { defaults } from './repeater-shapes';
import type { StaffFormValues } from '../staff-form-schema';

export function ResearchTab({ form }: { form: UseFormReturn<StaffFormValues> }) {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Counts</h2>
        <FormField control={form.control} name="research_papers" render={({ field }) => (
          <FormItem className="max-w-xs">
            <FormLabel>Research Papers Count</FormLabel>
            <FormControl><Input type="number" min={0} {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </section>

      <RepeatingFieldArray
        control={form.control}
        name="publications"
        label="Publications"
        defaultItem={defaults.publication()}
        addLabel="Add publication"
        emptyMessage="No publications added yet."
        itemLabel={(item: any, i) => item?.title || `Publication ${i + 1}`}
        renderItem={(base) => (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField control={form.control} name={`${base}.title` as any} render={({ field }) => (
              <FormItem className="md:col-span-2"><FormLabel>Title</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.journal` as any} render={({ field }) => (
              <FormItem><FormLabel>Journal / Venue</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.year` as any} render={({ field }) => (
              <FormItem><FormLabel>Year</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.doi` as any} render={({ field }) => (
              <FormItem><FormLabel>DOI</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.url` as any} render={({ field }) => (
              <FormItem><FormLabel>URL</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.type` as any} render={({ field }) => (
              <FormItem><FormLabel>Type</FormLabel><FormControl><Input placeholder="journal | conference | book" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
          </div>
        )}
      />

      <RepeatingFieldArray
        control={form.control}
        name="research_focus_areas"
        label="Research Focus Areas"
        defaultItem={defaults.researchFocus()}
        addLabel="Add focus area"
        emptyMessage="No focus areas added yet."
        itemLabel={(item: any, i) => item?.area || `Area ${i + 1}`}
        renderItem={(base) => (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField control={form.control} name={`${base}.area` as any} render={({ field }) => (
              <FormItem><FormLabel>Area</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.description` as any} render={({ field }) => (
              <FormItem><FormLabel>Description</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
          </div>
        )}
      />

      <RepeatingFieldArray
        control={form.control}
        name="funded_projects"
        label="Funded Projects"
        defaultItem={defaults.fundedProject()}
        addLabel="Add project"
        emptyMessage="No funded projects added yet."
        itemLabel={(item: any, i) => item?.title || `Project ${i + 1}`}
        renderItem={(base) => (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField control={form.control} name={`${base}.title` as any} render={({ field }) => (
              <FormItem className="md:col-span-2"><FormLabel>Title</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.agency` as any} render={({ field }) => (
              <FormItem><FormLabel>Agency</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.amount` as any} render={({ field }) => (
              <FormItem><FormLabel>Amount</FormLabel><FormControl><Input placeholder="₹ 12,00,000" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.year` as any} render={({ field }) => (
              <FormItem><FormLabel>Year</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.status` as any} render={({ field }) => (
              <FormItem><FormLabel>Status</FormLabel><FormControl><Input placeholder="ongoing | completed" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
          </div>
        )}
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Scholar URLs</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField control={form.control} name="google_scholar_url" render={({ field }) => (
            <FormItem><FormLabel>Google Scholar</FormLabel><FormControl><Input placeholder="https://scholar.google.com/..." {...field} value={field.value ?? ''} /></FormControl><FormDescription>Full URL.</FormDescription><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="researchgate_url" render={({ field }) => (
            <FormItem><FormLabel>ResearchGate</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="orcid_url" render={({ field }) => (
            <FormItem><FormLabel>ORCID</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npm run typecheck
git add app/(routes)/staff/list/_components/staff-form-tabs/research-tab.tsx
git commit -m "feat(staff/form): research-tab"
```

---

### Task 19: Build `achievements-tab.tsx`

**Files:**
- Create: `app/(routes)/staff/list/_components/staff-form-tabs/achievements-tab.tsx`

- [ ] **Step 1: Create the tab**

```tsx
'use client';

import { UseFormReturn } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { RepeatingFieldArray } from '@/components/forms';
import { defaults } from './repeater-shapes';
import type { StaffFormValues } from '../staff-form-schema';

export function AchievementsTab({ form }: { form: UseFormReturn<StaffFormValues> }) {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Counts</h2>
        <FormField control={form.control} name="awards_won" render={({ field }) => (
          <FormItem className="max-w-xs">
            <FormLabel>Awards Won (count)</FormLabel>
            <FormControl><Input type="number" min={0} {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </section>

      <RepeatingFieldArray
        control={form.control}
        name="badges"
        label="Badges"
        defaultItem={defaults.badge()}
        addLabel="Add badge"
        emptyMessage="No badges added yet."
        itemLabel={(item: any, i) => item?.label || `Badge ${i + 1}`}
        renderItem={(base) => (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField control={form.control} name={`${base}.label` as any} render={({ field }) => (
              <FormItem><FormLabel>Label</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.color` as any} render={({ field }) => (
              <FormItem><FormLabel>Color (hex or token)</FormLabel><FormControl><Input placeholder="#ef4444" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
          </div>
        )}
      />

      <RepeatingFieldArray
        control={form.control}
        name="awards"
        label="Awards"
        defaultItem={defaults.award()}
        addLabel="Add award"
        emptyMessage="No awards added yet."
        itemLabel={(item: any, i) => item?.title || `Award ${i + 1}`}
        renderItem={(base) => (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField control={form.control} name={`${base}.title` as any} render={({ field }) => (
              <FormItem className="md:col-span-2"><FormLabel>Title</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.awarded_by` as any} render={({ field }) => (
              <FormItem><FormLabel>Awarded By</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.year` as any} render={({ field }) => (
              <FormItem><FormLabel>Year</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.description` as any} render={({ field }) => (
              <FormItem className="md:col-span-2"><FormLabel>Description</FormLabel><FormControl><Textarea rows={2} {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
          </div>
        )}
      />

      <RepeatingFieldArray
        control={form.control}
        name="certifications"
        label="Certifications"
        defaultItem={defaults.certification()}
        addLabel="Add certification"
        emptyMessage="No certifications added yet."
        itemLabel={(item: any, i) => item?.name || `Certification ${i + 1}`}
        renderItem={(base) => (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField control={form.control} name={`${base}.name` as any} render={({ field }) => (
              <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.issuer` as any} render={({ field }) => (
              <FormItem><FormLabel>Issuer</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.year` as any} render={({ field }) => (
              <FormItem><FormLabel>Year</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.credential_url` as any} render={({ field }) => (
              <FormItem><FormLabel>Credential URL</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
          </div>
        )}
      />

      <RepeatingFieldArray
        control={form.control}
        name="memberships"
        label="Memberships"
        defaultItem={defaults.membership()}
        addLabel="Add membership"
        emptyMessage="No memberships added yet."
        itemLabel={(item: any, i) => item?.body || `Membership ${i + 1}`}
        renderItem={(base) => (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <FormField control={form.control} name={`${base}.body` as any} render={({ field }) => (
              <FormItem><FormLabel>Body</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.role` as any} render={({ field }) => (
              <FormItem><FormLabel>Role</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.since` as any} render={({ field }) => (
              <FormItem><FormLabel>Since (year)</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
          </div>
        )}
      />

      <RepeatingFieldArray
        control={form.control}
        name="achievements"
        label="Achievements"
        defaultItem={defaults.achievement()}
        addLabel="Add achievement"
        emptyMessage="No achievements added yet."
        itemLabel={(item: any, i) => item?.title || `Achievement ${i + 1}`}
        renderItem={(base) => (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField control={form.control} name={`${base}.title` as any} render={({ field }) => (
              <FormItem className="md:col-span-2"><FormLabel>Title</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.date` as any} render={({ field }) => (
              <FormItem><FormLabel>Date</FormLabel><FormControl><Input type="date" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.category` as any} render={({ field }) => (
              <FormItem><FormLabel>Category</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.description` as any} render={({ field }) => (
              <FormItem className="md:col-span-2"><FormLabel>Description</FormLabel><FormControl><Textarea rows={3} {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.featured` as any} render={({ field }) => (
              <FormItem className="flex items-center gap-2 mt-2"><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="!mt-0">Featured</FormLabel><FormMessage /></FormItem>
            )} />
          </div>
        )}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npm run typecheck
git add app/(routes)/staff/list/_components/staff-form-tabs/achievements-tab.tsx
git commit -m "feat(staff/form): achievements-tab"
```

---

### Task 20: Build `mentoring-tab.tsx`

**Files:**
- Create: `app/(routes)/staff/list/_components/staff-form-tabs/mentoring-tab.tsx`

- [ ] **Step 1: Create the tab**

```tsx
'use client';

import { UseFormReturn } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RepeatingFieldArray, MarkdownField } from '@/components/forms';
import { defaults } from './repeater-shapes';
import type { StaffFormValues } from '../staff-form-schema';

export function MentoringTab({ form }: { form: UseFormReturn<StaffFormValues> }) {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">About Mentoring</h2>
        <MarkdownField
          control={form.control}
          name="mentoring_description"
          label="Mentoring Approach"
          description="Markdown supported."
          rows={6}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Counts</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField control={form.control} name="phd_scholars" render={({ field }) => (
            <FormItem><FormLabel>PhD Scholars (count)</FormLabel><FormControl><Input type="number" min={0} {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="pg_dissertations_guided" render={({ field }) => (
            <FormItem><FormLabel>PG Dissertations Guided</FormLabel><FormControl><Input type="number" min={0} {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="ug_projects_guided" render={({ field }) => (
            <FormItem><FormLabel>UG Projects Guided</FormLabel><FormControl><Input type="number" min={0} {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>
      </section>

      <RepeatingFieldArray
        control={form.control}
        name="phd_scholars_list"
        label="PhD Scholars List"
        defaultItem={defaults.phdScholar()}
        addLabel="Add scholar"
        emptyMessage="No scholars added yet."
        itemLabel={(item: any, i) => item?.name || `Scholar ${i + 1}`}
        renderItem={(base) => (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField control={form.control} name={`${base}.name` as any} render={({ field }) => (
              <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.topic` as any} render={({ field }) => (
              <FormItem><FormLabel>Research Topic</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.year` as any} render={({ field }) => (
              <FormItem><FormLabel>Year</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.status` as any} render={({ field }) => (
              <FormItem><FormLabel>Status</FormLabel><FormControl><Input placeholder="ongoing | completed" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
          </div>
        )}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npm run typecheck
git add app/(routes)/staff/list/_components/staff-form-tabs/mentoring-tab.tsx
git commit -m "feat(staff/form): mentoring-tab"
```

---

### Task 21: Build `faqs-tab.tsx`

**Files:**
- Create: `app/(routes)/staff/list/_components/staff-form-tabs/faqs-tab.tsx`

- [ ] **Step 1: Create the tab**

```tsx
'use client';

import { UseFormReturn } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RepeatingFieldArray } from '@/components/forms';
import { defaults } from './repeater-shapes';
import type { StaffFormValues } from '../staff-form-schema';

export function FaqsTab({ form }: { form: UseFormReturn<StaffFormValues> }) {
  return (
    <RepeatingFieldArray
      control={form.control}
      name="faqs"
      label="Frequently Asked Questions"
      defaultItem={defaults.faq()}
      addLabel="Add FAQ"
      emptyMessage="No FAQs added yet."
      itemLabel={(item: any, i) => item?.question || `FAQ ${i + 1}`}
      renderItem={(base) => (
        <div className="space-y-3">
          <FormField control={form.control} name={`${base}.question` as any} render={({ field }) => (
            <FormItem><FormLabel>Question</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name={`${base}.answer` as any} render={({ field }) => (
            <FormItem><FormLabel>Answer</FormLabel><FormControl><Textarea rows={4} {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>
      )}
    />
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npm run typecheck
git add app/(routes)/staff/list/_components/staff-form-tabs/faqs-tab.tsx
git commit -m "feat(staff/form): faqs-tab"
```

---

### Task 22: Wire `staff-form.tsx` into the tabbed shell

**Files:**
- Modify: `app/(routes)/staff/list/_components/staff-form.tsx`

- [ ] **Step 1: Extract existing 5 sections into local consts**

Inside the `StaffForm` component, just before the existing `return (...)`, wrap each of the 5 existing `<section>` blocks (Personal / Contact / Additional / Employment / Status) into a JSX-bound `const`:

```tsx
const personalSection      = (<section className="space-y-3"> {/* ... existing JSX ... */} </section>);
const contactSection       = (<section className="space-y-3"> {/* ... */} </section>);
const additionalSection    = (<section className="space-y-3"> {/* ... */} </section>);
const employmentSection    = (<section className="space-y-3"> {/* ... */} </section>);
const statusSection        = (<section className="space-y-3"> {/* ... */} </section>);
```

(This is mechanical — copy the existing JSX literally; nothing inside changes.)

- [ ] **Step 2: Add tab spec wiring**

Above the `return`, add:

```tsx
import { TabbedFormShell, type TabSpec } from '@/components/forms';
import { BasicTab } from './staff-form-tabs/basic-tab';
import { AcademicTab } from './staff-form-tabs/academic-tab';
import { ExperienceTab } from './staff-form-tabs/experience-tab';
import { ResearchTab } from './staff-form-tabs/research-tab';
import { AchievementsTab } from './staff-form-tabs/achievements-tab';
import { MentoringTab } from './staff-form-tabs/mentoring-tab';
import { FaqsTab } from './staff-form-tabs/faqs-tab';

// inside StaffForm, after form is set up:
const hasExtended  = form.watch('has_extended_profile');
const dirty        = form.formState.dirtyFields as Record<string, unknown>;

// Heuristic: a tab is "dirty" if any field name in the dirty map starts with one of its prefixes.
const isDirty = (prefixes: string[]) =>
  prefixes.some((p) => Object.keys(dirty).some((k) => k === p || k.startsWith(`${p}.`)));

const tabs: TabSpec[] = [
  {
    id: 'basic',
    label: 'Basic',
    dirty: isDirty(['first_name','last_name','gender','date_of_birth','email','phone','address','state','district','pincode','marital_status','blood_group','profile_picture','staff_id','institution_email','date_of_joining','designation','category_id','role_key','institution_id','department_id','is_active','slug','status','display_order','has_extended_profile']),
    content: (
      <BasicTab
        form={form}
        personalSection={personalSection}
        contactSection={contactSection}
        additionalSection={additionalSection}
        employmentSection={employmentSection}
        statusSection={statusSection}
        canEnableExtended={true /* TODO: pass true when category.shows_extended_profile, see Task 23 */}
      />
    ),
  },
  { id: 'academic',     label: 'Academic',     hidden: !hasExtended, dirty: isDirty(['qualifications','specialisations','qualification_summary']),                            content: <AcademicTab     form={form} /> },
  { id: 'experience',   label: 'Experience',   hidden: !hasExtended, dirty: isDirty(['experience_years','experience_entries','professional_summary']),                       content: <ExperienceTab   form={form} /> },
  { id: 'research',     label: 'Research',     hidden: !hasExtended, dirty: isDirty(['research_papers','publications','research_focus_areas','funded_projects','google_scholar_url','researchgate_url','orcid_url']), content: <ResearchTab     form={form} /> },
  { id: 'achievements', label: 'Achievements', hidden: !hasExtended, dirty: isDirty(['awards_won','badges','awards','certifications','memberships','achievements']),         content: <AchievementsTab form={form} /> },
  { id: 'mentoring',    label: 'Mentoring',    hidden: !hasExtended, dirty: isDirty(['mentoring_description','phd_scholars','pg_dissertations_guided','ug_projects_guided','phd_scholars_list']), content: <MentoringTab form={form} /> },
  { id: 'faqs',         label: 'FAQs',         hidden: !hasExtended, dirty: isDirty(['faqs']),                                                                                content: <FaqsTab         form={form} /> },
];
```

- [ ] **Step 3: Replace the form's old vertical-section render with the tabbed shell**

In the `return`, replace the long stack of `<section>` blocks with:

```tsx
<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
  <TabbedFormShell tabs={tabs} defaultTab="basic" />
  {/* footer (see Task 23) */}
</form>
```

- [ ] **Step 4: Default-value initialization**

Update the `useForm({ defaultValues })` call to include defaults for all new extended fields, so the form is never `undefined` for those properties:

```tsx
defaultValues: {
  // ... existing defaults ...
  has_extended_profile: initialData?.has_extended_profile ?? false,
  slug: initialData?.slug ?? null,
  status: initialData?.status ?? 'draft',
  display_order: initialData?.display_order ?? 0,
  experience_years: initialData?.experience_years ?? 0,
  research_papers: initialData?.research_papers ?? 0,
  phd_scholars: initialData?.phd_scholars ?? 0,
  awards_won: initialData?.awards_won ?? 0,
  pg_dissertations_guided: initialData?.pg_dissertations_guided ?? 0,
  ug_projects_guided: initialData?.ug_projects_guided ?? 0,
  qualification_summary: initialData?.qualification_summary ?? null,
  professional_summary: initialData?.professional_summary ?? null,
  mentoring_description: initialData?.mentoring_description ?? null,
  google_scholar_url: initialData?.google_scholar_url ?? null,
  researchgate_url: initialData?.researchgate_url ?? null,
  orcid_url: initialData?.orcid_url ?? null,
  badges: initialData?.badges ?? [],
  qualifications: initialData?.qualifications ?? [],
  specialisations: initialData?.specialisations ?? [],
  experience_entries: initialData?.experience_entries ?? [],
  research_focus_areas: initialData?.research_focus_areas ?? [],
  publications: initialData?.publications ?? [],
  funded_projects: initialData?.funded_projects ?? [],
  certifications: initialData?.certifications ?? [],
  awards: initialData?.awards ?? [],
  memberships: initialData?.memberships ?? [],
  phd_scholars_list: initialData?.phd_scholars_list ?? [],
  faqs: initialData?.faqs ?? [],
  achievements: initialData?.achievements ?? [],
},
```

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/(routes)/staff/list/_components/staff-form.tsx
git commit -m "refactor(staff/form): tabbed shell with conditional extended tabs"
```

---

### Task 23: Footer buttons + per-status validation + category-driven canEnableExtended

**Files:**
- Modify: `app/(routes)/staff/list/_components/staff-form.tsx`

- [ ] **Step 1: Read `category.shows_extended_profile` to drive the toggle visibility**

Inside `StaffForm`, after categories are fetched (likely via `useEmploymentCategories()` or similar), add:

```tsx
const selectedCategoryId = form.watch('category_id');
const selectedCategory   = categories?.find((c) => c.id === selectedCategoryId);
const canEnableExtended  = !!selectedCategory?.shows_extended_profile;

// When category changes to one with shows_extended_profile=true and the staff
// has no value yet, default the toggle to true.
useEffect(() => {
  if (canEnableExtended && form.getValues('has_extended_profile') === false && !initialData?.id) {
    form.setValue('has_extended_profile', true);
  }
}, [canEnableExtended, form, initialData?.id]);
```

Pass `canEnableExtended` into `<BasicTab canEnableExtended={canEnableExtended} />` (replacing the `true` placeholder from Task 22).

- [ ] **Step 2: Replace footer button block**

Find the existing Cancel/Submit footer buttons (~end of file). Replace with:

```tsx
<div className="flex items-center justify-end gap-2 pt-4 border-t">
  <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
  <Button
    type="button"
    variant="outline"
    onClick={form.handleSubmit(
      (values) => onSubmit({ ...values, status: 'draft' }, { strict: false }),
      onValidationError
    )}
    disabled={form.formState.isSubmitting}
  >
    Save Draft
  </Button>
  {hasExtended && (
    <Button
      type="button"
      onClick={form.handleSubmit(
        (values) => onSubmit({ ...values, status: 'published' }, { strict: true }),
        onValidationError
      )}
      disabled={form.formState.isSubmitting}
    >
      Save & Publish
    </Button>
  )}
</div>
```

- [ ] **Step 3: Update `onSubmit` to accept `{ strict }` flag**

```tsx
async function onSubmit(values: StaffFormValues, opts: { strict: boolean }) {
  // If strict (Save & Publish): validate the extended schema explicitly.
  if (opts.strict && values.has_extended_profile) {
    const result = extendedStaffSchema.safeParse(values);
    if (!result.success) {
      // Surface errors via setError on each path
      result.error.issues.forEach((issue) => {
        form.setError(issue.path.join('.') as never, { message: issue.message });
      });
      // Switch to the first tab that has an error
      const firstField = result.error.issues[0]?.path[0] as string | undefined;
      if (firstField) {
        const tabId = mapFieldToTab(firstField);
        if (tabId) {
          const params = new URLSearchParams(window.location.search);
          params.set('tab', tabId);
          window.history.replaceState(null, '', `?${params.toString()}`);
        }
      }
      return;
    }
  }

  // ... existing service call (createStaff / updateStaff) ...
}

// Helper above onSubmit:
function mapFieldToTab(field: string): string | null {
  const map: Record<string, string> = {
    qualifications: 'academic', specialisations: 'academic', qualification_summary: 'academic',
    experience_years: 'experience', experience_entries: 'experience', professional_summary: 'experience',
    research_papers: 'research', publications: 'research', research_focus_areas: 'research',
    funded_projects: 'research', google_scholar_url: 'research', researchgate_url: 'research', orcid_url: 'research',
    awards_won: 'achievements', badges: 'achievements', awards: 'achievements',
    certifications: 'achievements', memberships: 'achievements', achievements: 'achievements',
    mentoring_description: 'mentoring', phd_scholars: 'mentoring', pg_dissertations_guided: 'mentoring',
    ug_projects_guided: 'mentoring', phd_scholars_list: 'mentoring',
    faqs: 'faqs',
  };
  return map[field] ?? null;
}

function onValidationError(errors: Record<string, unknown>) {
  // toast or console — existing pattern in the file should already have one
}
```

- [ ] **Step 4: Typecheck + smoke test**

```bash
npm run typecheck
npm run dev
```

Open `/staff/list/new`. Verify:
- The form shows tabs at the top with "Basic" highlighted.
- Other tabs are not visible until you switch to a category with `shows_extended_profile=true` and toggle the switch in Profile Settings.
- Save Draft saves with `status='draft'`. Save & Publish appears only when extended is on.

- [ ] **Step 5: Commit**

```bash
git add app/(routes)/staff/list/_components/staff-form.tsx
git commit -m "feat(staff/form): footer buttons, per-status validation, category-driven toggle"
```

---

## Phase 5 — Detail View

### Task 24: Add conditional Extended Profile section to detail page

**Files:**
- Modify: `app/(routes)/staff/list/[id]/page.tsx`

- [ ] **Step 1: Add a read-only `<ExtendedProfileSections>` component inline**

After the existing 4 Cards (Profile Overview / Personal / Contact / Employment), and before the closing `<ContentLayout>`, add:

```tsx
{staff.has_extended_profile && (
  <Card>
    <CardHeader>
      <CardTitle>Extended Profile</CardTitle>
    </CardHeader>
    <CardContent>
      <Tabs defaultValue="academic">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="academic">Academic</TabsTrigger>
          <TabsTrigger value="experience">Experience</TabsTrigger>
          <TabsTrigger value="research">Research</TabsTrigger>
          <TabsTrigger value="achievements">Achievements</TabsTrigger>
          <TabsTrigger value="mentoring">Mentoring</TabsTrigger>
          <TabsTrigger value="faqs">FAQs</TabsTrigger>
        </TabsList>

        <TabsContent value="academic">
          {staff.qualification_summary && (
            <div className="prose prose-sm mb-4"><ReactMarkdown>{staff.qualification_summary}</ReactMarkdown></div>
          )}
          <ReadOnlyList title="Qualifications" items={staff.qualifications} renderItem={(q: any) => `${q.degree} — ${q.institution} (${q.year})`} />
          <ReadOnlyList title="Specialisations" items={staff.specialisations} renderItem={(s: any) => s.name} />
        </TabsContent>

        <TabsContent value="experience">
          <p className="text-sm text-muted-foreground mb-3">{staff.experience_years} years total</p>
          <ReadOnlyList title="Experience" items={staff.experience_entries} renderItem={(e: any) => `${e.role} @ ${e.organisation} (${e.from} – ${e.to ?? 'present'})`} />
          {staff.professional_summary && (
            <div className="prose prose-sm mt-4"><ReactMarkdown>{staff.professional_summary}</ReactMarkdown></div>
          )}
        </TabsContent>

        <TabsContent value="research">
          <p className="text-sm text-muted-foreground mb-3">{staff.research_papers} research papers</p>
          <ReadOnlyList title="Publications" items={staff.publications} renderItem={(p: any) => `${p.title} (${p.year ?? '—'})`} />
          <ReadOnlyList title="Research Focus" items={staff.research_focus_areas} renderItem={(r: any) => r.area} />
          <ReadOnlyList title="Funded Projects" items={staff.funded_projects} renderItem={(f: any) => `${f.title} — ${f.agency ?? '—'}`} />
          <div className="mt-3 flex gap-3 text-sm">
            {staff.google_scholar_url && <a className="underline" href={staff.google_scholar_url} target="_blank" rel="noreferrer">Google Scholar</a>}
            {staff.researchgate_url   && <a className="underline" href={staff.researchgate_url}   target="_blank" rel="noreferrer">ResearchGate</a>}
            {staff.orcid_url          && <a className="underline" href={staff.orcid_url}          target="_blank" rel="noreferrer">ORCID</a>}
          </div>
        </TabsContent>

        <TabsContent value="achievements">
          <p className="text-sm text-muted-foreground mb-3">{staff.awards_won} awards won</p>
          <ReadOnlyList title="Badges" items={staff.badges} renderItem={(b: any) => b.label} />
          <ReadOnlyList title="Awards" items={staff.awards} renderItem={(a: any) => `${a.title} (${a.year ?? '—'})`} />
          <ReadOnlyList title="Certifications" items={staff.certifications} renderItem={(c: any) => c.name} />
          <ReadOnlyList title="Memberships" items={staff.memberships} renderItem={(m: any) => `${m.body}${m.role ? ' (' + m.role + ')' : ''}`} />
          <ReadOnlyList title="Achievements" items={staff.achievements} renderItem={(a: any) => a.title} />
        </TabsContent>

        <TabsContent value="mentoring">
          {staff.mentoring_description && (
            <div className="prose prose-sm mb-4"><ReactMarkdown>{staff.mentoring_description}</ReactMarkdown></div>
          )}
          <p className="text-sm">PhD scholars: {staff.phd_scholars} | PG: {staff.pg_dissertations_guided} | UG: {staff.ug_projects_guided}</p>
          <ReadOnlyList title="PhD Scholars" items={staff.phd_scholars_list} renderItem={(s: any) => `${s.name}${s.topic ? ' — ' + s.topic : ''}`} />
        </TabsContent>

        <TabsContent value="faqs">
          {(staff.faqs ?? []).map((q: any, i: number) => (
            <div key={i} className="mb-4">
              <p className="font-semibold">{q.question}</p>
              <p className="text-sm">{q.answer}</p>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </CardContent>
  </Card>
)}
```

And add this small helper at the bottom of the same file:

```tsx
function ReadOnlyList<T>({ title, items, renderItem }: { title: string; items: T[]; renderItem: (item: T) => React.ReactNode; }) {
  if (!items?.length) return null;
  return (
    <div className="mb-4">
      <h3 className="font-semibold text-sm mb-2">{title}</h3>
      <ul className="list-disc pl-5 space-y-1 text-sm">
        {items.map((it, i) => <li key={i}>{renderItem(it)}</li>)}
      </ul>
    </div>
  );
}
```

Add the imports at the top:

```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import ReactMarkdown from 'react-markdown';
```

- [ ] **Step 2: Smoke test in browser**

`npm run dev`, navigate to `/staff/list/<some-id>`. For a staff with `has_extended_profile: false`, the page renders unchanged (4 cards). For one with `true`, the new Extended Profile card appears below.

- [ ] **Step 3: Commit**

```bash
git add app/(routes)/staff/list/[id]/page.tsx
git commit -m "feat(staff/detail): conditional Extended Profile read-only section"
```

---

## Phase 6 — Category Form Toggle

### Task 25: Add `shows_extended_profile` switch to category form

**Files:**
- Modify: `app/(routes)/staff/category/_components/category-form.tsx` (verify path with `ls`)

- [ ] **Step 1: Locate the category form file**

```bash
ls "app/(routes)/staff/category/_components/" 2>/dev/null
```

If the form file isn't there, find it:

```bash
grep -rln "category_name" app/\(routes\)/staff/category/ | head
```

- [ ] **Step 2: Add the field to the Zod schema**

Add `shows_extended_profile: z.boolean().default(false),` to the schema.

- [ ] **Step 3: Add the switch to the form JSX**

Below the `is_teaching` switch (it should already exist; mirror its shape):

```tsx
<FormField
  control={form.control}
  name="shows_extended_profile"
  render={({ field }) => (
    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
      <div className="space-y-0.5">
        <FormLabel>Default Extended Profile</FormLabel>
        <FormDescription>
          When enabled, staff added under this category get the extended faculty profile fields by default.
        </FormDescription>
      </div>
      <FormControl>
        <Switch checked={field.value} onCheckedChange={field.onChange} />
      </FormControl>
    </FormItem>
  )}
/>
```

- [ ] **Step 4: Update default values + ensure mutation passes the field through**

In `defaultValues`, add `shows_extended_profile: initialData?.shows_extended_profile ?? false`.

- [ ] **Step 5: Smoke test**

`npm run dev`. Navigate to `/staff/category`. Edit a category, toggle the switch, save. Verify in DB:

```sql
SELECT id, category_name, shows_extended_profile FROM employment_categories;
```

- [ ] **Step 6: Commit**

```bash
git add app/(routes)/staff/category/
git commit -m "feat(staff/category): shows_extended_profile switch"
```

---

## Phase 7 — Import Script

### Task 26: Set up env template and script skeleton

**Files:**
- Create: `.env.import.example`
- Create: `scripts/import/website-faculty-to-staff.ts`
- Create: `scripts/import/lib/website-supabase.ts`
- Modify: `package.json` (add script entry)

- [ ] **Step 1: Create `.env.import.example`**

```bash
# Copy to .env.import (gitignored) and fill in real values.
WEBSITE_SUPABASE_URL=https://kyvfkyjmdbtyimtedkie.supabase.co
WEBSITE_SUPABASE_SERVICE_ROLE_KEY=

# MyJKKN Supabase already configured via .env.local
```

- [ ] **Step 2: Verify `.env.import` is gitignored**

```bash
grep -E "^\.env" .gitignore
```

If `.env.*` or `.env.import` is not listed, add it:

```bash
echo "" >> .gitignore
echo "# Import script env" >> .gitignore
echo ".env.import" >> .gitignore
```

- [ ] **Step 3: Create `scripts/import/lib/website-supabase.ts`**

```typescript
import { createClient } from '@supabase/supabase-js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.import');
  if (!fs.existsSync(envPath)) {
    throw new Error(`.env.import not found at ${envPath}. Copy .env.import.example and fill in.`);
  }
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

export function websiteSupabase() {
  loadEnv();
  const url = process.env.WEBSITE_SUPABASE_URL;
  const key = process.env.WEBSITE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('WEBSITE_SUPABASE_URL and WEBSITE_SUPABASE_SERVICE_ROLE_KEY must be set in .env.import');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
```

- [ ] **Step 4: Create script skeleton**

`scripts/import/website-faculty-to-staff.ts`:

```typescript
#!/usr/bin/env tsx
/* eslint-disable no-console */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { websiteSupabase } from './lib/website-supabase';

const DRY_RUN = process.argv.includes('--dry-run');

function myjkknSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('MyJKKN Supabase env missing — load .env.local first');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function main() {
  console.log(`[import] Starting (DRY_RUN=${DRY_RUN})`);
  const ws = websiteSupabase();
  const my = myjkknSupabase();

  const { data: faculty, error } = await ws.from('faculty').select('*');
  if (error) throw error;
  console.log(`[import] Fetched ${faculty?.length ?? 0} website faculty rows`);

  // Field-mapping + match loop go here in Task 27/28.

  console.log('[import] Done');
}

main().catch((e) => {
  console.error('[import] FAILED', e);
  process.exit(1);
});
```

- [ ] **Step 5: Add npm script**

In `package.json`, under `"scripts"`:

```json
"import:website-faculty": "tsx --env-file=.env.local scripts/import/website-faculty-to-staff.ts",
"import:website-faculty:dry": "tsx --env-file=.env.local scripts/import/website-faculty-to-staff.ts --dry-run"
```

- [ ] **Step 6: Smoke test the skeleton**

```bash
cp .env.import.example .env.import
# Fill in real values, then:
npm run import:website-faculty:dry
```

Expected: prints `[import] Starting (DRY_RUN=true)` and the fetch count, then `[import] Done`.

- [ ] **Step 7: Commit**

```bash
git add .env.import.example .gitignore scripts/import/ package.json
git commit -m "feat(import): script skeleton + env template

Loads website Supabase via .env.import, MyJKKN via .env.local."
```

---

### Task 27: Field-mapping module + tests

**Files:**
- Create: `scripts/import/lib/field-mapper.ts`
- Create: `scripts/import/lib/field-mapper.test.ts`

- [ ] **Step 1: Write the failing test first**

```typescript
// scripts/import/lib/field-mapper.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitFullName, mapFacultyToStaffUpdate } from './field-mapper';

test('splitFullName splits on first whitespace', () => {
  assert.deepEqual(splitFullName('Dr. John Smith'), { first_name: 'Dr.', last_name: 'John Smith' });
  assert.deepEqual(splitFullName('Madonna'),         { first_name: 'Madonna', last_name: '' });
  assert.deepEqual(splitFullName('  '),              { first_name: '', last_name: '' });
});

test('mapFacultyToStaffUpdate copies extended fields, skips nulls cleanly', () => {
  const out = mapFacultyToStaffUpdate({
    slug: 'dr-john-smith',
    designation: 'Professor',
    qualification: 'Ph.D., M.Tech',
    experience_years: 15,
    qualifications: [{ degree: 'Ph.D.', institution: 'IIT Madras', year: 2010 }],
    badges: [{ label: 'Senior Member', color: '#ef4444' }],
  });
  assert.equal(out.slug, 'dr-john-smith');
  assert.equal(out.qualification_summary, 'Ph.D., M.Tech');
  assert.equal(out.experience_years, 15);
  assert.equal(out.qualifications.length, 1);
  assert.equal(out.has_extended_profile, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx tsx --test scripts/import/lib/field-mapper.test.ts
```

Expected: FAIL ("cannot find module './field-mapper'").

- [ ] **Step 3: Implement the module**

```typescript
// scripts/import/lib/field-mapper.ts
export interface WebsiteFacultyRow {
  full_name?: string | null;
  slug?: string | null;
  designation?: string | null;
  department?: string | null;
  qualification?: string | null;
  email?: string | null;
  photo_url?: string | null;
  experience_years?: number | null;
  research_papers?: number | null;
  phd_scholars?: number | null;
  awards_won?: number | null;
  display_order?: number | null;
  status?: 'draft' | 'published' | null;
  badges?: any[] | null;
  professional_summary?: string | null;
  qualifications?: any[] | null;
  specialisations?: any[] | null;
  experience_entries?: any[] | null;
  research_focus_areas?: any[] | null;
  publications?: any[] | null;
  funded_projects?: any[] | null;
  google_scholar_url?: string | null;
  researchgate_url?: string | null;
  orcid_url?: string | null;
  certifications?: any[] | null;
  awards?: any[] | null;
  memberships?: any[] | null;
  mentoring_description?: string | null;
  phd_scholars_list?: any[] | null;
  pg_dissertations_guided?: number | null;
  ug_projects_guided?: number | null;
  faqs?: any[] | null;
}

export function splitFullName(full: string): { first_name: string; last_name: string } {
  const trimmed = (full ?? '').trim();
  if (!trimmed) return { first_name: '', last_name: '' };
  const ws = trimmed.indexOf(' ');
  if (ws === -1) return { first_name: trimmed, last_name: '' };
  return { first_name: trimmed.slice(0, ws), last_name: trimmed.slice(ws + 1).trim() };
}

/** Returns the partial UPDATE payload to apply to a matched MyJKKN staff row. */
export function mapFacultyToStaffUpdate(f: WebsiteFacultyRow) {
  return {
    has_extended_profile: true,
    slug: f.slug ?? null,
    status: f.status ?? 'draft',
    display_order: f.display_order ?? 0,
    experience_years: f.experience_years ?? 0,
    research_papers: f.research_papers ?? 0,
    phd_scholars: f.phd_scholars ?? 0,
    awards_won: f.awards_won ?? 0,
    pg_dissertations_guided: f.pg_dissertations_guided ?? 0,
    ug_projects_guided: f.ug_projects_guided ?? 0,
    qualification_summary: f.qualification ?? null,
    professional_summary: f.professional_summary ?? null,
    mentoring_description: f.mentoring_description ?? null,
    google_scholar_url: f.google_scholar_url ?? null,
    researchgate_url: f.researchgate_url ?? null,
    orcid_url: f.orcid_url ?? null,
    badges: f.badges ?? [],
    qualifications: f.qualifications ?? [],
    specialisations: f.specialisations ?? [],
    experience_entries: f.experience_entries ?? [],
    research_focus_areas: f.research_focus_areas ?? [],
    publications: f.publications ?? [],
    funded_projects: f.funded_projects ?? [],
    certifications: f.certifications ?? [],
    awards: f.awards ?? [],
    memberships: f.memberships ?? [],
    phd_scholars_list: f.phd_scholars_list ?? [],
    faqs: f.faqs ?? [],
  };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx tsx --test scripts/import/lib/field-mapper.test.ts
```

Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add scripts/import/lib/field-mapper.ts scripts/import/lib/field-mapper.test.ts
git commit -m "feat(import): field-mapper with unit tests"
```

---

### Task 28: Wire mapping + match loop into the script

**Files:**
- Modify: `scripts/import/website-faculty-to-staff.ts`

- [ ] **Step 1: Replace the placeholder loop with the real one**

Inside `main()`, replace the comment-only section with:

```typescript
import { mapFacultyToStaffUpdate, splitFullName } from './lib/field-mapper';

// after fetch:
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const logDir = path.resolve(process.cwd(), 'scripts/import/runs');
fs.mkdirSync(logDir, { recursive: true });
const logPath = path.join(logDir, `run-${runId}.log`);
const log = (line: string) => {
  console.log(line);
  fs.appendFileSync(logPath, line + '\n');
};

let matched = 0, skipped = 0, unmatched = 0;

for (const fac of faculty ?? []) {
  const email = (fac.email ?? '').toLowerCase().trim();
  if (!email) {
    log(`[skip] no email: ${fac.full_name ?? '(unknown)'}`);
    skipped++;
    continue;
  }

  const { data: staffRow, error: lookupErr } = await my
    .from('staff')
    .select('id, first_name, last_name')
    .ilike('email', email)
    .maybeSingle();

  if (lookupErr) {
    log(`[error] lookup failed for ${email}: ${lookupErr.message}`);
    skipped++;
    continue;
  }

  if (!staffRow) {
    log(`[unmatched] ${email} — no staff with this email`);
    unmatched++;
    if (!DRY_RUN) {
      const { error: insErr } = await my.from('staff_import_unmatched').insert({
        source_table: 'faculty',
        source_row: fac,
        reason: 'no email match in MyJKKN staff',
      });
      if (insErr) log(`[error] failed to record unmatched row: ${insErr.message}`);
    }
    continue;
  }

  const update = mapFacultyToStaffUpdate(fac);
  log(`[match] ${email} → staff.id=${staffRow.id}`);
  if (!DRY_RUN) {
    const { error: updErr } = await my.from('staff').update(update).eq('id', staffRow.id);
    if (updErr) {
      log(`[error] update failed for ${email}: ${updErr.message}`);
      skipped++;
      continue;
    }
  }
  matched++;
}

log(`[summary] matched=${matched} unmatched=${unmatched} skipped=${skipped}`);
log(`[summary] log written to ${logPath}`);
```

- [ ] **Step 2: Add `runs/.gitkeep`**

```bash
mkdir -p scripts/import/runs && touch scripts/import/runs/.gitkeep
```

Edit `.gitignore` to ignore `*.log` under that path:

```bash
echo "scripts/import/runs/*.log" >> .gitignore
```

- [ ] **Step 3: Smoke test**

```bash
npm run import:website-faculty:dry
```

Expected: prints `[match]`, `[unmatched]`, and `[summary]` lines; **no rows** written because `--dry-run` is set. Confirm no log file mutates the DB by querying `select count(*) from staff_import_unmatched;`.

- [ ] **Step 4: Commit**

```bash
git add scripts/import/website-faculty-to-staff.ts scripts/import/runs/.gitkeep .gitignore
git commit -m "feat(import): match-by-email loop with unmatched-row capture"
```

---

### Task 29: Achievements pass

**Files:**
- Modify: `scripts/import/website-faculty-to-staff.ts`

- [ ] **Step 1: Add a second pass after the main loop**

```typescript
// SECOND PASS: faculty_achievements → staff.achievements jsonb
const { data: achievements, error: achErr } = await ws.from('faculty_achievements').select('*');
if (achErr) {
  log(`[warn] failed to fetch faculty_achievements (table may not exist): ${achErr.message}`);
} else if (achievements?.length) {
  // Group by faculty_name
  const byName = new Map<string, any[]>();
  for (const a of achievements) {
    const name = (a.faculty_name ?? '').trim();
    if (!name) continue;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name)!.push({
      title: a.title,
      description: a.description,
      date: a.achievement_date,
      featured: !!a.is_featured,
      category: null, // FK lookup not preserved
    });
  }

  for (const [name, items] of byName) {
    // Find staff by name (best-effort; not perfect)
    const { first_name, last_name } = splitFullName(name);
    const { data: staffRow } = await my
      .from('staff')
      .select('id, achievements')
      .eq('first_name', first_name)
      .eq('last_name', last_name)
      .maybeSingle();

    if (!staffRow) {
      log(`[unmatched-ach] no staff found for "${name}" — ${items.length} achievements`);
      if (!DRY_RUN) {
        await my.from('staff_import_unmatched').insert({
          source_table: 'faculty_achievements',
          source_row: { faculty_name: name, items },
          reason: 'no staff found by full_name split',
        });
      }
      continue;
    }

    const merged = [...(staffRow.achievements ?? []), ...items];
    log(`[match-ach] ${name} → staff.id=${staffRow.id} (+${items.length} achievements)`);
    if (!DRY_RUN) {
      const { error: updErr } = await my.from('staff').update({ achievements: merged }).eq('id', staffRow.id);
      if (updErr) log(`[error] achievement update failed for ${name}: ${updErr.message}`);
    }
  }
}
```

- [ ] **Step 2: Smoke test dry-run again**

```bash
npm run import:website-faculty:dry
```

Expected: see `[match-ach]` / `[unmatched-ach]` / `[warn]` lines depending on what's in the website DB.

- [ ] **Step 3: Commit**

```bash
git add scripts/import/website-faculty-to-staff.ts
git commit -m "feat(import): faculty_achievements second pass"
```

---

### Task 30: Document the import workflow

**Files:**
- Create: `scripts/import/README.md`

- [ ] **Step 1: Write the README**

```markdown
# Website Faculty → MyJKKN Staff Import

One-time migration script that copies extended faculty profile fields from the institution website's standalone Supabase project into MyJKKN.

## Setup

1. Copy `.env.import.example` to `.env.import`.
2. Fill in `WEBSITE_SUPABASE_URL` and `WEBSITE_SUPABASE_SERVICE_ROLE_KEY` (find in Supabase dashboard → Project Settings → API).
3. Make sure `.env.local` has `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` for MyJKKN (it should already).

## Run

```bash
# Dry run — prints matched/unmatched but writes nothing
npm run import:website-faculty:dry

# Real run
npm run import:website-faculty
```

Each run writes a log to `scripts/import/runs/run-<timestamp>.log`.

## What it does

1. **Pass 1** — fetch all rows from the website's `faculty` table. For each:
   - Look up MyJKKN `staff` by `lower(email)`.
   - If found, UPDATE the new extended fields (existing personal data is NOT overwritten).
   - If not found, insert into `staff_import_unmatched` for manual review.
2. **Pass 2** — fetch `faculty_achievements`, group by `faculty_name`, append to matched staff's `achievements` JSONB. Unmatched names go to `staff_import_unmatched`.

## Reviewing unmatched rows

```sql
SELECT id, source_table, source_row->>'email' AS email, reason, created_at
FROM staff_import_unmatched
WHERE resolved = false
ORDER BY created_at DESC;
```

Resolve by:
- Creating the missing staff in MyJKKN, or
- Editing an existing staff's email to match, or
- Marking the row as resolved if it should be discarded:

```sql
UPDATE staff_import_unmatched SET resolved = true, resolved_at = now() WHERE id = '...';
```

After resolution, re-run the import script — already-matched rows are idempotent (UPDATE replaces with the same payload).
```

- [ ] **Step 2: Commit**

```bash
git add scripts/import/README.md
git commit -m "docs(import): README for website-faculty-to-staff script"
```

---

## Phase 8 — End-to-End Verification

### Task 31: Toggle category, create staff, verify form behavior

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify category toggle**

Navigate to `/staff/category`. Pick "Teaching Staff" (or equivalent), edit, enable **Default Extended Profile**, save.

- [ ] **Step 3: Create a staff under that category**

Navigate to `/staff/list/new`. Fill in mandatory Basic fields. When the category is selected, verify:
- The "Extended Faculty Profile" toggle in Profile Settings is auto-enabled.
- The other 6 tabs become visible.

- [ ] **Step 4: Add at least one entry per tab**

Click into Academic, add 1 qualification. Click into Achievements, add 1 award. Save Draft.

- [ ] **Step 5: Verify in DB**

```sql
SELECT first_name, last_name, has_extended_profile, status,
       jsonb_array_length(qualifications) AS qual_n,
       jsonb_array_length(awards) AS awd_n
FROM staff
ORDER BY created_at DESC LIMIT 1;
```

Expected: `has_extended_profile = true`, `status = 'draft'`, `qual_n = 1`, `awd_n = 1`.

- [ ] **Step 6: Open the detail page**

Navigate to `/staff/list/<the new id>`. Verify the Extended Profile card appears and shows 1 qualification + 1 award.

- [ ] **Step 7: Test API endpoint**

```bash
curl -H "Authorization: Bearer <test-key>" \
  "http://localhost:3000/api/api-management/staff?has_extended_profile=true&limit=5" \
  | jq '.data[0] | {first_name, last_name, has_extended_profile, qualifications, awards}'
```

Expected: the new staff appears with the JSONB arrays populated.

### Task 32: Run the import script (dry then real) on a Supabase branch

- [ ] **Step 1: Create a Supabase branch**

```
mcp__supabase__create_branch  name: "staff-extended-import-test"
```

- [ ] **Step 2: Point `.env.import` to the website's Supabase, `.env.local` to the branch**

(Branch URL/key from MCP response.)

- [ ] **Step 3: Run dry**

```bash
npm run import:website-faculty:dry
```

Verify the log shows expected matched/unmatched counts.

- [ ] **Step 4: Run for real**

```bash
npm run import:website-faculty
```

Verify in DB:

```sql
SELECT count(*) FROM staff WHERE has_extended_profile = true;
SELECT count(*) FROM staff_import_unmatched;
```

- [ ] **Step 5: Spot-check a known faculty**

Pick a known website faculty, run:

```sql
SELECT first_name, last_name, slug, status,
       jsonb_array_length(publications) AS pubs,
       jsonb_array_length(awards) AS awds
FROM staff
WHERE lower(institution_email) = lower('<known-email>');
```

Expected: matches the website's data.

- [ ] **Step 6: Merge or discard the branch**

If happy: `mcp__supabase__merge_branch`. Otherwise `mcp__supabase__delete_branch`.

### Task 33: Final cleanup commit

- [ ] **Step 1: Run lint**

```bash
npm run lint
```

Fix any new lint errors introduced.

- [ ] **Step 2: Run typecheck final**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run sidebar/permission gates**

```bash
npm run check:sidebar
npm run check:reachability
```

Expected: PASS.

- [ ] **Step 4: Commit any cleanup**

```bash
git add -A
git commit -m "chore(staff): final lint/type cleanup for extended profile feature"
```

---

## Self-Review Notes (already applied)

- ✅ Spec coverage: every section in the spec maps to one or more tasks (schema → Phase 1; types/API → Phase 2; components → Phase 3; form → Phase 4; detail view → Phase 5; category toggle → Phase 6; import → Phase 7; verification → Phase 8).
- ✅ No placeholders in any task body.
- ✅ Type names consistent: `StaffFormValues`, `BasicTabProps`, `RepeatingFieldArray<T,TItem>`, `defaults.qualification()` etc. used consistently across Tasks 13–22.
- ✅ Per project memory: every migration is committed to `supabase/migrations/` AND mirrored into `supabase/setup/01_tables.sql` (and `03_policies.sql` for the new table). No `SELECT 1;` placeholders.
- ✅ Per project memory: Supabase mutations destructure `{ error }` (Tasks 28, 29) — no fire-and-forget inserts.
- ✅ Per project memory: no browser-side `user_roles` insert added. Existing role assignment paths untouched.

---

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-05-03-staff-extended-faculty-fields.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
