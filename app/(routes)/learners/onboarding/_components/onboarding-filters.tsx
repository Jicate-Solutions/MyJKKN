'use client';
/**
 * Cascading filters for the Learner Onboarding page.
 *
 * Mirrors profiles' ProfilesFilters: Institution → Degree → Department →
 * Program → Semester → Section + Academic Year + Gender, plus a Missing Field
 * dropdown unique to this page so admins can batch-fix one field at a time
 * (e.g. "show me everyone missing a College Email").
 *
 * Profile Status filter is omitted — this page already lists ONLY incomplete
 * profiles by definition.
 */

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RotateCcw, ChevronDown, ChevronUp, Search } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { SectionService } from '@/lib/services/organization/section-service';
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';
import type { OnboardingSearchParams } from './data-table-schema';

interface OnboardingFiltersProps {
  searchParams: OnboardingSearchParams;
}

const FILTER_KEYS = [
  'institution_id',
  'degree_id',
  'department_id',
  'program_id',
  'semester_id',
  'section_id',
  'academic_year_id',
  'gender',
  'missing_field'
] as const;

export function OnboardingFilters({ searchParams }: OnboardingFiltersProps) {
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const { isSuperAdmin } = usePermissions();
  const { profile } = useAuth();
  const router = useRouter();
  const currentSearchParams = useSearchParams();

  const [localFilters, setLocalFilters] = useState<{
    institution_id?: string;
    degree_id?: string;
    department_id?: string;
    program_id?: string;
    semester_id?: string;
    section_id?: string;
    academic_year_id?: string;
    gender?: string;
    missing_field?: string;
  }>({
    institution_id: searchParams.institution_id || undefined,
    degree_id: searchParams.degree_id || undefined,
    department_id: searchParams.department_id || undefined,
    program_id: searchParams.program_id || undefined,
    semester_id: searchParams.semester_id || undefined,
    section_id: searchParams.section_id || undefined,
    academic_year_id: searchParams.academic_year_id || undefined,
    gender: searchParams.gender || undefined,
    missing_field: searchParams.missing_field || undefined
  });

  const [institutions, setInstitutions] = useState<any[]>([]);
  const [degrees, setDegrees] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [programs, setPrograms] = useState<any[]>([]);
  const [semesters, setSemesters] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [academicYears, setAcademicYears] = useState<any[]>([]);

  const [loadingDegrees, setLoadingDegrees] = useState(false);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [loadingSemesters, setLoadingSemesters] = useState(false);
  const [loadingSections, setLoadingSections] = useState(false);
  const [loadingAcademicYears, setLoadingAcademicYears] = useState(false);

  const handleSearch = async () => {
    setIsSearching(true);
    try {
      const params = new URLSearchParams(currentSearchParams.toString());
      FILTER_KEYS.forEach((key) => params.delete(key));
      Object.entries(localFilters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.set(key, value.toString());
        }
      });
      params.set('page', '1');
      router.push(`/learners/onboarding?${params.toString()}`);
    } finally {
      setTimeout(() => setIsSearching(false), 1000);
    }
  };

  const handleClear = () => {
    setLocalFilters({
      institution_id: undefined,
      degree_id: undefined,
      department_id: undefined,
      program_id: undefined,
      semester_id: undefined,
      section_id: undefined,
      academic_year_id: undefined,
      gender: undefined,
      missing_field: undefined
    });
    const params = new URLSearchParams(currentSearchParams.toString());
    FILTER_KEYS.forEach((key) => params.delete(key));
    params.set('page', '1');
    router.push(`/learners/onboarding?${params.toString()}`);
    setIsSearching(false);
  };

  useEffect(() => {
    setLocalFilters({
      institution_id: searchParams.institution_id || undefined,
      degree_id: searchParams.degree_id || undefined,
      department_id: searchParams.department_id || undefined,
      program_id: searchParams.program_id || undefined,
      semester_id: searchParams.semester_id || undefined,
      section_id: searchParams.section_id || undefined,
      academic_year_id: searchParams.academic_year_id || undefined,
      gender: searchParams.gender || undefined,
      missing_field: searchParams.missing_field || undefined
    });
  }, [searchParams]);

  useEffect(() => {
    OrganizationService.getInstitutions({ page: 1, limit: 1000, isActive: true })
      .then((res) => setInstitutions(res.data || []))
      .catch((err) => {
        console.error('[onboarding-filters] institutions:', err);
        setInstitutions([]);
      });
  }, []);

  useEffect(() => {
    if (!localFilters.institution_id) {
      setDegrees([]);
      return;
    }
    setLoadingDegrees(true);
    DegreeService.getDegrees({
      institution_id: localFilters.institution_id,
      page: 1,
      limit: 1000,
      isActive: true
    })
      .then((res) => setDegrees(res.data || []))
      .catch((err) => {
        console.error('[onboarding-filters] degrees:', err);
        setDegrees([]);
      })
      .finally(() => setLoadingDegrees(false));
  }, [localFilters.institution_id]);

  useEffect(() => {
    if (!localFilters.degree_id || !localFilters.institution_id) {
      setDepartments([]);
      return;
    }
    setLoadingDepartments(true);
    DepartmentService.getDepartments({
      institution_id: localFilters.institution_id,
      degree_id: localFilters.degree_id,
      page: 1,
      limit: 1000,
      isActive: true
    })
      .then((res) => setDepartments(res.data || []))
      .catch((err) => {
        console.error('[onboarding-filters] departments:', err);
        setDepartments([]);
      })
      .finally(() => setLoadingDepartments(false));
  }, [localFilters.degree_id, localFilters.institution_id]);

  useEffect(() => {
    if (!localFilters.degree_id || !localFilters.department_id) {
      setPrograms([]);
      return;
    }
    setLoadingPrograms(true);
    ProgramService.getPrograms({
      degree_id: localFilters.degree_id,
      department_id: localFilters.department_id,
      page: 1,
      limit: 1000,
      isActive: true
    } as any)
      .then((res) => setPrograms(res.data || []))
      .catch((err) => {
        console.error('[onboarding-filters] programs:', err);
        setPrograms([]);
      })
      .finally(() => setLoadingPrograms(false));
  }, [localFilters.degree_id, localFilters.department_id]);

  useEffect(() => {
    if (!localFilters.program_id) {
      setSemesters([]);
      return;
    }
    setLoadingSemesters(true);
    SemesterService.getSemestersByProgram(localFilters.program_id)
      .then((data) => setSemesters(data || []))
      .catch((err) => {
        console.error('[onboarding-filters] semesters:', err);
        setSemesters([]);
      })
      .finally(() => setLoadingSemesters(false));
  }, [localFilters.program_id]);

  useEffect(() => {
    if (!localFilters.semester_id) {
      setSections([]);
      return;
    }
    setLoadingSections(true);
    SectionService.getSections({
      semester_id: localFilters.semester_id,
      page: 1,
      limit: 1000,
      isActive: true
    })
      .then((res) => setSections(res.data || []))
      .catch((err) => {
        console.error('[onboarding-filters] sections:', err);
        setSections([]);
      })
      .finally(() => setLoadingSections(false));
  }, [localFilters.semester_id]);

  useEffect(() => {
    if (!localFilters.institution_id) {
      setAcademicYears([]);
      return;
    }
    setLoadingAcademicYears(true);
    AcademicYearService.getAcademicYearsByInstitution(localFilters.institution_id)
      .then((data) => setAcademicYears(data || []))
      .catch((err) => {
        console.error('[onboarding-filters] academic years:', err);
        setAcademicYears([]);
      })
      .finally(() => setLoadingAcademicYears(false));
  }, [localFilters.institution_id]);

  // Auto-select institution / department for scoped roles
  useEffect(() => {
    if (profile?.institution_id && !isSuperAdmin && !localFilters.institution_id) {
      setLocalFilters((prev) => ({ ...prev, institution_id: profile.institution_id || undefined }));
    }
  }, [profile?.institution_id, localFilters.institution_id, isSuperAdmin]);

  useEffect(() => {
    if (
      profile?.role === 'hod' &&
      profile?.department_id &&
      !isSuperAdmin &&
      !localFilters.department_id
    ) {
      setLocalFilters((prev) => ({ ...prev, department_id: profile.department_id || undefined }));
    }
  }, [profile?.role, profile?.department_id, localFilters.department_id, isSuperAdmin]);

  const handleInstitutionChange = (v: string) =>
    setLocalFilters((prev) => ({
      ...prev,
      institution_id: v === 'all' ? undefined : v,
      degree_id: undefined,
      department_id: undefined,
      program_id: undefined,
      semester_id: undefined,
      section_id: undefined,
      academic_year_id: undefined
    }));

  const handleDegreeChange = (v: string) =>
    setLocalFilters((prev) => ({
      ...prev,
      degree_id: v === 'all' ? undefined : v,
      department_id: undefined,
      program_id: undefined,
      semester_id: undefined,
      section_id: undefined
    }));

  const handleDepartmentChange = (v: string) =>
    setLocalFilters((prev) => ({
      ...prev,
      department_id: v === 'all' ? undefined : v,
      program_id: undefined,
      semester_id: undefined,
      section_id: undefined
    }));

  const handleProgramChange = (v: string) =>
    setLocalFilters((prev) => ({
      ...prev,
      program_id: v === 'all' ? undefined : v,
      semester_id: undefined,
      section_id: undefined
    }));

  const handleSemesterChange = (v: string) =>
    setLocalFilters((prev) => ({
      ...prev,
      semester_id: v === 'all' ? undefined : v,
      section_id: undefined
    }));

  const handleSectionChange = (v: string) =>
    setLocalFilters((prev) => ({ ...prev, section_id: v === 'all' ? undefined : v }));

  const handleAcademicYearChange = (v: string) =>
    setLocalFilters((prev) => ({ ...prev, academic_year_id: v === 'all' ? undefined : v }));

  return (
    <div className="space-y-4">
      <Collapsible open={showAdvancedFilters} onOpenChange={setShowAdvancedFilters} className="w-full">
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-between">
            Advanced Filters
            {showAdvancedFilters ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Select
              value={localFilters.institution_id || ''}
              onValueChange={handleInstitutionChange}
              disabled={!isSuperAdmin}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !isSuperAdmin && profile?.institution_id
                      ? 'Your institution is auto-selected'
                      : 'Select Institution'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Institutions</SelectItem>
                {institutions.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={localFilters.degree_id || ''}
              onValueChange={handleDegreeChange}
              disabled={!localFilters.institution_id || loadingDegrees}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingDegrees ? 'Loading...' : 'Select Degree'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Degrees</SelectItem>
                {degrees.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.degree_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={localFilters.department_id || ''}
              onValueChange={handleDepartmentChange}
              disabled={
                !localFilters.degree_id ||
                loadingDepartments ||
                (profile?.role === 'hod' && !isSuperAdmin)
              }
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    loadingDepartments
                      ? 'Loading...'
                      : profile?.role === 'hod' && !isSuperAdmin
                        ? 'Your department is auto-selected'
                        : 'Select Department'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.department_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={localFilters.program_id || ''}
              onValueChange={handleProgramChange}
              disabled={
                !localFilters.degree_id || !localFilters.department_id || loadingPrograms
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingPrograms ? 'Loading...' : 'Select Program'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Programs</SelectItem>
                {programs.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.program_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={localFilters.semester_id || ''}
              onValueChange={handleSemesterChange}
              disabled={!localFilters.program_id || loadingSemesters}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingSemesters ? 'Loading...' : 'Select Semester'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Semesters</SelectItem>
                {semesters.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.semester_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={localFilters.section_id || ''}
              onValueChange={handleSectionChange}
              disabled={!localFilters.semester_id || loadingSections}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingSections ? 'Loading...' : 'Select Section'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sections</SelectItem>
                {sections.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.section_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={localFilters.academic_year_id || ''}
              onValueChange={handleAcademicYearChange}
              disabled={!localFilters.institution_id || loadingAcademicYears}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={loadingAcademicYears ? 'Loading...' : 'Select Academic Year'}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Academic Years</SelectItem>
                {academicYears.map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.academic_year_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={localFilters.gender || ''}
              onValueChange={(v) =>
                setLocalFilters((prev) => ({ ...prev, gender: v === 'all' ? undefined : v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select Gender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Genders</SelectItem>
                <SelectItem value="Male">Male</SelectItem>
                <SelectItem value="Female">Female</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>

            {/* Missing Field — unique to the onboarding page */}
            <Select
              value={localFilters.missing_field || ''}
              onValueChange={(v) =>
                setLocalFilters((prev) => ({
                  ...prev,
                  missing_field: v === 'all' ? undefined : v
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Filter by Missing Field" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any Missing Field</SelectItem>
                <SelectItem value="college_email">Missing College Email</SelectItem>
                <SelectItem value="academic_year_id">Missing Academic Year</SelectItem>
                <SelectItem value="semester_id">Missing Semester</SelectItem>
                <SelectItem value="section_id">Missing Section</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={handleClear}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Clear All Filters
            </Button>
            <Button onClick={handleSearch} disabled={isSearching} className="ml-auto">
              {isSearching ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Search Learners
                </>
              )}
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
