# Bug Management Module Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Add module-wise grouping/filtering, markdown export for AI agents, and duplicate detection to the bug management dashboard.

**Architecture:**
- Add a `module_name` DB column populated by a Postgres trigger that parses `page_url` path segments.
- Expose `module_name` as a filter in the list API and a new modules summary API.
- Add an export API that streams markdown files as a ZIP download.
- Duplicate detection groups bugs by error signature (first console error line, normalized).

**Tech Stack:** Next.js App Router, Supabase (Postgres triggers, RLS), React Query, shadcn/ui, JSZip (new dep), TypeScript

---

## Phase 1 — Database: `module_name` Column

### Task 1: Supabase migration — add column + extract function + trigger

**Files:**
- Modify: `supabase/setup/01_tables.sql` (add `module_name` column)
- Modify: `supabase/setup/02_functions.sql` (add `extract_module_from_url` function)
- Modify: `supabase/setup/04_triggers.sql` (add trigger)

**Step 1: Add column to `bug_reports` table in `01_tables.sql`**

Find the `bug_reports` table definition and add after `page_url`:
```sql
-- Updated: 2026-03-23 - Added module_name for module-wise grouping
module_name VARCHAR(100) GENERATED ALWAYS AS (
  CASE
    WHEN page_url IS NULL THEN 'unknown'
    WHEN page_url ~ '/academic/' THEN 'academic'
    WHEN page_url ~ '/billing/' THEN 'billing'
    WHEN page_url ~ '/organization/' THEN 'organization'
    WHEN page_url ~ '/learners/' THEN 'learners'
    WHEN page_url ~ '/staff/' THEN 'staff'
    WHEN page_url ~ '/admission/' THEN 'admission'
    WHEN page_url ~ '/resource-management/' THEN 'resource-management'
    WHEN page_url ~ '/startup-studio/' THEN 'startup-studio'
    WHEN page_url ~ '/settings/' THEN 'settings'
    WHEN page_url ~ '/admin/' THEN 'admin'
    ELSE 'other'
  END
) STORED,
```

> **Note:** Using a generated column avoids a trigger entirely — Postgres recomputes it automatically on insert/update. STORED means it's indexed.

**Step 2: Add index on `module_name` in `01_tables.sql`**

After the table definition, add:
```sql
-- Updated: 2026-03-23 - Index for module filtering
CREATE INDEX IF NOT EXISTS idx_bug_reports_module_name ON public.bug_reports(module_name);
```

**Step 3: Apply migration via Supabase MCP**

Run this SQL via `mcp__supabase__apply_migration` with name `add_module_name_to_bug_reports`:
```sql
-- Add generated column for module detection from page_url
ALTER TABLE public.bug_reports
ADD COLUMN IF NOT EXISTS module_name VARCHAR(100) GENERATED ALWAYS AS (
  CASE
    WHEN page_url IS NULL THEN 'unknown'
    WHEN page_url ~ '/academic/' THEN 'academic'
    WHEN page_url ~ '/billing/' THEN 'billing'
    WHEN page_url ~ '/organization/' THEN 'organization'
    WHEN page_url ~ '/learners/' THEN 'learners'
    WHEN page_url ~ '/staff/' THEN 'staff'
    WHEN page_url ~ '/admission/' THEN 'admission'
    WHEN page_url ~ '/resource-management/' THEN 'resource-management'
    WHEN page_url ~ '/startup-studio/' THEN 'startup-studio'
    WHEN page_url ~ '/settings/' THEN 'settings'
    WHEN page_url ~ '/admin/' THEN 'admin'
    ELSE 'other'
  END
) STORED;

CREATE INDEX IF NOT EXISTS idx_bug_reports_module_name ON public.bug_reports(module_name);
```

**Step 4: Verify the migration worked**

Run this query via Supabase MCP to confirm:
```sql
SELECT module_name, count(*) FROM bug_reports GROUP BY module_name ORDER BY count DESC;
```
Expected: rows grouped by detected module names.

**Step 5: Update `supabase/SQL_FILE_INDEX.md`**

Add an entry for the new `module_name` generated column.

