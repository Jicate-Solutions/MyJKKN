# Hostel Per-Category "Allow Upgrades" Toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-category admin switch that controls whether self-service upgrade options appear on the My Hostel page, gated by the learner's CURRENT category, defaulting OFF (opt-in), for both room and mess categories.

**Architecture:** A new `upgrades_enabled boolean NOT NULL DEFAULT false` column on `hostel_categories` and `mess_categories`. The My Hostel tab hides the upgrade cards when the learner's current category flag is off (client-side visibility); the upgrade *entry* action RPCs reject disabled-category upgrades (server-side enforcement), while first-booking stays exempt.

**Tech Stack:** Next.js 16 / React 19, Supabase (Postgres + RLS + SECURITY DEFINER RPCs), TanStack Query, react-hook-form + Zod, Shadcn `Switch`.

**Spec:** `docs/superpowers/specs/2026-06-16-hostel-upgrade-enable-toggle-design.md`

**Verification model:** This repo has **no unit-test runner** (CLAUDE.md). "Done" per task = touched TS files pass `mcp__ide__getDiagnostics`, SQL applies cleanly, and the feature is exercised in a browser. Do not claim tests pass — there are none.

**Commit policy:** The user commits only when they ask. Commit steps below are checkpoints — run them only once the user gives the go-ahead (or batch at the end). All migration SQL must be committed to `supabase/migrations/` (never a `SELECT 1;` placeholder) and mirrored into `supabase/setup/`.

---

## File map

| File | Change |
|------|--------|
| `supabase/migrations/20260616080000_hostel_mess_upgrades_enabled_column.sql` | **Create** — add column to both tables |
| `supabase/migrations/20260616090000_gate_upgrade_actions_on_upgrades_enabled.sql` | **Create** — gate 4 action RPCs |

