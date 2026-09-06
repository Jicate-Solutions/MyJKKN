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
import { Loader2, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import type { Language } from './language-toggle';
import { ENTRY_TYPE_OPTIONS } from '@/lib/constants/learner-dropdown-values';

interface Props {
  lang: Language;
  data: Record<string, any>;
  token: string;
  onContinue: (fields: Record<string, any>) => void;
  onBack: () => void;
  submitting: boolean;
}

interface InstitutionRow {
  id: string;
  name: string;
}
interface QuotaRow {
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
  // 2026-05-21: department_code is embedded from departments via the
  // course-options endpoint so the client can apply the
  // engineering-first-year rule (only Science & Humanities programmes
  // shown when entry_type='FIRST YEAR' at an institution with an SH dept).
  department_code?: string | null;
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
interface AdmissionYearRow {
  id: string;
  admission_year_name: string;
  year: number;
}
interface AcademicYearRow {
  id: string;
  academic_year_name: string;
}
interface SectionRow {
  id: string;
  section_name: string;
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
  onBack,
  submitting,
}: Props) {
  // Form state pre-filled from learners_profiles (the conversion bridge
  // sets institution_id always; degree/department/program/semester may be
  // null on legacy leads — student fills them in).
  // admission_year_id is auto-fetched (not student-edited) — see the
  // useEffect below. It's persisted on save so the fee-structure matrix
  // lookup has the right cohort.
  const [v, setV] = useState({
    quota_id: (data as { quota_id?: string }).quota_id ?? '',
    institution_id: data.institution_id ?? '',
    degree_id: data.degree_id ?? '',
    department_id: data.department_id ?? '',
    program_id: data.program_id ?? '',
    entry_type: data.entry_type ?? '',
    semester_id: data.semester_id ?? '',
    admission_year_id: data.admission_year_id ?? '',
    academic_year_id: data.academic_year_id ?? '',
    section_id: data.section_id ?? '',
  });
  const set = <K extends keyof typeof v>(k: K, val: typeof v[K]) =>
    setV((p) => ({ ...p, [k]: val }));

  // Dropdown caches. Each fetches via the token-validated options endpoint
  // when its parent selection changes.
  const [institutions, setInstitutions] = useState<InstitutionRow[]>([]);
  const [quotas, setQuotas] = useState<QuotaRow[]>([]);
  const [degrees, setDegrees] = useState<DegreeRow[]>([]);
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [semesters, setSemesters] = useState<SemesterRow[]>([]);
  const [department, setDepartment] = useState<DepartmentRow | null>(null);
  const [admissionYear, setAdmissionYear] = useState<AdmissionYearRow | null>(null);
  const [academicYear, setAcademicYear] = useState<AcademicYearRow | null>(null);
  const [sectionA, setSectionA] = useState<SectionRow | null>(null);

  const [loadingI, setLoadingI] = useState(false);
  const [loadingD, setLoadingD] = useState(false);
  const [loadingP, setLoadingP] = useState(false);
  const [loadingS, setLoadingS] = useState(false);
  const [loadingDept, setLoadingDept] = useState(false);
  const [loadingAY, setLoadingAY] = useState(false);
  const [loadingAcY, setLoadingAcY] = useState(false);
  const [loadingSec, setLoadingSec] = useState(false);

  async function fetchOptions(
    kind:
      | 'institutions'
      | 'quotas'
      | 'degrees'
      | 'programs'
      | 'semesters'
      | 'sections'
      | 'department'
      | 'admission_year'
      | 'academic_year',
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

  // Load quotas on mount (global list; student picks one → quota_id)
  useEffect(() => {
    let alive = true;
    fetchOptions('quotas').then((d) => {
      if (alive && d) setQuotas(d);
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

  // When institution changes, resolve its CURRENT academic year (2026-07-27).
  // Keyed on institution alone — unlike admission_year, academic_years is not
  // program-scoped, so this must NOT live in the program effect below or it
  // would stay empty until the student picks a programme.
  useEffect(() => {
    if (!v.institution_id) {
      setAcademicYear(null);
      if (v.academic_year_id) set('academic_year_id', '');
      return;
    }
    let alive = true;
    setLoadingAcY(true);
    fetchOptions('academic_year', { institution_id: v.institution_id }).then((d) => {
      if (!alive) return;
      const row = (d as AcademicYearRow | null) ?? null;
      setAcademicYear(row);
      // Persist the FK so it ships with Save & Continue. Empty when the
      // institution has no active row covering today — the render below
      // tells the student to contact admission, and the wizard's required
      // rule blocks final submit.
      set('academic_year_id', row?.id ?? '');
      setLoadingAcY(false);
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
  // the read-only Department display. Also auto-fetch the current-year
  // admission_year row scoped to (institution, program) — see
  // 2026-05-21 change. Result is rendered read-only and saved with the
  // form so the fee-structure matrix lookup has the correct cohort.
  useEffect(() => {
    if (!v.program_id || !v.institution_id) {
      setSemesters([]);
      setDepartment(null);
      setAdmissionYear(null);
      if (v.admission_year_id) set('admission_year_id', '');
      return;
    }
    let alive = true;
    setLoadingS(true);
    setLoadingDept(true);
    setLoadingAY(true);
    Promise.all([
      fetchOptions('semesters', { program_id: v.program_id }),
      fetchOptions('department', { program_id: v.program_id }),
      fetchOptions('admission_year', {
        institution_id: v.institution_id,
        program_id: v.program_id,
      }),
    ]).then(([sems, dept, ay]) => {
      if (!alive) return;
      if (sems) setSemesters(sems);
      if (dept) setDepartment(dept);
      const ayRow = (ay as AdmissionYearRow | null) ?? null;
      setAdmissionYear(ayRow);
      // Persist the FK id into form state so it's submitted on Save & Continue.
      // Empty string when no row matches — admin hasn't configured the
      // current-year cohort for this (institution, program) yet; the
      // render below shows that hint to the student.
      set('admission_year_id', ayRow?.id ?? '');
      setLoadingS(false);
      setLoadingDept(false);
      setLoadingAY(false);
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

  // ──────────────────────────────────────────────────────────────────────
  // Engineering-college first-year programme filter (2026-05-21)
  // ──────────────────────────────────────────────────────────────────────
  // Convention at JKKN College of Engineering and Technology (and any
  // future institution that follows the same pattern): a learner entering
  // FIRST YEAR enrols under the "Science and Humanities" (SH) department,
  // NOT their branch department. The SH dept hosts a mirror of every
  // branch programme — e.g. "B.E. CSE" exists once in CSE-dept and once
  // in SH-dept, with identical names.
  //
  // Detection signal: the institution exposes any programme with
  // department_code='SH' (via the embed in course-options/programs).
  // Activation signal: entry_type === 'FIRST YEAR'.
  // When both fire, the Programme picker is restricted to SH rows only.
  //
  // No `institution_type` check — that column is funding model
  // (autonomous/aided/self), not discipline. Presence of SH dept IS the
  // discipline signal.
  const institutionHasShDept = programs.some(
    (p) => p.department_code === 'SH',
  );
  // 2026-05-21 (revised 2026-05-30): the SH (Science & Humanities) dept is
  // the first-year home for engineering students, and FIRST YEAR is the
  // default/mandatory path for QR-form admissions. Because the Programme
  // field is picked BEFORE Entry Type, an unset entry_type is treated the
  // SAME as FIRST YEAR so the student sees the correct list by default:
  //   - entry_type === 'FIRST YEAR' OR unset → show ONLY SH programmes
  //   - any other entry_type (LATERAL ENTRY, etc.) → HIDE SH, show branch
  // Branch-department programmes only surface once the student explicitly
  // picks a non-first-year entry type.
  const isFirstYearOrDefault =
    v.entry_type === 'FIRST YEAR' || v.entry_type === '';
  const restrictToSh = institutionHasShDept && isFirstYearOrDefault;
  const hideSh = institutionHasShDept && !isFirstYearOrDefault;
  const displayedPrograms = useMemo(() => {
    if (!institutionHasShDept) return programs;
    if (restrictToSh) return programs.filter((p) => p.department_code === 'SH');
    if (hideSh) return programs.filter((p) => p.department_code !== 'SH');
    return programs;
  }, [programs, restrictToSh, hideSh, institutionHasShDept]);

  // When picking Entry Type, auto-pick the semester if rule applies.
  // Only runs on user interaction (in onValueChange), not on mount —
  // preserves manual overrides from prefilled data.
  //
  // 2026-05-21: also clear program_id if entry_type=FIRST YEAR is picked
  // at an engineering institution and the current programme isn't a
  // Science & Humanities one — the dropdown about to refilter would hide
  // the picked row otherwise, leaving a phantom selection.
  const handleEntryTypeChange = (entryType: string) => {
    set('entry_type', entryType);
    // Set here as well as in the effect below so the field doesn't flash the
    // old value while the semesters list settles.
    const picked = autoPickSemester(entryType, semesters);
    if (picked) set('semester_id', picked);

    if (institutionHasShDept && v.program_id) {
      const currentProg = programs.find((p) => p.id === v.program_id);
      if (currentProg) {
        const switchingIntoFirstYear =
          entryType === 'FIRST YEAR' && currentProg.department_code !== 'SH';
        const switchingOutOfFirstYear =
          entryType !== 'FIRST YEAR' && currentProg.department_code === 'SH';

        if (switchingIntoFirstYear) {
          set('program_id', '');
          set('department_id', '');
          set('semester_id', '');
          setDepartment(null);
          toast(
            'First-year admissions at this institution go through the Science and Humanities department — please re-pick the programme.',
            { duration: 6000, icon: 'ℹ️' },
          );
        } else if (switchingOutOfFirstYear) {
          // Inverse: leaving FIRST YEAR but the picked programme is the
          // first-year-only SH variant. Clear so the student picks the
          // branch-department version.
          set('program_id', '');
          set('department_id', '');
          set('semester_id', '');
          setDepartment(null);
          toast(
            'Lateral entry and later admissions belong to the branch department — please re-pick the programme.',
            { duration: 6000, icon: 'ℹ️' },
          );
        }
      }
    }
  };

  // FIRST YEAR admits get section "A" of their auto-picked semester, read-only.
  // Declared ahead of the effects that read it: a dependency array is evaluated
  // during render, so a const declared further down would hit the temporal dead
  // zone rather than simply reading stale.
  const isFirstYear = v.entry_type === 'FIRST YEAR';

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
  }, [semesters, v.entry_type]);

  // Resolve section "A" under the committed semester — or clear a stale one.
  // The clear branch matters when the student switches away from FIRST YEAR or
  // changes semester: the old section would otherwise persist as a
  // cross-semester reference on the learner row.
  useEffect(() => {
    if (!isFirstYear || !v.semester_id) {
      setSectionA(null);
      if (v.section_id) set('section_id', '');
      return;
    }
    let alive = true;
    setLoadingSec(true);
    fetchOptions('sections', { semester_id: v.semester_id }).then((d) => {
      if (!alive) return;
      const rows = (d as SectionRow[] | null) ?? [];
      const a =
        rows.find((s) => s.section_name?.trim().toUpperCase() === 'A') ?? null;
      setSectionA(a);
      set('section_id', a?.id ?? '');
      setLoadingSec(false);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFirstYear, v.semester_id]);

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
        <Field
          label="Quota / ஒதுக்கீடு"
          required
          helper="Required — affects the fee structure applied to your admission."
        >
          <Select value={v.quota_id} onValueChange={(s) => set('quota_id', s)}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Select quota / ஒதுக்கீடு தேர்வு செய்க" />
            </SelectTrigger>
            <SelectContent>
              {quotas.map((q) => (
                <SelectItem key={q.id} value={q.id}>
                  {q.name}
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
              {displayedPrograms.map((p) => (
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

        {/* Admission Year — read-only, auto-fetched from the current calendar
         *  year scoped to the picked (institution, program). The value is
         *  saved with the form so the fee-structure matrix has the correct
         *  cohort. Added 2026-05-21.
         */}
        <Field
          label="Admission Year / சேர்க்கை ஆண்டு"
          required
          helper="Automatically set for the current admission cycle. Cannot be changed."
        >
          <div className="relative">
            <Input
              value={
                loadingAY
                  ? 'Loading…'
                  : admissionYear?.admission_year_name ?? ''
              }
              readOnly
              placeholder={
                !v.program_id
                  ? 'Pick program first / முதலில் பாடம் தேர்வு செய்க'
                  : loadingAY
                    ? 'Loading admission year…'
                    : 'No admission year configured for the current cycle — contact admission'
              }
              className="h-12 bg-muted/40 pr-10"
            />
            <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          </div>
        </Field>

        {/* Academic Year — read-only, auto-resolved from the picked
         *  institution's active row whose date window contains today.
         *  Saved with the form so the learner lands in the right cohort.
         *  Added 2026-07-27. Depends on Institution only, not Program.
         */}
        <Field
          label="Academic Year / கல்வி ஆண்டு"
          required
          helper="Automatically set for the current academic year. Cannot be changed."
        >
          <div className="relative">
            <Input
              value={
                loadingAcY
                  ? 'Loading…'
                  : academicYear?.academic_year_name ?? ''
              }
              readOnly
              placeholder={
                !v.institution_id
                  ? 'Pick institution first / முதலில் நிறுவனம் தேர்வு செய்க'
                  : loadingAcY
                    ? 'Loading academic year…'
                    : 'No academic year configured for the current cycle — contact admission'
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

        {/* Section — read-only, and only rendered for FIRST YEAR, where it is
         *  a derivation (section "A" of the auto-picked initial semester)
         *  rather than a placement choice. Other entry types don't show it at
         *  all: section placement there stays an admission-staff decision made
         *  during onboarding. Added 2026-07-27.
         */}
        {isFirstYear && (
          <Field
            label="Section / பிரிவு"
            helper="Automatically assigned for first-year admits. Cannot be changed."
          >
            <div className="relative">
              <Input
                value={loadingSec ? 'Loading…' : sectionA?.section_name ?? ''}
                readOnly
                placeholder={
                  loadingSec
                    ? 'Loading section…'
                    : 'No section configured for this programme — contact admission'
                }
                className="h-12 bg-muted/40 pr-10"
              />
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
          </Field>
        )}
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
        <Button type="submit" className="flex-1 h-12 text-sm sm:text-base" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save & Continue / சேமித்துத் தொடரவும்
        </Button>
      </div>
    </form>
  );
}
