'use client';

import { useEffect } from 'react';
import { ClassInchargeFilters } from '@/types/staff';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useDegrees } from '@/hooks/organization/use-degrees';
import { useDepartments } from '@/hooks/organization/use-departments';
import { usePrograms } from '@/hooks/organization/use-programs';
import { useSemesters } from '@/hooks/organization/use-semesters';
import { useSections } from '@/hooks/organization/use-sections';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RotateCcw } from 'lucide-react';

interface Props {
  filters: ClassInchargeFilters;
  onFiltersChange: (updated: Partial<ClassInchargeFilters>) => void;
}

export function ClassInchargesFilters({ filters, onFiltersChange }: Props) {
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();

  // Institution list — respects user access automatically inside the hook
  const { institutions, loading: institutionsLoading } =
    useInstitutionsWithAccess();

  // Cascading dropdowns — each level is disabled until parent is selected
  const { data: degreesData, isLoading: degreesLoading } = useDegrees({
    institution_id: filters.institution_id,
    isActive: true,
  });

  const { data: departmentsData, isLoading: departmentsLoading } =
    useDepartments({
      institution_id: filters.institution_id,
      degree_id: filters.degree_id,
      isActive: true,
    });

  const { data: programsData, isLoading: programsLoading } = usePrograms({
    institution_id: filters.institution_id,
    degree_id: filters.degree_id,
    department_id: filters.department_id,
    isActive: true,
  });

  const { data: semestersData, isLoading: semestersLoading } = useSemesters({
    institution_id: filters.institution_id,
    degree_id: filters.degree_id,
    department_id: filters.department_id,
    program_id: filters.program_id,
    isActive: true,
  });

  const { data: sectionsData, isLoading: sectionsLoading } = useSections({
    institution_id: filters.institution_id,
    degree_id: filters.degree_id,
    department_id: filters.department_id,
    program_id: filters.program_id,
    semester_id: filters.semester_id,
    isActive: true,
  });

  // Auto-select institution for non-super-admin users
  useEffect(() => {
    if (!isSuperAdmin && profile?.institution_id && !filters.institution_id) {
      onFiltersChange({ institution_id: profile.institution_id });
    }
  }, [profile, isSuperAdmin, filters.institution_id, onFiltersChange]);

  function handleReset() {
    onFiltersChange({
      institution_id: isSuperAdmin
        ? undefined
        : profile?.institution_id ?? undefined,
      degree_id: undefined,
      department_id: undefined,
      program_id: undefined,
      semester_id: undefined,
      section_id: undefined,
    });
  }

  const degrees = degreesData?.data ?? [];
  const departments = departmentsData?.data ?? [];
  const programs = programsData?.data ?? [];
  const semesters = semestersData?.data ?? [];
  const sections = sectionsData?.data ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Filters</CardTitle>
          <Button variant="ghost" size="sm" onClick={handleReset}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Reset
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* Institution — super admin only */}
          {isSuperAdmin && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Institution</Label>
              <Select
                value={filters.institution_id ?? ''}
                onValueChange={(val) =>
                  onFiltersChange({
                    institution_id: val || undefined,
                    degree_id: undefined,
                    department_id: undefined,
                    program_id: undefined,
                    semester_id: undefined,
                    section_id: undefined,
                  })
                }
                disabled={institutionsLoading}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="All institutions" />
                </SelectTrigger>
                <SelectContent>
                  {institutions.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Degree — disabled until institution selected */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Degree</Label>
            <Select
              value={filters.degree_id ?? ''}
              onValueChange={(val) =>
                onFiltersChange({
                  degree_id: val || undefined,
                  department_id: undefined,
                  program_id: undefined,
                  semester_id: undefined,
                  section_id: undefined,
                })
              }
              disabled={!filters.institution_id || degreesLoading}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="All degrees" />
              </SelectTrigger>
              <SelectContent>
                {degrees.map((deg) => (
                  <SelectItem key={deg.id} value={deg.id}>
                    {deg.degree_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Department — disabled until degree selected */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Department</Label>
            <Select
              value={filters.department_id ?? ''}
              onValueChange={(val) =>
                onFiltersChange({
                  department_id: val || undefined,
                  program_id: undefined,
                  semester_id: undefined,
                  section_id: undefined,
                })
              }
              disabled={!filters.degree_id || departmentsLoading}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="All departments" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {dept.department_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Program — disabled until department selected */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Program</Label>
            <Select
              value={filters.program_id ?? ''}
              onValueChange={(val) =>
                onFiltersChange({
                  program_id: val || undefined,
                  semester_id: undefined,
                  section_id: undefined,
                })
              }
              disabled={!filters.department_id || programsLoading}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="All programs" />
              </SelectTrigger>
              <SelectContent>
                {programs.map((prog) => (
                  <SelectItem key={prog.id} value={prog.id}>
                    {prog.program_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Semester — disabled until program selected */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Semester</Label>
            <Select
              value={filters.semester_id ?? ''}
              onValueChange={(val) =>
                onFiltersChange({
                  semester_id: val || undefined,
                  section_id: undefined,
                })
              }
              disabled={!filters.program_id || semestersLoading}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="All semesters" />
              </SelectTrigger>
              <SelectContent>
                {semesters.map((sem) => (
                  <SelectItem key={sem.id} value={sem.id}>
                    {sem.semester_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Section — disabled until semester selected */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Section</Label>
            <Select
              value={filters.section_id ?? ''}
              onValueChange={(val) =>
                onFiltersChange({ section_id: val || undefined })
              }
              disabled={!filters.semester_id || sectionsLoading}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="All sections" />
              </SelectTrigger>
              <SelectContent>
                {sections.map((sec) => (
                  <SelectItem key={sec.id} value={sec.id}>
                    {sec.section_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
