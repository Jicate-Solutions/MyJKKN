'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Loader2, Lock, Save } from 'lucide-react';
import type { Language } from './language-toggle';
import {
  QUOTA_OPTIONS,
  ENTRY_TYPE_OPTIONS,
} from '@/lib/constants/learner-dropdown-values';

interface Props {
  lang: Language;
  data: Record<string, any>;
  token: string;
  onContinue: (fields: Record<string, any>) => void;
  onSaveDraft: (fields: Record<string, any>) => void;
  onBack: () => void;
  submitting: boolean;
}

interface InstitutionRow {
  id: string;
  name: string;
}
interface DegreeRow {
  id: string;
  degree_name: string;
}
interface ProgramRow {
  id: string;
  program_name: string;
  department_id: string;
}
interface SemesterRow {
  id: string;
  semester_name: string;
  semester_code: string;
  semester_order: number | null;
  initial_semester: boolean | null;
}
interface DepartmentRow {
  id: string;
  department_name: string;
}

function Req() {
  return <span className="text-red-500 ml-0.5">*</span>;
}

function Section({
  title,
  children,
}: {
  title: { en: string; ta: string };
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 border-t pt-5">
      <h3 className="text-base font-semibold text-foreground">
        {title.en}{' '}
        <span className="text-muted-foreground font-normal">/ {title.ta}</span>
      </h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  helper,
  children,
}: {
  label: string;
  required?: boolean;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {label}
        {required && <Req />}
      </Label>
      {children}
      {helper && <p className="text-xs text-muted-foreground">{helper}</p>}
    </div>
  );
}

// Compute auto-pick semester id from entry_type + the semester list.
// Returns undefined when no rule applies (manual selection only).
function autoPickSemester(
  entryType: string,
  semesters: SemesterRow[],
): string | undefined {
  if (semesters.length === 0) return undefined;
  const sorted = [...semesters].sort(
    (a, b) => (a.semester_order ?? 0) - (b.semester_order ?? 0),
  );
  if (entryType === 'FIRST YEAR') {
    const target = sorted.find((s) => s.initial_semester === true) ?? sorted[0];
    return target?.id;
  }
  if (entryType === 'LATERAL ENTRY') {
    const isYearBased = /year/i.test(sorted[0]?.semester_name ?? '');
    const targetOrder = isYearBased ? 2 : 3;
    const target =
      sorted.find((s) => s.semester_order === targetOrder) ??
      sorted[isYearBased ? 1 : 2];
    return target?.id;
  }
  return undefined;
}

