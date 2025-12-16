'use client';

import { useDepartments } from '@/hooks/organization/use-departments';
import { useSemesters } from '@/hooks/organization/use-semesters';
import { useSections } from '@/hooks/organization/use-sections';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { usePermissions } from '@/hooks/use-permissions';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { Department, Semester, Section } from '@/types/organizations';

interface CalendarFiltersProps {
  isSuperAdmin: boolean;
  selectedInstitution?: string;
  selectedDepartment?: string;
  selectedSemester?: string;
  selectedSection?: string;
  onInstitutionChange: (value: string | undefined) => void;
  onDepartmentChange: (value: string | undefined) => void;
  onSemesterChange: (value: string | undefined) => void;
  onSectionChange: (value: string | undefined) => void;
}

export function CalendarFilters({
  isSuperAdmin,
  selectedInstitution,
  selectedDepartment,
  selectedSemester,
  selectedSection,
  onInstitutionChange,
  onDepartmentChange,
  onSemesterChange,
  onSectionChange
}: CalendarFiltersProps) {
  const { userProfile } = usePermissions();

  // For super admin, use selected institution; for others, use their own institution
  const effectiveInstitutionId = isSuperAdmin
    ? selectedInstitution
    : userProfile?.institution_id ?? undefined;

  // Fetch institutions for super admin
  const { institutions, loading: instLoading } = useInstitutionsWithAccess({
    autoFetch: isSuperAdmin
  });

  const departmentsQuery = useDepartments({ institution_id: effectiveInstitutionId });
  const semestersQuery = useSemesters({
    institution_id: effectiveInstitutionId,
    department_id: selectedDepartment
  });
  const sectionsQuery = useSections({
    institution_id: effectiveInstitutionId,
    department_id: selectedDepartment,
    semester_id: selectedSemester
  });

  const departments = (departmentsQuery.data?.data || []) as Department[];
  const semesters = (semestersQuery.data?.data || []) as Semester[];
  const sections = (sectionsQuery.data?.data || []) as Section[];
  const deptLoading = departmentsQuery.isLoading;
  const semLoading = semestersQuery.isLoading;
  const secLoading = sectionsQuery.isLoading;

  const handleClearFilters = () => {
    if (isSuperAdmin) {
      onInstitutionChange(undefined);
    }
    onDepartmentChange(undefined);
    onSemesterChange(undefined);
    onSectionChange(undefined);
  };

  const hasFilters = selectedInstitution || selectedDepartment || selectedSemester || selectedSection;

  return (
    <div className='flex flex-wrap items-end gap-4'>
      {/* Institution Filter - Only for Super Admin */}
      {isSuperAdmin && (
        <div className='space-y-1.5'>
          <Label className='text-sm'>Institution</Label>
          <Select
            value={selectedInstitution || '_all'}
            onValueChange={(value) =>
              onInstitutionChange(value === '_all' ? undefined : value)
            }
            disabled={instLoading}
          >
            <SelectTrigger className='w-[220px]'>
              <SelectValue placeholder='All Institutions' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='_all'>All Institutions</SelectItem>
              {institutions.map((inst) => (
                <SelectItem key={inst.id} value={inst.id}>
                  {inst.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className='space-y-1.5'>
        <Label className='text-sm'>Department</Label>
        <Select
          value={selectedDepartment || '_all'}
          onValueChange={(value) =>
            onDepartmentChange(value === '_all' ? undefined : value)
          }
          disabled={deptLoading || (isSuperAdmin && !selectedInstitution)}
        >
          <SelectTrigger className='w-[200px]'>
            <SelectValue placeholder='All Departments' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='_all'>All Departments</SelectItem>
            {departments.map((dept) => (
              <SelectItem key={dept.id} value={dept.id}>
                {dept.department_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className='space-y-1.5'>
        <Label className='text-sm'>Semester</Label>
        <Select
          value={selectedSemester || '_all'}
          onValueChange={(value) =>
            onSemesterChange(value === '_all' ? undefined : value)
          }
          disabled={semLoading || !selectedDepartment}
        >
          <SelectTrigger className='w-[200px]'>
            <SelectValue placeholder='All Semesters' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='_all'>All Semesters</SelectItem>
            {semesters.map((sem) => (
              <SelectItem key={sem.id} value={sem.id}>
                {sem.semester_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className='space-y-1.5'>
        <Label className='text-sm'>Section</Label>
        <Select
          value={selectedSection || '_all'}
          onValueChange={(value) =>
            onSectionChange(value === '_all' ? undefined : value)
          }
          disabled={secLoading || !selectedSemester}
        >
          <SelectTrigger className='w-[200px]'>
            <SelectValue placeholder='All Sections' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='_all'>All Sections</SelectItem>
            {sections.map((sec) => (
              <SelectItem key={sec.id} value={sec.id}>
                {sec.section_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasFilters && (
        <Button
          variant='ghost'
          size='sm'
          onClick={handleClearFilters}
          className='gap-1'
        >
          <X className='h-4 w-4' />
          Clear
        </Button>
      )}
    </div>
  );
}