**Step 6: Commit**
```bash
git add supabase/setup/01_tables.sql supabase/SQL_FILE_INDEX.md
git commit -m "feat(db): add module_name generated column to bug_reports"
```

---

## Phase 2 — TypeScript Types

### Task 2: Add `module_name` to types and filters

**Files:**
- Modify: `types/bugs.ts`

**Step 1: Add `module_name` to `BugReport` interface**

In `types/bugs.ts`, add to the `BugReport` interface after `page_url`:
```typescript
module_name?: string | null;
```

**Step 2: Add `module_name` to `BugReportFilters` interface**

In `types/bugs.ts`, add to the `BugReportFilters` interface:
```typescript
module_name?: string;
```

**Step 3: Verify no TypeScript errors**

Run: `npx tsc --noEmit 2>&1 | grep bugs.ts`
Expected: no output (no errors in bugs.ts)

**Step 4: Commit**
```bash
git add types/bugs.ts
git commit -m "feat(types): add module_name to BugReport and BugReportFilters"
```

---

## Phase 3 — API: Module Filter + Modules List Endpoint

### Task 3: Add `module_name` filter to GET /api/bug-reports

**Files:**
- Modify: `app/api/bug-reports/route.ts`

**Step 1: Add `module_name` to the GET handler query params**

In `app/api/bug-reports/route.ts`, inside the `GET` function after line `const department_id = searchParams.get('department_id');`:
```typescript
const module_name = searchParams.get('module_name');
```

**Step 2: Apply the filter in the query chain**

After the `department_id` filter block, add:
```typescript
if (module_name) {
  query = query.eq('module_name', module_name);
}
```

**Step 3: Verify with curl (dev server running)**

```bash
curl "http://localhost:3000/api/bug-reports?module_name=academic" -H "Cookie: ..."
```
Expected: JSON with only academic module bugs.

**Step 4: Commit**
```bash
git add app/api/bug-reports/route.ts
git commit -m "feat(api): add module_name filter to bug reports list endpoint"
```

### Task 4: Create GET /api/bug-reports/modules endpoint

This returns the list of distinct module names with bug counts — powers the filter dropdown.

**Files:**
- Create: `app/api/bug-reports/modules/route.ts`

**Step 1: Create the route file**

```typescript
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Check admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !['admin', 'super_admin', 'administrator'].includes(profile.role)) {
      return NextResponse.json({ error: 'Admin permissions required' }, { status: 403 });
    }

    const adminSupabase = createAdminClient();

    const { data, error } = await (adminSupabase as any)
      .from('bug_reports')
      .select('module_name')
      .not('module_name', 'is', null);

    if (error) throw error;

    // Count by module
    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      const m = row.module_name ?? 'other';
      counts[m] = (counts[m] ?? 0) + 1;
    }

    const modules = Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({ modules });
  } catch (error) {
    logger.error('bug-reports/modules', 'Failed to fetch module list', error);
    return NextResponse.json({ error: 'Failed to fetch modules' }, { status: 500 });
  }
}
```

**Step 2: Verify**

```bash
curl "http://localhost:3000/api/bug-reports/modules" -H "Cookie: ..."
```
Expected: `{ "modules": [{ "name": "academic", "count": 12 }, ...] }`

**Step 3: Commit**
```bash
git add app/api/bug-reports/modules/route.ts
git commit -m "feat(api): add /api/bug-reports/modules endpoint for module counts"
```

---

## Phase 4 — React Query Hook + UI Filter

### Task 5: Add module hooks and filter to bug list page

**Files:**
- Modify: `hooks/bug-reports/use-bug-reports.ts`
- Modify: `app/(routes)/admin/bug-reports/page.tsx`

**Step 1: Add `fetchBugModules` and `useBugModules` hook**

In `hooks/bug-reports/use-bug-reports.ts`, add after the existing fetch functions:

```typescript
const fetchBugModules = async (): Promise<{ modules: { name: string; count: number }[] }> => {
  const response = await fetch('/api/bug-reports/modules');
  if (!response.ok) throw new Error('Failed to fetch bug modules');
  return response.json();
};
```

