# Fee Structure Bulk Create & Edit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Excel-based bulk create + bulk edit for `admission_fee_structures` (wide rows, one amount column per fee category, unified create/update via a `Fee Structure ID` column).

**Architecture:** Template/export/import Next.js API routes (server-side, cookie-authed Supabase) + a shared upload dialog. Imports resolve dimension/category **names → IDs** (scoped by parent), validate per row, and upsert each row through a new atomic `SECURITY DEFINER` RPC. Writes are gated by `admission_fees.manage` (+ `role_has_institution_access`).

**Tech Stack:** Next.js 16 route handlers, ExcelJS (writes, via existing patterns), SheetJS `xlsx` (reads), Supabase (Postgres + RLS), Shadcn dialog, `lib/utils/excel-compat.ts`.

**Spec:** `docs/superpowers/specs/2026-06-01-fee-structure-bulk-create-edit-design.md`

> **Verification note (read first):** This repo has **no test runner** wired into npm (see CLAUDE.md). So: pure-logic files get a runnable `npx tsx` assert-script; the RPC is verified with `mcp__supabase__execute_sql` inside a `BEGIN; … ROLLBACK;`; routes/UI are verified by running `npm run dev` and exercising them, plus `mcp__ide__getDiagnostics` per touched file. Commit after each task.

---

### Task 1: Pure Excel-mapping + row-resolver module

**Files:**
- Create: `lib/utils/mappings/fee-structure-excel-mappings.ts`
- Create (runnable test): `lib/utils/mappings/__tests__/fee-structure-excel-mappings.test.ts`

- [ ] **Step 1: Write the mapping + resolver module**

