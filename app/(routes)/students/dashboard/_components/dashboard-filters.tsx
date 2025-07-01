'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import {
  Calendar,
  Filter,
  X,
  Building,
  BookOpen,
  GraduationCap
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { DashboardFilters } from '@/types/student';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';

interface DashboardFiltersPanelProps {
  filters: DashboardFilters;
  onFiltersChange: (filters: DashboardFilters) => void;
  isLoading: boolean;
}

export function DashboardFiltersPanel({
  filters,
  onFiltersChange,
  isLoading
}: DashboardFiltersPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [departments, setDepartments] = useState<
    Array<{ id: string; department_name: string }>
  >([]);
  const [programs, setPrograms] = useState<
    Array<{ id: string; program_name: string }>
  >([]);

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
    if (filters.institutionId) {
      async function loadDepartments() {
        try {
          const { data } = await DepartmentService.getDepartments({
            institution_id: filters.institutionId,
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
  }, [filters.institutionId]);

  // Load programs when department changes
  useEffect(() => {
    if (filters.departmentId) {
      async function loadPrograms() {
        try {
          const { data } = await ProgramService.getPrograms({
            department_id: filters.departmentId,
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
  }, [filters.departmentId]);

  const handleDateRangeChange = (range: any) => {
    if (range?.from) {
      onFiltersChange({
        ...filters,
        dateRange: {
          from: range.from,
          to: range.to || range.from
        }
      });
    }
  };

  const handleInstitutionChange = (institutionId: string) => {
    onFiltersChange({
      ...filters,
      institutionId: institutionId || undefined,
      departmentId: undefined,
      programId: undefined
    });
  };

  const handleDepartmentChange = (departmentId: string) => {
    onFiltersChange({
      ...filters,
      departmentId: departmentId || undefined,
      programId: undefined
    });
  };

  const handleProgramChange = (programId: string) => {
    onFiltersChange({
      ...filters,
      programId: programId || undefined
    });
  };

  const handleStatusChange = (status: string, checked: boolean) => {
    const currentStatus = filters.status || [];
    if (checked) {
      onFiltersChange({
        ...filters,
        status: [...currentStatus, status]
      });
    } else {
      onFiltersChange({
        ...filters,
        status: currentStatus.filter((s) => s !== status)
      });
    }
  };

  const handleClearFilters = () => {
    onFiltersChange({
      dateRange: {
        from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        to: new Date()
      }
    });
  };

  const getActiveFiltersCount = () => {
    let count = 0;
    if (filters.institutionId) count++;
    if (filters.departmentId) count++;
    if (filters.programId) count++;
    if (filters.status && filters.status.length > 0) count++;
    return count;
  };

  const statusOptions = [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'pending', label: 'Pending' },
    { value: 'exited', label: 'Exited' },
    { value: 'graduated', label: 'Graduated' }
  ];

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between'>
          <CardTitle className='flex items-center gap-2'>
            <Filter className='h-5 w-5' />
            Dashboard Filters
            {getActiveFiltersCount() > 0 && (
              <Badge variant='secondary' className='ml-2'>
                {getActiveFiltersCount()} active
              </Badge>
            )}
          </CardTitle>
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setIsOpen(!isOpen)}
            >
              {isOpen ? 'Hide Filters' : 'Show Filters'}
            </Button>
            {getActiveFiltersCount() > 0 && (
              <Button variant='ghost' size='sm' onClick={handleClearFilters}>
                <X className='h-4 w-4 mr-1' />
                Clear
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      {isOpen && (
        <CardContent className='space-y-4'>
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
            {/* Date Range */}
            <div className='space-y-2'>
              <Label>Date Range</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant='outline'
                    className='w-full justify-start text-left font-normal'
                  >
                    <Calendar className='mr-2 h-4 w-4' />
                    {filters.dateRange?.from ? (
                      filters.dateRange.to ? (
                        `${format(filters.dateRange.from, 'MMM dd')} - ${format(
                          filters.dateRange.to,
                          'MMM dd'
                        )}`
                      ) : (
                        format(filters.dateRange.from, 'MMM dd, yyyy')
                      )
                    ) : (
                      <span>Pick a date range</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className='w-auto p-0' align='start'>
                  <CalendarComponent
                    initialFocus
                    mode='range'
                    defaultMonth={filters.dateRange?.from}
                    selected={filters.dateRange}
                    onSelect={handleDateRangeChange}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Institution */}
            <div className='space-y-2'>
              <Label>Institution</Label>
              <Select
                value={filters.institutionId || ''}
                onValueChange={handleInstitutionChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select institution' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=''>All Institutions</SelectItem>
                  {institutions.map((institution) => (
                    <SelectItem key={institution.id} value={institution.id}>
                      {institution.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Department */}
            <div className='space-y-2'>
              <Label>Department</Label>
              <Select
                value={filters.departmentId || ''}
                onValueChange={handleDepartmentChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select department' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=''>All Departments</SelectItem>
                  {departments.map((department) => (
                    <SelectItem key={department.id} value={department.id}>
                      {department.department_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Program */}
            <div className='space-y-2'>
              <Label>Program</Label>
              <Select
                value={filters.programId || ''}
                onValueChange={handleProgramChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select program' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=''>All Programs</SelectItem>
                  {programs.map((program) => (
                    <SelectItem key={program.id} value={program.id}>
                      {program.program_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Status Filters */}
          <div className='space-y-2'>
            <Label>Student Status</Label>
            <div className='flex flex-wrap gap-4'>
              {statusOptions.map((option) => (
                <div key={option.value} className='flex items-center space-x-2'>
                  <Checkbox
                    id={`status-${option.value}`}
                    checked={filters.status?.includes(option.value) || false}
                    onCheckedChange={(checked) =>
                      handleStatusChange(option.value, checked as boolean)
                    }
                  />
                  <Label htmlFor={`status-${option.value}`} className='text-sm'>
                    {option.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
