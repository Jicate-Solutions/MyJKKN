'use client';

// components/events/shared/member-picker-dialog.tsx
// MyJKKN user picker used by event committees (multi-select dialog) and the
// volunteer check-in form (single-select, embedded). Members must be real MyJKKN
// users (staff or current students); free-text entry is reserved for external
// guests. Flow: pick a role (Staff / Student) → search and/or narrow with
// cascading academic filters (Institution → Degree → Department → Program →
// Semester for students; Institution → Department for staff) → select.
//
// People come from the auth-gated /api/events/committees/member-directory route
// (service-role read + institution scope), NOT direct table reads — organizer
// roles often lack staff.*/learners.* RLS grants, which silently empties
// client-side queries. Lookup tables (institutions/degrees/departments/programs/
// semesters) are broadly readable, so those load client-side like every other
// dropdown in the app.
//
// Exports:
//   <MemberDirectoryPicker>  role tabs + search + filters + results (controlled selection)
//   <MemberPickerDialog>     the multi-select dialog wrapper (committees, in-charges)

import { useEffect, useMemo, useState } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  Search,
  Check,
  GraduationCap,
  Briefcase,
  SlidersHorizontal,
} from 'lucide-react';

export type DirectoryRole = 'staff' | 'student';

export interface DirectoryHit {
  id: string;
  member_id: string;
  name: string;
  email: string | null;
  subtitle: string;
  role: DirectoryRole;
}

export interface PickedMember {
  member_id: string;
  name: string;
}

interface LookupRow {
  id: string;
  name: string;
  institution_id?: string | null;
  department_id?: string | null;
  degree_id?: string | null;
  program_id?: string | null;
}

const ALL = 'all';

// ─── Directory picker (role tabs + search + filters + results) ───────────────
// Selection is CONTROLLED: the parent owns what is picked and renders any chips.