```ts
// lib/utils/mappings/fee-structure-excel-mappings.ts
//
// Pure module (NO DB access) for the fee-structure bulk Excel round-trip.
// The import route builds the `BulkResolveLookups` maps from the DB, then calls
// resolveRow() once per spreadsheet row to get a payload or a list of errors.

export const FEE_STRUCTURE_SHEET_NAME = 'Fee Structures';

// Fixed (non-amount) columns, left→right. Amount columns (one per active
// billing category, excluding transport/hostel) are appended dynamically by
// the template/export routes — their headers are the category names.
export const FIXED_HEADERS = [
  'Fee Structure ID',
  'Institution',
  'Degree',
  'Department',
  'Programme',
  'Admission Year',
  'Quota',
  'Gender',
  'Communities',
  'Name',
  'Status',
  'Effective From',
  'Effective To',
  'Notes',
] as const;

export interface BulkResolveLookups {
  institutions: Map<string, string>;        // name(lower) -> institution_id (accessible only)
  degrees: Map<string, string>;             // `${institutionId}::${degreeName(lower)}` -> id
  departments: Map<string, string>;         // `${institutionId}::${degreeId}::${deptName(lower)}` -> id
  programmes: Map<string, string>;          // `${departmentId}::${programmeName(lower)}` -> id
  admissionYears: Map<string, string>;      // `${programmeId}::${yearName(lower)}` -> id
  quotas: Map<string, string>;              // name(lower) -> id
  communities: Map<string, string>;         // name(lower) -> id
  categoriesByName: Map<string, string>;    // category_name(lower) -> billing_category_id
  amountHeaders: string[];                   // category names, in column order
}

export interface BulkUpsertPayload {
  structure_id: string | null;
  institution_id: string;
  degree_id: string;
  department_id: string;
  programme_id: string;
  admission_year_id: string;
  quota_id: string;
  gender: string | null;
  community_category_ids: string[];
  name: string;
  status: 'draft' | 'active' | 'archived';
  notes: string | null;
  effective_from: string | null;
  effective_to: string | null;
  items: Array<{ billing_category_id: string; amount: number; is_optional: boolean }>;
}

export interface RowResolution {
  rowNumber: number;
  name: string;
  payload?: BulkUpsertPayload;
  errors: string[];
}

const norm = (v: unknown): string => String(v ?? '').trim();
const lower = (v: unknown): string => norm(v).toLowerCase();

export function splitCommunities(cell: unknown): string[] {
  return norm(cell).split(',').map((s) => s.trim()).filter(Boolean);
}

/** Returns the number, null for blank, or NaN for non-numeric. */
export function parseAmountCell(cell: unknown): number | null {
  const s = norm(cell);
  if (s === '') return null;
  return Number(s.replace(/,/g, ''));
}

export function normalizeGender(cell: unknown): string | null | 'INVALID' {
  const s = norm(cell).toUpperCase();
  if (s === '' || s === 'ANY' || s === 'ANY GENDER') return null;
  if (s === 'MALE' || s === 'FEMALE') return s;
  return 'INVALID';
}

export function normalizeStatus(cell: unknown): 'draft' | 'active' | 'archived' | 'INVALID' {
  const s = lower(cell);
  if (s === '') return 'draft';
  if (s === 'draft' || s === 'active' || s === 'archived') return s;
  return 'INVALID';
}

/** yyyy-mm-dd string, null for blank, 'INVALID' otherwise. Accepts Date cells. */
export function parseDateCell(cell: unknown): string | null | 'INVALID' {
  if (cell instanceof Date && !isNaN(cell.getTime())) return cell.toISOString().slice(0, 10);
  const s = norm(cell);
  if (s === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return 'INVALID';
  return isNaN(new Date(s + 'T00:00:00Z').getTime()) ? 'INVALID' : s;
}

export function resolveRow(
  raw: Record<string, unknown>,
  rowNumber: number,
  lookups: BulkResolveLookups,
): RowResolution {
  const errors: string[] = [];
  const name = norm(raw['Name']);
  const structureId = norm(raw['Fee Structure ID']) || null;

  const instId = lookups.institutions.get(lower(raw['Institution']));
  if (!instId) errors.push(`Institution "${norm(raw['Institution'])}" not found or not accessible`);

  const degId = instId ? lookups.degrees.get(`${instId}::${lower(raw['Degree'])}`) : undefined;
  if (instId && !degId) errors.push(`Degree "${norm(raw['Degree'])}" not found in that institution`);

  const deptId = instId && degId
    ? lookups.departments.get(`${instId}::${degId}::${lower(raw['Department'])}`)
    : undefined;
  if (instId && degId && !deptId) errors.push(`Department "${norm(raw['Department'])}" not found`);

  const progId = deptId ? lookups.programmes.get(`${deptId}::${lower(raw['Programme'])}`) : undefined;
  if (deptId && !progId) errors.push(`Programme "${norm(raw['Programme'])}" not found`);

  const yearId = progId
    ? lookups.admissionYears.get(`${progId}::${lower(raw['Admission Year'])}`)
    : undefined;
  if (progId && !yearId) errors.push(`Admission Year "${norm(raw['Admission Year'])}" not found for that programme`);

  const quotaId = lookups.quotas.get(lower(raw['Quota']));
  if (!quotaId) errors.push(`Quota "${norm(raw['Quota'])}" not found`);

  const gender = normalizeGender(raw['Gender']);
  if (gender === 'INVALID') errors.push('Gender must be Male, Female, or blank');

  const status = normalizeStatus(raw['Status']);
  if (status === 'INVALID') errors.push('Status must be draft, active, or archived');

  const communityNames = splitCommunities(raw['Communities']);
  const communityIds: string[] = [];
  for (const cn of communityNames) {
    const cid = lookups.communities.get(cn.toLowerCase());
    if (cid) communityIds.push(cid);
    else errors.push(`Community "${cn}" not found`);
  }
  if (communityNames.length === 0) errors.push('At least one community is required');

  const effFrom = parseDateCell(raw['Effective From']);
  const effTo = parseDateCell(raw['Effective To']);
  if (effFrom === 'INVALID') errors.push('Effective From must be yyyy-mm-dd');
  if (effTo === 'INVALID') errors.push('Effective To must be yyyy-mm-dd');
  if (typeof effFrom === 'string' && typeof effTo === 'string' && effTo < effFrom) {
    errors.push('Effective To must be on/after Effective From');
  }

  if (name.length < 2) errors.push('Name must be at least 2 characters');

  const items: BulkUpsertPayload['items'] = [];
  for (const header of lookups.amountHeaders) {
    const parsed = parseAmountCell(raw[header]);
    if (parsed === null) continue; // blank = not included
    if (Number.isNaN(parsed) || parsed < 0) { errors.push(`"${header}" must be a number ≥ 0`); continue; }
    const catId = lookups.categoriesByName.get(header.toLowerCase());
    if (!catId) { errors.push(`Fee category "${header}" not found`); continue; }
    items.push({ billing_category_id: catId, amount: parsed, is_optional: false });
  }
  if (items.length === 0) errors.push('At least one fee amount is required');

  if (errors.length > 0) return { rowNumber, name, errors };

  return {
    rowNumber, name, errors: [],
    payload: {
      structure_id: structureId,
      institution_id: instId!, degree_id: degId!, department_id: deptId!,
      programme_id: progId!, admission_year_id: yearId!, quota_id: quotaId!,
      gender: gender as string | null,
      community_category_ids: communityIds,
      name,
      status: status as 'draft' | 'active' | 'archived',
      notes: norm(raw['Notes']) || null,
      effective_from: (effFrom as string | null) ?? null,
      effective_to: (effTo as string | null) ?? null,
      items,
    },
  };
}
```

- [ ] **Step 2: Write the runnable resolver test**

