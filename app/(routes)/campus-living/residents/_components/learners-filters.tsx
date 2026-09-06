'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { RotateCcw, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { SectionService } from '@/lib/services/organization/section-service';
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';
import { useGroupAdmissionYears } from '@/hooks/admission/use-group-admission-years';
import {
  useHostelBlocksForFilter, useAvailableYears,
} from '@/hooks/campus-living/use-learner-hostelites';
import { useActiveHostelCategories } from '@/hooks/campus-living/use-hostel-categories';
import { useActiveMessCategories } from '@/hooks/campus-living/use-mess-categories';
import { useRoomsByBlock } from '@/hooks/campus-living/use-hostel-rooms';
import { genderToCategoryType } from '@/hooks/campus-living/use-gender-categories';
import { UNASSIGNED_BLOCK } from '@/types/campus-living';

const FILTER_KEYS = [
  'institution_id', 'degree_id', 'department_id', 'program_id',
  'semester_id', 'section_id', 'academic_year_id', 'admission_year', 'gender',
  'block_id', 'year_of_study', 'hostel_category_id',
  'mess_category_id', 'room_id',
] as const;

type LocalFilters = Partial<Record<(typeof FILTER_KEYS)[number], string>>;

export function LearnersFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSuperAdmin } = usePermissions();
  const { profile } = useAuth();
  const { institutions, loading: loadingInstitutions } = useInstitutionsWithAccess();

  const canSelectAcrossInstitutions = isSuperAdmin || institutions.length > 1;
  const singleInstitutionId =
    !isSuperAdmin && institutions.length === 1 ? institutions[0].id : undefined;

  const [open, setOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const readParam = (k: string) => searchParams.get(k) ?? undefined;
  const [local, setLocal] = useState<LocalFilters>(() =>
    Object.fromEntries(FILTER_KEYS.map((k) => [k, readParam(k)])) as LocalFilters,
  );

  // Option lists
  const [degrees, setDegrees] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [programs, setPrograms] = useState<any[]>([]);
  const [semesters, setSemesters] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [academicYears, setAcademicYears] = useState<any[]>([]);
  const effectiveInst = isSuperAdmin ? local.institution_id : (profile?.institution_id ?? undefined);
  const { data: blockList } = useHostelBlocksForFilter(effectiveInst);
  const { data: availableYears } = useAvailableYears(effectiveInst);
  // Admission cohorts, deduped to one entry per YEAR across institutions. Not
  // gated on a chosen institution — a cohort year means the same thing in every
  // college, unlike Academic Year whose id is per-institution.
  const { data: admissionYears } = useGroupAdmissionYears(
    local.institution_id ? [local.institution_id] : null,
  );
  const { hostelCategories: roomCategories } = useActiveHostelCategories();
  const { messCategories } = useActiveMessCategories();

  // Hierarchical gender scope for the category dropdowns: a selected block
  // pins the gender via its hostel_type ('boys'/'girls' — same vocabulary as
  // category `type`); otherwise the Gender filter maps Male→boys / Female→
  // girls. No scope → show all active categories.
  const selectedBlock = (blockList ?? []).find((b) => b.id === local.block_id);
  const scopeType =
    selectedBlock?.hostel_type === 'boys' || selectedBlock?.hostel_type === 'girls'
      ? selectedBlock.hostel_type
      : genderToCategoryType(local.gender);
  const inScope = (c: { type?: string | null }) =>
    !scopeType || c.type === scopeType || c.type === 'mixed';
  const scopedRoomCategories = roomCategories.filter(inScope);
  const scopedMessCategories = messCategories.filter(inScope);

  // Rooms cascade under Block (required) and Room Category (optional narrow —
  // rooms carry their physical category_id).
  const realBlockId =
    local.block_id && local.block_id !== UNASSIGNED_BLOCK ? local.block_id : '';
  const { data: blockRooms } = useRoomsByBlock(realBlockId);
  const roomOptions = (blockRooms ?? []).filter(
    (r: any) => !local.hostel_category_id || r.category_id === local.hostel_category_id,
  );

  // Sync local state when the URL changes externally.
  useEffect(() => {
    setLocal(Object.fromEntries(FILTER_KEYS.map((k) => [k, readParam(k)])) as LocalFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Auto-select & lock the single accessible institution.
  useEffect(() => {
    if (singleInstitutionId && !local.institution_id) {
      setLocal((p) => ({ ...p, institution_id: singleInstitutionId }));
    }
  }, [singleInstitutionId, local.institution_id]);

  // Cascade option fetches (mirror profiles-filters.tsx).
  useEffect(() => {
    if (!local.institution_id) { setDegrees([]); return; }
    DegreeService.getDegrees({ institution_id: local.institution_id, page: 1, limit: 1000, isActive: true })
      .then((r) => setDegrees(r.data || [])).catch(() => setDegrees([]));
  }, [local.institution_id]);

  useEffect(() => {
    if (!local.degree_id || !local.institution_id) { setDepartments([]); return; }
    DepartmentService.getDepartments({ institution_id: local.institution_id, degree_id: local.degree_id, page: 1, limit: 1000, isActive: true })
      .then((r) => setDepartments(r.data || [])).catch(() => setDepartments([]));
  }, [local.degree_id, local.institution_id]);

  useEffect(() => {
    if (!local.degree_id || !local.department_id) { setPrograms([]); return; }
    ProgramService.getPrograms({ degree_id: local.degree_id, department_id: local.department_id, page: 1, limit: 1000, isActive: true })
      .then((r) => setPrograms(r.data || [])).catch(() => setPrograms([]));
  }, [local.degree_id, local.department_id]);

  useEffect(() => {
    if (!local.program_id) { setSemesters([]); return; }
    SemesterService.getSemestersByProgram(local.program_id)
      .then((r) => setSemesters(r || [])).catch(() => setSemesters([]));
  }, [local.program_id]);

  useEffect(() => {
    if (!local.semester_id) { setSections([]); return; }
    SectionService.getSections({ semester_id: local.semester_id, page: 1, limit: 1000, isActive: true })
      .then((r) => setSections(r.data || [])).catch(() => setSections([]));
  }, [local.semester_id]);

  useEffect(() => {
    if (!local.institution_id) { setAcademicYears([]); return; }
    AcademicYearService.getAcademicYearsByInstitution(local.institution_id)
      .then((r) => setAcademicYears(r || [])).catch(() => setAcademicYears([]));
  }, [local.institution_id]);

  // Child-reset setters
  const set = (patch: LocalFilters) => setLocal((p) => ({ ...p, ...patch }));
  const onInstitution = (v: string) => set({ institution_id: v === 'all' ? undefined : v, degree_id: undefined, department_id: undefined, program_id: undefined, semester_id: undefined, section_id: undefined, academic_year_id: undefined });
  const onDegree = (v: string) => set({ degree_id: v === 'all' ? undefined : v, department_id: undefined, program_id: undefined, semester_id: undefined, section_id: undefined });
  const onDepartment = (v: string) => set({ department_id: v === 'all' ? undefined : v, program_id: undefined, semester_id: undefined, section_id: undefined });
  const onProgram = (v: string) => set({ program_id: v === 'all' ? undefined : v, semester_id: undefined, section_id: undefined });
  const onSemester = (v: string) => set({ semester_id: v === 'all' ? undefined : v, section_id: undefined });
  const onSection = (v: string) => set({ section_id: v === 'all' ? undefined : v });
  const onAcademicYear = (v: string) => set({ academic_year_id: v === 'all' ? undefined : v });

  const apply = () => {
    setIsSearching(true);
    try {
      const params = new URLSearchParams(searchParams.toString());
      FILTER_KEYS.forEach((k) => params.delete(k));
      Object.entries(local).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
      });
      params.set('page', '1');
      router.push(`/campus-living/residents?${params.toString()}`);
    } finally {
      setTimeout(() => setIsSearching(false), 800);
    }
  };

  const clear = () => {
    setLocal({});
    const params = new URLSearchParams(searchParams.toString());
    FILTER_KEYS.forEach((k) => params.delete(k));
    params.set('page', '1');
    router.push(`/campus-living/residents?${params.toString()}`);
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className='w-full'>
      <CollapsibleTrigger asChild>
        <Button variant='outline' className='w-full justify-between'>
          Advanced Filters
          {open ? <ChevronUp className='h-4 w-4' /> : <ChevronDown className='h-4 w-4' />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className='space-y-4 pt-4'>
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
          {/* Institution */}
          <Select value={local.institution_id || ''} onValueChange={onInstitution} disabled={loadingInstitutions || !canSelectAcrossInstitutions}>
            <SelectTrigger><SelectValue placeholder={!canSelectAcrossInstitutions ? 'Your institution' : 'Select Institution'} /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Institutions</SelectItem>
              {institutions.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Degree */}
          <Select value={local.degree_id || ''} onValueChange={onDegree} disabled={!local.institution_id}>
            <SelectTrigger><SelectValue placeholder='Select Degree' /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Degrees</SelectItem>
              {degrees.map((d) => <SelectItem key={d.id} value={d.id}>{d.degree_name}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Department */}
          <Select value={local.department_id || ''} onValueChange={onDepartment} disabled={!local.degree_id}>
            <SelectTrigger><SelectValue placeholder='Select Department' /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Departments</SelectItem>
              {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.department_name}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Program */}
          <Select value={local.program_id || ''} onValueChange={onProgram} disabled={!local.department_id}>
            <SelectTrigger><SelectValue placeholder='Select Program' /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Programs</SelectItem>
              {programs.map((p) => <SelectItem key={p.id} value={p.id}>{p.program_name}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Semester */}
          <Select value={local.semester_id || ''} onValueChange={onSemester} disabled={!local.program_id}>
            <SelectTrigger><SelectValue placeholder='Select Semester' /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Semesters</SelectItem>
              {semesters.map((s) => <SelectItem key={s.id} value={s.id}>{s.semester_name}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Section */}
          <Select value={local.section_id || ''} onValueChange={onSection} disabled={!local.semester_id}>
            <SelectTrigger><SelectValue placeholder='Select Section' /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Sections</SelectItem>
              {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.section_name}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Academic Year */}
          <Select value={local.academic_year_id || ''} onValueChange={onAcademicYear} disabled={!local.institution_id}>
            <SelectTrigger><SelectValue placeholder='Select Academic Year' /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Academic Years</SelectItem>
              {academicYears.map((a) => <SelectItem key={a.id} value={a.id}>{a.academic_year_name}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Admission Year (cohort) — sits next to Academic Year because the
              three year filters on this row are easy to confuse. Academic Year
              is the session, Year of Study is progress through the programme
              (and advances annually), this is the intake batch and never moves.
              Not disabled without an institution: the options are year numbers,
              shared across every college. */}
          <Select
            value={local.admission_year || ''}
            onValueChange={(v) => set({ admission_year: v === 'all' ? undefined : v })}
          >
            <SelectTrigger><SelectValue placeholder='Select Admission Year' /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Admission Years</SelectItem>
              {(admissionYears ?? []).map((a) => (
                <SelectItem key={a.programStartYear} value={String(a.programStartYear)}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Gender — scopes the category dropdowns, so changing it clears them */}
          <Select value={local.gender || ''} onValueChange={(v) => set({ gender: v === 'all' ? undefined : v, hostel_category_id: undefined, mess_category_id: undefined, room_id: undefined })}>
            <SelectTrigger><SelectValue placeholder='Select Gender' /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Genders</SelectItem>
              <SelectItem value='Male'>Male</SelectItem>
              <SelectItem value='Female'>Female</SelectItem>
              <SelectItem value='Other'>Other</SelectItem>
            </SelectContent>
          </Select>
          {/* Block — pins the gender scope + feeds the Room list, so changing it clears downstream picks */}
          <Select value={local.block_id || ''} onValueChange={(v) => set({ block_id: v === 'all' ? undefined : v, hostel_category_id: undefined, mess_category_id: undefined, room_id: undefined })}>
            <SelectTrigger><SelectValue placeholder='Block' /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Blocks</SelectItem>
              <SelectItem value={UNASSIGNED_BLOCK}>Unassigned</SelectItem>
              {(blockList ?? []).map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}{b.code ? ` (${b.code})` : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Year of study */}
          <Select value={local.year_of_study || ''} onValueChange={(v) => set({ year_of_study: v === 'all' ? undefined : v })}>
            <SelectTrigger><SelectValue placeholder='Year of Study' /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Years</SelectItem>
              {(availableYears && availableYears.length > 0 ? availableYears : [1, 2, 3, 4]).map((y) => (
                <SelectItem key={y} value={String(y)}>Year {y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Room category — options scoped to the block/gender; narrows the Room list */}
          <Select value={local.hostel_category_id || ''} onValueChange={(v) => set({ hostel_category_id: v === 'all' ? undefined : v, room_id: undefined })}>
            <SelectTrigger><SelectValue placeholder='Room Category' /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Room Categories</SelectItem>
              {scopedRoomCategories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}{c.type ? ` (${c.type})` : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Room — needs a block; narrowed by the selected room category */}
          <Select value={local.room_id || ''} onValueChange={(v) => set({ room_id: v === 'all' ? undefined : v })} disabled={!realBlockId}>
            <SelectTrigger><SelectValue placeholder={realBlockId ? 'Room' : 'Room (pick a block first)'} /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Rooms</SelectItem>
              {roomOptions.map((r: any) => (
                <SelectItem key={r.id} value={r.id}>Room {r.room_number}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Mess category — options scoped to the block/gender */}
          <Select value={local.mess_category_id || ''} onValueChange={(v) => set({ mess_category_id: v === 'all' ? undefined : v })}>
            <SelectTrigger><SelectValue placeholder='Mess Category' /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Mess Categories</SelectItem>
              {scopedMessCategories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}{c.type ? ` (${c.type})` : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='flex justify-between pt-2'>
          <Button variant='outline' onClick={clear}>
            <RotateCcw className='mr-2 h-4 w-4' /> Clear All Filters
          </Button>
          <Button onClick={apply} disabled={isSearching} className='ml-auto'>
            <Search className='mr-2 h-4 w-4' />
            {isSearching ? 'Searching…' : 'Search Learners'}
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
