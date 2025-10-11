import { useState, useEffect } from 'react';
import { Search, CalendarIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
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
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { AdmissionFilters as FilterType } from '@/types/admission';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';

// Define a type for the simplified institution returned by getInstitutionNames
type InstitutionName = {
  id: string;
  name: string;
  counselling_code: string;
};

type DepartmentName = {
  id: string;
  department_name: string;
  department_code: string;
};

interface AdmissionFilterProps {
  filters: FilterType;
  onFilterChange: (filters: FilterType) => void;
}

export function AdmissionFilter({
  filters,
  onFilterChange
}: AdmissionFilterProps) {
  const { profile } = useAuth();
  const [localFilters, setLocalFilters] = useState<FilterType>(filters);
  const [fromDate, setFromDate] = useState<Date | undefined>(
    filters.fromDate ? new Date(filters.fromDate) : undefined
  );
  const [toDate, setToDate] = useState<Date | undefined>(
    filters.toDate ? new Date(filters.toDate) : undefined
  );
  const [institutions, setInstitutions] = useState<InstitutionName[]>([]);
  const [loadingInstitutions, setLoadingInstitutions] = useState(true);
  const [departments, setDepartments] = useState<DepartmentName[]>([]);
  const [loadingDepartments, setLoadingDepartments] = useState(false);

  useEffect(() => {
    setLocalFilters(filters);
    setFromDate(filters.fromDate ? new Date(filters.fromDate) : undefined);
    setToDate(filters.toDate ? new Date(filters.toDate) : undefined);
  }, [filters]);

  // Apply filters automatically when localFilters changes
  useEffect(() => {
    const timer = setTimeout(() => {
      // Skip initial render by comparing with current filters
      if (JSON.stringify(localFilters) !== JSON.stringify(filters)) {
        onFilterChange({ ...localFilters, page: 1 });
      }
    }, 500); // Debounce for 500ms

    return () => clearTimeout(timer);
  }, [localFilters, filters, onFilterChange]);

  // Fetch institutions when component mounts with institution access filtering
  useEffect(() => {
    async function fetchInstitutions() {
      try {
        setLoadingInstitutions(true);
        // Check if user has admission role to bypass filtering
        const shouldBypassFilter = profile?.role === 'super_admin' || profile?.role === 'admission';

        console.log('Admission filter institution access check:', {
          userId: profile?.id,
          userRole: profile?.role,
          shouldBypassFilter
        });

        // Use the new getInstitutions method that respects user access
        const { data: institutionsData } =
          await OrganizationService.getInstitutions({
            isActive: true,
            // Add current user context for filtering, but bypass for admission role
            userId: shouldBypassFilter ? undefined : profile?.id,
            bypassInstitutionFilter: shouldBypassFilter
          });
        // Map to the expected format
        const mappedInstitutions = institutionsData.map((inst) => ({
          id: inst.id,
          name: inst.name,
          counselling_code: inst.counselling_code
        }));
        setInstitutions(mappedInstitutions);
      } catch (error) {
        console.error('Error fetching institutions:', error);
      } finally {
        setLoadingInstitutions(false);
      }
    }

    fetchInstitutions();
    // Include profile?.role in dependencies as it affects filtering logic
  }, [profile?.id, profile?.role]);

  // Fetch departments when institution changes
  useEffect(() => {
    async function fetchDepartments() {
      if (!localFilters.institution) {
        setDepartments([]);
        return;
      }

      try {
        setLoadingDepartments(true);
        const { data: departmentsData } = await DepartmentService.getDepartments({
          institution_id: localFilters.institution,
          isActive: true
        });

        const mappedDepartments = departmentsData.map((dept) => ({
          id: dept.id,
          department_name: dept.department_name,
          department_code: dept.department_code
        }));
        setDepartments(mappedDepartments);
      } catch (error) {
        console.error('Error fetching departments:', error);
        setDepartments([]);
      } finally {
        setLoadingDepartments(false);
      }
    }

    fetchDepartments();
  }, [localFilters.institution]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setLocalFilters((prev: FilterType) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    // If institution changes, reset department
    if (name === 'institution') {
      setLocalFilters((prev: FilterType) => ({ ...prev, [name]: value, department: '' }));
    } else {
      setLocalFilters((prev: FilterType) => ({ ...prev, [name]: value }));
    }
  };

  const handleFromDateChange = (date: Date | undefined) => {
    setFromDate(date);
    setLocalFilters((prev: FilterType) => ({
      ...prev,
      fromDate: date ? format(date, 'yyyy-MM-dd') : undefined
    }));
  };

  const handleToDateChange = (date: Date | undefined) => {
    setToDate(date);
    setLocalFilters((prev: FilterType) => ({
      ...prev,
      toDate: date ? format(date, 'yyyy-MM-dd') : undefined
    }));
  };

  const handleResetFilters = () => {
    const resetFilters: FilterType = {
      search: '',
      name: '',
      institution: '',
      department: '',
      entry_type: '',
      status: '',
      course: '',
      fromDate: undefined,
      toDate: undefined,
      page: 1,
      limit: filters.limit || 10
    };
    setLocalFilters(resetFilters);
    setFromDate(undefined);
    setToDate(undefined);
    onFilterChange(resetFilters);
  };

  return (
    <div className='space-y-4 mb-6'>
      <div className='flex flex-col sm:flex-row gap-4'>
        <div className='flex-1'>
          <div className='relative'>
            <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
            <Input
              name='search'
              placeholder='Search by name or application ID...'
              value={localFilters.search || ''}
              onChange={handleInputChange}
              className='w-full pl-10'
            />
          </div>
        </div>

        <div className='w-full sm:w-48'>
          <Select
            value={localFilters.institution || 'all'}
            onValueChange={(value) =>
              handleSelectChange('institution', value === 'all' ? '' : value)
            }
            disabled={loadingInstitutions}
          >
            <SelectTrigger>
              <SelectValue placeholder='Institution' />
            </SelectTrigger>
            <SelectContent className='max-h-60 overflow-y-auto'>
              <SelectItem value='all'>All Institutions</SelectItem>
              {loadingInstitutions ? (
                <div className='p-2'>
                  <Skeleton className='h-5 w-full' />
                  <Skeleton className='h-5 w-full mt-2' />
                  <Skeleton className='h-5 w-full mt-2' />
                </div>
              ) : (
                institutions.map((institution) => (
                  <SelectItem key={institution.id} value={institution.id}>
                    {institution.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        <div className='w-full sm:w-48'>
          <Select
            value={localFilters.department || 'all'}
            onValueChange={(value) =>
              handleSelectChange('department', value === 'all' ? '' : value)
            }
            disabled={!localFilters.institution || loadingDepartments}
          >
            <SelectTrigger>
              <SelectValue placeholder='Department' />
            </SelectTrigger>
            <SelectContent className='max-h-60 overflow-y-auto'>
              <SelectItem value='all'>All Departments</SelectItem>
              {loadingDepartments ? (
                <div className='p-2'>
                  <Skeleton className='h-5 w-full' />
                  <Skeleton className='h-5 w-full mt-2' />
                </div>
              ) : (
                departments.map((department) => (
                  <SelectItem key={department.id} value={department.id}>
                    {department.department_name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        <div className='w-full sm:w-40'>
          <Select
            value={localFilters.entry_type || 'all'}
            onValueChange={(value) =>
              handleSelectChange('entry_type', value === 'all' ? '' : value)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder='Entry Type' />
            </SelectTrigger>
            <SelectContent className='max-h-60 overflow-y-auto'>
              <SelectItem value='all'>All Entry Types</SelectItem>
              <SelectItem value='FIRST YEAR'>First Year</SelectItem>
              <SelectItem value='LATERAL ENTRY'>Lateral Entry</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className='w-full sm:w-36'>
          <Select
            value={localFilters.status || 'all'}
            onValueChange={(value) =>
              handleSelectChange('status', value === 'all' ? '' : value)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder='Status' />
            </SelectTrigger>
            <SelectContent className='max-h-60 overflow-y-auto'>
              <SelectItem value='all'>All Statuses</SelectItem>
              <SelectItem value='pending'>Pending</SelectItem>
              <SelectItem value='approved'>Approved</SelectItem>
              <SelectItem value='rejected'>Rejected</SelectItem>
              <SelectItem value='waitlisted'>Waitlisted</SelectItem>
              <SelectItem value='enrolled'>Enrolled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className='flex flex-col sm:flex-row gap-4'>
        <div className='w-full sm:w-auto flex-1'>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant='outline'
                className={cn(
                  'w-full justify-start text-left font-normal',
                  !fromDate && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className='mr-2 h-4 w-4' />
                {fromDate ? format(fromDate, 'PPP') : 'From Date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className='w-auto p-0'>
              <Calendar
                mode='single'
                selected={fromDate}
                onSelect={handleFromDateChange}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className='w-full sm:w-auto flex-1'>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant='outline'
                className={cn(
                  'w-full justify-start text-left font-normal',
                  !toDate && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className='mr-2 h-4 w-4' />
                {toDate ? format(toDate, 'PPP') : 'To Date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className='w-auto p-0'>
              <Calendar
                mode='single'
                selected={toDate}
                onSelect={handleToDateChange}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className='flex gap-2'>
          <Button
            variant='outline'
            onClick={handleResetFilters}
            className='flex-1 w-full'
          >
            Reset Filters
          </Button>
        </div>
      </div>
    </div>
  );
}
