# Staff Extended Faculty Profile Fields — Design Spec

**Date:** 2026-05-03
**Author:** Claude (brainstormed with @aicse)
**Status:** Draft — awaiting user review
**Implementation plan:** TBD (next step is `writing-plans`)

---

## 1. Problem Statement

The MyJKKN `staff` module currently stores only basic HR information — 25 flat columns covering personal info, contact, and employment data. There is no representation of the rich academic profile a faculty member needs (qualifications, publications, research focus, awards, mentoring, FAQs, etc.).

Meanwhile, the JKKN College of Engineering institution website runs its own admin panel where the same staff data is re-entered into a separate `faculty` table (36 columns, 11 of them JSONB arrays — see `docs/features/staff/faculty-tables-clone.sql`). That duplication is the problem: changes to a staff member must be made twice, in two systems, with no enforced consistency.

The goal is to make MyJKKN the **single source of truth** so the website can read faculty profiles directly from MyJKKN, and the website's standalone `faculty` admin panel can be retired.

The integration path is already in place — the website already calls `GET /api/api-management/staff` (API-key authenticated), and that endpoint uses `.select('*')`, so any new columns added to the `staff` table will flow through to the website with no API code change.

---

## 2. Goals

- Add the academic / research / mentoring fields from the website's `faculty` table to MyJKKN's `staff` table.
- Make those fields **opt-in per category and per staff** so that non-faculty staff (admin, drivers, hostel wardens, etc.) see no extra UI clutter.
- Restructure the staff edit form into a tabbed layout matching the reference image so admins have one familiar editing experience whether they came from the website or MyJKKN.
- Provide a one-time data import pipeline to migrate existing website faculty records into MyJKKN.
- Keep the API endpoint contract the same so the website's existing API consumer keeps working.

## 3. Non-Goals

- Replicating the website's `faculty_achievements` table 1:1 with all its FK relations to colleges/courses/categories. Achievements are stored as a JSONB array on the staff row instead.
- Building a public-facing faculty profile page inside MyJKKN. The website remains the public surface; MyJKKN is the editor.
- Implementing rich-text WYSIWYG editing. Markdown fields use a textarea + preview tab.
- Hardening the `select('*')` API endpoint with an explicit field allowlist. (Flagged as future work in §10.)
- Image cropping / processing for `photo_url` beyond what the existing `StaffImageUpload` already does.

---

## 4. Decisions Locked In During Brainstorming

| # | Question | Decision | Reason |
|---|---|---|---|
| Q1 | Data flow direction (MyJKKN ↔ website) | **MyJKKN writes; website reads via the existing API** | The endpoint already exists at `app/api/api-management/staff/route.ts` and uses `select('*')`, so new columns auto-flow. |
| Q2 | Opt-in mechanism | **Per-category default + per-staff override.** `employment_categories.shows_extended_profile` drives the default; `staff.has_extended_profile` overrides per person. | Mirrors existing `is_teaching` pattern; covers edge case of one teaching staff who doesn't want a public profile. |
| Q3 | Schema shape | **Extend `staff` table directly** with new nullable columns. No side table, no JSONB blob. | Existing API uses `select('*')`, nullable cols are zero-cost when unused, type generation stays clean. |
| Q4 | Repeating sub-objects (qualifications, publications, etc.) | **`useFieldArray` + Accordion items** with Add/Remove buttons. | Matches the website's UX (per screenshot); react-hook-form has it built in. |
| Q5 | Form layout | **Tabbed shell at the top of the staff form** — 7 tabs matching the reference image. The Basic tab houses all existing 5 sections; the other 6 tabs are visible only when extended profile is on. | Matches reference image exactly; doesn't disrupt forms for non-faculty staff. |
| Q6 | Data migration from website | **One-time Node script** in `scripts/import/` that matches by `email` (case-insensitive); matched → UPDATE; unmatched → row in `staff_import_unmatched` review table. | Email is the only universally-present unique key; unmatched table catches the rest for manual review. |
| Q7 | `faculty_achievements` table | **Store as JSONB array `achievements` on staff**, do NOT replicate the separate child table. | Website-specific full-text search and college FKs aren't useful in MyJKKN; keeps schema flat. |
| Q8 | Public/private split | All new "extended profile" fields are public-safe (they were already on the public website). | All new fields = display content, not sensitive PII. |

---

