'use client';

import { useEffect, useState } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

import { usePermissions } from '@/hooks/use-permissions';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { SectionFilters as SectionFilterType } from '@/types/organizations';
import DownloadSectionTemplateButton from './download-section-template';
import BulkUploadSections from './bulk-upload-sections';

interface SectionFiltersProps {
  filters: Partial<SectionFilterType>;
  onFilterChange: (filters: Partial<SectionFilterType>) => void;
}

export function SectionFilters({
  filters,
  onFilterChange
}: SectionFiltersProps) {
  // Dropdown data states
  const [institutions, setInstitutions] = useState<
    { id: string; name: string; counselling_code: string }[]
  >([]);
  const [degrees, setDegrees] = useState<
    { id: string; degree_name: string; degree_id: string }[]
  >([]);
  const [departments, setDepartments] = useState<
    { id: string; department_name: string; department_code: string }[]
  >([]);
  const [programs, setPrograms] = useState<
    { id: string; program_name: string; program_id: string }[]
  >([]);
  const [semesters, setSemesters] = useState<
    { id: string; semester_name: string; semester_code: string }[]
  >([]);

  // Loading states
  const [loadingInstitutions, setLoadingInstitutions] = useState(true);
  const [loadingDegrees, setLoadingDegrees] = useState(false);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [loadingSemesters, setLoadingSemesters] = useState(false);

  const { canAccess, isSuperAdmin, userProfile } = usePermissions();
  const canViewSections =
    isSuperAdmin || canAccess('organizations.sections', 'view');
  const canCreateSections =
    isSuperAdmin || canAccess('organizations.sections', 'create');

  // Fetch institutions for dropdown
  useEffect(() => {
    const fetchInstitutions = async () => {
      try {
        setLoadingInstitutions(true);

        if (isSuperAdmin) {
          // Super admin can see all institutions
          const institutionNames =
            await OrganizationService.getInstitutionNames(true);
          setInstitutions(institutionNames);
        } else if (userProfile?.institution_id) {
          // Faculty users - fetch only their institution
          try {
            const institutionNames =
              await OrganizationService.getInstitutionNames(true);
            const userInstitution = institutionNames.find(
              (inst) => inst.id === userProfile.institution_id
            );
            if (userInstitution) {
              setInstitutions([userInstitution]);
            }
          } catch (error) {
            console.error('Error fetching user institution:', error);
            setInstitutions([]);
          }
        }
      } catch (error) {
        console.error('Error fetching institutions:', error);
        setInstitutions([]);
      } finally {
        setLoadingInstitutions(false);
      }
    };

    fetchInstitutions();
  }, [isSuperAdmin, userProfile?.institution_id]);

  // Auto-set institution filter for faculty users
  useEffect(() => {
    if (
      !isSuperAdmin &&
      userProfile?.institution_id &&
      !filters.institution_id &&
      !loadingInstitutions &&
      institutions.length > 0
    ) {
      onFilterChange({ institution_id: userProfile.institution_id });
    }
  }, [
    userProfile,
    isSuperAdmin,
    filters.institution_id,
    onFilterChange,
    loadingInstitutions,
    institutions
  ]);

  // Fetch degrees when institution filter changes
  useEffect(() => {
    const fetchDegrees = async () => {
      if (!filters.institution_id) {
        setDegrees([]);
        return;
      }

      try {
        setLoadingDegrees(true);
        const response = await DegreeService.getDegrees({
          institution_id: filters.institution_id,
          isActive: true,
          limit: 100
        });
        setDegrees(response.data);
      } catch (error) {
        console.error('Error fetching degrees:', error);
        setDegrees([]);
      } finally {
        setLoadingDegrees(false);
      }
    };

    fetchDegrees();
  }, [filters.institution_id]);

  // Fetch departments when degree filter changes
  useEffect(() => {
    const fetchDepartments = async () => {
      if (!filters.degree_id) {
        setDepartments([]);
        return;
      }

      try {
        setLoadingDepartments(true);
        const response = await DepartmentService.getDepartments({
          degree_id: filters.degree_id,
          isActive: true,
          limit: 100
        });
        setDepartments(response.data);
      } catch (error) {
        console.error('Error fetching departments:', error);
        setDepartments([]);
      } finally {
        setLoadingDepartments(false);
      }
    };

    fetchDepartments();
  }, [filters.degree_id]);

  // Fetch programs when department filter changes
  useEffect(() => {
    const fetchPrograms = async () => {
      if (!filters.department_id) {
        setPrograms([]);
        return;
      }

      try {
        setLoadingPrograms(true);
        const response = await ProgramService.getPrograms({
          department_id: filters.department_id,
          isActive: true,
          limit: 100
        });
        setPrograms(response.data);
      } catch (error) {
        console.error('Error fetching programs:', error);
        setPrograms([]);
      } finally {
        setLoadingPrograms(false);
      }
    };

    fetchPrograms();
  }, [filters.department_id]);

  // Fetch semesters when program filter changes
  useEffect(() => {
    const fetchSemesters = async () => {
      if (!filters.program_id) {
        setSemesters([]);
        return;
      }

      try {
        setLoadingSemesters(true);
        const response = await SemesterService.getSemesters({
          program_id: filters.program_id,
          isActive: true,
          limit: 100
        });
        setSemesters(response.data);
      } catch (error) {
        console.error('Error fetching semesters:', error);
        setSemesters([]);
      } finally {
        setLoadingSemesters(false);
      }
    };

    fetchSemesters();
  }, [filters.program_id]);

  // Handle cascading filter changes
  const handleInstitutionChange = (value: string) => {
    const institutionId = value === 'all' ? undefined : value;
    onFilterChange({
      ...filters,
      institution_id: institutionId,
      degree_id: undefined,
      department_id: undefined,
      program_id: undefined,
      semester_id: undefined
    });
  };

  const handleDegreeChange = (value: string) => {
    const degreeId = value === 'all' ? undefined : value;
    onFilterChange({
      ...filters,
      degree_id: degreeId,
      department_id: undefined,
      program_id: undefined,
      semester_id: undefined
    });
  };

  const handleDepartmentChange = (value: string) => {
    const departmentId = value === 'all' ? undefined : value;
    onFilterChange({
      ...filters,
      department_id: departmentId,
      program_id: undefined,
      semester_id: undefined
    });
  };

  const handleProgramChange = (value: string) => {
    const programId = value === 'all' ? undefined : value;
    onFilterChange({
      ...filters,
      program_id: programId,
      semester_id: undefined
    });
  };

  const handleSemesterChange = (value: string) => {
    const semesterId = value === 'all' ? undefined : value;
    onFilterChange({
      ...filters,
      semester_id: semesterId
    });
  };

  return (
    <div className='space-y-4 mb-6'>
      {/* Hierarchy Filters */}
      <div className='grid gap-4 w-full md:grid-cols-3 lg:grid-cols-6'>
        {/* Institution Filter */}
        <Select
          value={filters.institution_id || 'all'}
          onValueChange={handleInstitutionChange}
          disabled={loadingInstitutions || !isSuperAdmin}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                isSuperAdmin
                  ? 'Filter by institution'
                  : loadingInstitutions
                  ? 'Loading...'
                  : 'Your institution'
              }
            />
          </SelectTrigger>
          <SelectContent>
            {isSuperAdmin && (
              <SelectItem value='all'>All Institutions</SelectItem>
            )}
            {institutions.map((institution) => (
              <SelectItem key={institution.id} value={institution.id}>
                {institution.name} ({institution.counselling_code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Degree Filter */}
        <Select
          value={filters.degree_id || 'all'}
          onValueChange={handleDegreeChange}
          disabled={!filters.institution_id || loadingDegrees}
        >
          <SelectTrigger>
            <SelectValue placeholder='Filter by degree' />
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

        {/* Department Filter */}
        <Select
          value={filters.department_id || 'all'}
          onValueChange={handleDepartmentChange}
          disabled={!filters.degree_id || loadingDepartments}
        >
          <SelectTrigger>
            <SelectValue placeholder='Filter by department' />
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

        {/* Program Filter */}
        <Select
          value={filters.program_id || 'all'}
          onValueChange={handleProgramChange}
          disabled={!filters.department_id || loadingPrograms}
        >
          <SelectTrigger>
            <SelectValue placeholder='Filter by program' />
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

        {/* Semester Filter */}
        <Select
          value={filters.semester_id || 'all'}
          onValueChange={handleSemesterChange}
          disabled={!filters.program_id || loadingSemesters}
        >
          <SelectTrigger>
            <SelectValue placeholder='Filter by semester' />
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

        {/* Status Filter */}
        <Select
          value={
            filters.isActive !== undefined ? filters.isActive.toString() : 'all'
          }
          onValueChange={(value) =>
            onFilterChange({
              ...filters,
              isActive: value === 'all' ? undefined : value === 'true'
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder='Filter by status' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Statuses</SelectItem>
            <SelectItem value='true'>Active</SelectItem>
            <SelectItem value='false'>Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Action Buttons */}
      <div className='flex items-center justify-between gap-2 w-full'>
        <div className='flex items-center gap-2'>
          {canViewSections && <DownloadSectionTemplateButton />}
          {canCreateSections && <BulkUploadSections />}
        </div>
      </div>
    </div>
  );
}
