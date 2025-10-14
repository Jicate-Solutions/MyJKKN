'use client';

import { useState, useEffect, useMemo } from 'react';
import { Check, ChevronsUpDown, X, Search, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import type { StaffAssignment } from '@/types/staff-planning';
import { useDebounceValue } from '@/hooks/use-debounce-value';
import { StaffService } from '@/lib/services/staff/staff-service';

interface StaffMember {
  id: string;
  first_name: string;
  last_name: string;
  designation?: string;
}

interface StaffSearchSelectorProps {
  institutionId: string;
  departmentId?: string;
  value: StaffAssignment[];
  onChange: (assignments: StaffAssignment[]) => void;
  placeholder?: string;
  className?: string;
  courseName?: string;
}

function generateAssignmentId(): string {
  return `assignment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function StaffSearchSelector({
  institutionId,
  departmentId,
  value = [],
  onChange,
  placeholder = 'Add staff members to this course...',
  className,
  courseName
}: StaffSearchSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [fetchedStaff, setFetchedStaff] = useState<StaffMember[]>([]);
  const [assignedStaffDetails, setAssignedStaffDetails] = useState<
    StaffMember[]
  >([]);
  const [loadingAssigned, setLoadingAssigned] = useState(false);
  const debouncedSearchTerm = useDebounceValue(searchTerm, 300);

  // Fetch details for already-assigned staff on mount
  useEffect(() => {
    async function fetchAssignedStaff() {
      if (!institutionId || value.length === 0) {
        setAssignedStaffDetails([]);
        return;
      }

      try {
        setLoadingAssigned(true);
        const staffIds = value.map((assignment) => assignment.staff_id);
        // Fetch all staff from institution
        const result = await StaffService.getStaff({
          institution_id: institutionId,
          limit: 1000,
          isActive: true
        });
        // Filter to only include assigned staff
        const assignedStaff = result.data.filter((staff: any) =>
          staffIds.includes(staff.id)
        );
        setAssignedStaffDetails(assignedStaff as StaffMember[]);
      } catch (error) {
        console.error('Failed to fetch assigned staff details:', error);
      } finally {
        setLoadingAssigned(false);
      }
    }

    fetchAssignedStaff();
  }, [institutionId, value.length]); // Re-fetch when institution or assignments change

  // Fetch all institution staff automatically when institution is selected
  useEffect(() => {
    async function fetchInstitutionStaff() {
      if (!institutionId) {
        setFetchedStaff([]);
        return;
      }

      setIsLoading(true);
      try {
        const result = await StaffService.getStaff({
          institution_id: institutionId,
          limit: 1000,
          isActive: true
        });
        setFetchedStaff(result.data as StaffMember[]);
      } catch (error) {
        console.error('Failed to fetch institution staff:', error);
        setFetchedStaff([]);
      } finally {
        setIsLoading(false);
      }
    }

    // If no search term, load all institution staff automatically
    if (!debouncedSearchTerm && institutionId) {
      fetchInstitutionStaff();
    }
  }, [institutionId, debouncedSearchTerm]);

  // Search staff when user types
  useEffect(() => {
    async function searchStaff() {
      if (debouncedSearchTerm.length < 2) {
        return; // Don't clear if we have institution staff loaded
      }

      setIsLoading(true);
      try {
        const result = await StaffService.getStaff({
          institution_id: institutionId,
          search: debouncedSearchTerm,
          limit: 100,
          isActive: true
        });
        setFetchedStaff(result.data as StaffMember[]);
      } catch (error) {
        console.error('Failed to search staff:', error);
        setFetchedStaff([]);
      } finally {
        setIsLoading(false);
      }
    }

    if (debouncedSearchTerm.length >= 2) {
      searchStaff();
    }
  }, [debouncedSearchTerm, institutionId]);

  const assignmentsWithIds = useMemo(() => {
    return value.map((assignment) => ({
      ...assignment,
      assignment_id: assignment.assignment_id || generateAssignmentId()
    }));
  }, [value]);

  const uniqueAssignments = useMemo(() => {
    const seenStaffIds = new Set<string>();
    const uniqueList = assignmentsWithIds.filter((assignment) => {
      if (seenStaffIds.has(assignment.staff_id)) {
        console.warn(
          `Duplicate staff assignment detected for staff_id: ${assignment.staff_id} in course: ${courseName}`
        );
        return false;
      }
      seenStaffIds.add(assignment.staff_id);
      return true;
    });

    return uniqueList;
  }, [assignmentsWithIds, courseName]);

  // Consolidate staff members from assignments and search results
  const allStaffMembers = useMemo(() => {
    const staffMap = new Map<string, StaffMember>();

    // Add staff from assigned staff details (fetched on mount)
    assignedStaffDetails.forEach((staff) => {
      staffMap.set(staff.id, staff);
    });

    // Add staff from search results
    fetchedStaff.forEach((staff) => {
      if (!staffMap.has(staff.id)) {
        staffMap.set(staff.id, staff);
      }
    });

    return Array.from(staffMap.values());
  }, [assignedStaffDetails, fetchedStaff]);

  useEffect(() => {
    if (
      uniqueAssignments.length !== value.length ||
      uniqueAssignments.some((ua, index) => !value[index]?.assignment_id)
    ) {
      onChange(uniqueAssignments);
    }
  }, [uniqueAssignments, value, onChange]);

  const selectedStaffIds = uniqueAssignments.map(
    (assignment) => assignment.staff_id
  );

  const addStaffAssignment = (staffId: string) => {
    if (!selectedStaffIds.includes(staffId)) {
      const newAssignment: StaffAssignment = {
        staff_id: staffId,
        staff_type: '',
        assignment_id: generateAssignmentId()
      };
      onChange([...uniqueAssignments, newAssignment]);
    }
    setOpen(false);
  };

  const removeStaffAssignment = (assignmentId: string) => {
    const updatedAssignments = uniqueAssignments.filter(
      (assignment) => assignment.assignment_id !== assignmentId
    );
    onChange(updatedAssignments);
  };

  const updateStaffAssignment = (
    assignmentId: string,
    updates: Partial<StaffAssignment>
  ) => {
    const updatedAssignments = uniqueAssignments.map((assignment) =>
      assignment.assignment_id === assignmentId
        ? { ...assignment, ...updates }
        : assignment
    );
    onChange(updatedAssignments);
  };

  const getStaffName = (staffId: string) => {
    const staff = allStaffMembers.find((s) => s.id === staffId);
    if (loadingAssigned && !staff) return 'Loading...';
    return staff ? `${staff.first_name} ${staff.last_name}` : 'Unknown Staff';
  };

  const getStaffDesignation = (staffId: string) => {
    const staff = allStaffMembers.find((s) => s.id === staffId);
    return staff?.designation || '';
  };

  return (
    <div className={cn('space-y-4', className)}>
      {courseName && (
        <div className='flex items-center justify-between'>
          <div>
            <h4 className='text-sm font-medium text-foreground'>
              {courseName}
            </h4>
            <p className='text-xs text-muted-foreground'>
              {uniqueAssignments.length === 0
                ? 'No staff assigned'
                : `${uniqueAssignments.length} staff member${
                    uniqueAssignments.length === 1 ? '' : 's'
                  } assigned`}
            </p>
          </div>
          {uniqueAssignments.length > 0 && (
            <div className='flex flex-wrap gap-1'>
              {uniqueAssignments.map((assignment) => {
                const staffName = getStaffName(assignment.staff_id);
                return (
                  <Badge
                    key={`header-badge-${assignment.assignment_id}`}
                    variant='secondary'
                    className='text-xs'
                  >
                    {staffName
                      .split(' ')
                      .map((n) => n[0])
                      .join('.')}
                  </Badge>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className='space-y-2'>
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            <Label className='text-sm'>Staff Members</Label>
            {uniqueAssignments.length > 0 && (
              <Badge variant='outline' className='text-xs'>
                {uniqueAssignments.length} assigned
              </Badge>
            )}
          </div>
        </div>

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant='outline'
              role='combobox'
              aria-expanded={open}
              className='justify-between w-full h-9'
            >
              <div className='flex items-center gap-2'>
                <Plus className='h-4 w-4' />
                <span className='text-sm'>{placeholder}</span>
                {uniqueAssignments.length > 0 && (
                  <Badge variant='secondary' className='text-xs'>
                    {uniqueAssignments.length} assigned
                  </Badge>
                )}
              </div>
              <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
            </Button>
          </PopoverTrigger>
          <PopoverContent className='w-full p-0' align='start'>
            <Command>
              <CommandInput
                placeholder='Search staff members...'
                className='h-9'
                value={searchTerm}
                onValueChange={setSearchTerm}
              />
              <CommandList>
                <CommandEmpty>
                  {isLoading
                    ? 'Loading staff...'
                    : !institutionId
                    ? 'Please select an institution first'
                    : debouncedSearchTerm.length > 0 &&
                      debouncedSearchTerm.length < 2
                    ? 'Type at least 2 characters to search'
                    : 'No staff members found.'}
                </CommandEmpty>
                <CommandGroup>
                  {fetchedStaff.filter(
                    (staff) => !selectedStaffIds.includes(staff.id)
                  ).length > 0 && (
                    <div className='px-2 py-1.5 text-xs text-muted-foreground border-b'>
                      {
                        fetchedStaff.filter(
                          (staff) => !selectedStaffIds.includes(staff.id)
                        ).length
                      }{' '}
                      available staff members
                    </div>
                  )}
                  {fetchedStaff
                    .filter((staff) => !selectedStaffIds.includes(staff.id))
                    .map((staff) => (
                      <CommandItem
                        key={staff.id}
                        value={`${staff.first_name} ${staff.last_name} ${
                          staff.designation || ''
                        }`}
                        onSelect={() => addStaffAssignment(staff.id)}
                        className='cursor-pointer'
                      >
                        <div className='flex flex-col'>
                          <span className='font-medium text-sm'>
                            {staff.first_name} {staff.last_name}
                          </span>
                          {staff.designation && (
                            <span className='text-xs text-muted-foreground'>
                              {staff.designation}
                            </span>
                          )}
                        </div>
                        <Check className='ml-auto h-4 w-4 opacity-0' />
                      </CommandItem>
                    ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {uniqueAssignments.length > 0 && (
        <div className='space-y-3'>
          <div className='flex items-center gap-2'>
            <Label className='text-sm'>Staff Assignments</Label>
            <Badge variant='secondary' className='text-xs'>
              {uniqueAssignments.length}
            </Badge>
          </div>

          <div className='space-y-3'>
            {uniqueAssignments.map((assignment) => {
              const staffName = getStaffName(assignment.staff_id);
              const staffDesignation = getStaffDesignation(assignment.staff_id);

              return (
                <Card
                  key={`assignment-card-${assignment.assignment_id}`}
                  className='border border-border/50'
                >
                  <CardHeader className='pb-3'>
                    <div className='flex items-center justify-between'>
                      <div className='flex items-center gap-2'>
                        <div>
                          <CardTitle className='text-sm font-medium'>
                            {staffName}
                          </CardTitle>
                          {staffDesignation && (
                            <p className='text-xs text-muted-foreground mt-0.5'>
                              {staffDesignation}
                            </p>
                          )}
                        </div>
                      </div>
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() =>
                          removeStaffAssignment(assignment.assignment_id!)
                        }
                        className='h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive'
                      >
                        <X className='h-4 w-4' />
                      </Button>
                    </div>
                  </CardHeader>

                  <CardContent className='pt-0'>
                    <div className='grid gap-4 grid-cols-1'>
                      <div className='space-y-2'>
                        <Label className='text-xs'>Staff Type</Label>
                        <Select
                          value={assignment.staff_type}
                          onValueChange={(value) =>
                            updateStaffAssignment(assignment.assignment_id!, {
                              staff_type: value
                            })
                          }
                        >
                          <SelectTrigger className='h-8'>
                            <SelectValue placeholder='Select type' />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value='lecturer'>Lecturer</SelectItem>
                            <SelectItem value='assistant_professor'>
                              Assistant Professor
                            </SelectItem>
                            <SelectItem value='associate_professor'>
                              Associate Professor
                            </SelectItem>
                            <SelectItem value='professor'>Professor</SelectItem>
                            <SelectItem value='hod'>HOD</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {!assignment.staff_type && (
                      <div className='mt-2 text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200'>
                        ⚠️ Staff type is required
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {uniqueAssignments.length > 0 && (
        <>
          <Separator />
          <div className='flex flex-wrap gap-2'>
            <Label className='text-xs text-muted-foreground'>Summary:</Label>
            {uniqueAssignments.map((assignment) => {
              const staffName = getStaffName(assignment.staff_id);
              return (
                <Badge
                  key={`summary-badge-${assignment.assignment_id}`}
                  variant='outline'
                  className='text-xs'
                >
                  {staffName}
                </Badge>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
