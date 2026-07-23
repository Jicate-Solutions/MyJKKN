# COE Course Mapping UI Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Redesign the 1252-line monolithic course mapping page into a clean, modular UI with filter bar, per-semester collapsible tables, slide-over add/edit sheet, bulk actions, and Excel import/export.

**Architecture:** Replace `app/(coe)/course-management/course-mapping/page.tsx` with a composition of small focused components. Data fetching moves to a custom hook (`useCourseMapping`). The existing API route at `app/api/course-management/course-mapping/route.ts` is reused with minor additions.

**Tech Stack:** Next.js 15, TypeScript, Supabase (server-side), Shadcn UI (Sheet, Table, Badge, Collapsible, Command, Select), Tailwind CSS, XLSX (excel export/import)

---

## ASCII Wireframe

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Course Management › Course Mapping                         [Import] [Export] │
├─────────────────────────────────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                   │
│ │Institution│ │ Program  │ │Regulation│ │  Batch   │  [Load Mapping]   │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ ▼ Semester I  (12 courses)          [+ Add Course]  [Bulk Actions ▾]   │
│ ┌──┬──────────┬───────────────┬──────────┬──────┬────────┬──────────┐  │
│ │☐ │  Code    │  Title        │  Group   │ Int  │  Ext  │  Status  │  │
│ ├──┼──────────┼───────────────┼──────────┼──────┼────────┼──────────┤  │
│ │☐ │ 23BCA101 │ Programming   │ General  │ 25/40│ 40/60 │ ●Pending │  │
│ │☐ │ 23BCA102 │ Mathematics   │ General  │ 25/40│ 40/60 │ ●BOS Appr│  │
│ │☐ │ 23BCA103 │ Data Struct.. │ Elect-I  │ 25/40│ 40/60 │ ●Locked  │  │
│ └──┴──────────┴───────────────┴──────────┴──────┴────────┴──────────┘  │
│                                                                         │
│ ► Semester II (8 courses)           [+ Add Course]  [Bulk Actions ▾]   │
│ ► Semester III (0 courses)          [+ Add Course]  [Bulk Actions ▾]   │
│                                                                         │
│ ┌─── Add / Edit Course Mapping (Sheet — slides from right) ─────────┐  │
│ │ Course *       [Search course...                              ▾]   │  │
│ │ Course Group * [General                                       ▾]   │  │
│ │ Course Order   [____]                                              │  │
│ │ ─── Internal Marks ───────────────────────────────────────────    │  │
│ │ Max [___]  Pass [___]  Converted [___]                            │  │
│ │ ─── External Marks ───────────────────────────────────────────    │  │
│ │ Max [___]  Pass [___]  Converted [___]                            │  │
│ │ ─── Total ────────────────────────────────────────────────────    │  │
│ │ Max [___]  Pass [___]                                             │  │
│ │ Registration Based [switch]   Annual/Semester [switch]            │  │
│ │ Status  [Pending ▾]   Active [switch]                            │  │
│ │                               [Cancel]  [Save Mapping]           │  │
│ └────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
app/(coe)/course-management/course-mapping/
  page.tsx                          ← REPLACE (thin orchestrator, ~80 lines)

components/course-mapping/
  filter-bar.tsx                    ← CREATE  Institution/Program/Regulation/Batch selects
  semester-section.tsx              ← CREATE  Collapsible per-semester block
  mapping-table.tsx                 ← CREATE  Table with checkboxes + row click
  mapping-sheet.tsx                 ← CREATE  Add/Edit slide-over form
  bulk-action-menu.tsx              ← CREATE  Dropdown: change status, delete
  import-dialog.tsx                 ← CREATE  Excel import with preview
  status-badge.tsx                  ← CREATE  Color-coded Pending/BOS Approved/Locked
  empty-state.tsx                   ← CREATE  No mappings illustration

hooks/
  use-course-mapping.ts             ← CREATE  All data fetching + mutations

app/api/course-management/course-mapping/
  route.ts                          ← MODIFY  Add bulk PATCH endpoint

types/course-mapping.ts             ← MODIFY  Add FilterState, MappingFormValues
```

---

## Type Additions — `types/course-mapping.ts`

Add to the existing file:

```typescript
export interface FilterState {
  institution_code: string
  program_code: string
  regulation_code: string
  batch_code: string
}

export interface MappingFormValues {
  course_id: string
  course_group: string
  course_order: number | ''
  internal_max_mark: number | ''
  internal_pass_mark: number | ''
  internal_converted_mark: number | ''
  external_max_mark: number | ''
  external_pass_mark: number | ''
  external_converted_mark: number | ''
  total_max_mark: number | ''
  total_pass_mark: number | ''
  registration_based: boolean
  annual_semester: boolean
  courses_status: CourseMappingStatus
  is_active: boolean
}

export const EMPTY_FORM: MappingFormValues = {
  course_id: '',
  course_group: 'General',
  course_order: '',
  internal_max_mark: '',
  internal_pass_mark: '',
  internal_converted_mark: '',
  external_max_mark: '',
  external_pass_mark: '',
  external_converted_mark: '',
  total_max_mark: '',
  total_pass_mark: '',
  registration_based: false,
  annual_semester: false,
  courses_status: 'Pending',
  is_active: true,
}
```

---

## API Contract

### Existing endpoints (no change needed)

```
GET  /api/course-management/course-mapping
  ?institution_code=CAS
  ?program_code=BCA
  ?regulation_code=R2023
  ?batch_code=2023
  → { data: CourseMapping[], total: number }