## 5. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  MyJKKN (single source of truth)                                │
│                                                                  │
│   staff table (existing 25 cols)                                 │
│   + 1  toggle col   (has_extended_profile)                       │
│   + 3  publishing cols (slug, status, display_order)             │
│   + 6  count cols  (experience_years, research_papers, ...)      │
│   + 3  markdown cols (professional_summary, mentoring_..., ...)  │
│   + 3  url cols (google_scholar_url, researchgate_url, orcid_url)│
│   + 12 jsonb[] cols (qualifications, publications, awards, ...)  │
│                                                                  │
│   employment_categories                                          │
│   + 1 col (shows_extended_profile boolean)                       │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼   GET /api/api-management/staff?…
                   (uses select('*') — auto-includes new cols)
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Institution website (separate Supabase project)                 │
│   - Standalone faculty admin retired after cutover               │
│   - Reads faculty profiles from MyJKKN API                       │
│   - One-time script imports existing faculty rows into MyJKKN    │
│     before the cutover                                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Schema Additions

### 6.1 New columns on `public.staff`

All new columns are **nullable**, with sensible defaults so existing rows are unaffected.

| Column | Type | Default | Notes |
|---|---|---|---|
| `has_extended_profile` | `boolean` | `false` | Per-staff toggle. Drives form visibility. |
| `slug` | `text` | `null` | URL-friendly. Globally unique (partial unique index). Auto-generated from name on first save with collision-suffix. |
| `status` | `text` | `'draft'` | CHECK in `('draft','published')`. Controls public visibility on website. |
| `display_order` | `integer` | `0` | Website ordering. |
| `experience_years` | `integer` | `0` | Count. |
| `research_papers` | `integer` | `0` | Count. |
| `phd_scholars` | `integer` | `0` | Count. |
| `awards_won` | `integer` | `0` | Count. |
| `pg_dissertations_guided` | `integer` | `0` | Count. |
| `ug_projects_guided` | `integer` | `0` | Count. |
| `qualification_summary` | `text` | `null` | Short caption (existing `designation` already covers job title). |
| `professional_summary` | `text` | `null` | Markdown. |
| `mentoring_description` | `text` | `null` | Markdown. |
| `google_scholar_url` | `text` | `null` | |
| `researchgate_url` | `text` | `null` | |
| `orcid_url` | `text` | `null` | |
| `badges` | `jsonb` | `'[]'::jsonb` | `[{ label, color }]` |
| `qualifications` | `jsonb` | `'[]'::jsonb` | `[{ degree, institution, year, specialization }]` |
| `specialisations` | `jsonb` | `'[]'::jsonb` | `[{ name }]` |
| `experience_entries` | `jsonb` | `'[]'::jsonb` | `[{ role, organisation, from, to, description }]` |
| `research_focus_areas` | `jsonb` | `'[]'::jsonb` | `[{ area, description }]` |
| `publications` | `jsonb` | `'[]'::jsonb` | `[{ title, journal, year, doi, url, type }]` |
| `funded_projects` | `jsonb` | `'[]'::jsonb` | `[{ title, agency, amount, year, status }]` |
| `certifications` | `jsonb` | `'[]'::jsonb` | `[{ name, issuer, year, credential_url }]` |
| `awards` | `jsonb` | `'[]'::jsonb` | `[{ title, awarded_by, year, description }]` |
| `memberships` | `jsonb` | `'[]'::jsonb` | `[{ body, role, since }]` |
| `phd_scholars_list` | `jsonb` | `'[]'::jsonb` | `[{ name, topic, year, status }]` |
| `faqs` | `jsonb` | `'[]'::jsonb` | `[{ question, answer }]` |
| `achievements` | `jsonb` | `'[]'::jsonb` | `[{ title, description, date, featured, category }]` — replaces website's `faculty_achievements` table. |

**Note on existing column reuse:**
- `staff.profile_picture` (existing) maps to the website's `faculty.photo_url`. Reuse as-is. No new column.
- `staff.designation` (existing) maps to the website's `faculty.designation`. Reuse as-is.
- `staff.first_name + last_name` (existing) maps to website's `full_name`. The import script splits/joins.

### 6.2 New column on `public.employment_categories`

| Column | Type | Default | Notes |
|---|---|---|---|
| `shows_extended_profile` | `boolean` | `false` | When true, staff added under this category have `has_extended_profile` defaulted to `true`. |

### 6.3 Indexes