```ts
// lib/utils/mappings/__tests__/fee-structure-excel-mappings.test.ts
// Run with: npx tsx lib/utils/mappings/__tests__/fee-structure-excel-mappings.test.ts
import assert from 'node:assert';
import { resolveRow, parseAmountCell, normalizeGender, type BulkResolveLookups } from '../fee-structure-excel-mappings';

const lookups: BulkResolveLookups = {
  institutions: new Map([['jkkn cas', 'inst-1']]),
  degrees: new Map([['inst-1::undergraduate', 'deg-1']]),
  departments: new Map([['inst-1::deg-1::clinical lab', 'dept-1']]),
  programmes: new Map([['dept-1::b.sc clt', 'prog-1']]),
  admissionYears: new Map([['prog-1::2026 - 2027', 'yr-1']]),
  quotas: new Map([['management quota', 'q-1']]),
  communities: new Map([['bc', 'c-1'], ['mbc', 'c-2']]),
  categoriesByName: new Map([['application fee', 'cat-app'], ['1 year tuition fee', 'cat-tui']]),
  amountHeaders: ['Application Fee', '1 Year Tuition Fee'],
};

// Happy path
const ok = resolveRow({
  'Fee Structure ID': '', Institution: 'JKKN CAS', Degree: 'Undergraduate',
  Department: 'Clinical Lab', Programme: 'B.Sc CLT', 'Admission Year': '2026 - 2027',
  Quota: 'Management Quota', Gender: '', Communities: 'BC, MBC', Name: 'Test FS',
  Status: 'active', 'Effective From': '', 'Effective To': '', Notes: '',
  'Application Fee': '1000', '1 Year Tuition Fee': '50000',
}, 2, lookups);
assert.deepStrictEqual(ok.errors, [], 'happy path should have no errors');
assert.strictEqual(ok.payload!.community_category_ids.length, 2);
assert.strictEqual(ok.payload!.items.length, 2);
assert.strictEqual(ok.payload!.gender, null);

// Bad institution + negative amount + no communities
const bad = resolveRow({
  Institution: 'Nope', Degree: 'Undergraduate', Department: 'Clinical Lab',
  Programme: 'B.Sc CLT', 'Admission Year': '2026 - 2027', Quota: 'Management Quota',
  Communities: '', Name: 'X', Status: 'active', 'Application Fee': '-5',
}, 3, lookups);
assert.ok(bad.errors.some((e) => e.includes('Institution')), 'should flag institution');
assert.ok(bad.errors.some((e) => e.includes('community')), 'should flag missing community');
assert.ok(bad.errors.some((e) => e.includes('Application Fee')), 'should flag negative amount');
assert.strictEqual(bad.payload, undefined);

assert.strictEqual(parseAmountCell(''), null);
assert.ok(Number.isNaN(parseAmountCell('abc')));
assert.strictEqual(normalizeGender('male'), 'MALE');
assert.strictEqual(normalizeGender('x'), 'INVALID');

console.log('✓ fee-structure-excel-mappings resolver tests passed');
```

- [ ] **Step 3: Run the test**

Run: `npx tsx lib/utils/mappings/__tests__/fee-structure-excel-mappings.test.ts`
Expected: `✓ fee-structure-excel-mappings resolver tests passed` (exit 0). If it fails, fix the module until it passes.

- [ ] **Step 4: Typecheck the module**

Use `mcp__ide__getDiagnostics` on `lib/utils/mappings/fee-structure-excel-mappings.ts` → expect no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/mappings/fee-structure-excel-mappings.ts lib/utils/mappings/__tests__/fee-structure-excel-mappings.test.ts
git commit -m "feat(admission-fees): pure Excel-row resolver for bulk fee structures"
```

---

### Task 2: Server-side lookup loader

**Files:**
- Create: `lib/services/admission/fee-structure-bulk-lookups.ts`

- [ ] **Step 1: Write the loader (accepts a Supabase client; reusable by all 3 routes)**

```ts
// lib/services/admission/fee-structure-bulk-lookups.ts
//
// Server-side loaders for the bulk fee-structure routes. Accept an
// already-authenticated Supabase client (RLS applies, so cross-institution
// access is naturally scoped). Build the name→id maps resolveRow() consumes.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BulkResolveLookups } from '@/lib/utils/mappings/fee-structure-excel-mappings';

const EXCLUDED_KINDS = ['transport', 'hostel'];

/** Active billing categories that may be used as fee-structure items. */
export async function loadActiveFeeCategories(
  supabase: SupabaseClient,
): Promise<Array<{ id: string; category_name: string }>> {
  const { data, error } = await supabase
    .from('billing_categories')
    .select('id, category_name, kind')
    .eq('is_active', true)
    .order('category_name');
  if (error) throw error;
  return (data ?? [])
    .filter((c: any) => !EXCLUDED_KINDS.includes(c.kind))
    .map((c: any) => ({ id: c.id, category_name: c.category_name }));
}

export async function loadBulkResolveLookups(
  supabase: SupabaseClient,
): Promise<BulkResolveLookups> {
  const [inst, deg, dept, prog, yrs, quo, comm, cats] = await Promise.all([
    supabase.from('institutions').select('id, name'),
    supabase.from('degrees').select('id, institution_id, degree_name'),
    supabase.from('departments').select('id, institution_id, degree_id, department_name'),
    supabase.from('programs').select('id, department_id, program_name'),
    supabase.from('admission_years').select('id, program_id, admission_year_name'),
    supabase.from('quotas').select('id, name'),
    supabase.from('community_categories').select('id, name'),
    loadActiveFeeCategories(supabase),
  ]);
  for (const r of [inst, deg, dept, prog, yrs, quo, comm]) {
    if (r.error) throw r.error;
  }
  const L = (v: string | null) => String(v ?? '').trim().toLowerCase();

  return {
    institutions: new Map((inst.data ?? []).map((r: any) => [L(r.name), r.id])),
    degrees: new Map((deg.data ?? []).map((r: any) => [`${r.institution_id}::${L(r.degree_name)}`, r.id])),
    departments: new Map((dept.data ?? []).map((r: any) => [`${r.institution_id}::${r.degree_id}::${L(r.department_name)}`, r.id])),
    programmes: new Map((prog.data ?? []).map((r: any) => [`${r.department_id}::${L(r.program_name)}`, r.id])),
    admissionYears: new Map((yrs.data ?? []).map((r: any) => [`${r.program_id}::${L(r.admission_year_name)}`, r.id])),
    quotas: new Map((quo.data ?? []).map((r: any) => [L(r.name), r.id])),
    communities: new Map((comm.data ?? []).map((r: any) => [L(r.name), r.id])),
    categoriesByName: new Map(cats.map((c) => [c.category_name.toLowerCase(), c.id])),
    amountHeaders: cats.map((c) => c.category_name),
  };
}
```

- [ ] **Step 2: Typecheck** with `mcp__ide__getDiagnostics` → no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/services/admission/fee-structure-bulk-lookups.ts
git commit -m "feat(admission-fees): server lookup loader for bulk fee structures"
```