export function StepCourseSelection({
  data,
  token,
  onContinue,
  onSaveDraft,
  onBack,
  submitting,
}: Props) {
  // Form state pre-filled from learners_profiles (the conversion bridge
  // sets institution_id always; degree/department/program/semester may be
  // null on legacy leads — student fills them in).
  const [v, setV] = useState({
    quota: data.quota ?? '',
    institution_id: data.institution_id ?? '',
    degree_id: data.degree_id ?? '',
    department_id: data.department_id ?? '',
    program_id: data.program_id ?? '',
    entry_type: data.entry_type ?? '',
    semester_id: data.semester_id ?? '',
  });
  const set = <K extends keyof typeof v>(k: K, val: typeof v[K]) =>
    setV((p) => ({ ...p, [k]: val }));

  // Dropdown caches. Each fetches via the token-validated options endpoint
  // when its parent selection changes.
  const [institutions, setInstitutions] = useState<InstitutionRow[]>([]);
  const [degrees, setDegrees] = useState<DegreeRow[]>([]);
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [semesters, setSemesters] = useState<SemesterRow[]>([]);
  const [department, setDepartment] = useState<DepartmentRow | null>(null);

  const [loadingI, setLoadingI] = useState(false);
  const [loadingD, setLoadingD] = useState(false);
  const [loadingP, setLoadingP] = useState(false);
  const [loadingS, setLoadingS] = useState(false);
  const [loadingDept, setLoadingDept] = useState(false);

  async function fetchOptions(
    kind: 'institutions' | 'degrees' | 'programs' | 'semesters' | 'department',
    filters?: Record<string, string>,
  ) {
    const res = await fetch(`/api/student-form/${encodeURIComponent(token)}/course-options`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, filters }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data;
  }

  // Load institutions on mount
  useEffect(() => {
    let alive = true;
    setLoadingI(true);
    fetchOptions('institutions').then((d) => {
      if (alive && d) setInstitutions(d);
      setLoadingI(false);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When institution changes, load degrees
  useEffect(() => {
    if (!v.institution_id) {
      setDegrees([]);
      return;
    }
    let alive = true;
    setLoadingD(true);
    fetchOptions('degrees', { institution_id: v.institution_id }).then((d) => {
      if (alive && d) setDegrees(d);
      setLoadingD(false);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.institution_id]);

  // When degree changes, load programs
  useEffect(() => {
    if (!v.degree_id) {
      setPrograms([]);
      return;
    }
    let alive = true;
    setLoadingP(true);
    fetchOptions('programs', { degree_id: v.degree_id }).then((d) => {
      if (alive && d) setPrograms(d);
      setLoadingP(false);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.degree_id]);

  // When program changes, load semesters AND look up the department for
  // the read-only Department display.
  useEffect(() => {
    if (!v.program_id) {
      setSemesters([]);
      setDepartment(null);
      return;
    }
    let alive = true;
    setLoadingS(true);
    setLoadingDept(true);
    Promise.all([
      fetchOptions('semesters', { program_id: v.program_id }),
      fetchOptions('department', { program_id: v.program_id }),
    ]).then(([sems, dept]) => {
      if (!alive) return;
      if (sems) setSemesters(sems);
      if (dept) setDepartment(dept);
      setLoadingS(false);
      setLoadingDept(false);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.program_id]);

  // When picking a Program, also auto-fill department_id from the program's
  // department FK. This is the canonical state — the read-only Department
  // display feeds off `department` (the looked-up row), but the form value
  // we save is department_id from the picked program.
  const handleProgramChange = (programId: string) => {
    const picked = programs.find((p) => p.id === programId);
    set('program_id', programId);
    if (picked?.department_id && picked.department_id !== v.department_id) {
      set('department_id', picked.department_id);
    }
    // Reset semester when program changes (different semester list)
    if (programId !== v.program_id) {
      set('semester_id', '');
    }
  };

  // When picking Entry Type, auto-pick the semester if rule applies.
  // Only runs on user interaction (in onValueChange), not on mount —
  // preserves manual overrides from prefilled data.
  const handleEntryTypeChange = (entryType: string) => {
    set('entry_type', entryType);
    const picked = autoPickSemester(entryType, semesters);
    if (picked) set('semester_id', picked);
  };

  // When semesters list LOADS (after program change), re-apply the
  // entry-type rule if one is set. This handles the case where the user
  // picked Entry Type before picking Program — we still want auto-pick
  // to fire once semesters are available.
  useEffect(() => {
    if (semesters.length === 0 || !v.entry_type) return;
    // Skip if already valid in the list — don't fight a manual pick
    if (v.semester_id && semesters.some((s) => s.id === v.semester_id)) return;
    const picked = autoPickSemester(v.entry_type, semesters);
    if (picked && picked !== v.semester_id) set('semester_id', picked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semesters]);

  const lateralLocksSemester =
    v.entry_type === 'FIRST YEAR' || v.entry_type === 'LATERAL ENTRY';

  const programType = useMemo(() => {
    if (semesters.length === 0) return '';
    return /year/i.test(semesters[0]?.semester_name ?? '') ? 'year' : 'semester';
  }, [semesters]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onContinue(v);
      }}
      className="space-y-6"
    >
      <header className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">
          Course Selection{' '}
          <span className="text-muted-foreground font-normal">
            / பாட தேர்வு
          </span>
        </h2>
        <p className="text-xs text-muted-foreground">
          Fields marked <Req /> are required.
        </p>
      </header>

      <Section title={{ en: 'Quota', ta: 'ஒதுக்கீடு' }}>
        <Field label="Quota / ஒதுக்கீடு">
          <Select value={v.quota} onValueChange={(s) => set('quota', s)}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Select quota / ஒதுக்கீடு தேர்வு செய்க" />
            </SelectTrigger>
            <SelectContent>
              {QUOTA_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </Section>

      <Section title={{ en: 'Institution & Course', ta: 'நிறுவனம் மற்றும் பாடம்' }}>
        <Field label="Institution / நிறுவனம்" required>
          <Select
            value={v.institution_id}
            onValueChange={(s) => {
              set('institution_id', s);
              // Changing institution resets all downstream selections
              set('degree_id', '');
              set('department_id', '');
              set('program_id', '');
              set('semester_id', '');
              setDepartment(null);
            }}
          >
            <SelectTrigger className="h-12">
              <SelectValue placeholder={loadingI ? 'Loading…' : 'Select institution / நிறுவனம் தேர்வு செய்க'} />
            </SelectTrigger>
            <SelectContent>
              {institutions.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Degree / பட்டப்படிப்பு" required>
          <Select
            value={v.degree_id}
            onValueChange={(s) => {
              set('degree_id', s);
              set('department_id', '');
              set('program_id', '');
              set('semester_id', '');
              setDepartment(null);
            }}
            disabled={!v.institution_id || loadingD}
          >
            <SelectTrigger className="h-12">
              <SelectValue
                placeholder={
                  !v.institution_id
                    ? 'Pick institution first / முதலில் நிறுவனம் தேர்வு செய்க'
                    : loadingD
                      ? 'Loading…'
                      : 'Select degree / பட்டப்படிப்பு தேர்வு செய்க'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {degrees.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.degree_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Program / பாடம்" required>
          <Select
            value={v.program_id}
            onValueChange={handleProgramChange}
            disabled={!v.degree_id || loadingP}
          >
            <SelectTrigger className="h-12">
              <SelectValue
                placeholder={
                  !v.degree_id
                    ? 'Pick degree first / முதலில் பட்டப்படிப்பு தேர்வு செய்க'
                    : loadingP
                      ? 'Loading…'
                      : 'Select program / பாடம் தேர்வு செய்க'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {programs.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.program_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {/* Department — read-only, auto-filled from picked Program */}
        <Field
          label="Department / துறை"
          required
          helper="Automatically derived from the selected Program."
        >
          <div className="relative">
            <Input
              value={
                loadingDept
                  ? 'Loading…'
                  : department?.department_name ?? ''
              }
              readOnly
              placeholder={
                v.program_id
                  ? 'Loading department…'
                  : 'Pick program first / முதலில் பாடம் தேர்வு செய்க'
              }
              className="h-12 bg-muted/40 pr-10"
            />
            <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          </div>
        </Field>
      </Section>

      <Section title={{ en: 'Entry & Semester', ta: 'சேர்க்கை மற்றும் பருவம்' }}>
        <Field
          label="Entry Type / சேர்க்கை வகை"
          required
          helper="First Year auto-picks the initial semester. Lateral Entry picks year 2 (year-based programs) or semester 3 (semester-based programs)."
        >
          <Select value={v.entry_type} onValueChange={handleEntryTypeChange}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Select entry type / சேர்க்கை வகை தேர்வு செய்க" />
            </SelectTrigger>
            <SelectContent>
              {ENTRY_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="Semester / பருவம்"
          required
          helper={
            !v.entry_type
              ? 'Select Entry Type first.'
              : lateralLocksSemester
                ? v.entry_type === 'FIRST YEAR'
                  ? 'Locked — First Year always starts at the initial semester. To change, switch Entry Type.'
                  : 'Locked — Lateral Entry auto-picks the appropriate semester. To change, switch Entry Type.'
                : programType
                  ? 'Pick the semester you are joining.'
                  : ''
          }
        >
          <div className="relative">
            <Select
              value={v.semester_id}
              onValueChange={(s) => set('semester_id', s)}
              disabled={!v.program_id || loadingS || lateralLocksSemester}
            >
              <SelectTrigger
                className={`h-12 ${lateralLocksSemester ? 'pr-10 bg-muted/40' : ''}`}
              >
                <SelectValue
                  placeholder={
                    !v.program_id
                      ? 'Pick program first / முதலில் பாடம் தேர்வு செய்க'
                      : loadingS
                        ? 'Loading…'
                        : 'Select semester / பருவம் தேர்வு செய்க'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {[...semesters]
                  .sort(
                    (a, b) =>
                      (a.semester_order ?? 0) - (b.semester_order ?? 0),
                  )
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.semester_name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {lateralLocksSemester && (
              <Lock
                className="absolute right-9 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
                aria-hidden
              />
            )}
          </div>
        </Field>
      </Section>

      <div className="flex gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1 h-12 text-sm sm:text-base"
          onClick={onBack}
          disabled={submitting}
        >
          Back / பின்
        </Button>
        <Button
          type="button"
          variant="outline"
          className="flex-1 h-12 text-sm sm:text-base"
          onClick={() => onSaveDraft(v)}
          disabled={submitting}
        >
          <Save className="h-4 w-4 mr-1.5" />
          Save Draft
        </Button>
        <Button type="submit" className="flex-1 h-12 text-sm sm:text-base" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Continue / தொடரவும்
        </Button>
      </div>
    </form>
  );
}