```sql
-- Slug uniqueness (partial — only enforce on rows that have a slug)
CREATE UNIQUE INDEX idx_staff_slug_unique
  ON public.staff (slug)
  WHERE slug IS NOT NULL;

-- Fast lookup of published profiles for the public API
CREATE INDEX idx_staff_status_published
  ON public.staff (status, is_active)
  WHERE status = 'published' AND is_active = true;

-- Fast filter for "show extended UI" queries
CREATE INDEX idx_staff_extended_profile
  ON public.staff (has_extended_profile)
  WHERE has_extended_profile = true;
```

### 6.4 Constraints

```sql
ALTER TABLE public.staff
  ADD CONSTRAINT staff_status_check
  CHECK (status IN ('draft', 'published'));
```

### 6.5 RLS

No RLS policy changes required. The existing `staff` policies (see `supabase/setup/03_policies.sql:836-932`) operate at the row level (institution-scope, super-admin, faculty-self), and the new columns inherit row-level access automatically. No column-level RLS is needed because all new fields are public-safe.

### 6.6 Triggers

The existing `sync_staff_to_profiles` trigger does **not** need updating. None of the new fields belong on the `profiles` table — they are profile-page content, not authentication/authorization data.

---

## 7. UI Changes

### 7.1 Tabbed shell for `staff-form.tsx`

The form's outer shell becomes a `<Tabs>` container matching the reference image's 7-tab layout. Each tab body uses the existing section-divider pattern (h2 header + grid) for sub-sections.

```
┌───────────────────────────────────────────────────────────────────┐
│  [Basic] [Academic] [Experience] [Research] [Achievements] ...    │  ← Tabs
│         [Mentoring] [FAQs]                                        │
├───────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Tab content area — sub-sections inside each tab                   │
│                                                                    │
│  Footer: [Cancel]  [Save Draft]  [Save & Publish]                 │
└───────────────────────────────────────────────────────────────────┘
```

### 7.2 Tab → sub-section → field mapping