---

### Task 3: Atomic upsert RPC (migration)

**Files:**
- Create: `supabase/migrations/20260601_admission_bulk_upsert_fee_structure.sql`
- Modify: `supabase/setup/02_functions.sql` (append the same function body — per repo migration rule)

- [ ] **Step 1: Write the migration SQL**

```sql
-- 20260601_admission_bulk_upsert_fee_structure.sql
-- Atomic per-row upsert for the fee-structure bulk import. One call = one
-- structure (parent + community junction + items) in a single transaction, so
-- the community-overlap trigger rejection rolls the whole row back (no orphan)
-- and its message is returned per row. SECURITY DEFINER → re-checks permission
-- with the same catalog key the RLS write policies use (admission_fees.manage).
CREATE OR REPLACE FUNCTION public.admission_bulk_upsert_fee_structure(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_structure_id   uuid := NULLIF(p_payload->>'structure_id','')::uuid;
  v_institution_id uuid := (p_payload->>'institution_id')::uuid;
  v_existing       record;
  v_item           jsonb;
  v_comm           uuid;
  v_idx            int := 0;
BEGIN
  IF NOT (user_has_permission('admission_fees.manage')
          AND role_has_institution_access(v_institution_id)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  IF v_structure_id IS NULL THEN
    INSERT INTO admission_fee_structures (
      institution_id, degree_id, department_id, programme_id,
      quota_id, admission_year_id, gender, name, status, notes,
      effective_from, effective_to
    ) VALUES (
      v_institution_id,
      (p_payload->>'degree_id')::uuid,
      (p_payload->>'department_id')::uuid,
      (p_payload->>'programme_id')::uuid,
      (p_payload->>'quota_id')::uuid,
      (p_payload->>'admission_year_id')::uuid,
      NULLIF(p_payload->>'gender','')::text,
      p_payload->>'name',
      COALESCE(NULLIF(p_payload->>'status',''),'draft'),
      NULLIF(p_payload->>'notes',''),
      NULLIF(p_payload->>'effective_from','')::date,
      NULLIF(p_payload->>'effective_to','')::date
    ) RETURNING id INTO v_structure_id;
  ELSE
    SELECT * INTO v_existing FROM admission_fee_structures WHERE id = v_structure_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'structure_not_found');
    END IF;
    -- Identity guard: the 6 dimensions are immutable on edit.
    IF v_existing.institution_id <> v_institution_id
       OR v_existing.degree_id        <> (p_payload->>'degree_id')::uuid
       OR v_existing.department_id     <> (p_payload->>'department_id')::uuid
       OR v_existing.programme_id      <> (p_payload->>'programme_id')::uuid
       OR v_existing.quota_id          <> (p_payload->>'quota_id')::uuid
       OR v_existing.admission_year_id <> (p_payload->>'admission_year_id')::uuid THEN
      RETURN jsonb_build_object('ok', false, 'error',
        'dimension_mismatch: dimensions are immutable on edit and no longer match this Fee Structure ID');
    END IF;
    UPDATE admission_fee_structures SET
      gender         = NULLIF(p_payload->>'gender','')::text,
      name           = p_payload->>'name',
      status         = COALESCE(NULLIF(p_payload->>'status',''),'draft'),
      notes          = NULLIF(p_payload->>'notes',''),
      effective_from = NULLIF(p_payload->>'effective_from','')::date,
      effective_to   = NULLIF(p_payload->>'effective_to','')::date,
      updated_at     = now()
    WHERE id = v_structure_id;
  END IF;

  -- Replace communities (junction trigger enforces no-overlap; may RAISE).
  DELETE FROM admission_fee_structure_communities WHERE fee_structure_id = v_structure_id;
  FOR v_comm IN SELECT jsonb_array_elements_text(p_payload->'community_category_ids')::uuid LOOP
    INSERT INTO admission_fee_structure_communities (fee_structure_id, community_category_id)
    VALUES (v_structure_id, v_comm);
  END LOOP;

  -- Replace items.
  DELETE FROM admission_fee_structure_items WHERE fee_structure_id = v_structure_id;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items') LOOP
    INSERT INTO admission_fee_structure_items (
      fee_structure_id, billing_category_id, amount, is_optional, sort_order
    ) VALUES (
      v_structure_id,
      (v_item->>'billing_category_id')::uuid,
      (v_item->>'amount')::numeric,
      COALESCE((v_item->>'is_optional')::boolean, false),
      v_idx
    );
    v_idx := v_idx + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'structure_id', v_structure_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admission_bulk_upsert_fee_structure(jsonb) TO authenticated;
```

- [ ] **Step 2: Apply the migration**

Apply via `mcp__supabase__apply_migration` (name `admission_bulk_upsert_fee_structure`, body above). Then append the identical `CREATE OR REPLACE FUNCTION …` body to `supabase/setup/02_functions.sql`.

