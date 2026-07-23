# Upgraded-Learners Report ("Upgrades" tab) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin "Upgrades" tab on the Campus Living Residents page that lists every learner who has a hostel/mess category upgrade in progress or completed, with the from→to category, fee, payment status, and date.

**Architecture:** Read-only, sourced entirely from the upgrade-fee bills (`billing_student_bills.fee_source='hostel_category'`, which covers room + category-only + mess). A service fetches + maps the bills (RLS-gated, joined to learner/category), a React Query hook wraps it, and a new tab component filters (status/kind/search) client-side and renders a table. No DB/RPC changes.

**Tech Stack:** Next.js 16 / React 19, Supabase (`billing_student_bills` + RLS), TanStack Query, Shadcn `Table`/`Tabs`/`Badge`/`Select`.

**Spec:** `docs/superpowers/specs/2026-06-16-hostel-upgraded-learners-report-design.md`

**Verification model:** No unit-test runner exists (CLAUDE.md). "Done" = touched TS files pass `mcp__ide__getDiagnostics` (if available; else structural read), and the tab is exercised in a browser. Don't claim tests pass.

**Commit policy:** Per the user, commit per task to a local feature branch (not pushed). Branch first (currently on `main`).

---

## File map

| File | Change |
|------|--------|
| `types/campus-living/category-upgrade-report.ts` | **Create** — `CategoryUpgradeRow` type |
| `lib/services/campus-living/category-upgrades-report-service.ts` | **Create** — `CategoryUpgradesReportService.getUpgrades()` |
| `hooks/campus-living/use-category-upgrades-report.ts` | **Create** — `useCategoryUpgradesReport()` |
| `app/(routes)/campus-living/residents/_components/upgrades-tab.tsx` | **Create** — `UpgradesTab` (filters + table) |
| `app/(routes)/campus-living/residents/page.tsx` | **Modify** — add the `upgrades` tab |

---

## Task 0: Branch

- [ ] **Step 1: Create the feature branch**

