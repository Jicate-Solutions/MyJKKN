'use client';

import { useState, useEffect } from 'react';
import { Search, X, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { SemesterService } from '@/lib/services/organization/semester-service';
import type { Institution, Department, Semester } from '@/types/organizations';
import type { StudentSearchFilters } from '@/types/billing-schedule';

interface StudentSearchFiltersProps {
  filters: StudentSearchFilters;
  onFilterChange: (filters: Partial<StudentSearchFilters>) => void;
}

export function StudentSearchFilters({
  filters,
  onFilterChange
}: StudentSearchFiltersProps) {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [isLoadingInstitutions, setIsLoadingInstitutions] = useState(true);
  const [isLoadingDepartments, setIsLoadingDepartments] = useState(false);
  const [isLoadingSemesters, setIsLoadingSemesters] = useState(false);

  // Debounced search state
  const [searchInput, setSearchInput] = useState(filters.student_name || '');
  const [rollNumberInput, setRollNumberInput] = useState(
    filters.roll_number || ''
  );
  const [mobileInput, setMobileInput] = useState(filters.mobile_number || '');

  useEffect(() => {
    loadInstitutions();
  }, []);

  // Sync local input states with filter props when they change
  useEffect(() => {
    setSearchInput(filters.student_name || '');
  }, [filters.student_name]);

  useEffect(() => {
    setRollNumberInput(filters.roll_number || '');
  }, [filters.roll_number]);

  useEffect(() => {
    setMobileInput(filters.mobile_number || '');
  }, [filters.mobile_number]);

  useEffect(() => {
    if (filters.institution_id) {
      loadDepartments(filters.institution_id);
      loadSemesters(filters.institution_id);
    } else {
      setDepartments([]);
      setSemesters([]);
    }
  }, [filters.institution_id]);

  // Debounce search inputs
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.student_name) {
        onFilterChange({ student_name: searchInput || undefined });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchInput, filters.student_name, onFilterChange]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (rollNumberInput !== filters.roll_number) {
        onFilterChange({ roll_number: rollNumberInput || undefined });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [rollNumberInput, filters.roll_number, onFilterChange]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (mobileInput !== filters.mobile_number) {
        onFilterChange({ mobile_number: mobileInput || undefined });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [mobileInput, filters.mobile_number, onFilterChange]);

  const loadInstitutions = async () => {
    try {
      setIsLoadingInstitutions(true);
      const institutionNames = await OrganizationService.getInstitutionNames(
        true
      );
      setInstitutions(institutionNames as Institution[]);
    } catch (error) {
      console.error('Error loading institutions:', error);
    } finally {
      setIsLoadingInstitutions(false);
    }
  };

  const loadDepartments = async (institutionId: string) => {
    try {
      setIsLoadingDepartments(true);
      const departmentData =
        await DepartmentService.getDepartmentsByInstitution(institutionId);
      setDepartments(departmentData);
    } catch (error) {
      console.error('Error loading departments:', error);
    } finally {
      setIsLoadingDepartments(false);
    }
  };

  const loadSemesters = async (institutionId: string) => {
    try {
      setIsLoadingSemesters(true);
      const semesterData = await SemesterService.getSemesters({
        institution_id: institutionId,
        isActive: true
      });
      setSemesters(semesterData.data);
    } catch (error) {
      console.error('Error loading semesters:', error);
    } finally {
      setIsLoadingSemesters(false);
    }
  };

  const handleClearFilters = () => {
    setSearchInput('');
    setRollNumberInput('');
    setMobileInput('');
    onFilterChange({
      student_name: undefined,
      roll_number: undefined,
      mobile_number: undefined,
      institution_id: undefined,
      academic_year_id: undefined,
      semester_id: undefined,
      department_id: undefined
    });
  };

  const hasActiveFilters =
    filters.student_name ||
    filters.roll_number ||
    filters.mobile_number ||
    filters.institution_id ||
    filters.academic_year_id ||
    filters.semester_id ||
    filters.department_id;

  return (
    <div className='space-y-4 mb-6'>
      <div className='flex items-center gap-2 mb-4'>
        <Filter className='h-4 w-4 text-muted-foreground' />
        <h3 className='text-sm font-medium'>Advanced Search & Filters</h3>
      </div>

      {/* Search Fields Row */}
      <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
        {/* Student Name Search */}
        <div className='relative'>
          <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4' />
          <Input
            placeholder='Search by student name...'
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className='pl-10'
          />
        </div>

        {/* Roll Number Search */}
        <div className='relative'>
          <Input
            placeholder='Search by roll number...'
            value={rollNumberInput}
            onChange={(e) => setRollNumberInput(e.target.value)}
          />
        </div>

        {/* Mobile Number Search */}
        <div className='relative'>
          <Input
            placeholder='Search by mobile number...'
            value={mobileInput}
            onChange={(e) => setMobileInput(e.target.value)}
          />
        </div>
      </div>

      {/* Filter Dropdowns Row */}
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
        {/* Institution Filter */}
        <Select
          value={filters.institution_id || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              institution_id: value === 'all' ? undefined : value,
              department_id: undefined,
              semester_id: undefined
            })
          }
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                isLoadingInstitutions
                  ? 'Loading institutions...'
                  : 'All institutions'
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All institutions</SelectItem>
            {institutions.map((institution) => (
              <SelectItem key={institution.id} value={institution.id}>
                {institution.name} ({institution.counselling_code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Academic Year Filter */}
        <Select
          value={filters.academic_year_id || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              academic_year_id: value === 'all' ? undefined : value
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder='All academic years' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All academic years</SelectItem>
            {/* TODO: Load academic years dynamically */}
            <SelectItem value='2023-24'>2023-24</SelectItem>
            <SelectItem value='2024-25'>2024-25</SelectItem>
          </SelectContent>
        </Select>

        {/* Semester Filter */}
        <Select
          value={filters.semester_id || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              semester_id: value === 'all' ? undefined : value
            })
          }
          disabled={!filters.institution_id || isLoadingSemesters}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                !filters.institution_id
                  ? 'Select institution first'
                  : isLoadingSemesters
                  ? 'Loading semesters...'
                  : 'All semesters'
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All semesters</SelectItem>
            {semesters.map((semester) => (
              <SelectItem key={semester.id} value={semester.id}>
                {semester.semester_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Department Filter */}
        <Select
          value={filters.department_id || 'all'}
          onValueChange={(value) =>
            onFilterChange({
              department_id: value === 'all' ? undefined : value
            })
          }
          disabled={!filters.institution_id || isLoadingDepartments}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                !filters.institution_id
                  ? 'Select institution first'
                  : isLoadingDepartments
                  ? 'Loading departments...'
                  : 'All departments'
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All departments</SelectItem>
            {departments.map((department) => (
              <SelectItem key={department.id} value={department.id}>
                {department.department_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <div className='flex justify-end'>
          <Button
            variant='outline'
            size='sm'
            onClick={handleClearFilters}
            className='h-8'
          >
            <X className='mr-2 h-4 w-4' />
            Clear Filters
          </Button>
        </div>
      )}
    </div>
  );
}