> **Migration numbering:** `…050000` (waitlist reset) and `…060000` (delete unpaid upgrade bills) are already taken by a concurrent workstream. This plan uses `…080000` / `…090000`. If either is taken at execution time, bump by `+010000` and keep going.
| `supabase/setup/01_tables.sql` | **Modify** — mirror the two columns |
| `supabase/setup/02_functions.sql` | **Modify** — mirror the 4 gated functions (update live defs, don't append dup copies) |
| `types/supabase.ts` | **Modify** — register column on both tables (Row/Insert/Update) |
| `types/hostel-categories.ts` | **Modify** — add `upgrades_enabled` to `HostelCategory` + Create/Update DTOs |
| `types/mess-categories.ts` | **Modify** — add `upgrades_enabled` to `MessCategory` + Create/Update DTOs |
| `app/(routes)/campus-living/settings/categories/_components/hostel-category-form-dialog.tsx` | **Modify** — "Allow upgrades" Switch |
| `app/(routes)/campus-living/mess/categories/_components/mess-category-form-dialog.tsx` | **Modify** — "Allow upgrades" Switch |
| `lib/services/campus-living/my-hostel-service.ts` | **Modify** — select + type `upgrades_enabled` on both category objects |
| `app/(routes)/campus-living/my-hostel/_components/category-fees-tab.tsx` | **Modify** — gate the two upgrade cards |

No changes to `hostel-category-service.ts` / `mess-category-service.ts` (they spread the DTO) or the category hooks (they pass the payload through).

---

## Task 1: Database column on both tables

**Files:**
- Create: `supabase/migrations/20260616080000_hostel_mess_upgrades_enabled_column.sql`
- Modify: `supabase/setup/01_tables.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Per-category "allow upgrades" flag. Default false = opt-in: after deploy no learner
-- sees upgrade options until an admin enables it per category (clean slate on top of the
-- 2026-06-16 upgrade-waitlist reset). Gate basis is the learner's CURRENT category.
ALTER TABLE public.hostel_categories
  ADD COLUMN IF NOT EXISTS upgrades_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.mess_categories
  ADD COLUMN IF NOT EXISTS upgrades_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.hostel_categories.upgrades_enabled IS
  'When true, residents currently in this room category see/can use self-service upgrade options on My Hostel. Default false (opt-in). First-booking is unaffected.';
COMMENT ON COLUMN public.mess_categories.upgrades_enabled IS
  'When true, residents currently in this mess category see/can use mess upgrade options on My Hostel. Default false (opt-in).';
```

- [ ] **Step 2: Apply via MCP**

Use `mcp__supabase__apply_migration` with name `hostel_mess_upgrades_enabled_column` and the SQL above.

- [ ] **Step 3: Verify columns exist and backfilled to false**

Run via `mcp__supabase__execute_sql`:
```sql
SELECT 'hostel' AS tbl, count(*) total, count(*) FILTER (WHERE upgrades_enabled) enabled FROM hostel_categories
UNION ALL
SELECT 'mess', count(*), count(*) FILTER (WHERE upgrades_enabled) FROM mess_categories;
```
Expected: both rows show `enabled = 0` (every existing category defaulted off).

- [ ] **Step 4: Mirror into `supabase/setup/01_tables.sql`**

Find the `CREATE TABLE ... hostel_categories` and `... mess_categories` blocks; add `upgrades_enabled boolean NOT NULL DEFAULT false` to each (next to `is_active`). If a block isn't present, add a trailing `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` mirroring Step 1.

- [ ] **Step 5: Commit (on go-ahead)**

```bash
git add supabase/migrations/20260616080000_hostel_mess_upgrades_enabled_column.sql supabase/setup/01_tables.sql
git commit -m "feat(campus-living): add upgrades_enabled to hostel/mess categories"
```

---

## Task 2: Register the column in generated types

**Files:**
- Modify: `types/supabase.ts`

- [ ] **Step 1: Regenerate (preferred)**

Run `mcp__supabase__generate_typescript_types` and splice the refreshed `hostel_categories` and `mess_categories` table definitions into `types/supabase.ts`. If a full regen is too noisy, do the manual edit in Step 2 instead.

- [ ] **Step 2: Manual edit (fallback)**

In `types/supabase.ts`, locate the `hostel_categories` and `mess_categories` table types. In each, add to the three shapes:
- `Row`: `upgrades_enabled: boolean`
- `Insert`: `upgrades_enabled?: boolean`
- `Update`: `upgrades_enabled?: boolean`

- [ ] **Step 3: Verify diagnostics**

Run `mcp__ide__getDiagnostics` on `types/supabase.ts`. Expected: no new errors.

- [ ] **Step 4: Commit (on go-ahead)**

```bash
git add types/supabase.ts
git commit -m "chore(types): register upgrades_enabled on hostel/mess categories"
```

---

## Task 3: Gate the upgrade ACTION RPCs

**Files:**
- Create: `supabase/migrations/20260616090000_gate_upgrade_actions_on_upgrades_enabled.sql`
- Modify: `supabase/setup/02_functions.sql`

> Use `CREATE OR REPLACE` rebuilt from each function's **current live body** — per the repo gotcha, pull the latest definition first so you don't revert intermediate changes. For each function below, get the live body with `pg_get_functiondef('public.<fn>(<argtypes>)'::regprocedure)`, insert the exact guard block at the stated anchor, and re-apply. Do NOT hand-reconstruct from old migrations.

- [ ] **Step 1: Pull the four current definitions**

Run via `mcp__supabase__execute_sql`:
```sql
SELECT pg_get_functiondef('public.fn_self_upgrade_room_category(uuid,uuid,uuid)'::regprocedure);
SELECT pg_get_functiondef('public.fn_self_upgrade_category_only(uuid)'::regprocedure);
SELECT pg_get_functiondef('public.fn_self_join_upgrade_waitlist(uuid)'::regprocedure);
SELECT pg_get_functiondef('public.fn_self_upgrade_mess_category(uuid)'::regprocedure);
```

- [ ] **Step 2: Insert guards and assemble the migration**

Insert each guard verbatim, then write all four `CREATE OR REPLACE` into `supabase/migrations/20260616070000_gate_upgrade_actions_on_upgrades_enabled.sql`.

**(a) `fn_self_upgrade_room_category`** — anchor: immediately AFTER the line that sets `v_has_alloc` (`v_has_alloc := EXISTS (SELECT 1 FROM hostel_allocations WHERE learner_id = v_profile AND status = 'active');`). Insert:
```sql
  -- Gate: upgrades disabled for the resident's current room category. First-booking
  -- (no active allocation) is exempt — that path is initial room selection, not an upgrade.
  IF v_has_alloc AND NOT COALESCE((SELECT upgrades_enabled FROM hostel_categories WHERE id = v_cur_cat), false) THEN
    RAISE EXCEPTION 'Room upgrades are currently disabled for your category';
  END IF;
```

**(b) `fn_self_upgrade_category_only`** — anchor: immediately AFTER `SELECT name INTO v_cur_name FROM hostel_categories WHERE id = v_cur_cat;` (i.e. once `v_cur_cat` is known). Insert:
```sql
  IF NOT COALESCE((SELECT upgrades_enabled FROM hostel_categories WHERE id = v_cur_cat), false) THEN
    RAISE EXCEPTION 'Upgrades are currently disabled for your category';
  END IF;
```

**(c) `fn_self_join_upgrade_waitlist`** — anchor: immediately AFTER the `IF v_lp IS NULL OR v_profile IS NULL OR NOT user_is_hosteler() THEN ... END IF;` block, BEFORE the `fn_my_manual_categories()` eligibility check. Insert:
```sql
  IF NOT COALESCE((SELECT upgrades_enabled FROM hostel_categories
                   WHERE id = (SELECT hostel_category_id FROM learners_profiles WHERE id = v_lp)), false) THEN
    RAISE EXCEPTION 'Upgrades are currently disabled for your category';
  END IF;
```

**(d) `fn_self_upgrade_mess_category`** — anchor: immediately AFTER `SELECT lp.mess_category_id INTO v_cur_mess FROM learners_profiles lp WHERE lp.id = v_lp;`. Insert:
```sql
  IF NOT COALESCE((SELECT upgrades_enabled FROM mess_categories WHERE id = v_cur_mess), false) THEN
    RAISE EXCEPTION 'Mess upgrades are currently disabled for your category';
  END IF;
```

Append the same REVOKE/GRANT lines that the live definitions already carry (re-grant `authenticated`, revoke `anon, PUBLIC`) for any function whose signature you re-create, to be safe:
```sql
REVOKE EXECUTE ON FUNCTION public.fn_self_upgrade_room_category(uuid,uuid,uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_self_upgrade_category_only(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_self_join_upgrade_waitlist(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_self_upgrade_mess_category(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_self_upgrade_room_category(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_self_upgrade_category_only(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_self_join_upgrade_waitlist(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_self_upgrade_mess_category(uuid) TO authenticated;
```

- [ ] **Step 3: Apply via MCP**

Use `mcp__supabase__apply_migration` name `gate_upgrade_actions_on_upgrades_enabled` with the assembled SQL.

- [ ] **Step 4: Verify the guard is live (negative + exempt cases)**

```sql
-- All four functions still exist with expected signatures
SELECT proname, pg_get_function_identity_arguments(oid)
FROM pg_proc
WHERE proname IN ('fn_self_upgrade_room_category','fn_self_upgrade_category_only',
                  'fn_self_join_upgrade_waitlist','fn_self_upgrade_mess_category')
ORDER BY proname;
-- Confirm each body now contains the guard text
SELECT proname FROM pg_proc
WHERE proname IN ('fn_self_upgrade_room_category','fn_self_upgrade_category_only',
                  'fn_self_join_upgrade_waitlist','fn_self_upgrade_mess_category')
  AND pg_get_functiondef(oid) ILIKE '%upgrades_enabled%';
```
Expected: 4 rows in the first query; 4 rows in the second (every function carries the guard).

- [ ] **Step 5: Mirror into `supabase/setup/02_functions.sql`**

Update the existing definitions of these four functions in place (the file has known stale/dup copies — edit the live one, don't append a fifth copy).

- [ ] **Step 6: Commit (on go-ahead)**

```bash
git add supabase/migrations/20260616090000_gate_upgrade_actions_on_upgrades_enabled.sql supabase/setup/02_functions.sql
git commit -m "feat(campus-living): gate upgrade actions on category upgrades_enabled"
```

---

## Task 4: TS DTO types (room + mess)

**Files:**
- Modify: `types/hostel-categories.ts`
- Modify: `types/mess-categories.ts`

- [ ] **Step 1: Extend `HostelCategory` + DTOs**

In `types/hostel-categories.ts`:
- Add to `interface HostelCategory` (after `requires_explicit_upgrade`):
```ts
  /** When true, residents in this category see/can use self-service upgrades on My Hostel. Default false. */
  upgrades_enabled: boolean;
```
- Add to `CreateHostelCategoryDto` and `UpdateHostelCategoryDto`:
```ts
  upgrades_enabled?: boolean;
```

- [ ] **Step 2: Extend `MessCategory` + DTOs**

In `types/mess-categories.ts`:
- Add to `interface MessCategory` (after `sort_order`):
```ts
  /** When true, residents in this mess category see/can use mess upgrades on My Hostel. Default false. */
  upgrades_enabled: boolean;
```
- Add to `CreateMessCategoryDto` and `UpdateMessCategoryDto`:
```ts
  upgrades_enabled?: boolean;
```

- [ ] **Step 3: Verify diagnostics**

`mcp__ide__getDiagnostics` on both files. Expected: no errors.

- [ ] **Step 4: Commit (on go-ahead)**

```bash
git add types/hostel-categories.ts types/mess-categories.ts
git commit -m "feat(types): add upgrades_enabled to category DTOs"
```

---

## Task 5: "Allow upgrades" switch — ROOM category form

**Files:**
- Modify: `app/(routes)/campus-living/settings/categories/_components/hostel-category-form-dialog.tsx`

- [ ] **Step 1: Add `upgrades_enabled` to the zod schema**

After the `upgrade_hold_days` field in `formSchema`:
```ts
  upgrades_enabled: z.boolean(),
```

- [ ] **Step 2: Add to both `defaultValues`/`reset` blocks**

In the `useForm` `defaultValues`, the `mode === 'edit'` reset, and the `else` reset — add:
```ts
      upgrades_enabled: false,
```
…except the edit reset uses the existing category value:
```ts
        upgrades_enabled: category.upgrades_enabled ?? false,
```

- [ ] **Step 3: Render the Switch**

Immediately BEFORE the existing `is_active` `FormField`, add:
```tsx
            <FormField
              control={form.control}
              name='upgrades_enabled'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3'>
                  <div className='space-y-0.5'>
                    <FormLabel className='text-sm'>Allow upgrades</FormLabel>
                    <p className='text-xs text-muted-foreground'>
                      When on, residents in this category can see and use self-service room
                      upgrades on My Hostel. Off hides the upgrade options entirely.
                    </p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
```

- [ ] **Step 4: Confirm payload carries it**

The `onSubmit` payload spreads `...data`, so `upgrades_enabled` flows through. No change needed beyond Steps 1-3.

- [ ] **Step 5: Verify diagnostics**

`mcp__ide__getDiagnostics` on the file. Expected: no errors.

- [ ] **Step 6: Commit (on go-ahead)**

```bash
git add "app/(routes)/campus-living/settings/categories/_components/hostel-category-form-dialog.tsx"
git commit -m "feat(campus-living): allow-upgrades switch on room category form"
```

---

## Task 6: "Allow upgrades" switch — MESS category form

**Files:**
- Modify: `app/(routes)/campus-living/mess/categories/_components/mess-category-form-dialog.tsx`

- [ ] **Step 1: Add `upgrades_enabled` to the zod schema**

After `is_active: z.boolean(),` in `formSchema`:
```ts
  upgrades_enabled: z.boolean(),
```

- [ ] **Step 2: Add to `defaultValues` and both `reset` blocks**

`useForm` defaults and the `else` reset:
```ts
      upgrades_enabled: false,
```
Edit reset:
```ts
        upgrades_enabled: category.upgrades_enabled ?? false,
```

- [ ] **Step 3: Render the Switch**

Immediately BEFORE the existing `is_active` `FormField`, add:
```tsx
            <FormField
              control={form.control}
              name='upgrades_enabled'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3'>
                  <div className='space-y-0.5'>
                    <FormLabel className='text-sm'>Allow upgrades</FormLabel>
                    <p className='text-xs text-muted-foreground'>
                      When on, residents in this mess category can see and use mess upgrades on
                      My Hostel. Off hides the mess upgrade options.
                    </p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
```

- [ ] **Step 4: Verify diagnostics**

`mcp__ide__getDiagnostics` on the file. Expected: no errors.

- [ ] **Step 5: Commit (on go-ahead)**

```bash
git add "app/(routes)/campus-living/mess/categories/_components/mess-category-form-dialog.tsx"
git commit -m "feat(campus-living): allow-upgrades switch on mess category form"
```

---

## Task 7: Plumb `upgrades_enabled` to the learner summary

**Files:**
- Modify: `lib/services/campus-living/my-hostel-service.ts`

- [ ] **Step 1: Add the column to the FK-embed select**

In `getMySummary`, change the select embeds:
- `hostelCategory:hostel_category_id(id, name, type, allocation_mode)` → `hostelCategory:hostel_category_id(id, name, type, allocation_mode, upgrades_enabled)`
- `messCategory:mess_category_id(id, name)` → `messCategory:mess_category_id(id, name, upgrades_enabled)`

- [ ] **Step 2: Widen the `MyHostelSummary` type**

```ts
  hostelCategory: { id: string; name: string; type: string | null; allocation_mode: string | null; upgrades_enabled: boolean } | null;
  /** In-flight upgrade target staged on confirm; promoted to hostelCategory on payment, else reverts. */
  pendingHostelCategory: { id: string; name: string } | null;
  messCategory: { id: string; name: string; upgrades_enabled: boolean } | null;
```

- [ ] **Step 3: Verify diagnostics**

`mcp__ide__getDiagnostics` on the file. Expected: no errors.

- [ ] **Step 4: Commit (on go-ahead)**

```bash
git add lib/services/campus-living/my-hostel-service.ts
git commit -m "feat(campus-living): expose upgrades_enabled on my-hostel summary"
```

---

## Task 8: Gate the upgrade cards on My Hostel

**Files:**
- Modify: `app/(routes)/campus-living/my-hostel/_components/category-fees-tab.tsx`

- [ ] **Step 1: Gate the room upgrade card**

In the non-book return block, replace:
```tsx
      <RoomCategoryUpgradeCard
        currentCategoryName={summary?.hostelCategory?.name ?? null}
        mode='upgrade'
      />
```
with:
```tsx
      {summary?.hostelCategory?.upgrades_enabled && (
        <RoomCategoryUpgradeCard
          currentCategoryName={summary?.hostelCategory?.name ?? null}
          mode='upgrade'
        />
      )}
```

- [ ] **Step 2: Gate the mess upgrade card**

Replace:
```tsx
      <MessCategoryUpgradeCard
        currentMessName={summary?.messCategory?.name ?? null}
      />
```
with:
```tsx
      {summary?.messCategory?.upgrades_enabled && (
        <MessCategoryUpgradeCard
          currentMessName={summary?.messCategory?.name ?? null}
        />
      )}
```

- [ ] **Step 3: Confirm book mode is untouched**

The `showBook` early-return block (manual category + no allocation, `mode='book'`) is NOT modified — first-booking remains available regardless of the flag.

- [ ] **Step 4: Verify diagnostics**

`mcp__ide__getDiagnostics` on the file. Expected: no errors.

- [ ] **Step 5: Commit (on go-ahead)**

```bash
git add "app/(routes)/campus-living/my-hostel/_components/category-fees-tab.tsx"
git commit -m "feat(campus-living): hide upgrade cards when category upgrades disabled"
```

---

## Task 9: End-to-end verification (browser + data)

- [ ] **Step 1: Pick a test resident**

```sql
-- An allocated resident + their current room/mess categories
SELECT lp.id AS learner_id, hc.id AS room_cat, hc.name room_cat_name, hc.upgrades_enabled room_on,
       mc.id AS mess_cat, mc.name mess_cat_name, mc.upgrades_enabled mess_on
FROM hostel_allocations a
JOIN profiles p ON p.id = a.learner_id
JOIN learners_profiles lp ON lp.id = p.learner_id
LEFT JOIN hostel_categories hc ON hc.id = lp.hostel_category_id
LEFT JOIN mess_categories mc ON mc.id = lp.mess_category_id
WHERE a.status='active' LIMIT 5;
```

- [ ] **Step 2: Disabled state (default)** — As that resident, open My Hostel → Category/Fees tab. Expect the "Your Category Assignment" card to show, and **no** room/mess upgrade cards (both flags default off).

- [ ] **Step 3: Enable room upgrades** — In Settings → Categories, edit that resident's room category, turn **Allow upgrades** ON, save. Reload My Hostel. Expect the "Upgrade Room Category" card to appear with higher tiers; mess card still hidden.

- [ ] **Step 4: Enable mess upgrades** — In Mess → Categories, enable the resident's mess category. Reload. Expect the mess upgrade card to appear.

- [ ] **Step 5: Server enforcement** — With the room category set back to OFF, confirm a direct call is rejected:
```sql
-- expect: ERROR 'Room upgrades are currently disabled for your category'
SELECT public.fn_self_upgrade_category_only('<a-higher-category-id>');
```
(Run as the resident's session, or confirm the guard text via `pg_get_functiondef`.)

- [ ] **Step 6: First-booking exemption** — As a manual-category resident with NO active allocation and their category OFF, confirm the **"Book Your Room"** flow still renders and books (book mode is exempt).

- [ ] **Step 7: Leave-waitlist still works** — Confirm `fn_self_leave_upgrade_waitlist` is callable even when the category is disabled (ungated by design).

---

## Self-review notes (author)

- **Spec coverage:** data model → T1/T2; admin UI room+mess → T5/T6 (+T4 types); learner visibility → T7/T8; server enforcement (4 RPCs, leave exempt) → T3; permissions (no new key) → no task needed; verification → T9. All spec sections mapped.
- **Type consistency:** `upgrades_enabled` used identically across `types/supabase.ts`, `HostelCategory`/`MessCategory`, DTOs, `MyHostelSummary`, and the SQL column. Boolean throughout, default false.
- **No placeholders:** every code step shows literal code; RPC task specifies exact guard text + exact anchor lines and instructs pulling the live body (per the CREATE-OR-REPLACE-from-latest gotcha) rather than reconstructing.
