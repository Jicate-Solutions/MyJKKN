'use client';

import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
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
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { StudentFilters } from '@/types/student';

interface PromotionFiltersProps {
  filters: StudentFilters;
  onFilterChange: (filters: Partial<StudentFilters>) => void;
}

export function PromotionFilters({
  filters,
  onFilterChange
}: PromotionFiltersProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }>
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

  const [searchInput, setSearchInput] = useState(filters.search || '');

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

  // Load departments when institution changes
  useEffect(() => {
    if (filters.institution) {
      async function loadDepartments() {
        try {
          const { data } = await DepartmentService.getDepartments({
            institution_id: filters.institution,
            isActive: true
          });
          setDepartments(data);
        } catch (error) {
          console.error('Error loading departments:', error);
        }
      }
      loadDepartments();
    } else {
      setDepartments([]);
    }
  }, [filters.institution]);

  // Load programs when department changes
  useEffect(() => {
    if (filters.department) {
      async function loadPrograms() {
        try {
          const { data } = await ProgramService.getPrograms({
            department_id: filters.department,
            isActive: true
          });
          setPrograms(data);
        } catch (error) {
          console.error('Error loading programs:', error);
        }
      }
      loadPrograms();
    } else {
      setPrograms([]);
    }
  }, [filters.department]);

  // Load semesters when program changes
  useEffect(() => {
    if (filters.program) {
      async function loadSemesters() {
        try {
          const data = await SemesterService.getSemestersByProgram(
            filters.program!
          );
          setSemesters(data);
        } catch (error) {
          console.error('Error loading semesters:', error);
        }
      }
      loadSemesters();
    } else {
      setSemesters([]);
    }
  }, [filters.program]);

  // Load sections when semester changes
  useEffect(() => {
    if (filters.semester) {
      async function loadSections() {
        try {
          const data = await SectionService.getSectionsBySemester(
            filters.semester!
          );
          setSections(data);
        } catch (error) {
          console.error('Error loading sections:', error);
        }
      }
      loadSections();
    } else {
      setSections([]);
    }
  }, [filters.semester]);

  // Handle search input with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.search) {
        onFilterChange({ search: searchInput });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput, filters.search, onFilterChange]);

  const handleReset = () => {
    setSearchInput('');
    onFilterChange({
      search: undefined,
      institution: undefined,
      department: undefined,
      program: undefined,
      semester: undefined,
      section: undefined,
      page: 1
    });
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
          />
        </div>

        <Button
          variant='outline'
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? 'Hide Filters' : 'Show Filters'}
        </Button>

        <Button variant='outline' onClick={handleReset}>
          Reset
        </Button>
      </div>

      <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
        <CollapsibleContent>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mt-4'>
            <Select
              value={filters.institution || 'all'}
              onValueChange={(value) =>
                onFilterChange({
                  institution: value === 'all' ? undefined : value,
                  department: undefined,
                  program: undefined,
                  semester: undefined,
                  section: undefined,
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
              disabled={!filters.institution}
            >
              <SelectTrigger>
                <SelectValue placeholder='All Departments' />
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
              disabled={!filters.department}
            >
              <SelectTrigger>
                <SelectValue placeholder='All Programs' />
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
              disabled={!filters.program}
            >
              <SelectTrigger>
                <SelectValue placeholder='All Semesters' />
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
              disabled={!filters.semester}
            >
              <SelectTrigger>
                <SelectValue placeholder='All Sections' />
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
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
