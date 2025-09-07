'use client';

import { useState, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useDepartments } from '@/hooks/organization/use-departments';
import { usePrograms } from '@/hooks/organization/use-programs';
import {
  Search,
  Filter,
  X,
  Building,
  BookOpen,
  GraduationCap,
  Tag,
  RotateCcw
} from 'lucide-react';

interface TemplateFiltersProps {
  searchParams: Record<string, string>;
  onFilterChange: (key: string, value: string | undefined) => void;
  onClearFilters: () => void;
}

// Common template categories
const TEMPLATE_CATEGORIES = [
  'Engineering',
  'Business',
  'Science',
  'Arts',
  'Medicine',
  'Law',
  'Education',
  'General'
];

export function TemplateFilters({
  searchParams,
  onFilterChange,
  onClearFilters
}: TemplateFiltersProps) {
  const [searchInput, setSearchInput] = useState(searchParams.search || '');
  const { institutions } = useUserInstitutionAccess();

  // Get departments and programs based on selected institution
  const { data: departments } = useDepartments({
    institution_id: searchParams.institution_id,
    isActive: true
  });

  const { data: programs } = usePrograms({
    institution_id: searchParams.institution_id,
    department_id: searchParams.department_id,
    isActive: true
  });

  // Handle search input with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      onFilterChange('search', searchInput || undefined);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchInput, onFilterChange]);

  // Get active filter count
  const getActiveFilterCount = () => {
    const filters = [
      'search',
      'institution_id',
      'department_id',
      'program_id',
      'category'
    ];
    return filters.filter((key) => searchParams[key]).length;
  };

  const activeFilterCount = getActiveFilterCount();

  return (
    <Card>
      <CardContent className='p-4 space-y-4'>
        {/* Search and Quick Actions */}
        <div className='flex flex-col sm:flex-row gap-4'>
          <div className='flex-1 relative'>
            <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4' />
            <Input
              placeholder='Search templates by name, description, or tags...'
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className='pl-9'
            />
          </div>
          <div className='flex items-center gap-2'>
            {activeFilterCount > 0 && (
              <>
                <Badge variant='secondary' className='gap-1'>
                  <Filter className='h-3 w-3' />
                  {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''}
                </Badge>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={onClearFilters}
                  className='gap-1'
                >
                  <RotateCcw className='h-3 w-3' />
                  Clear
                </Button>
              </>
            )}
          </div>
        </div>

        <Separator />

        {/* Filter Controls */}
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
          {/* Institution Filter */}
          <div className='space-y-2'>
            <label className='text-sm font-medium flex items-center gap-1'>
              <Building className='h-3 w-3' />
              Institution
            </label>
            <Select
              value={searchParams.institution_id || 'all'}
              onValueChange={(value) =>
                onFilterChange(
                  'institution_id',
                  value === 'all' ? undefined : value
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder='All Institutions' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Institutions</SelectItem>
                {institutions?.map((institution: any) => (
                  <SelectItem
                    key={institution.institution_id}
                    value={institution.institution_id}
                  >
                    {institution.institution_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Department Filter */}
          <div className='space-y-2'>
            <label className='text-sm font-medium flex items-center gap-1'>
              <BookOpen className='h-3 w-3' />
              Department
            </label>
            <Select
              value={searchParams.department_id || 'all'}
              onValueChange={(value) =>
                onFilterChange(
                  'department_id',
                  value === 'all' ? undefined : value
                )
              }
              disabled={!searchParams.institution_id}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !searchParams.institution_id
                      ? 'Select institution first'
                      : 'All Departments'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Departments</SelectItem>
                {departments?.data?.map((department) => (
                  <SelectItem key={department.id} value={department.id}>
                    {department.department_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Program Filter */}
          <div className='space-y-2'>
            <label className='text-sm font-medium flex items-center gap-1'>
              <GraduationCap className='h-3 w-3' />
              Program
            </label>
            <Select
              value={searchParams.program_id || 'all'}
              onValueChange={(value) =>
                onFilterChange(
                  'program_id',
                  value === 'all' ? undefined : value
                )
              }
              disabled={!searchParams.department_id}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !searchParams.department_id
                      ? 'Select department first'
                      : 'All Programs'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Programs</SelectItem>
                {programs?.data?.map((program) => (
                  <SelectItem key={program.id} value={program.id}>
                    {program.program_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Category Filter */}
          <div className='space-y-2'>
            <label className='text-sm font-medium flex items-center gap-1'>
              <Tag className='h-3 w-3' />
              Category
            </label>
            <Select
              value={searchParams.category || 'all'}
              onValueChange={(value) =>
                onFilterChange('category', value === 'all' ? undefined : value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder='All Categories' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Categories</SelectItem>
                {TEMPLATE_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Active Filters Display */}
        {activeFilterCount > 0 && (
          <>
            <Separator />
            <div className='flex flex-wrap gap-2'>
              <span className='text-sm font-medium text-muted-foreground'>
                Active filters:
              </span>

              {searchParams.search && (
                <Badge variant='secondary' className='gap-1'>
                  Search: &quot;{searchParams.search}&quot;
                  <X
                    className='h-3 w-3 cursor-pointer'
                    onClick={() => {
                      setSearchInput('');
                      onFilterChange('search', undefined);
                    }}
                  />
                </Badge>
              )}

              {searchParams.institution_id && (
                <Badge variant='secondary' className='gap-1'>
                  Institution:{' '}
                  {
                    institutions?.find(
                      (i: any) =>
                        i.institution_id === searchParams.institution_id
                    )?.institution_name
                  }
                  <X
                    className='h-3 w-3 cursor-pointer'
                    onClick={() => onFilterChange('institution_id', undefined)}
                  />
                </Badge>
              )}

              {searchParams.department_id && (
                <Badge variant='secondary' className='gap-1'>
                  Department:{' '}
                  {
                    departments?.data?.find(
                      (d) => d.id === searchParams.department_id
                    )?.department_name
                  }
                  <X
                    className='h-3 w-3 cursor-pointer'
                    onClick={() => onFilterChange('department_id', undefined)}
                  />
                </Badge>
              )}

              {searchParams.program_id && (
                <Badge variant='secondary' className='gap-1'>
                  Program:{' '}
                  {
                    programs?.data?.find(
                      (p) => p.id === searchParams.program_id
                    )?.program_name
                  }
                  <X
                    className='h-3 w-3 cursor-pointer'
                    onClick={() => onFilterChange('program_id', undefined)}
                  />
                </Badge>
              )}

              {searchParams.category && (
                <Badge variant='secondary' className='gap-1'>
                  Category: {searchParams.category}
                  <X
                    className='h-3 w-3 cursor-pointer'
                    onClick={() => onFilterChange('category', undefined)}
                  />
                </Badge>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