```bash
git checkout main && git checkout -b feat/campus-living-upgrades-report
```
(Untracked migrations from the concurrent session carry over — leave them alone; scope every `git add` to this plan's files.)

---

## Task 1: Row type

**Files:**
- Create: `types/campus-living/category-upgrade-report.ts`

- [ ] **Step 1: Write the type**

```ts
// One row in the admin "Upgrades" report — derived from a single upgrade-fee bill
// (billing_student_bills.fee_source='hostel_category'), covering room + mess upgrades.
export interface CategoryUpgradeRow {
  bill_id: string;
  learner_id: string;            // learners_profiles.id (billing student_id)
  learner_name: string;          // "First Last", fallback "—"
  roll_number: string | null;    // shown with "N/A" fallback (matches billing module)
  institution_name: string | null;
  kind: 'room' | 'mess';
  description: string;           // bill_description, e.g. "Classic Room → Deluxe Room"
  upgrade_fee: number;           // final_amount
  paid_amount: number;           // final_amount - balance_amount
  status: string;                // raw bill status
  status_label: 'Completed' | 'Pending';
  created_at: string;
  academic_year_name: string | null;
}

export type UpgradeStatusFilter = 'all' | 'completed' | 'pending';
export type UpgradeKindFilter = 'all' | 'room' | 'mess';
```

- [ ] **Step 2: Diagnostics + commit**

`mcp__ide__getDiagnostics` on the new file (expect none). Then:
```bash
git add types/campus-living/category-upgrade-report.ts
git commit -m "feat(campus-living): CategoryUpgradeRow report type"
```
End commit body with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## Task 2: Service

**Files:**
- Create: `lib/services/campus-living/category-upgrades-report-service.ts`

**Context:** Mirrors the existing `HostelWaitlistService` pattern (browser client + select with embeds + map). `billing_student_bills` RLS already gates rows by institution access, so no explicit institution filter is needed (read-only report). Status values in use: `paid`, `unpaid`, `partially_paid`, `overdue`, `cancelled`, `refunded`, `superseded`. The two upgrade billing categories are exactly `'Hostel Upgrade Fee'` (room) and `'Mess Upgrade Fee'` (mess).

- [ ] **Step 1: Write the service**

```ts
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type { CategoryUpgradeRow } from '@/types/campus-living/category-upgrade-report';

export class CategoryUpgradesReportService {
  // All in-flight + completed category upgrades, newest first. Reverted attempts
  // (cancelled/superseded/refunded) are excluded. Institution access is enforced by
  // billing_student_bills RLS. Left joins (no !inner) so a missing learner/category
  // FK degrades to "—" rather than silently dropping the row.
  static async getUpgrades(): Promise<CategoryUpgradeRow[]> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('billing_student_bills')
        .select(
          `id, bill_description, final_amount, balance_amount, status, created_at,
           item_category:billing_categories(category_name),
           student:learners_profiles!fk_billing_student_bills_learner_profile(
             id, first_name, last_name, roll_number,
             institution:institutions(name)
           ),
           academic_year:academic_years(academic_year_name)`
        )
        .eq('fee_source', 'hostel_category')
        .not('status', 'in', '(cancelled,superseded,refunded)')
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('campus-living/upgrades-report', 'Failed to fetch upgrades', error);
        throw error;
      }

      return ((data ?? []) as Record<string, unknown>[]).map((r) => {
        const stu = r.student as {
          id?: string; first_name?: string; last_name?: string; roll_number?: string;
          institution?: { name?: string } | null;
        } | null;
        const cat = (r.item_category as { category_name?: string } | null)?.category_name ?? '';
        const status = r.status as string;
        const fee = Number(r.final_amount ?? 0);
        const balance = Number(r.balance_amount ?? 0);
        const name = `${stu?.first_name ?? ''} ${stu?.last_name ?? ''}`.trim();
        return {
          bill_id: r.id as string,
          learner_id: stu?.id ?? '',
          learner_name: name || '—',
          roll_number: stu?.roll_number ?? null,
          institution_name: stu?.institution?.name ?? null,
          kind: cat === 'Mess Upgrade Fee' ? 'mess' : 'room',
          description: (r.bill_description as string) ?? '',
          upgrade_fee: fee,
          paid_amount: Math.max(0, fee - balance),
          status,
          status_label: status === 'paid' ? 'Completed' : 'Pending',
          created_at: r.created_at as string,
          academic_year_name:
            (r.academic_year as { academic_year_name?: string } | null)?.academic_year_name ?? null,
        } satisfies CategoryUpgradeRow;
      });
    } catch (error) {
      logger.error('campus-living/upgrades-report', 'Unexpected error in getUpgrades', error);
      throw error;
    }
  }
}
```

- [ ] **Step 2: Sanity-check the query against prod**

Run via `mcp__supabase__execute_sql` to confirm the shape returns (may be 0 rows now — that's fine, structure is what matters):
```sql
SELECT bb.id, bb.bill_description, bb.status, bc.category_name, lp.roll_number
FROM billing_student_bills bb
LEFT JOIN billing_categories bc ON bc.id = bb.item_category_id
LEFT JOIN learners_profiles lp ON lp.id = bb.student_id
WHERE bb.fee_source='hostel_category' AND bb.status NOT IN ('cancelled','superseded','refunded')
ORDER BY bb.created_at DESC LIMIT 5;
```
Expected: runs without error (FK names valid).

- [ ] **Step 3: Diagnostics + commit**

`mcp__ide__getDiagnostics` on the file. Then:
```bash
git add lib/services/campus-living/category-upgrades-report-service.ts
git commit -m "feat(campus-living): upgrades-report service (bills-sourced)"
```
End commit body with the Co-Authored-By trailer.

---

## Task 3: Hook

**Files:**
- Create: `hooks/campus-living/use-category-upgrades-report.ts`

**Context:** Follow the local-keys convention used by `hooks/campus-living/use-category-upgrade.ts` (a local `keys` object, not the central query-keys file).

- [ ] **Step 1: Write the hook**

```ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { CategoryUpgradesReportService } from '@/lib/services/campus-living/category-upgrades-report-service';

const upgradesReportKeys = {
  all: ['campus-living', 'upgrades-report'] as const,
};

export function useCategoryUpgradesReport() {
  return useQuery({
    queryKey: upgradesReportKeys.all,
    queryFn: () => CategoryUpgradesReportService.getUpgrades(),
  });
}
```

- [ ] **Step 2: Diagnostics + commit**

`mcp__ide__getDiagnostics`. Then:
```bash
git add hooks/campus-living/use-category-upgrades-report.ts
git commit -m "feat(campus-living): useCategoryUpgradesReport hook"
```
End with the Co-Authored-By trailer.

---

## Task 4: Upgrades tab component

**Files:**
- Create: `app/(routes)/campus-living/residents/_components/upgrades-tab.tsx`

**Context:** Read-only table with client-side filters (status/kind/search) over the fetched rows. Uses Shadcn `Table`, `Badge`, `Select`, `Input`. Currency format mirrors the billing tables (`Intl.NumberFormat('en-IN', { currency: 'INR' })`).

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { useMemo, useState } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, ArrowUpCircle } from 'lucide-react';
import { useCategoryUpgradesReport } from '@/hooks/campus-living/use-category-upgrades-report';
import type {
  UpgradeStatusFilter, UpgradeKindFilter,
} from '@/types/campus-living/category-upgrade-report';

const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export function UpgradesTab() {
  const { data: rows = [], isLoading } = useCategoryUpgradesReport();
  const [status, setStatus] = useState<UpgradeStatusFilter>('all');
  const [kind, setKind] = useState<UpgradeKindFilter>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (status === 'completed' && r.status_label !== 'Completed') return false;
      if (status === 'pending' && r.status_label !== 'Pending') return false;
      if (kind !== 'all' && r.kind !== kind) return false;
      if (q && !(`${r.learner_name} ${r.roll_number ?? ''}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, status, kind, search]);

  return (
    <div className='space-y-4'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-end'>
        <div className='space-y-1'>
          <label className='text-xs text-muted-foreground'>Status</label>
          <Select value={status} onValueChange={(v) => setStatus(v as UpgradeStatusFilter)}>
            <SelectTrigger className='w-[160px]'><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All</SelectItem>
              <SelectItem value='completed'>Completed</SelectItem>
              <SelectItem value='pending'>Pending payment</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className='space-y-1'>
          <label className='text-xs text-muted-foreground'>Kind</label>
          <Select value={kind} onValueChange={(v) => setKind(v as UpgradeKindFilter)}>
            <SelectTrigger className='w-[140px]'><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All</SelectItem>
              <SelectItem value='room'>Room</SelectItem>
              <SelectItem value='mess'>Mess</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className='space-y-1 sm:ml-auto'>
          <label className='text-xs text-muted-foreground'>Search learner</label>
          <Input
            placeholder='Name or roll number'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className='w-full sm:w-[240px]'
          />
        </div>
      </div>

      {isLoading ? (
        <div className='flex items-center text-sm text-muted-foreground py-8'>
          <Loader2 className='mr-2 h-4 w-4 animate-spin' /> Loading upgrades…
        </div>
      ) : filtered.length === 0 ? (
        <div className='flex flex-col items-center gap-2 py-12 text-center'>
          <ArrowUpCircle className='h-10 w-10 text-muted-foreground' />
          <p className='text-sm text-muted-foreground'>No category upgrades match these filters.</p>
        </div>
      ) : (
        <div className='rounded-md border overflow-x-auto'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Learner</TableHead>
                <TableHead>Institution</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Upgrade</TableHead>
                <TableHead className='text-right'>Fee</TableHead>
                <TableHead className='text-center'>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.bill_id}>
                  <TableCell>
                    <div className='font-medium'>{r.learner_name}</div>
                    <div className='text-xs text-muted-foreground'>{r.roll_number ?? 'N/A'}</div>
                  </TableCell>
                  <TableCell className='text-sm'>{r.institution_name ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant='outline' className='capitalize'>{r.kind}</Badge>
                  </TableCell>
                  <TableCell className='text-sm'>{r.description || '—'}</TableCell>
                  <TableCell className='text-right'>
                    <div className='font-medium'>{inr(r.upgrade_fee)}</div>
                    {r.status_label === 'Pending' && r.paid_amount > 0 && (
                      <div className='text-xs text-muted-foreground'>{inr(r.paid_amount)} paid</div>
                    )}
                  </TableCell>
                  <TableCell className='text-center'>
                    <Badge
                      variant='outline'
                      className={
                        r.status_label === 'Completed'
                          ? 'border-green-400 text-green-700 dark:text-green-400'
                          : 'border-amber-400 text-amber-700 dark:text-amber-400'
                      }
                    >
                      {r.status_label}
                    </Badge>
                  </TableCell>
                  <TableCell className='text-sm'>{fmtDate(r.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Diagnostics + commit**

`mcp__ide__getDiagnostics`. Then:
```bash
git add "app/(routes)/campus-living/residents/_components/upgrades-tab.tsx"
git commit -m "feat(campus-living): Upgrades tab table + filters"
```
End with the Co-Authored-By trailer.

---

## Task 5: Wire the tab into the Residents page

**Files:**
- Modify: `app/(routes)/campus-living/residents/page.tsx`

- [ ] **Step 1: Add the import** (next to the other tab imports near the top)

```tsx
import { UpgradesTab } from './_components/upgrades-tab';
```

- [ ] **Step 2: Add `'upgrades'` to TAB_VALUES**

Change:
```tsx
const TAB_VALUES = ['learners', 'non-learners', 'generate'] as const;
```
to:
```tsx
const TAB_VALUES = ['learners', 'non-learners', 'generate', 'upgrades'] as const;
```

- [ ] **Step 3: Add the trigger** — in the `<TabsList>`, after the `generate` trigger:

```tsx
            <TabsTrigger value='upgrades'>Upgrades</TabsTrigger>
```

- [ ] **Step 4: Add the content** — after the `generate` `<TabsContent>` block (and before `</Tabs>`):

```tsx
          <TabsContent value='upgrades' className='space-y-4'>
            <div>
              <p className='text-sm text-muted-foreground'>
                Learners who have a hostel/mess category upgrade in progress or completed,
                sourced from the upgrade-fee bills.
              </p>
            </div>
            <UpgradesTab />
          </TabsContent>
```

- [ ] **Step 5: Diagnostics + commit**

`mcp__ide__getDiagnostics` on `page.tsx`. Then:
```bash
git add "app/(routes)/campus-living/residents/page.tsx"
git commit -m "feat(campus-living): add Upgrades tab to Residents page"
```
End with the Co-Authored-By trailer.

---

## Task 6: Verification

- [ ] **Step 1: Generate a visible row** (there are 0 live upgrade bills now). Either run a real upgrade end-to-end, or temporarily verify with an existing/seeded `fee_source='hostel_category'` bill via SQL. Confirm via:
```sql
SELECT count(*) FROM billing_student_bills
WHERE fee_source='hostel_category' AND status NOT IN ('cancelled','superseded','refunded');
```
- [ ] **Step 2: Browser** — `npm run dev`, open `/campus-living/residents?tab=upgrades`. Confirm: the Upgrades tab appears; rows show Learner (name + roll, "N/A" when null), Kind (Room/Mess), the from→to under Upgrade, Fee, a Completed/Pending badge, Date.
- [ ] **Step 3: Filters** — Status = Pending shows only unpaid/partial; Kind = Mess shows only mess; search narrows by name/roll.
- [ ] **Step 4: Scope** — as a single-institution role, confirm only that institution's upgrades show (RLS).

---

## Self-review notes (author)

- **Spec coverage:** data source/status mapping → Task 2 query (`fee_source='hostel_category'`, exclude cancelled/superseded/refunded, `status_label` from `paid`); room+mess Kind → Task 2 map + Task 4 filter; roll_number identifier (billing-consistent) → Task 1 type + Task 4 render (`?? 'N/A'`); location (Residents tab) → Task 5; columns/filters → Task 4. All mapped.
- **Type consistency:** `CategoryUpgradeRow`, `UpgradeStatusFilter`, `UpgradeKindFilter` defined in Task 1 and used identically in Tasks 2–4. `kind` is `'room'|'mess'`; `status_label` is `'Completed'|'Pending'` throughout.
- **No placeholders:** every step has literal code; the FK embed name `fk_billing_student_bills_learner_profile` is the verified constraint; status enum values match the billing UI.
- **Deviation from spec:** filters (status/kind/search) run client-side in the tab rather than in the service — justified by the small upgrade-bill volume and avoids PostgREST embedded-resource filter complexity; service stays a single clean query.