export function MemberDirectoryPicker({
  selectedIds,
  onPick,
  existingNames = [],
  maxHeightClass = '',
}: {
  selectedIds: ReadonlySet<string>;
  onPick: (hit: DirectoryHit) => void;
  /** Names already on the committee / roster — shown disabled. */
  existingNames?: string[];
  /** e.g. "max-h-56 overflow-y-auto" when the host has no outer scroll region. */
  maxHeightClass?: string;
}) {
  const [role, setRole] = useState<DirectoryRole>('staff');
  const [q, setQ] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    institution_id: ALL,
    degree_id: ALL,
    department_id: ALL,
    program_id: ALL,
    semester_id: ALL,
  });

  const [institutions, setInstitutions] = useState<LookupRow[]>([]);
  const [degrees, setDegrees] = useState<LookupRow[]>([]);
  const [departments, setDepartments] = useState<LookupRow[]>([]);
  const [programs, setPrograms] = useState<LookupRow[]>([]);
  const [semesters, setSemesters] = useState<LookupRow[]>([]);

  const [results, setResults] = useState<DirectoryHit[]>([]);
  const [loading, setLoading] = useState(false);

  const existingNameSet = useMemo(
    () => new Set(existingNames.map((n) => n.toLowerCase())),
    [existingNames]
  );

  // Base lookups (institutions / degrees / departments) — once per mount.
  useEffect(() => {
    const supabase = createClientSupabaseClient();
    let active = true;
    (async () => {
      const [instRes, degRes, deptRes] = await Promise.all([
        (supabase as any).from('institutions').select('id, name').order('name'),
        (supabase as any).from('degrees').select('id, degree_name, institution_id').order('degree_name'),
        (supabase as any)
          .from('departments')
          .select('id, department_name, institution_id')
          .order('department_name'),
      ]);
      if (!active) return;
      setInstitutions((instRes.data ?? []).map((r: any) => ({ id: r.id, name: r.name })));
      setDegrees(
        (degRes.data ?? []).map((r: any) => ({
          id: r.id,
          name: r.degree_name,
          institution_id: r.institution_id,
        }))
      );
      setDepartments(
        (deptRes.data ?? []).map((r: any) => ({
          id: r.id,
          name: r.department_name,
          institution_id: r.institution_id,
        }))
      );
    })();
    return () => {
      active = false;
    };
  }, []);

  // Programs — when degree/department narrows (students only).
  useEffect(() => {
    if (role !== 'student') return;
    const supabase = createClientSupabaseClient();
    let active = true;
    let query = (supabase as any).from('programs').select('id, program_name, department_id, degree_id');
    if (filters.department_id !== ALL) query = query.eq('department_id', filters.department_id);
    if (filters.degree_id !== ALL) query = query.eq('degree_id', filters.degree_id);
    query.order('program_name').then(({ data }: any) => {
      if (active) setPrograms((data ?? []).map((r: any) => ({ id: r.id, name: r.program_name })));
    });
    return () => {
      active = false;
    };
  }, [role, filters.degree_id, filters.department_id]);

  // Semesters — when a program is chosen.
  useEffect(() => {
    if (role !== 'student' || filters.program_id === ALL) {
      setSemesters([]);
      return;
    }
    const supabase = createClientSupabaseClient();
    let active = true;
    (supabase as any)
      .from('semesters')
      .select('id, semester_name, program_id')
      .eq('program_id', filters.program_id)
      .order('semester_name')
      .then(({ data }: any) => {
        if (active) setSemesters((data ?? []).map((r: any) => ({ id: r.id, name: r.semester_name })));
      });
    return () => {
      active = false;
    };
  }, [role, filters.program_id]);

  // Directory search — debounced on role / search / filters.
  useEffect(() => {
    const term = q.trim();
    const hasCriteria = term.length >= 2 || filters.institution_id !== ALL;
    if (!hasCriteria) {
      setResults([]);
      return;
    }
    let active = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ role });
        if (term.length >= 2) params.set('q', term);
        for (const [k, v] of Object.entries(filters)) {
          if (v !== ALL) params.set(k, v);
        }
        const res = await fetch(`/api/events/committees/member-directory?${params.toString()}`);
        const json = await res.json().catch(() => ({}));
        if (active) setResults(json.results ?? []);
      } catch {
        if (active) setResults([]);
      } finally {
        if (active) setLoading(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [role, q, filters]);

  const switchRole = (r: DirectoryRole) => {
    setRole(r);
    setFilters((f) => ({
      institution_id: f.institution_id,
      degree_id: ALL,
      department_id: ALL,
      program_id: ALL,
      semester_id: ALL,
    }));
  };

  const setFilter = (key: keyof typeof filters, value: string) => {
    setFilters((f) => {
      const next = { ...f, [key]: value };
      // Cascade resets downstream of the changed level.
      if (key === 'institution_id') {
        next.degree_id = ALL;
        next.department_id = ALL;
        next.program_id = ALL;
        next.semester_id = ALL;
      } else if (key === 'degree_id' || key === 'department_id') {
        next.program_id = ALL;
        next.semester_id = ALL;
      } else if (key === 'program_id') {
        next.semester_id = ALL;
      }
      return next;
    });
  };

  const visibleDegrees =
    filters.institution_id !== ALL
      ? degrees.filter((d) => d.institution_id === filters.institution_id)
      : degrees;
  const visibleDepartments =
    filters.institution_id !== ALL
      ? departments.filter((d) => d.institution_id === filters.institution_id)
      : departments;

  const FilterSelect = ({
    label,
    value,
    onChange,
    options,
    allLabel,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    options: LookupRow[];
    allLabel: string;
  }) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Role */}
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Member role">
        {(
          [
            { key: 'staff', label: 'Staff', icon: Briefcase },
            { key: 'student', label: 'Student', icon: GraduationCap },
          ] as const
        ).map((r) => (
          <button
            key={r.key}
            type="button"
            role="radio"
            aria-checked={role === r.key}
            onClick={() => switchRole(r.key)}
            className={`flex h-10 items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-colors ${
              role === r.key
                ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            <r.icon
              className={`h-4 w-4 ${role === r.key ? 'text-emerald-600 dark:text-emerald-400' : ''}`}
            />
            {r.label}
          </button>
        ))}
      </div>

      {/* Search + filter toggle */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={
              role === 'staff'
                ? 'Search staff by name or email'
                : 'Search students by name, register no or email'
            }
          />
        </div>
        <Button
          type="button"
          variant={showFilters ? 'secondary' : 'outline'}
          className="h-10 shrink-0 gap-1.5 px-3 text-xs"
          aria-expanded={showFilters}
          onClick={() => setShowFilters((v) => !v)}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
        </Button>
      </div>

      {/* Advanced filters — Institution always; then per-role dimensions. */}
      {showFilters && (
        <div className="grid grid-cols-1 gap-3 rounded-lg border p-3 min-[440px]:grid-cols-2">
          <FilterSelect
            label="Institution"
            value={filters.institution_id}
            onChange={(v) => setFilter('institution_id', v)}
            options={institutions}
            allLabel="All institutions"
          />
          {role === 'student' && (
            <FilterSelect
              label="Degree"
              value={filters.degree_id}
              onChange={(v) => setFilter('degree_id', v)}
              options={visibleDegrees}
              allLabel="All degrees"
            />
          )}
          <FilterSelect
            label="Department"
            value={filters.department_id}
            onChange={(v) => setFilter('department_id', v)}
            options={visibleDepartments}
            allLabel="All departments"
          />
          {role === 'student' && (
            <>
              <FilterSelect
                label="Program"
                value={filters.program_id}
                onChange={(v) => setFilter('program_id', v)}
                options={programs}
                allLabel="All programs"
              />
              <FilterSelect
                label="Semester"
                value={filters.semester_id}
                onChange={(v) => setFilter('semester_id', v)}
                options={semesters}
                allLabel={filters.program_id === ALL ? 'Pick a program first' : 'All semesters'}
              />
            </>
          )}
        </div>
      )}

      {/* Results */}
      <div className={`rounded-lg border ${maxHeightClass}`}>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : results.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-muted-foreground">
            {q.trim().length >= 2 || filters.institution_id !== ALL
              ? `No matching ${role === 'staff' ? 'staff' : 'students'} found.`
              : 'Type at least 2 characters, or pick an institution to browse.'}
          </p>
        ) : (
          results.map((hit) => {
            const isSelected = selectedIds.has(hit.member_id);
            const alreadyMember = existingNameSet.has(hit.name.toLowerCase());
            return (
              <button
                key={hit.member_id}
                type="button"
                disabled={alreadyMember}
                onClick={() => onPick(hit)}
                aria-pressed={isSelected}
                className={`flex w-full items-center gap-3 border-b px-3 py-2.5 text-left last:border-0 disabled:opacity-50 ${
                  isSelected ? 'bg-emerald-50/60 dark:bg-emerald-950/40' : 'hover:bg-accent'
                }`}
              >
                <span
                  aria-hidden
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    isSelected
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-muted-foreground/40'
                  }`}
                >
                  {isSelected && <Check className="h-3 w-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {hit.name}
                    {alreadyMember && (
                      <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                        already added
                      </span>
                    )}
                  </span>
                  {hit.subtitle && (
                    <span className="block truncate text-xs text-muted-foreground">{hit.subtitle}</span>
                  )}
                  {hit.email && (
                    <span className="block truncate text-xs text-muted-foreground">{hit.email}</span>
                  )}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Multi-select dialog (committees, tournament in-charges) ─────────────────

function PickerBody({
  onClose,
  onAdd,
  isAdding,
  existingNames,
}: {
  onClose: () => void;
  onAdd: (people: PickedMember[]) => void;
  isAdding: boolean;
  existingNames: string[];
}) {
  const [selected, setSelected] = useState<Map<string, PickedMember>>(new Map());

  const toggle = (hit: DirectoryHit) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(hit.member_id)) next.delete(hit.member_id);
      else next.set(hit.member_id, { member_id: hit.member_id, name: hit.name });
      return next;
    });
  };

  return (
    <>
      {/* Single scroll region: role/search/filters/chips/results scroll together;
          the dialog header and footer stay pinned. */}
      <div className="-mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto px-1 py-1">
        {selected.size > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {[...selected.values()].map((p) => (
              <Badge key={p.member_id} variant="secondary" className="gap-1 text-[11px]">
                {p.name}
                <button
                  type="button"
                  className="ml-0.5 text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    setSelected((prev) => {
                      const next = new Map(prev);
                      next.delete(p.member_id);
                      return next;
                    })
                  }
                  aria-label={`Remove ${p.name}`}
                >
                  ×
                </button>
              </Badge>
            ))}
          </div>
        )}

        <MemberDirectoryPicker
          selectedIds={new Set(selected.keys())}
          onPick={toggle}
          existingNames={existingNames}
        />
      </div>

      <DialogFooter className="shrink-0 gap-2 border-t pt-3 sm:gap-0">
        <Button
          variant="outline"
          className="w-full sm:w-auto"
          onClick={onClose}
          disabled={isAdding}
        >
          Cancel
        </Button>
        <Button
          className="w-full sm:w-auto"
          onClick={() => onAdd([...selected.values()])}
          disabled={isAdding || selected.size === 0}
        >
          {isAdding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Add {selected.size > 0 ? `${selected.size} ` : ''}Member{selected.size === 1 ? '' : 's'}
        </Button>
      </DialogFooter>
    </>
  );
}

export function MemberPickerDialog({
  open,
  onClose,
  onAdd,
  isAdding = false,
  committeeName,
  existingNames = [],
  title,
  description,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (people: PickedMember[]) => void;
  isAdding?: boolean;
  committeeName?: string;
  existingNames?: string[];
  /**
   * Overrides the default "Add Committee Members" heading. The picker is also
   * used to appoint event in-charges, where that title names the wrong thing.
   */
  title?: string;
  /** Overrides the default blurb under the title. */
  description?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-lg p-4 sm:max-h-[85dvh] sm:w-full sm:max-w-xl sm:p-6">
        <DialogHeader className="shrink-0">
          <DialogTitle className="pr-6 text-base sm:text-lg">
            {title ?? `Add Committee Members${committeeName ? ` — ${committeeName}` : ''}`}
          </DialogTitle>
        </DialogHeader>
        <p className="shrink-0 text-xs text-muted-foreground">
          {description ??
            'Members must be MyJKKN users. For outside people (guest referees, parent volunteers) use the Guest option instead.'}
        </p>
        {open && (
          <PickerBody
            key={committeeName ?? 'picker'}
            onClose={onClose}
            onAdd={onAdd}
            isAdding={isAdding}
            existingNames={existingNames}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