- [ ] **Step 3: Verify the RPC end-to-end (rolled back, no prod mutation)**

Use `mcp__supabase__execute_sql`. Pick a real accessible institution + cascade (from `admission_fee_structures` LIMIT 1) and a manage-permission user UUID, then:

```sql
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<MANAGE_USER_UUID>","role":"authenticated"}';
SELECT public.admission_bulk_upsert_fee_structure(jsonb_build_object(
  'structure_id', null,
  'institution_id','<INST>','degree_id','<DEG>','department_id','<DEPT>',
  'programme_id','<PROG>','quota_id','<QUOTA>','admission_year_id','<YEAR>',
  'gender', null, 'community_category_ids', jsonb_build_array('<COMM>'),
  'name','RPC TEST','status','draft','notes',null,
  'effective_from',null,'effective_to',null,
  'items', jsonb_build_array(jsonb_build_object('billing_category_id','<CAT>','amount',1000,'is_optional',false))
));
ROLLBACK;
```
Expected: `{"ok": true, "structure_id": "…"}`. Then verify a permission-denied path with a UUID lacking `admission_fees.manage` → `{"ok": false, "error": "permission_denied"}`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260601_admission_bulk_upsert_fee_structure.sql supabase/setup/02_functions.sql
git commit -m "feat(admission-fees): admission_bulk_upsert_fee_structure RPC"
```

---

### Task 4: Template download route

**Files:**
- Create: `app/api/admission/fees-structure/template/route.ts`

- [ ] **Step 1: Write the route** (pattern mirrors `app/api/billing/schedule/bills/template/route.ts`)

```ts
export const dynamic = 'force-dynamic';
// app/api/admission/fees-structure/template/route.ts
import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';
import { FIXED_HEADERS } from '@/lib/utils/mappings/fee-structure-excel-mappings';
import { loadActiveFeeCategories } from '@/lib/services/admission/fee-structure-bulk-lookups';

function serverClient(cookieStore: any) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n: string) => cookieStore.get(n)?.value,
        set: (n: string, v: string, o: any) => cookieStore.set(n, v, o),
        remove: (n: string, o: any) => cookieStore.set(n, '', { ...o, maxAge: 0 }),
      },
    },
  );
}

