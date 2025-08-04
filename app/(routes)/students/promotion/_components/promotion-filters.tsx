'use client';

import { useState, useEffect } from 'react';
import { Search, RotateCcw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { SectionService } from '@/lib/services/organization/section-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';
import { StudentFilters } from '@/types/student';

interface PromotionFiltersProps {
  filters: StudentFilters;
  onFilterChange: (filters: Partial<StudentFilters>) => void;
  onSearch: () => void;
  onReset: () => void;
  isSearching?: boolean;
}

export function PromotionFilters({
  filters,
  onFilterChange,
  onSearch,
  onReset,
  isSearching = false
}: PromotionFiltersProps) {
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [degrees, setDegrees] = useState<
    Array<{ id: string; degree_name: string }>
  >([]);
  const [departments, setDepartments] = useState<
    Array<{ id: string; department_name: string }>
  >([]);
  const [programs, setPrograms] = useState<
    Array<{ id: string; program_name: string }>
  >([]);
  const [semesters, setSemesters] = useState<
    Array<{ id: string; semester_name: string }>
  >([]);
  const [sections, setSections] = useState<
    Array<{ id: string; section_name: string }>
  >([]);
  const [academicYears, setAcademicYears] = useState<
    Array<{ id: string; academic_year_name: string }>
  >([]);

  const [searchInput, setSearchInput] = useState(filters.search || '');

  // Loading states
  const [loadingDegrees, setLoadingDegrees] = useState(false);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [loadingSemesters, setLoadingSemesters] = useState(false);
  const [loadingSections, setLoadingSections] = useState(false);
  const [loadingAcademicYears, setLoadingAcademicYears] = useState(false);

  // Load institutions on mount
  useEffect(() => {
    async function loadInstitutions() {
      try {
        const data = await OrganizationService.getInstitutionNames(true);
        setInstitutions(data);
      } catch (error) {
        console.error('Error loading institutions:', error);
      }
    }
    loadInstitutions();
  }, []);

  // Load degrees when institution changes
  useEffect(() => {
    if (filters.institution) {
      async function loadDegrees() {
        try {
          setLoadingDegrees(true);
          const { data } = await DegreeService.getDegrees({
            institution_id: filters.institution,
            isActive: true
          });
          setDegrees(data);
        } catch (error) {
          console.error('Error loading degrees:', error);
        } finally {
          setLoadingDegrees(false);
        }
      }
      loadDegrees();
    } else {
      setDegrees([]);
    }
  }, [filters.institution]);

  // Load departments when institution changes
  useEffect(() => {
    if (filters.institution) {
      async function loadDepartments() {
        try {
          setLoadingDepartments(true);
          const { data } = await DepartmentService.getDepartments({
            institution_id: filters.institution,
            isActive: true
          });
          setDepartments(data);
        } catch (error) {
          console.error('Error loading departments:', error);
        } finally {
          setLoadingDepartments(false);
        }
      }
      loadDepartments();
    } else {
      setDepartments([]);
    }
  }, [filters.institution]);

  // Load programs when degree or department changes
  useEffect(() => {
    if (filters.degree || filters.department) {
      async function loadPrograms() {
        try {
          setLoadingPrograms(true);
          const queryParams: any = {
            isActive: true
          };
          
          if (filters.degree) {
            queryParams.degree_id = filters.degree;
          }
          if (filters.department) {
            queryParams.department_id = filters.department;
          }
          
          const { data } = await ProgramService.getPrograms(queryParams);
          setPrograms(data);
        } catch (error) {
          console.error('Error loading programs:', error);
        } finally {
          setLoadingPrograms(false);
        }
      }
      loadPrograms();
    } else {
      setPrograms([]);
    }
  }, [filters.degree, filters.department]);

  // Load semesters when program changes
  useEffect(() => {
    if (filters.program) {
      async function loadSemesters() {
        try {
          setLoadingSemesters(true);
          const data = await SemesterService.getSemestersByProgram(
            filters.program!
          );
          setSemesters(data);
        } catch (error) {
          console.error('Error loading semesters:', error);
        } finally {
          setLoadingSemesters(false);
        }
      }
      loadSemesters();
    } else {
      setSemesters([]);
    }
  }, [filters.program]);

  // Load sections when semester changes
  useEffect(() => {
    if (filters.semester && filters.institution) {
      async function loadSections() {
        try {
          setLoadingSections(true);
          const data = await SectionService.getSectionsBySemesterAndInstitution(
            filters.semester!,
            filters.institution!
          );
          setSections(data);
        } catch (error) {
          console.error('Error loading sections:', error);
        } finally {
          setLoadingSections(false);
        }
      }
      loadSections();
    } else {
      setSections([]);
    }
  }, [filters.semester, filters.institution]);

  // Load academic years when institution changes
  useEffect(() => {
    if (filters.institution) {
      async function loadAcademicYears() {
        try {
          setLoadingAcademicYears(true);
          const data = await AcademicYearService.getAcademicYearsByInstitution(
            filters.institution!
          );
          setAcademicYears(data);
        } catch (error) {
          console.error('Error loading academic years:', error);
        } finally {
          setLoadingAcademicYears(false);
        }
      }
      loadAcademicYears();
    } else {
      setAcademicYears([]);
    }
  }, [filters.institution]);

  // Update search input when filters change externally (for reset)
  useEffect(() => {
    setSearchInput(filters.search || '');
  }, [filters.search]);

  const handleSearchClick = () => {
    // Update the search filter and trigger search
    onFilterChange({
      search: searchInput,
      page: 1
    });
    onSearch();
  };

  const handleResetClick = () => {
    setSearchInput('');
    onReset();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearchClick();
    }
  };

  return (
    <div className='space-y-4 mb-6'>
      <div className='flex flex-col sm:flex-row gap-4'>
        <div className='relative flex-1'>
          <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
          <Input
            placeholder='Search by name, roll number, or email...'
            className='pl-8'
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyPress={handleKeyPress}
          />
        </div>

        <Button
          onClick={handleSearchClick}
          disabled={isSearching}
          className='min-w-[100px]'
        >
          {isSearching ? (
            <>
              <div className='animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2' />
              Searching...
            </>
          ) : (
            <>
              <Search className='h-4 w-4 mr-2' />
              Search
            </>
          )}
        </Button>

        <Button
          variant='outline'
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? 'Hide Filters' : 'Advanced Filters'}
        </Button>

        <Button variant='outline' onClick={handleResetClick}>
          <RotateCcw className='h-4 w-4 mr-2' />
          Reset
        </Button>
      </div>

      <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
        <CollapsibleContent>
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4'>
            <Select
              value={filters.institution || 'all'}
              onValueChange={(value) =>
                onFilterChange({
                  institution: value === 'all' ? undefined : value,
                  degree: undefined,
                  department: undefined,
                  program: undefined,
                  semester: undefined,
                  section: undefined,
                  academic_year: undefined,
                  page: 1
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder='All Institutions' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Institutions</SelectItem>
                {institutions.map((institution) => (
                  <SelectItem key={institution.id} value={institution.id}>
                    {institution.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.degree || 'all'}
              onValueChange={(value) =>
                onFilterChange({
                  degree: value === 'all' ? undefined : value,
                  program: undefined,
                  semester: undefined,
                  section: undefined,
                  page: 1
                })
              }
              disabled={!filters.institution || loadingDegrees}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingDegrees ? 'Loading...' : 'All Degrees'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Degrees</SelectItem>
                {degrees.map((degree) => (
                  <SelectItem key={degree.id} value={degree.id}>
                    {degree.degree_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.department || 'all'}
              onValueChange={(value) =>
                onFilterChange({
                  department: value === 'all' ? undefined : value,
                  program: undefined,
                  semester: undefined,
                  section: undefined,
                  page: 1
                })
              }
              disabled={!filters.institution || loadingDepartments}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingDepartments ? 'Loading...' : 'All Departments'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Departments</SelectItem>
                {departments.map((department) => (
                  <SelectItem key={department.id} value={department.id}>
                    {department.department_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.program || 'all'}
              onValueChange={(value) =>
                onFilterChange({
                  program: value === 'all' ? undefined : value,
                  semester: undefined,
                  section: undefined,
                  page: 1
                })
              }
              disabled={(!filters.degree && !filters.department) || loadingPrograms}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingPrograms ? 'Loading...' : 'All Programs'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Programs</SelectItem>
                {programs.map((program) => (
                  <SelectItem key={program.id} value={program.id}>
                    {program.program_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.semester || 'all'}
              onValueChange={(value) =>
                onFilterChange({
                  semester: value === 'all' ? undefined : value,
                  section: undefined,
                  page: 1
                })
              }
              disabled={!filters.program || loadingSemesters}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingSemesters ? 'Loading...' : 'All Semesters'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Semesters</SelectItem>
                {semesters.map((semester) => (
                  <SelectItem key={semester.id} value={semester.id}>
                    {semester.semester_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.section || 'all'}
              onValueChange={(value) =>
                onFilterChange({
                  section: value === 'all' ? undefined : value,
                  page: 1
                })
              }
              disabled={!filters.semester || !filters.institution || loadingSections}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingSections ? 'Loading...' : 'All Sections'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Sections</SelectItem>
                {sections.map((section) => (
                  <SelectItem key={section.id} value={section.id}>
                    {section.section_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.academic_year || 'all'}
              onValueChange={(value) =>
                onFilterChange({
                  academic_year: value === 'all' ? undefined : value,
                  page: 1
                })
              }
              disabled={!filters.institution || loadingAcademicYears}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingAcademicYears ? 'Loading...' : 'All Academic Years'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Academic Years</SelectItem>
                {academicYears.map((academicYear) => (
                  <SelectItem key={academicYear.id} value={academicYear.id}>
                    {academicYear.academic_year_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