And add the hook (alongside the other `useQuery` hooks in the file):
```typescript
export const useBugModules = () => {
  return useQuery({
    queryKey: [queryKeys.BUG_REPORTS, 'modules'],
    queryFn: fetchBugModules,
    staleTime: 5 * 60 * 1000 // 5 min — module list doesn't change often
  });
};
```

**Step 2: Add `module_name` to `fetchBugReports` params**

In `hooks/bug-reports/use-bug-reports.ts`, inside `fetchBugReports`, add after the `search` param:
```typescript
if (filters.module_name) params.append('module_name', filters.module_name);
```

**Step 3: Add module filter import to page.tsx**

In `app/(routes)/admin/bug-reports/page.tsx`, add to the import from `@/hooks/bug-reports/use-bug-reports`:
```typescript
useBugModules,
```

**Step 4: Add `useBugModules` call in component**

In `AdminBugReportsPage`, after the `useDepartments` call:
```typescript
const { data: modulesData } = useBugModules();
```

**Step 5: Add module filter `<Select>` to filter bar**

In `page.tsx`, after the department filter block (around line 771), add:
```tsx
<div className='w-full sm:w-auto md:w-48'>
  <Select
    value={filters.module_name || 'all'}
    onValueChange={(value) => {
      setFilters((prev) => ({
        ...prev,
        module_name: value === 'all' ? undefined : value,
        page: 1
      }));
      setSelectedReports([]);
    }}
  >
    <SelectTrigger className='w-full'>
      <SelectValue placeholder='Filter by module...' />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value='all'>All Modules</SelectItem>
      {modulesData?.modules.map((mod) => (
        <SelectItem key={mod.name} value={mod.name}>
          {mod.name} ({mod.count})
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

**Step 6: Add `module_name` column to the DataTable**

In `page.tsx`, in the `columns` array, add after the `category` column:
```tsx
{
  accessorKey: 'module_name',
  header: 'Module',
  cell: ({ row }) => (
    <Badge variant='outline' className='text-xs font-mono'>
      {row.original.module_name || 'other'}
    </Badge>
  )
},
```

**Step 7: Verify UI renders**

Open `/admin/bug-reports` in browser. Module filter dropdown should show module names. Module column should be visible in the table.

**Step 8: Commit**
```bash
git add hooks/bug-reports/use-bug-reports.ts app/(routes)/admin/bug-reports/page.tsx
git commit -m "feat(ui): add module filter and module column to bug reports dashboard"
```

---

## Phase 5 — Markdown Export

### Task 6: Install JSZip

**Step 1: Install**
```bash
npm install jszip
npm install --save-dev @types/jszip
```

**Step 2: Verify install**
```bash
node -e "require('jszip'); console.log('ok')"
```
Expected: `ok`

### Task 7: Create POST /api/bug-reports/export endpoint

This generates markdown files and returns them as a ZIP download.

**Files:**
- Create: `app/api/bug-reports/export/route.ts`

**Step 1: Create the route**

```typescript
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

const exportSchema = z.object({
  module_name: z.string().optional(),           // single module, or all if omitted
  status: z.string().optional(),                // filter by status
  include_console_logs: z.boolean().default(true)
});