export async function GET(_req: NextRequest) {
  await connection();
  try {
    const supabase = serverClient(await cookies());
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const [cats, insts, quotas, comms] = await Promise.all([
      loadActiveFeeCategories(supabase),
      supabase.from('institutions').select('name').order('name'),
      supabase.from('quotas').select('name').order('name'),
      supabase.from('community_categories').select('name').order('name'),
    ]);
    const amountHeaders = cats.map((c) => c.category_name);
    const headers = [...FIXED_HEADERS, ...amountHeaders];

    const wb = new ExcelJS.Workbook();

    // ---- Sheet 1: Fee Structures ----
    const sheet = wb.addWorksheet('Fee Structures');
    sheet.columns = headers.map((h) => ({ header: h, key: h, width: Math.max(16, h.length + 2) }));
    sheet.getRow(1).font = { bold: true, size: 11, name: 'Arial', color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    // Sample row (yellow) — leave Fee Structure ID blank to mean "create".
    const sample: Record<string, string | number> = {
      'Fee Structure ID': '',
      Institution: insts.data?.[0]?.name ?? 'JKKN College',
      Degree: 'Undergraduate', Department: 'Sample Department', Programme: 'Sample Programme',
      'Admission Year': '2026 - 2027', Quota: quotas.data?.[0]?.name ?? 'Management Quota',
      Gender: '', Communities: comms.data?.slice(0, 2).map((c) => c.name).join(', ') ?? 'BC, MBC',
      Name: 'BE CSE — General — 2026', Status: 'draft', 'Effective From': '', 'Effective To': '', Notes: '',
    };
    if (amountHeaders[0]) sample[amountHeaders[0]] = 1000;
    sheet.addRow(sample);
    sheet.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } };
    sheet.getCell('A2').note = { texts: [{ font: { bold: true, size: 9 }, text: 'Sample row — delete before importing.' }] };

    // ---- Sheet 2: Lists (hidden) ----
    const lists = wb.addWorksheet('Lists');
    lists.state = 'hidden';
    const instNames = (insts.data ?? []).map((r) => r.name);
    const quotaNames = (quotas.data ?? []).map((r) => r.name);
    const commNames = (comms.data ?? []).map((r) => r.name);
    lists.columns = [
      { header: 'Institution', key: 'inst', width: 30 },
      { header: 'Quota', key: 'quota', width: 24 },
      { header: 'Gender', key: 'gender', width: 12 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Community', key: 'comm', width: 30 },
    ];
    const maxLen = Math.max(instNames.length, quotaNames.length, commNames.length, 3);
    for (let i = 0; i < maxLen; i++) {
      lists.addRow({
        inst: instNames[i] ?? null, quota: quotaNames[i] ?? null,
        gender: ['Male', 'Female'][i] ?? null, status: ['draft', 'active', 'archived'][i] ?? null,
        comm: commNames[i] ?? null,
      });
    }
    // Dropdowns on first 200 data rows. Columns: B=Institution, G=Quota, H=Gender, K=Status.
    const colRange = (letter: string, n: number) => `Lists!$${letter}$2:$${letter}$${n + 1}`;
    for (let r = 2; r <= 201; r++) {
      if (instNames.length) sheet.getCell(`B${r}`).dataValidation = { type: 'list', allowBlank: false, formulae: [colRange('A', instNames.length)] };
      if (quotaNames.length) sheet.getCell(`G${r}`).dataValidation = { type: 'list', allowBlank: false, formulae: [colRange('B', quotaNames.length)] };
      sheet.getCell(`H${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['Lists!$C$2:$C$3'] };
      sheet.getCell(`K${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['Lists!$D$2:$D$4'] };
    }

    // ---- Sheet 3: Instructions ----
    const instr = wb.addWorksheet('Instructions');
    instr.columns = [{ width: 100 }];
    [
      'INSTRUCTIONS — BULK FEE STRUCTURE IMPORT',
      '',
      '1. ONE ROW = ONE FEE STRUCTURE.',
      '2. Leave "Fee Structure ID" BLANK to create. Filled = update an existing structure (from Export for Edit).',
      '3. Dimensions (Institution/Degree/Department/Programme/Admission Year/Quota): type the exact NAME.',
      '   Degree/Department/Programme/Admission Year must be valid WITHIN the chosen parent.',
      '4. Communities: comma-separated names, e.g. "BC, MBC, OBC".',
      '5. Gender: Male, Female, or blank (= applies to any gender).',
      '6. Fee amount columns: enter a number for each fee that applies; leave blank where it does not.',
      '   Transport and Hostel fees are intentionally NOT here (managed in their own modules).',
      '7. Status: draft (default), active, or archived. Dates: yyyy-mm-dd.',
      '8. Valid rows are saved even if others fail; the import dialog lists per-row errors to fix and re-upload.',
      '9. On UPDATE rows, the 6 dimensions are read-only identity — changing them rejects the row.',
    ].forEach((line, i) => {
      const row = instr.addRow([line]);
      row.font = i === 0 ? { bold: true, size: 14 } : line.match(/^\d+\./) ? { bold: true, size: 11 } : { size: 10 };
    });

    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=fee-structures-template-${new Date().toISOString().split('T')[0]}.xlsx`,
      },
    });
  } catch (e) {
    console.error('[fees-structure/template] error:', e);
    return NextResponse.json({ error: 'Failed to generate template' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify** — `npm run dev`, browse to `http://localhost:3000/api/admission/fees-structure/template`, open the downloaded file: header row = fixed columns + each active non-transport/non-hostel category; Institution(B)/Quota(G)/Gender(H)/Status(K) dropdowns work; Lists sheet hidden; Instructions present. `mcp__ide__getDiagnostics` clean.

- [ ] **Step 3: Commit**

```bash
git add app/api/admission/fees-structure/template/route.ts
git commit -m "feat(admission-fees): bulk fee-structure template route"
```

---

### Task 5: Export-for-edit route

**Files:**
- Create: `app/api/admission/fees-structure/export/route.ts`

- [ ] **Step 1: Write the route** (reuses the same column shape; pre-fills `Fee Structure ID`)

```ts
export const dynamic = 'force-dynamic';
// app/api/admission/fees-structure/export/route.ts
import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';
import { FIXED_HEADERS } from '@/lib/utils/mappings/fee-structure-excel-mappings';
import { loadActiveFeeCategories } from '@/lib/services/admission/fee-structure-bulk-lookups';

export async function GET(req: NextRequest) {
  await connection();
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (n: string) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const institutionId = req.nextUrl.searchParams.get('institution_id');
    const status = req.nextUrl.searchParams.get('status');

    const cats = await loadActiveFeeCategories(supabase);
    const amountHeaders = cats.map((c) => c.category_name);

    let q = supabase.from('admission_fee_structures').select(`
      id, gender, name, status, notes, effective_from, effective_to,
      institution:institutions(name), degree:degrees(degree_name),
      department:departments(department_name), programme:programs(program_name),
      quota:quotas(name), admission_year:admission_years(admission_year_name),
      communities:admission_fee_structure_communities(community_category:community_categories(name)),
      items:admission_fee_structure_items(amount, billing_category:billing_categories(category_name))
    `).order('updated_at', { ascending: false });
    if (institutionId) q = q.eq('institution_id', institutionId);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Fee Structures');
    const headers = [...FIXED_HEADERS, ...amountHeaders];
    sheet.columns = headers.map((h) => ({ header: h, key: h, width: Math.max(16, h.length + 2) }));
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    for (const s of (data ?? []) as any[]) {
      const row: Record<string, string | number> = {
        'Fee Structure ID': s.id,
        Institution: s.institution?.name ?? '', Degree: s.degree?.degree_name ?? '',
        Department: s.department?.department_name ?? '', Programme: s.programme?.program_name ?? '',
        'Admission Year': s.admission_year?.admission_year_name ?? '', Quota: s.quota?.name ?? '',
        Gender: s.gender ?? '', Name: s.name, Status: s.status,
        'Effective From': s.effective_from ?? '', 'Effective To': s.effective_to ?? '', Notes: s.notes ?? '',
        Communities: (s.communities ?? []).map((c: any) => c.community_category?.name).filter(Boolean).join(', '),
      };
      for (const it of s.items ?? []) {
        const name = it.billing_category?.category_name;
        if (name && amountHeaders.includes(name)) row[name] = Number(it.amount);
      }
      sheet.addRow(row);
    }
    // Note: Fee Structure ID is identity — keep it. (Instructions sheet omitted on export.)

    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=fee-structures-export-${new Date().toISOString().split('T')[0]}.xlsx`,
      },
    });
  } catch (e) {
    console.error('[fees-structure/export] error:', e);
    return NextResponse.json({ error: 'Failed to export' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify** — browse to `/api/admission/fees-structure/export`; the file lists existing structures with `Fee Structure ID` filled, dimension names, communities joined, and amounts under the matching category columns. Try `?institution_id=<id>&status=active` to confirm filtering. `mcp__ide__getDiagnostics` clean.

- [ ] **Step 3: Commit**

```bash
git add app/api/admission/fees-structure/export/route.ts
git commit -m "feat(admission-fees): export-for-edit route for fee structures"
```

---

### Task 6: Import route

**Files:**
- Create: `app/api/admission/fees-structure/import/route.ts`

- [ ] **Step 1: Write the route**

```ts
export const dynamic = 'force-dynamic';
// app/api/admission/fees-structure/import/route.ts
import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import * as XLSX from 'xlsx';
import { FEE_STRUCTURE_SHEET_NAME, resolveRow } from '@/lib/utils/mappings/fee-structure-excel-mappings';
import { loadBulkResolveLookups } from '@/lib/services/admission/fee-structure-bulk-lookups';

export async function POST(req: NextRequest) {
  await connection();
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (n: string) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    // Pick the data sheet BY NAME (not SheetNames[0] — Instructions may be first).
    const ws = wb.Sheets[FEE_STRUCTURE_SHEET_NAME];
    if (!ws) return NextResponse.json({ error: `Sheet "${FEE_STRUCTURE_SHEET_NAME}" not found` }, { status: 400 });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

    const lookups = await loadBulkResolveLookups(supabase);

    let created = 0, updated = 0;
    const failed: Array<{ row: number; name: string; error: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const excelRow = i + 2; // header = row 1
      const raw = rows[i];
      // Skip fully-blank rows.
      if (Object.values(raw).every((v) => String(v ?? '').trim() === '')) continue;
      const res = resolveRow(raw, excelRow, lookups);
      if (res.errors.length > 0) { failed.push({ row: excelRow, name: res.name, error: res.errors.join('; ') }); continue; }

      const isUpdate = !!res.payload!.structure_id;
      const { data, error } = await supabase.rpc('admission_bulk_upsert_fee_structure', { p_payload: res.payload });
      if (error) { failed.push({ row: excelRow, name: res.name, error: error.message }); continue; }
      const result = data as { ok: boolean; error?: string };
      if (!result?.ok) { failed.push({ row: excelRow, name: res.name, error: humanize(result?.error ?? 'Unknown error') }); continue; }
      if (isUpdate) updated++; else created++;
    }

    return NextResponse.json({ created, updated, failed });
  } catch (e: any) {
    console.error('[fees-structure/import] error:', e);
    return NextResponse.json({ error: e?.message ?? 'Import failed' }, { status: 500 });
  }
}

// Mirror of fees-structure-form.tsx humanizeFeeStructureCreateError, for the
// community-overlap trigger message.
function humanize(raw: string): string {
  if (/already covers community/i.test(raw) || /7-dim combination/i.test(raw)) {
    return 'A fee structure already exists for this exact dimension + community combination. Archive the existing one or change a dimension/community.';
  }
  if (/dimension_mismatch/i.test(raw)) return 'The 6 dimensions are read-only on edit and no longer match this Fee Structure ID — fix them or clear the ID to create new.';
  if (/permission_denied/i.test(raw)) return 'You do not have permission to manage fee structures for this institution.';
  return raw;
}
```

- [ ] **Step 2: Verify** — with the app running and signed in as an `admission_fees.manage` user: fill the template with 2 valid rows + 1 row with a bad institution name + 1 with a negative amount, POST it (via the dialog in Task 8, or `curl -F file=@test.xlsx`). Expect `{ created: 2, updated: 0, failed: [2 rows with reasons] }`, and the 2 valid structures appear in the list/DB. Re-export, change an amount, re-import → `updated: 1`, no duplicate. `mcp__ide__getDiagnostics` clean.

- [ ] **Step 3: Commit**

```bash
git add app/api/admission/fees-structure/import/route.ts
git commit -m "feat(admission-fees): bulk fee-structure import route"
```

---

### Task 7: Upload dialog component

**Files:**
- Create: `app/(routes)/admission/settings/fees-structure/_components/bulk-fee-structure-dialog.tsx`

- [ ] **Step 1: Write the dialog**

```tsx
'use client';
// bulk-fee-structure-dialog.tsx — file upload + per-row error report. Shared by
// the Bulk Create and Export-for-Edit flows (both POST to /import).
import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, UploadCloud, CheckCircle2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

interface ImportResult {
  created: number;
  updated: number;
  failed: Array<{ row: number; name: string; error: string }>;
}

export function BulkFeeStructureDialog({
  open, onOpenChange, onImported,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const reset = () => { setFile(null); setResult(null); };

  const handleUpload = async () => {
    if (!file || submitting) return;
    setSubmitting(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/admission/fees-structure/import', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Import failed');
      setResult(json as ImportResult);
      const ok = (json.created ?? 0) + (json.updated ?? 0);
      if (ok > 0) { toast.success(`${json.created} created, ${json.updated} updated`); onImported(); }
      if ((json.failed?.length ?? 0) > 0) toast.error(`${json.failed.length} row(s) had errors`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Import failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk Import Fee Structures</DialogTitle>
          <DialogDescription>
            Upload a filled template (or an edited export). Rows with a blank
            <strong> Fee Structure ID</strong> are created; rows with an ID are updated.
            Valid rows are saved even if others fail.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input type="file" accept=".xlsx,.xls" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }} />

          {result && (
            <div className="rounded-md border p-3 space-y-2 text-sm">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                {result.created} created · {result.updated} updated
              </div>
              {result.failed.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-destructive font-medium">
                    <AlertTriangle className="h-4 w-4" /> {result.failed.length} failed
                  </div>
                  <div className="max-h-56 overflow-auto rounded border divide-y">
                    {result.failed.map((f) => (
                      <div key={f.row} className="p-2 text-xs">
                        <span className="font-mono text-muted-foreground">Row {f.row}</span>
                        {f.name ? ` · ${f.name}` : ''} — <span className="text-destructive">{f.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Close</Button>
          <Button onClick={handleUpload} disabled={!file || submitting}>
            {submitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <UploadCloud className="h-4 w-4 mr-1" />}
            Upload &amp; Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck** with `mcp__ide__getDiagnostics` → no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(routes)/admission/settings/fees-structure/_components/bulk-fee-structure-dialog.tsx"
git commit -m "feat(admission-fees): bulk fee-structure upload dialog"
```

---

### Task 8: Wire entry points into the list view

**Files:**
- Modify: `app/(routes)/admission/settings/fees-structure/_components/fee-structures-list-view.tsx`

- [ ] **Step 1: Add imports + permission gate + dialog state** near the top of the component

Add to the imports block:
```tsx
import { BulkFeeStructureDialog } from './bulk-fee-structure-dialog';
import { Upload, Download } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
```
Inside the component body (near the other `useState`s):
```tsx
const { isSuperAdmin, canPerformAll } = usePermissions();
const canManage = isSuperAdmin || canPerformAll('admission_fees', ['manage']);
const [bulkOpen, setBulkOpen] = useState(false);

const downloadTemplate = () => {
  window.open('/api/admission/fees-structure/template', '_blank');
};
const exportForEdit = () => {
  const params = new URLSearchParams();
  if (institutionFilter !== ALL) params.set('institution_id', institutionFilter);
  if (statusFilter !== ALL) params.set('status', statusFilter);
  window.open(`/api/admission/fees-structure/export?${params.toString()}`, '_blank');
};
```

- [ ] **Step 2: Add the buttons** next to the existing "New Fee Structure" button (the block around the `New Fee Structure` button found near the advanced-filters header)

```tsx
{canManage && (
  <>
    <Button variant="outline" size="sm" onClick={downloadTemplate}>
      <Download className="h-4 w-4 mr-1" /> Template
    </Button>
    <Button variant="outline" size="sm" onClick={exportForEdit}>
      <Upload className="h-4 w-4 mr-1 rotate-180" /> Export for Edit
    </Button>
    <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
      <Upload className="h-4 w-4 mr-1" /> Bulk Import
    </Button>
  </>
)}
```

- [ ] **Step 3: Render the dialog** (before the component's closing tag, alongside other dialogs)

```tsx
<BulkFeeStructureDialog
  open={bulkOpen}
  onOpenChange={setBulkOpen}
  onImported={bumpRefetch}
/>
```

- [ ] **Step 4: Typecheck** `fee-structures-list-view.tsx` with `mcp__ide__getDiagnostics` → no errors. (Confirm `ALL`, `institutionFilter`, `statusFilter`, `bumpRefetch` are the existing identifiers in this file.)

- [ ] **Step 5: End-to-end browser verification**
  1. `npm run dev`, sign in as an `admission_fees.manage` user, open `/admission/settings/fees-structure`.
  2. Click **Template** → fill 2 valid rows + a couple of deliberately-bad rows → **Bulk Import** → upload → confirm summary (created count + per-row errors) and the new rows appear after refetch.
  3. Click **Export for Edit** → change an amount + flip a status → re-import → confirm the structure updates (no duplicate created).
  4. Confirm a community-overlap collision shows the humanized message.
  5. As a non-`manage` role, confirm the three buttons are hidden.

- [ ] **Step 6: Commit**

```bash
git add "app/(routes)/admission/settings/fees-structure/_components/fee-structures-list-view.tsx"
git commit -m "feat(admission-fees): bulk create/edit entry points on fee-structure list"
```

---

## Final self-review checklist (run after all tasks)

- [ ] Template, export, and import all derive amount columns from the **same** `loadActiveFeeCategories` (transport/hostel excluded) — headers stay aligned.
- [ ] Import picks the sheet **by name** (`Fee Structures`), never `SheetNames[0]`.
- [ ] RPC re-checks `admission_fees.manage` + `role_has_institution_access` (SECURITY DEFINER bypasses RLS).
- [ ] Migration body committed to `supabase/migrations/` **and** mirrored into `supabase/setup/02_functions.sql`.
- [ ] Buttons gated on `admission_fees.manage`; non-managers see nothing.
- [ ] Partial success: valid rows commit; failed rows reported with row number + reason.
- [ ] `is_optional` defaults false; dimensions immutable on edit (RPC guard + humanized error).