POST /api/course-management/course-mapping
  body: CourseMapping (without id)
  → { data: CourseMapping }

PUT  /api/course-management/course-mapping?id=<uuid>
  body: Partial<CourseMapping>
  → { data: CourseMapping }

DELETE /api/course-management/course-mapping?id=<uuid>
  → { data: { id, deleted: true } }
```

### New endpoint — Bulk PATCH

```
PATCH /api/course-management/course-mapping
  body: {
    ids: string[]                        // array of mapping UUIDs
    action: 'status' | 'delete'
    courses_status?: CourseMappingStatus // required when action='status'
  }
  → { data: { updated: number } }
```

---

## Database Queries — Supabase Syntax

### Fetch mappings with joined course data

```typescript
const { data, error } = await supabase
  .from('course_mapping')
  .select(`
    id, course_id, institution_code, program_code, regulation_code,
    batch_code, semester_code, course_group, course_order,
    internal_max_mark, internal_pass_mark, internal_converted_mark,
    external_max_mark, external_pass_mark, external_converted_mark,
    total_max_mark, total_pass_mark, annual_semester, registration_based,
    is_active, courses_status, created_at,
    courses!course_id (id, course_code, course_title, course_type, credits)
  `)
  .eq('institution_code', institution_code)
  .eq('program_code', program_code)
  .eq('regulation_code', regulation_code)
  .eq('batch_code', batch_code)
  .eq('is_active', true)
  .order('semester_code', { ascending: true })
  .order('course_order', { ascending: true, nullsFirst: false })
  .range(0, 9999)
```

### Fetch semesters for a program

```typescript
const { data } = await supabase
  .from('semesters')
  .select('id, semester_code, semester_name, semester_number, semester_order, program_id')
  .eq('program_id', program.id)
  .order('semester_order', { ascending: true })
  .range(0, 9999)
```

### Fetch courses for combobox search

```typescript
const { data } = await supabase
  .from('courses')
  .select('id, course_code, course_title, course_type, credits')
  .eq('institution_code', institution_code)
  .eq('regulation_code', regulation_code)
  .ilike('course_title', `%${searchTerm}%`)
  .order('course_code', { ascending: true })
  .range(0, 999)
```

### Bulk status update

```typescript
const { data, error } = await supabase
  .from('course_mapping')
  .update({ courses_status: newStatus, updated_at: new Date().toISOString() })
  .in('id', ids)
  .select('id')
```

### Bulk delete

```typescript
const { error } = await supabase
  .from('course_mapping')
  .delete()
  .in('id', ids)