function buildBugMarkdown(bug: any, includeConsoleLogs: boolean): string {
  const lines: string[] = [];

  lines.push(`# Bug Report: ${bug.display_id}`);
  lines.push('');
  lines.push('```yaml');
  lines.push(`id: ${bug.id}`);
  lines.push(`display_id: ${bug.display_id}`);
  lines.push(`status: ${bug.status}`);
  lines.push(`module: ${bug.module_name ?? 'other'}`);
  lines.push(`category: ${bug.category ?? 'bug'}`);
  lines.push(`reported_at: ${bug.created_at}`);
  if (bug.resolved_at) lines.push(`resolved_at: ${bug.resolved_at}`);
  lines.push('```');
  lines.push('');

  lines.push('## Reporter');
  if (bug.reporter_name) {
    lines.push(`- **Name:** ${bug.reporter_name}`);
    lines.push(`- **Email:** ${bug.reporter_email ?? 'N/A'}`);
    lines.push(`- **Role:** ${bug.reporter_role ?? 'N/A'}`);
  } else {
    lines.push('- Anonymous / No profile');
  }
  lines.push('');

  lines.push('## Page URL');
  lines.push(`\`${bug.page_url}\``);
  lines.push('');

  if (bug.institution_name) {
    lines.push(`**Institution:** ${bug.institution_name}`);
    lines.push('');
  }

  lines.push('## Description');
  lines.push(bug.description ?? 'No description provided.');
  lines.push('');

  if (bug.metadata) {
    lines.push('## Environment');
    const meta = typeof bug.metadata === 'string' ? JSON.parse(bug.metadata) : bug.metadata;
    if (meta.browser) lines.push(`- **Browser:** ${meta.browser}`);
    if (meta.os) lines.push(`- **OS:** ${meta.os}`);
    lines.push('');
  }

  if (includeConsoleLogs && bug.console_logs && Array.isArray(bug.console_logs) && bug.console_logs.length > 0) {
    lines.push('## Console Logs');
    lines.push('```');
    for (const log of bug.console_logs.slice(0, 50)) { // cap at 50 entries
      const level = log.level ?? log.type ?? 'log';
      const msg = typeof log.message === 'string' ? log.message : JSON.stringify(log.message ?? log);
      lines.push(`[${level.toUpperCase()}] ${msg}`);
    }
    lines.push('```');
    lines.push('');
  }

  if (bug.screenshot_url) {
    lines.push('## Screenshot');
    lines.push(`![Screenshot](${bug.screenshot_url})`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  return lines.join('\n');
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !['admin', 'super_admin', 'administrator'].includes(profile.role)) {
      return NextResponse.json({ error: 'Admin permissions required' }, { status: 403 });
    }

    const json = await request.json();
    const { module_name, status, include_console_logs } = exportSchema.parse(json);

    const adminSupabase = createAdminClient();

    let query = (adminSupabase as any)
      .from('bug_reports_with_details')
      .select('id, display_id, status, module_name, category, created_at, resolved_at, page_url, description, console_logs, screenshot_url, metadata, reporter_name, reporter_email, reporter_role, institution_name')
      .order('module_name', { ascending: true })
      .order('created_at', { ascending: false });

    if (module_name) query = query.eq('module_name', module_name);
    if (status) query = query.eq('status', status);

    const { data: bugs, error } = await query;
    if (error) throw error;

    // Group by module
    const byModule: Record<string, any[]> = {};
    for (const bug of bugs ?? []) {
      const mod = bug.module_name ?? 'other';
      (byModule[mod] ??= []).push(bug);
    }

    // Build ZIP
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    const exportDate = new Date().toISOString().split('T')[0];

    for (const [mod, modBugs] of Object.entries(byModule)) {
      let content = `# Bug Reports — ${mod} module\n\n`;
      content += `> Exported: ${exportDate} | Total: ${modBugs.length} bugs\n\n`;
      content += `---\n\n`;

      for (const bug of modBugs) {
        content += buildBugMarkdown(bug, include_console_logs);
      }

      zip.file(`${mod}-bugs-${exportDate}.md`, content);
    }

    // Add summary index
    const summaryLines = [`# Bug Export Summary — ${exportDate}\n`];
    summaryLines.push(`Total bugs: ${(bugs ?? []).length}\n`);
    summaryLines.push(`## Modules\n`);
    for (const [mod, modBugs] of Object.entries(byModule)) {
      summaryLines.push(`- **${mod}**: ${modBugs.length} bugs`);
    }
    zip.file('_index.md', summaryLines.join('\n'));

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    return new Response(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="bug-reports-${exportDate}.zip"`
      }
    });
  } catch (error) {
    logger.error('bug-reports/export', 'Export failed', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
```

**Step 2: Verify the route compiles**

```bash
npx tsc --noEmit 2>&1 | grep export
```
Expected: no errors in export route.

**Step 3: Commit**
```bash
git add app/api/bug-reports/export/route.ts
git commit -m "feat(api): add bug reports markdown export endpoint"
```

### Task 8: Add Export Dialog UI to bug reports page

**Files:**
- Create: `app/(routes)/admin/bug-reports/_components/export-bugs-dialog.tsx`
- Modify: `app/(routes)/admin/bug-reports/page.tsx`

**Step 1: Create the export dialog component**

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Download, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface ExportBugsDialogProps {
  modules: { name: string; count: number }[];
}

export function ExportBugsDialog({ modules }: ExportBugsDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [includeConsoleLogs, setIncludeConsoleLogs] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const payload: any = { include_console_logs: includeConsoleLogs };
      if (selectedModule !== 'all') payload.module_name = selectedModule;
      if (selectedStatus !== 'all') payload.status = selectedStatus;

      const response = await fetch('/api/bug-reports/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error ?? 'Export failed');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bug-reports-${new Date().toISOString().split('T')[0]}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success('Bug reports exported successfully');
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message ?? 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const totalCount =
    selectedModule === 'all'
      ? modules.reduce((sum, m) => sum + m.count, 0)
      : (modules.find((m) => m.name === selectedModule)?.count ?? 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant='outline' size='sm'>
          <Download className='w-4 h-4 mr-2' />
          Export for AI
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Export Bug Reports</DialogTitle>
          <DialogDescription>
            Download structured markdown files to share with AI agents for batch resolution.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4 py-2'>
          <div className='space-y-2'>
            <Label>Module</Label>
            <Select value={selectedModule} onValueChange={setSelectedModule}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>
                  All Modules ({modules.reduce((s, m) => s + m.count, 0)} bugs)
                </SelectItem>
                {modules.map((mod) => (
                  <SelectItem key={mod.name} value={mod.name}>
                    {mod.name} ({mod.count} bugs)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-2'>
            <Label>Status Filter</Label>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Statuses</SelectItem>
                <SelectItem value='new'>New</SelectItem>
                <SelectItem value='seen'>Seen</SelectItem>
                <SelectItem value='in_progress'>In Progress</SelectItem>
                <SelectItem value='resolved'>Resolved</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className='flex items-center gap-2'>
            <Checkbox
              id='consoleLogs'
              checked={includeConsoleLogs}
              onCheckedChange={(v) => setIncludeConsoleLogs(!!v)}
            />
            <Label htmlFor='consoleLogs' className='cursor-pointer'>
              Include console logs (larger file size)
            </Label>
          </div>

          {totalCount > 0 && (
            <p className='text-sm text-muted-foreground'>
              Will export <strong>{totalCount}</strong> bug report{totalCount !== 1 ? 's' : ''} as a ZIP of markdown files.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting || totalCount === 0}>
            {isExporting ? (
              <>
                <Loader2 className='w-4 h-4 mr-2 animate-spin' />
                Exporting...
              </>
            ) : (
              <>
                <Download className='w-4 h-4 mr-2' />
                Download ZIP
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Import and use ExportBugsDialog in page.tsx**

Add import at the top of `page.tsx`:
```typescript
import { ExportBugsDialog } from './_components/export-bugs-dialog';
```

**Step 3: Add export button to page header**

In the header `<div className='flex gap-2'>` (around line 543), add before the Leaderboard button:
```tsx
<ExportBugsDialog modules={modulesData?.modules ?? []} />
```

**Step 4: Verify UI**

- Export button appears in header
- Dialog opens with module/status selectors
- Selecting a module shows the count
- Download triggers correctly

**Step 5: Commit**
```bash
git add app/(routes)/admin/bug-reports/_components/export-bugs-dialog.tsx app/(routes)/admin/bug-reports/page.tsx
git commit -m "feat(ui): add bug reports export dialog with ZIP download"
```

---

## Phase 6 — Duplicate / Similar Bug Detection

### Task 9: Add error signature extraction + similar bugs count to API

**Files:**
- Modify: `app/api/bug-reports/route.ts`
- Modify: `app/api/bug-reports/[id]/route.ts`

**Step 1: Add `extractErrorSignature` helper in `route.ts`**

Add this helper function at the top of `app/api/bug-reports/route.ts` (after imports):

```typescript
// Extract a normalized error signature from console_logs for deduplication
function extractErrorSignature(consoleLogs: any[] | null): string | null {
  if (!consoleLogs || consoleLogs.length === 0) return null;

  for (const log of consoleLogs) {
    const level = log.level ?? log.type ?? '';
    if (!['error', 'Error'].includes(level)) continue;

    const msg: string = typeof log.message === 'string'
      ? log.message
      : JSON.stringify(log.message ?? '');

    // Normalize: strip line numbers, memory addresses, UUIDs
    const normalized = msg
      .split('\n')[0]                          // first line only
      .replace(/\b[0-9a-f]{8}-[0-9a-f-]+\b/gi, 'UUID') // strip UUIDs
      .replace(/:\d+:\d+/g, ':L:C')           // strip line:col numbers
      .replace(/0x[0-9a-f]+/gi, '0xADDR')     // strip hex addresses
      .trim()
      .slice(0, 200);                          // cap length

    if (normalized.length > 10) return normalized;
  }
  return null;
}
```

**Step 2: Add `similar_count` to the GET response**

The current GET handler fetches bugs from `bug_reports_with_details`. After fetching, add a post-processing step to count similar bugs.

In the GET handler, after fetching `bugs`, before building the response, add:

```typescript
// Compute error signatures and attach similar_count
const sigMap: Record<string, number> = {};
const bugsWithSig = (bugs ?? []).map((bug: any) => {
  const sig = extractErrorSignature(bug.console_logs);
  return { ...bug, _sig: sig };
});
// Count occurrences of each signature across ALL fetched bugs
for (const bug of bugsWithSig) {
  if (bug._sig) sigMap[bug._sig] = (sigMap[bug._sig] ?? 0) + 1;
}
const bugsWithSimilar = bugsWithSig.map(({ _sig, ...bug }: any) => ({
  ...bug,
  similar_count: _sig ? (sigMap[_sig] - 1) : 0 // exclude self
}));
```

Then return `bugsWithSimilar` instead of `bugs` in the response.

**Step 3: Add `similar_count` to BugReport type**

In `types/bugs.ts`, add to `BugReport` interface:
```typescript
similar_count?: number;
```

**Step 4: Add "Similar" badge to the DataTable in page.tsx**

In the `description` column cell in `page.tsx`, update to show a badge when `similar_count > 0`:

```tsx
cell: ({ row }) => (
  <div className='max-w-[150px] sm:max-w-xs text-xs sm:text-sm'>
    <div className='truncate'>{row.original.description}</div>
    {(row.original.similar_count ?? 0) > 0 && (
      <Badge variant='outline' className='mt-1 text-xs text-yellow-600 border-yellow-400'>
        {row.original.similar_count} similar
      </Badge>
    )}
  </div>
)
```

**Step 5: Verify similar badge appears**

Open bug list. Bugs with matching error signatures should show a "N similar" yellow badge under the description.

**Step 6: Commit**
```bash
git add app/api/bug-reports/route.ts types/bugs.ts app/(routes)/admin/bug-reports/page.tsx
git commit -m "feat: add error signature deduplication and similar bugs badge"
```

---

## Completion Checklist

- [ ] Phase 1: `module_name` generated column in DB, indexed, backfilled
- [ ] Phase 2: TypeScript types updated
- [ ] Phase 3: List API filters by module; modules summary endpoint created
- [ ] Phase 4: Module filter dropdown in UI; module column in table
- [ ] Phase 5: Export endpoint + ZIP download dialog
- [ ] Phase 6: Error signature grouping + "N similar" badge

---

## Testing Checklist

- [ ] Filter by module returns only bugs from that module's pages
- [ ] Module dropdown shows count badges
- [ ] Export ZIP contains one `.md` file per module + `_index.md`
- [ ] Markdown files include reporter info, description, console logs (when enabled)
- [ ] "Similar" badge appears when ≥2 bugs have same error signature
- [ ] Existing filters (status, category, institution) still work alongside module filter