| Tab | Sub-sections | Visibility |
|---|---|---|
| **Basic** | Personal Information, Contact Information, Additional Information, Employment Information, Profile Settings (slug, status, display_order, has_extended_profile toggle), Status (is_active) | Always visible |
| **Academic** | Qualifications (repeater), Specialisations (repeater), Qualification Summary (markdown) | Only if `has_extended_profile === true` |
| **Experience** | Experience Years (number), Experience Entries (repeater), Professional Summary (markdown) | Only if extended |
| **Research** | Research Papers (count), Publications (repeater), Research Focus Areas (repeater), Funded Projects (repeater), Scholar URLs (Google Scholar / ResearchGate / ORCID) | Only if extended |
| **Achievements** | Awards Won (count), Badges (repeater), Awards (repeater), Certifications (repeater), Memberships (repeater), Achievements (unified repeater — replaces website's `faculty_achievements` table) | Only if extended |
| **Mentoring** | Mentoring Description (markdown), PhD Scholars (count + list repeater), PG Dissertations Guided (number), UG Projects Guided (number) | Only if extended |
| **FAQs** | FAQs (repeater of `{question, answer}`) | Only if extended |

### 7.3 Behavior rules

1. **Non-faculty staff** (`has_extended_profile === false`): only the **Basic** tab renders. The other 6 tabs are hidden (not just disabled). The form looks like the existing form with a tab wrapper around it.
2. **Toggling `has_extended_profile` on** in Basic → Profile Settings: the other 6 tabs appear immediately (client state), no save required.
3. **Per-tab validation:** Zod schema split into `basicSchema` (always required) + `extendedSchema` (only validated when toggle is on). Save Draft skips extended validation entirely; Save & Publish runs both.
4. **Unsaved-edit indicator:** small dot on a tab label when fields in that tab have been touched but the form hasn't been submitted (uses `formState.dirtyFields` filtered by tab).
5. **Deep linking:** `?tab=research` query param controls the active tab and updates as the user clicks.
6. **Footer buttons:**
   - `Cancel` (always)
   - `Save Draft` (always — sets `status='draft'`)
   - `Save & Publish` (visible only when `has_extended_profile === true`; sets `status='published'` and validates extended schema)
7. **Mobile:** tabs become a horizontal-scroll strip (existing pattern from `components/ui/tabs.tsx`).

### 7.4 New shared components

- **`<RepeatingFieldArray>`** — generic wrapper around `useFieldArray` + Accordion + Add/Remove buttons. Takes a `renderItem` prop. Reused for all 12 JSONB array fields.
- **`<MarkdownField>`** — textarea + live preview tab using `react-markdown` (~30KB gzipped). Used by `professional_summary`, `mentoring_description`, `qualification_summary`.
- **`<TabbedFormShell>`** — owns the tabs, deep-link sync, dirty-tab indicators. Generic so it can be reused outside staff later.

### 7.5 Detail view (`app/(routes)/staff/list/[id]/page.tsx`)

Mirror the same tab structure for read-only display when `has_extended_profile === true`. When off, the page renders unchanged (existing 4 cards). Same tabs, same labels — the editor and the viewer use the same mental model.

### 7.6 List view (`app/(routes)/staff/list/_components/staff-list.tsx`)

No structural changes. Optionally add a small "🌐 Profile" badge in the row to indicate which staff have a published extended profile. The DataTable column lineup stays as-is.

---

## 8. API Changes

### 8.1 `GET /api/api-management/staff` (website-facing)

**Code change required:** *None.*

The endpoint at `app/api/api-management/staff/route.ts:115` already uses `.select('*')`, so all new columns are returned automatically once the schema migration runs. The website needs to update *its own* code to consume the new fields.

### 8.2 `GET /api/staff` (in-app)

**Code change required:** *None* for the same reason. Existing query uses `.select('*')` plus joins.

### 8.3 `POST /api/staff` and `PATCH /api/staff/[id]` (in-app)

**Code change required:** *Minimal.* The route handlers spread the request body into the insert/update payload. The validation layer (`CreateStaffDto`, `UpdateStaffDto`) needs the new optional fields appended. No new routes.

### 8.4 New optional API filter

Add `?has_extended_profile=true` filter to `GET /api/api-management/staff` so the website can request only published faculty rows. Implementation: one new `if (extendedOnly)` clause in the existing query builder.

---

## 9. Data Import Pipeline

### 9.1 Script location

`scripts/import/website-faculty-to-staff.ts` (new file)

### 9.2 Configuration

Read website Supabase URL + service role from `.env.import` (a separate file that is **not** committed). Existing `.env.local` is for MyJKKN itself.

### 9.3 Steps

1. `SELECT * FROM public.faculty` from the website Supabase.
2. For each row:
   - Split `full_name` → `first_name` (first whitespace-separated token) + `last_name` (everything after).
   - Look up MyJKKN staff: `SELECT id FROM staff WHERE lower(email) = lower(:website_email) LIMIT 1`.
   - **Match found:** `UPDATE` the new extended fields. Existing personal data (name, phone, address, etc.) is **NOT** overwritten — the import is additive only.
   - **No match:** insert into a new `staff_import_unmatched` table (see 9.5) with the full source row + a `reason` column ("no email match in MyJKKN staff").
3. Second pass: `SELECT * FROM faculty_achievements`, group by `faculty_name`, serialize each group into the matched staff row's `achievements` JSONB.
4. Write a full diff report to `scripts/import/runs/run-<ISO timestamp>.log` (one line per row: matched / updated / skipped / unmatched + the field deltas).
5. Support `--dry-run` flag: prints would-be changes without committing.

### 9.4 Field-by-field mapping

| website `faculty` | MyJKKN `staff` | Notes |
|---|---|---|
| `id` | (ignored) | MyJKKN keeps its own id |
| `full_name` | `first_name` + `last_name` | Split on first whitespace |
| `slug` | `slug` | Direct copy; collision → suffix |
| `designation` | `designation` | Already exists |
| `department` (text) | `department_id` (uuid) | Lookup by name in `departments`. Unmatched → reported, field left null |
| `qualification` | `qualification_summary` | Direct copy |
| `email` | `institution_email` (existing) | Match key — must already exist |
| `photo_url` | `profile_picture` | Direct copy |
| `experience_years` | `experience_years` | Direct copy |
| `research_papers` | `research_papers` | Direct copy |
| `phd_scholars` | `phd_scholars` | Direct copy |
| `awards_won` | `awards_won` | Direct copy |
| `display_order` | `display_order` | Direct copy |
| `is_active` | (ignored — staff has its own) | |
| `status` | `status` | Direct copy |
| `badges` | `badges` | Direct JSONB copy |
| `professional_summary` | `professional_summary` | Direct copy |
| `qualifications` | `qualifications` | Direct JSONB copy |
| `specialisations` | `specialisations` | Direct JSONB copy |
| `experience_entries` | `experience_entries` | Direct JSONB copy |
| `research_focus_areas` | `research_focus_areas` | Direct JSONB copy |
| `publications` | `publications` | Direct JSONB copy |
| `funded_projects` | `funded_projects` | Direct JSONB copy |
| `google_scholar_url` | `google_scholar_url` | Direct copy |
| `researchgate_url` | `researchgate_url` | Direct copy |
| `orcid_url` | `orcid_url` | Direct copy |
| `certifications` | `certifications` | Direct JSONB copy |
| `awards` | `awards` | Direct JSONB copy |
| `memberships` | `memberships` | Direct JSONB copy |
| `mentoring_description` | `mentoring_description` | Direct copy |
| `phd_scholars_list` | `phd_scholars_list` | Direct JSONB copy |
| `pg_dissertations_guided` | `pg_dissertations_guided` | Direct copy |
| `ug_projects_guided` | `ug_projects_guided` | Direct copy |
| `faqs` | `faqs` | Direct JSONB copy |
| `created_at` / `updated_at` | (ignored) | MyJKKN keeps its own timestamps |

For matched rows, also set `has_extended_profile = true` so the form renders the tabs immediately.

### 9.5 New review table `public.staff_import_unmatched`

```sql
CREATE TABLE public.staff_import_unmatched (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL,             -- 'faculty' or 'faculty_achievements'
  source_row  jsonb NOT NULL,             -- full original row
  reason      text NOT NULL,              -- e.g. 'no email match in MyJKKN staff'
  resolved    boolean NOT NULL DEFAULT false,
  resolved_by uuid NULL REFERENCES auth.users(id),
  resolved_at timestamptz NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

A future admin UI (out of scope for this spec) can list unresolved rows and let an admin choose: link to existing staff / create new staff / discard.

---

## 10. Risks & Future Hardening

1. **`select('*')` API leaks new columns by default.** Acceptable for now since all new fields are public-safe. Future hardening: replace `select('*')` in `app/api/api-management/staff/route.ts` with an explicit field allowlist so adding a new `staff` column doesn't accidentally expose it. Out of scope for this spec.

2. **`slug` collisions** between staff with the same name. The import script auto-suffixes (`dr-john-smith-2`). The form should do the same on first save.

3. **Markdown rendering** — `react-markdown` will be added as a dependency. Bundle impact ~30KB gzipped. If MyJKKN ever displays user-supplied markdown to other users (vs the staff member themselves), add `rehype-sanitize`. Currently the markdown is only displayed back to its author in the form preview, so sanitization is not yet required.

4. **Department name → uuid lookup during import** is fragile — the website's `department` is a free-text field. Unmapped departments fall through to the unmatched table for manual reconciliation.

5. **Two Supabase projects during migration.** The import script holds service-role keys for both projects. Keep `.env.import` out of git (`.gitignore` should already cover `.env.*`).

6. **Concurrent edits during the import window.** While the script runs, an admin in MyJKKN could edit a staff row that the script is about to update. Mitigation: run the script during a low-traffic window and announce a 30-minute soft freeze.

7. **The new sub-section "Profile Settings" inside the Basic tab** is the surface where `has_extended_profile`, `slug`, `status`, and `display_order` live. Make sure these are clearly labeled — they look innocuous but `status='published'` is the gate that exposes the staff member on the public website.

---

## 11. Out of Scope

- A dedicated public faculty profile page inside MyJKKN.
- WYSIWYG / rich-text editing.
- Image cropping for `photo_url`.
- Replacing the website's standalone `faculty` admin panel with MyJKKN cross-domain SSO.
- Building the admin UI for resolving `staff_import_unmatched` rows. (CSV export of the table is sufficient for v1.)
- Image / file uploads for publication PDFs.
- Hardening the API endpoint with an explicit field allowlist (item 1 in §10).
- Localization / i18n of the new field labels.

---

## 12. Acceptance Criteria

- [ ] All new columns added to `public.staff` and `public.employment_categories` via a single migration.
- [ ] Existing staff CRUD continues to work unchanged for non-faculty rows.
- [ ] When `has_extended_profile = true`, the staff form shows all 7 tabs from the reference image.
- [ ] When `has_extended_profile = false`, the staff form shows only the Basic tab and looks identical to the current form (modulo the tab strip wrapper).
- [ ] `GET /api/api-management/staff` returns the new fields in the response payload without code changes to the route handler.
- [ ] The import script successfully migrates a sample of website faculty rows to matched staff rows.
- [ ] Unmatched website rows land in `staff_import_unmatched` with a clear reason.
- [ ] `--dry-run` mode of the import script prints a diff without modifying any data.

---

*End of design spec.*