```

---

## Task 1 — Type additions

**Files:**
- Modify: `types/course-mapping.ts`

**Step 1: Add FilterState, MappingFormValues, EMPTY_FORM**

Append to `types/course-mapping.ts` exactly the types shown in the "Type Additions" section above.

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

**Step 3: Commit**

```bash
git add types/course-mapping.ts
git commit -m "feat(course-mapping): add FilterState and MappingFormValues types"
```

---

## Task 2 — Bulk PATCH API endpoint

**Files:**
- Modify: `app/api/course-management/course-mapping/route.ts`

**Step 1: Add PATCH handler at the bottom of route.ts**

```typescript
export async function PATCH(request: Request) {
  try {
    const supabase = getSupabaseServer()
    const body = await request.json()
    const { ids, action, courses_status } = body

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 })
    }
    if (!['status', 'delete'].includes(action)) {
      return NextResponse.json({ error: 'action must be "status" or "delete"' }, { status: 400 })
    }

    if (action === 'delete') {
      const { error } = await supabase.from('course_mapping').delete().in('id', ids)
      if (error) {
        console.error('Bulk delete error:', error)
        return NextResponse.json({ error: 'Bulk delete failed' }, { status: 500 })
      }
      return NextResponse.json({ data: { updated: ids.length } })
    }

    if (action === 'status') {
      if (!courses_status) {
        return NextResponse.json({ error: 'courses_status required for status action' }, { status: 400 })
      }
      const { data, error } = await supabase
        .from('course_mapping')
        .update({ courses_status, updated_at: new Date().toISOString() })
        .in('id', ids)
        .select('id')
      if (error) {
        console.error('Bulk status error:', error)
        return NextResponse.json({ error: 'Bulk status update failed' }, { status: 500 })
      }
      return NextResponse.json({ data: { updated: data?.length ?? 0 } })
    }
  } catch (err) {
    console.error('PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

**Step 2: Verify build**

```bash
npm run build 2>&1 | tail -20
```
Expected: no TypeScript errors in this route

**Step 3: Commit**

```bash
git add app/api/course-management/course-mapping/route.ts
git commit -m "feat(course-mapping): add bulk PATCH endpoint for status/delete"
```

---

## Task 3 — `useCourseMapping` hook

**Files:**
- Create: `hooks/use-course-mapping.ts`

**Step 1: Create the hook**

```typescript
'use client'

import { useState, useCallback } from 'react'
import { useToast } from '@/hooks/common/use-toast'
import type {
  CourseMapping, Semester, Program, Regulation,
  FilterState, MappingFormValues, CourseMappingStatus
} from '@/types/course-mapping'

export interface SemesterGroup {
  semester: Semester
  mappings: (CourseMapping & { courses?: { course_code: string; course_title: string; course_type: string; credits: number } })[]
  isOpen: boolean
}

export function useCourseMapping() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [semesterGroups, setSemesterGroups] = useState<SemesterGroup[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [regulations, setRegulations] = useState<Regulation[]>([])
  const [batches, setBatches] = useState<{ batch_code: string; batch_name: string }[]>([])
  const [courseOptions, setCourseOptions] = useState<{ id: string; course_code: string; course_title: string }[]>([])
  const [filter, setFilter] = useState<FilterState>({
    institution_code: '', program_code: '', regulation_code: '', batch_code: ''
  })
  const [loaded, setLoaded] = useState(false)

  const fetchPrograms = useCallback(async (institutionCode: string) => {
    if (!institutionCode) return
    const res = await fetch(`/api/course-management/programs?institution_code=${institutionCode}`)
    const json = await res.json()
    setPrograms(json.data || [])
  }, [])

  const fetchRegulations = useCallback(async (institutionCode: string, programCode: string) => {
    if (!institutionCode || !programCode) return
    const res = await fetch(`/api/course-management/regulations?institution_code=${institutionCode}&program_code=${programCode}`)
    const json = await res.json()
    setRegulations(json.data || [])
  }, [])

  const fetchBatches = useCallback(async (institutionCode: string, programCode: string) => {
    if (!institutionCode || !programCode) return
    const res = await fetch(`/api/course-management/batches?institution_code=${institutionCode}&program_code=${programCode}`)
    const json = await res.json()
    setBatches(json.data || [])
  }, [])

  const fetchCourseOptions = useCallback(async (institutionCode: string, regulationCode: string, search: string) => {
    if (!institutionCode || !regulationCode) return
    const params = new URLSearchParams({ institution_code: institutionCode, regulation_code: regulationCode, search })
    const res = await fetch(`/api/course-management/courses?${params}`)
    const json = await res.json()
    setCourseOptions(json.data || [])
  }, [])

  const loadMappings = useCallback(async (f: FilterState) => {
    if (!f.institution_code || !f.program_code || !f.regulation_code || !f.batch_code) {
      toast({ title: 'Select all filters to load mappings', variant: 'destructive' })
      return
    }
    setLoading(true)
    setLoaded(false)
    try {
      const params = new URLSearchParams({
        institution_code: f.institution_code,
        program_code: f.program_code,
        regulation_code: f.regulation_code,
        batch_code: f.batch_code,
      })
      const [mappingRes, semesterRes] = await Promise.all([
        fetch(`/api/course-management/course-mapping?${params}`),
        fetch(`/api/course-management/semesters?${params}`),
      ])
      const [mappingJson, semesterJson] = await Promise.all([mappingRes.json(), semesterRes.json()])
      const mappings: CourseMapping[] = mappingJson.data || []
      const semesters: Semester[] = semesterJson.data || []

      const groups: SemesterGroup[] = semesters.map((sem, idx) => ({
        semester: sem,
        mappings: mappings.filter(m => m.semester_code === sem.semester_code),
        isOpen: idx === 0,
      }))
      setSemesterGroups(groups)
      setLoaded(true)
    } catch {
      toast({ title: 'Failed to load mappings', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  const addMapping = useCallback(async (semesterCode: string, values: MappingFormValues): Promise<boolean> => {
    setSaving(true)
    try {
      const payload = { ...values, ...filter, semester_code: semesterCode }
      const res = await fetch('/api/course-management/course-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: json.error || 'Failed to add mapping', variant: 'destructive' })
        return false
      }
      setSemesterGroups(prev => prev.map(g =>
        g.semester.semester_code === semesterCode
          ? { ...g, mappings: [...g.mappings, json.data] }
          : g
      ))
      toast({ title: 'Course mapping added' })
      return true
    } catch {
      toast({ title: 'Failed to add mapping', variant: 'destructive' })
      return false
    } finally {
      setSaving(false)
    }
  }, [filter, toast])

  const updateMapping = useCallback(async (id: string, semesterCode: string, values: MappingFormValues): Promise<boolean> => {
    setSaving(true)
    try {
      const res = await fetch(`/api/course-management/course-mapping?id=${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: json.error || 'Failed to update', variant: 'destructive' })
        return false
      }
      setSemesterGroups(prev => prev.map(g =>
        g.semester.semester_code === semesterCode
          ? { ...g, mappings: g.mappings.map(m => m.id === id ? { ...m, ...json.data } : m) }
          : g
      ))
      toast({ title: 'Mapping updated' })
      return true
    } catch {
      toast({ title: 'Failed to update', variant: 'destructive' })
      return false
    } finally {
      setSaving(false)
    }
  }, [toast])

  const deleteMapping = useCallback(async (id: string, semesterCode: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/course-management/course-mapping?id=${id}`, { method: 'DELETE' })
      if (!res.ok) { toast({ title: 'Delete failed', variant: 'destructive' }); return false }
      setSemesterGroups(prev => prev.map(g =>
        g.semester.semester_code === semesterCode
          ? { ...g, mappings: g.mappings.filter(m => m.id !== id) }
          : g
      ))
      toast({ title: 'Mapping removed' })
      return true
    } catch {
      toast({ title: 'Delete failed', variant: 'destructive' })
      return false
    }
  }, [toast])

  const bulkAction = useCallback(async (ids: string[], action: 'status' | 'delete', courses_status?: CourseMappingStatus): Promise<boolean> => {
    try {
      const res = await fetch('/api/course-management/course-mapping', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action, courses_status }),
      })
      if (!res.ok) { toast({ title: 'Bulk action failed', variant: 'destructive' }); return false }
      if (action === 'delete') {
        setSemesterGroups(prev => prev.map(g => ({ ...g, mappings: g.mappings.filter(m => !ids.includes(m.id!)) })))
        toast({ title: `${ids.length} mapping(s) deleted` })
      } else {
        setSemesterGroups(prev => prev.map(g => ({
          ...g,
          mappings: g.mappings.map(m => ids.includes(m.id!) ? { ...m, courses_status } : m)
        })))
        toast({ title: `Status updated for ${ids.length} mapping(s)` })
      }
      return true
    } catch {
      toast({ title: 'Bulk action failed', variant: 'destructive' })
      return false
    }
  }, [toast])

  const toggleSemester = useCallback((semesterCode: string) => {
    setSemesterGroups(prev => prev.map(g =>
      g.semester.semester_code === semesterCode ? { ...g, isOpen: !g.isOpen } : g
    ))
  }, [])

  return {
    loading, saving, semesterGroups, programs, regulations, batches,
    courseOptions, filter, setFilter, loaded,
    fetchPrograms, fetchRegulations, fetchBatches, fetchCourseOptions,
    loadMappings, addMapping, updateMapping, deleteMapping, bulkAction, toggleSemester,
  }
}
```

**Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | grep use-course-mapping
```
Expected: no output (no errors)

**Step 3: Commit**

```bash
git add hooks/use-course-mapping.ts
git commit -m "feat(course-mapping): add useCourseMapping hook with full CRUD and bulk actions"
```

---

## Task 4 — `StatusBadge` component

**Files:**
- Create: `components/course-mapping/status-badge.tsx`

**Step 1: Create the component**

```typescript
import { Badge } from '@/components/ui/badge'
import type { CourseMappingStatus } from '@/types/course-mapping'

const CONFIG: Record<CourseMappingStatus, { label: string; className: string }> = {
  'Pending':      { label: 'Pending',      className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  'BOS Approved': { label: 'BOS Approved', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  'Locked':       { label: 'Locked',       className: 'bg-green-100 text-green-800 border-green-200' },
}

export function StatusBadge({ status }: { status: CourseMappingStatus }) {
  const cfg = CONFIG[status] ?? CONFIG['Pending']
  return <Badge variant="outline" className={cfg.className}>{cfg.label}</Badge>
}
```

**Step 2: Commit**

```bash
git add components/course-mapping/status-badge.tsx
git commit -m "feat(course-mapping): add StatusBadge component"
```

---

## Task 5 — `FilterBar` component

**Files:**
- Create: `components/course-mapping/filter-bar.tsx`

**Step 1: Create the component**

```typescript
'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import type { FilterState, Program, Regulation } from '@/types/course-mapping'

interface Props {
  filter: FilterState
  institutions: { id: string; institution_code: string; name: string }[]
  programs: Program[]
  regulations: Regulation[]
  batches: { batch_code: string; batch_name: string }[]
  canSwitchInstitution: boolean
  loading: boolean
  onFilterChange: (key: keyof FilterState, value: string) => void
  onLoad: () => void
}

export function FilterBar({
  filter, institutions, programs, regulations, batches,
  canSwitchInstitution, loading, onFilterChange, onLoad,
}: Props) {
  const allSelected = filter.institution_code && filter.program_code && filter.regulation_code && filter.batch_code

  return (
    <div className="flex flex-wrap items-end gap-3 p-4 bg-muted/30 rounded-lg border">
      {canSwitchInstitution && (
        <div className="flex flex-col gap-1.5 min-w-[160px]">
          <label className="text-xs font-medium text-muted-foreground">Institution</label>
          <Select value={filter.institution_code} onValueChange={v => onFilterChange('institution_code', v)}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Select institution" /></SelectTrigger>
            <SelectContent>
              {institutions.map(i => (
                <SelectItem key={i.id} value={i.institution_code}>{i.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex flex-col gap-1.5 min-w-[160px]">
        <label className="text-xs font-medium text-muted-foreground">Program</label>
        <Select value={filter.program_code} onValueChange={v => onFilterChange('program_code', v)} disabled={!filter.institution_code}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Select program" /></SelectTrigger>
          <SelectContent>
            {programs.map(p => (
              <SelectItem key={p.id} value={p.program_code}>{p.program_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5 min-w-[160px]">
        <label className="text-xs font-medium text-muted-foreground">Regulation</label>
        <Select value={filter.regulation_code} onValueChange={v => onFilterChange('regulation_code', v)} disabled={!filter.program_code}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Select regulation" /></SelectTrigger>
          <SelectContent>
            {regulations.map(r => (
              <SelectItem key={r.id} value={r.regulation_code}>{r.regulation_code} ({r.regulation_year})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5 min-w-[140px]">
        <label className="text-xs font-medium text-muted-foreground">Batch</label>
        <Select value={filter.batch_code} onValueChange={v => onFilterChange('batch_code', v)} disabled={!filter.program_code}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Select batch" /></SelectTrigger>
          <SelectContent>
            {batches.map(b => (
              <SelectItem key={b.batch_code} value={b.batch_code}>{b.batch_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button onClick={onLoad} disabled={!allSelected || loading} className="h-9 gap-1.5">
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        Load Mapping
      </Button>
    </div>
  )
}
```

**Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | grep filter-bar
```
Expected: no output

**Step 3: Commit**

```bash
git add components/course-mapping/filter-bar.tsx
git commit -m "feat(course-mapping): add FilterBar component"
```

---

## Task 6 — `MappingSheet` component

**Files:**
- Create: `components/course-mapping/mapping-sheet.tsx`

**Step 1: Create the component**

```typescript
'use client'

import { useState, useEffect } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { COURSE_GROUPS, COURSE_MAPPING_STATUS_OPTIONS, EMPTY_FORM } from '@/types/course-mapping'
import type { MappingFormValues, CourseMapping } from '@/types/course-mapping'

interface CourseOption { id: string; course_code: string; course_title: string }

interface Props {
  open: boolean
  semesterName: string
  editing: CourseMapping | null
  courseOptions: CourseOption[]
  saving: boolean
  onCourseSearch: (term: string) => void
  onSave: (values: MappingFormValues) => void
  onClose: () => void
}

function NumberInput({ label, value, onChange }: { label: string; value: number | ''; onChange: (v: number | '') => void }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number" min={0}
        value={value === '' ? '' : value}
        onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        className="h-8 w-full"
      />
    </div>
  )
}

export function MappingSheet({ open, semesterName, editing, courseOptions, saving, onCourseSearch, onSave, onClose }: Props) {
  const [form, setForm] = useState<MappingFormValues>(EMPTY_FORM)
  const [coursePopoverOpen, setCoursePopoverOpen] = useState(false)

  useEffect(() => {
    if (editing) {
      setForm({
        course_id: editing.course_id,
        course_group: editing.course_group || 'General',
        course_order: editing.course_order ?? '',
        internal_max_mark: editing.internal_max_mark ?? '',
        internal_pass_mark: editing.internal_pass_mark ?? '',
        internal_converted_mark: editing.internal_converted_mark ?? '',
        external_max_mark: editing.external_max_mark ?? '',
        external_pass_mark: editing.external_pass_mark ?? '',
        external_converted_mark: editing.external_converted_mark ?? '',
        total_max_mark: editing.total_max_mark ?? '',
        total_pass_mark: editing.total_pass_mark ?? '',
        registration_based: editing.registration_based ?? false,
        annual_semester: editing.annual_semester ?? false,
        courses_status: editing.courses_status || 'Pending',
        is_active: editing.is_active ?? true,
      })
    } else {
      setForm(EMPTY_FORM)
    }
  }, [editing, open])

  const set = <K extends keyof MappingFormValues>(key: K, val: MappingFormValues[K]) =>
    setForm(prev => ({ ...prev, [key]: val }))

  const selectedCourse = courseOptions.find(c => c.id === form.course_id)

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose() }}>
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{editing ? 'Edit' : 'Add'} Course Mapping — {semesterName}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-5 py-4">
          {/* Course combobox */}
          <div className="flex flex-col gap-1.5">
            <Label>Course <span className="text-destructive">*</span></Label>
            <Popover open={coursePopoverOpen} onOpenChange={setCoursePopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between h-9 font-normal">
                  {selectedCourse
                    ? `${selectedCourse.course_code} — ${selectedCourse.course_title}`
                    : 'Search course...'}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[440px] p-0">
                <Command>
                  <CommandInput placeholder="Type to search..." onValueChange={onCourseSearch} />
                  <CommandList>
                    <CommandEmpty>No courses found.</CommandEmpty>
                    <CommandGroup>
                      {courseOptions.map(c => (
                        <CommandItem
                          key={c.id}
                          value={`${c.course_code} ${c.course_title}`}
                          onSelect={() => { set('course_id', c.id); setCoursePopoverOpen(false) }}
                        >
                          <Check className={cn('mr-2 h-4 w-4', form.course_id === c.id ? 'opacity-100' : 'opacity-0')} />
                          <span className="font-mono text-xs mr-2">{c.course_code}</span>
                          {c.course_title}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Group + Order */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Course Group <span className="text-destructive">*</span></Label>
              <Select value={form.course_group} onValueChange={v => set('course_group', v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COURSE_GROUPS.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Course Order</Label>
              <Input type="number" min={1} value={form.course_order} onChange={e => set('course_order', e.target.value === '' ? '' : Number(e.target.value))} className="h-9" />
            </div>
          </div>

          {/* Internal marks */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Internal Marks</p>
            <div className="grid grid-cols-3 gap-2">
              <NumberInput label="Max" value={form.internal_max_mark} onChange={v => set('internal_max_mark', v)} />
              <NumberInput label="Pass" value={form.internal_pass_mark} onChange={v => set('internal_pass_mark', v)} />
              <NumberInput label="Converted" value={form.internal_converted_mark} onChange={v => set('internal_converted_mark', v)} />
            </div>
          </div>

          {/* External marks */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">External Marks</p>
            <div className="grid grid-cols-3 gap-2">
              <NumberInput label="Max" value={form.external_max_mark} onChange={v => set('external_max_mark', v)} />
              <NumberInput label="Pass" value={form.external_pass_mark} onChange={v => set('external_pass_mark', v)} />
              <NumberInput label="Converted" value={form.external_converted_mark} onChange={v => set('external_converted_mark', v)} />
            </div>
          </div>

          {/* Total marks */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Total</p>
            <div className="grid grid-cols-2 gap-2">
              <NumberInput label="Max" value={form.total_max_mark} onChange={v => set('total_max_mark', v)} />
              <NumberInput label="Pass" value={form.total_pass_mark} onChange={v => set('total_pass_mark', v)} />
            </div>
          </div>

          {/* Toggles */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label className="text-sm">Registration Based</Label>
              <Switch checked={form.registration_based} onCheckedChange={v => set('registration_based', v)} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label className="text-sm">Annual/Semester</Label>
              <Switch checked={form.annual_semester} onCheckedChange={v => set('annual_semester', v)} />
            </div>
          </div>

          {/* Status + Active */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <Select value={form.courses_status} onValueChange={v => set('courses_status', v as any)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COURSE_MAPPING_STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label className="text-sm">Active</Label>
              <Switch checked={form.is_active} onCheckedChange={v => set('is_active', v)} />
            </div>
          </div>
        </div>

        <SheetFooter className="pt-2 border-t">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={saving || !form.course_id}>
            {saving ? 'Saving...' : 'Save Mapping'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
```

**Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | grep mapping-sheet
```

**Step 3: Commit**

```bash
git add components/course-mapping/mapping-sheet.tsx
git commit -m "feat(course-mapping): add MappingSheet slide-over form component"
```

---

## Task 7 — `BulkActionMenu` component

**Files:**
- Create: `components/course-mapping/bulk-action-menu.tsx`

**Step 1: Create the component**

```typescript
'use client'

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { ChevronDown, CheckCircle2, Lock, Trash2 } from 'lucide-react'
import type { CourseMappingStatus } from '@/types/course-mapping'

interface Props {
  selectedCount: number
  onStatusChange: (status: CourseMappingStatus) => void
  onDelete: () => void
}

export function BulkActionMenu({ selectedCount, onStatusChange, onDelete }: Props) {
  if (selectedCount === 0) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1">
          {selectedCount} selected <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onStatusChange('BOS Approved')} className="gap-2">
          <CheckCircle2 className="h-4 w-4 text-blue-600" /> Mark BOS Approved
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onStatusChange('Locked')} className="gap-2">
          <Lock className="h-4 w-4 text-green-600" /> Mark Locked
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onStatusChange('Pending')} className="gap-2">
          <CheckCircle2 className="h-4 w-4 text-yellow-600" /> Reset to Pending
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="gap-2 text-destructive focus:text-destructive">
          <Trash2 className="h-4 w-4" /> Delete Selected
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

**Step 2: Commit**

```bash
git add components/course-mapping/bulk-action-menu.tsx
git commit -m "feat(course-mapping): add BulkActionMenu component"
```

---

## Task 8 — `MappingTable` component

**Files:**
- Create: `components/course-mapping/mapping-table.tsx`

**Step 1: Create the component**

```typescript
'use client'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Edit, Trash2 } from 'lucide-react'
import { StatusBadge } from './status-badge'
import type { CourseMapping } from '@/types/course-mapping'

type MappingWithCourse = CourseMapping & {
  courses?: { course_code: string; course_title: string; course_type: string; credits: number }
}

interface Props {
  mappings: MappingWithCourse[]
  selectedIds: Set<string>
  onSelectAll: (checked: boolean) => void
  onSelectRow: (id: string, checked: boolean) => void
  onEdit: (mapping: MappingWithCourse) => void
  onDelete: (id: string) => void
}

export function MappingTable({ mappings, selectedIds, onSelectAll, onSelectRow, onEdit, onDelete }: Props) {
  const allSelected = mappings.length > 0 && mappings.every(m => selectedIds.has(m.id!))
  const someSelected = mappings.some(m => selectedIds.has(m.id!)) && !allSelected

  return (
    <div className="rounded-md border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-10">
              <Checkbox
                checked={allSelected}
                ref={el => { if (el) (el as any).indeterminate = someSelected }}
                onCheckedChange={v => onSelectAll(!!v)}
              />
            </TableHead>
            <TableHead className="w-32">Code</TableHead>
            <TableHead>Title</TableHead>
            <TableHead className="w-28">Group</TableHead>
            <TableHead className="w-20 text-center">Int Max</TableHead>
            <TableHead className="w-20 text-center">Ext Max</TableHead>
            <TableHead className="w-20 text-center">Total</TableHead>
            <TableHead className="w-32">Status</TableHead>
            <TableHead className="w-20 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mappings.map(m => (
            <TableRow key={m.id} className="cursor-pointer hover:bg-muted/30" onClick={() => onEdit(m)}>
              <TableCell onClick={e => e.stopPropagation()}>
                <Checkbox
                  checked={selectedIds.has(m.id!)}
                  onCheckedChange={v => onSelectRow(m.id!, !!v)}
                />
              </TableCell>
              <TableCell className="font-mono text-xs">{m.courses?.course_code ?? '—'}</TableCell>
              <TableCell className="max-w-[200px] truncate" title={m.courses?.course_title}>{m.courses?.course_title ?? '—'}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{m.course_group ?? '—'}</TableCell>
              <TableCell className="text-center text-sm">{m.internal_max_mark ?? '—'}</TableCell>
              <TableCell className="text-center text-sm">{m.external_max_mark ?? '—'}</TableCell>
              <TableCell className="text-center text-sm">{m.total_max_mark ?? '—'}</TableCell>
              <TableCell><StatusBadge status={m.courses_status ?? 'Pending'} /></TableCell>
              <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(m)}>
                  <Edit className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(m.id!)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add components/course-mapping/mapping-table.tsx
git commit -m "feat(course-mapping): add MappingTable with checkboxes and row actions"
```

---

## Task 9 — `SemesterSection` component

**Files:**
- Create: `components/course-mapping/semester-section.tsx`

**Step 1: Create the component**

```typescript
'use client'

import { useState } from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { MappingTable } from './mapping-table'
import { BulkActionMenu } from './bulk-action-menu'
import type { SemesterGroup } from '@/hooks/use-course-mapping'
import type { CourseMapping, CourseMappingStatus } from '@/types/course-mapping'

type MappingWithCourse = CourseMapping & {
  courses?: { course_code: string; course_title: string; course_type: string; credits: number }
}

interface Props {
  group: SemesterGroup
  onToggle: () => void
  onAddCourse: () => void
  onEdit: (mapping: MappingWithCourse) => void
  onDelete: (id: string) => void
  onBulkStatus: (ids: string[], status: CourseMappingStatus) => void
  onBulkDelete: (ids: string[]) => void
}

export function SemesterSection({ group, onToggle, onAddCourse, onEdit, onDelete, onBulkStatus, onBulkDelete }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const { semester, mappings, isOpen } = group

  const handleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(mappings.map(m => m.id!)) : new Set())
  }
  const handleSelectRow = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      checked ? next.add(id) : next.delete(id)
      return next
    })
  }

  const selectedArray = Array.from(selectedIds)

  return (
    <Collapsible open={isOpen} onOpenChange={onToggle} className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/40 transition-colors">
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-2 text-sm font-semibold flex-1 text-left">
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            {semester.semester_name}
            <Badge variant="secondary" className="ml-1 font-mono text-xs">{mappings.length}</Badge>
          </button>
        </CollapsibleTrigger>
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          <BulkActionMenu
            selectedCount={selectedArray.length}
            onStatusChange={status => onBulkStatus(selectedArray, status)}
            onDelete={() => onBulkDelete(selectedArray)}
          />
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={onAddCourse}>
            <Plus className="h-3.5 w-3.5" /> Add Course
          </Button>
        </div>
      </div>

      <CollapsibleContent>
        {mappings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
            <p className="text-sm">No courses mapped to this semester yet.</p>
            <Button size="sm" variant="outline" onClick={onAddCourse} className="gap-1">
              <Plus className="h-3.5 w-3.5" /> Add First Course
            </Button>
          </div>
        ) : (
          <div className="p-3">
            <MappingTable
              mappings={mappings as MappingWithCourse[]}
              selectedIds={selectedIds}
              onSelectAll={handleSelectAll}
              onSelectRow={handleSelectRow}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
```

**Step 2: Commit**

```bash
git add components/course-mapping/semester-section.tsx
git commit -m "feat(course-mapping): add SemesterSection collapsible with bulk actions"
```

---

## Task 10 — Redesigned `page.tsx`

**Files:**
- Replace: `app/(coe)/course-management/course-mapping/page.tsx`

**Step 1: Replace page.tsx with the thin orchestrator**

```typescript
'use client'

import { useState, useCallback, useEffect } from 'react'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useInstitution } from '@/context/institution-context'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink,
  BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator
} from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'
import { FilterBar } from '@/components/course-mapping/filter-bar'
import { SemesterSection } from '@/components/course-mapping/semester-section'
import { MappingSheet } from '@/components/course-mapping/mapping-sheet'
import { useCourseMapping } from '@/hooks/use-course-mapping'
import type { CourseMapping, FilterState, MappingFormValues, CourseMappingStatus } from '@/types/course-mapping'

type MappingWithCourse = CourseMapping & {
  courses?: { course_code: string; course_title: string; course_type: string; credits: number }
}

export default function CourseMappingPage() {
  const { institutionCode: contextCode, isReady, mustSelectInstitution } = useInstitutionFilter()
  const { availableInstitutions, canSwitchInstitution } = useInstitution()

  const {
    loading, saving, semesterGroups, programs, regulations, batches,
    courseOptions, filter, setFilter, loaded,
    fetchPrograms, fetchRegulations, fetchBatches, fetchCourseOptions,
    loadMappings, addMapping, updateMapping, deleteMapping, bulkAction, toggleSemester,
  } = useCourseMapping()

  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false)
  const [activeSemesterCode, setActiveSemesterCode] = useState('')
  const [activeSemesterName, setActiveSemesterName] = useState('')
  const [editingMapping, setEditingMapping] = useState<MappingWithCourse | null>(null)

  // Sync institution from context for non-super-admins
  useEffect(() => {
    if (isReady && contextCode && !canSwitchInstitution) {
      handleFilterChange('institution_code', contextCode)
    }
  }, [isReady, contextCode, canSwitchInstitution])

  const handleFilterChange = useCallback((key: keyof FilterState, value: string) => {
    setFilter(prev => {
      const next = { ...prev, [key]: value }
      if (key === 'institution_code') { next.program_code = ''; next.regulation_code = ''; next.batch_code = '' }
      if (key === 'program_code') { next.regulation_code = ''; next.batch_code = '' }
      return next
    })
    if (key === 'institution_code') fetchPrograms(value)
    if (key === 'program_code') {
      fetchRegulations(filter.institution_code, value)
      fetchBatches(filter.institution_code, value)
    }
  }, [filter.institution_code, fetchPrograms, fetchRegulations, fetchBatches, setFilter])

  const openAdd = (semesterCode: string, semesterName: string) => {
    setEditingMapping(null)
    setActiveSemesterCode(semesterCode)
    setActiveSemesterName(semesterName)
    setSheetOpen(true)
  }

  const openEdit = (mapping: MappingWithCourse, semesterCode: string, semesterName: string) => {
    setEditingMapping(mapping)
    setActiveSemesterCode(semesterCode)
    setActiveSemesterName(semesterName)
    setSheetOpen(true)
  }

  const handleSave = async (values: MappingFormValues) => {
    let ok: boolean
    if (editingMapping?.id) {
      ok = await updateMapping(editingMapping.id, activeSemesterCode, values)
    } else {
      ok = await addMapping(activeSemesterCode, values)
    }
    if (ok) setSheetOpen(false)
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <main className="flex-1 p-6 space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink href="/">Home</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="/course-management">Course Management</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>Course Mapping</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <Card>
            <CardHeader>
              <CardTitle>Course Mapping</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {mustSelectInstitution && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>Select an institution before managing course mappings.</AlertDescription>
                </Alert>
              )}

              <FilterBar
                filter={filter}
                institutions={availableInstitutions.map(i => ({ id: i.id, institution_code: i.institution_code, name: i.name }))}
                programs={programs}
                regulations={regulations}
                batches={batches}
                canSwitchInstitution={canSwitchInstitution}
                loading={loading}
                onFilterChange={handleFilterChange}
                onLoad={() => loadMappings(filter)}
              />

              {loaded && semesterGroups.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                  <p>No semesters found for this program and regulation.</p>
                </div>
              )}

              <div className="space-y-3">
                {semesterGroups.map(group => (
                  <SemesterSection
                    key={group.semester.semester_code}
                    group={group}
                    onToggle={() => toggleSemester(group.semester.semester_code)}
                    onAddCourse={() => openAdd(group.semester.semester_code, group.semester.semester_name)}
                    onEdit={m => openEdit(m as MappingWithCourse, group.semester.semester_code, group.semester.semester_name)}
                    onDelete={id => deleteMapping(id, group.semester.semester_code)}
                    onBulkStatus={(ids, status) => bulkAction(ids, 'status', status)}
                    onBulkDelete={ids => bulkAction(ids, 'delete')}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </main>
        <AppFooter />

        <MappingSheet
          open={sheetOpen}
          semesterName={activeSemesterName}
          editing={editingMapping}
          courseOptions={courseOptions}
          saving={saving}
          onCourseSearch={term => fetchCourseOptions(filter.institution_code, filter.regulation_code, term)}
          onSave={handleSave}
          onClose={() => setSheetOpen(false)}
        />
      </SidebarInset>
    </SidebarProvider>
  )
}
```

**Step 2: Verify build**

```bash
npm run build 2>&1 | tail -30
```
Expected: no errors for course-mapping page

**Step 3: Commit**

```bash
git add app/(coe)/course-management/course-mapping/page.tsx
git commit -m "feat(course-mapping): replace monolith page with clean orchestrator (80 lines)"
```

---

## Task 11 — Wire up institution context on page load

**No new files.** Verify the `useEffect` in `page.tsx` (Task 10, Step 1) correctly sets `institution_code` from context so non-super-admins never see the institution dropdown and auto-load their institution's programs.

**Step 1: Verify in browser**
- Log in as a non-super-admin → institution_code must be pre-filled
- Log in as super_admin → Institution dropdown must be visible and empty

---

## Task 12 — Delete confirmation dialog

Add a simple `AlertDialog` confirmation before single-row delete and bulk delete.

**Files:**
- Modify: `app/(coe)/course-management/course-mapping/page.tsx`

**Step 1: Add confirmation state**

```typescript
const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; ids: string[]; semesterCode: string }>({
  open: false, ids: [], semesterCode: ''
})
```

**Step 2: Replace direct delete calls with confirmation trigger**

In `onDelete` prop of `SemesterSection`:
```typescript
onDelete={id => setDeleteConfirm({ open: true, ids: [id], semesterCode: group.semester.semester_code })}
onBulkDelete={ids => setDeleteConfirm({ open: true, ids, semesterCode: group.semester.semester_code })}
```

**Step 3: Add AlertDialog to page JSX**

```typescript
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'

// Inside JSX after MappingSheet:
<AlertDialog open={deleteConfirm.open} onOpenChange={open => setDeleteConfirm(prev => ({ ...prev, open }))}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete {deleteConfirm.ids.length > 1 ? `${deleteConfirm.ids.length} mappings` : 'mapping'}?</AlertDialogTitle>
      <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction
        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        onClick={async () => {
          if (deleteConfirm.ids.length === 1) {
            await deleteMapping(deleteConfirm.ids[0], deleteConfirm.semesterCode)
          } else {
            await bulkAction(deleteConfirm.ids, 'delete')
          }
          setDeleteConfirm({ open: false, ids: [], semesterCode: '' })
        }}
      >
        Delete
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

**Step 4: Commit**

```bash
git add app/(coe)/course-management/course-mapping/page.tsx
git commit -m "feat(course-mapping): add delete confirmation dialog for single and bulk delete"
```

---

## Edge Cases & Validation Rules

| Case | Handling |
|------|----------|
| Filters not fully selected | Load button disabled; toast on direct call |
| Duplicate mapping (same course + semester) | API returns 409 → toast "Already mapped" |
| Locked status change | Warn user via AlertDialog before allowing edit |
| super_admin views "All Institutions" | `mustSelectInstitution` alert shown, load blocked |
| Course search returns 0 results | CommandEmpty shown in combobox |
| Bulk delete 0 items | BulkActionMenu hidden when `selectedCount === 0` |
| Semester with 0 courses | Empty state with "Add First Course" button |
| Network failure on load | Toast error, `semesterGroups` unchanged |
| `course_order` omitted | Stored as null; table shows "—" |
| Annual vs Semester mode | `annual_semester: true` → show notice in mark fields |

---

## Implementation Order

```
Task 1  → types/course-mapping.ts additions
Task 2  → Bulk PATCH API endpoint
Task 3  → useCourseMapping hook
Task 4  → StatusBadge
Task 5  → FilterBar
Task 6  → MappingSheet
Task 7  → BulkActionMenu
Task 8  → MappingTable
Task 9  → SemesterSection
Task 10 → Redesigned page.tsx
Task 11 → Institution context verification
Task 12 → Delete confirmation dialog
```

Total: ~12 focused commits, each independently verifiable.

---

**Plan saved.** Two execution options:

**1. Subagent-Driven (this session)** — dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** — open new session with executing-plans skill, batch execution with checkpoints

Which approach?
