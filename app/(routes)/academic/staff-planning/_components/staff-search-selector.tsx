'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Check, ChevronsUpDown, X, Plus } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
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

// Global cache for staff data per institution (shared across all instances)
const staffCache = new Map<string, { data: StaffMember[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// In-flight requests to prevent duplicate concurrent fetches
const inFlightRequests = new Map<string, Promise<StaffMember[]>>();

async function fetchStaffForInstitution(institutionId: string): Promise<StaffMember[]> {
  // Check cache first
  const cached = staffCache.get(institutionId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  // Check if there's already an in-flight request
  const inFlight = inFlightRequests.get(institutionId);
  if (inFlight) {
    return inFlight;
  }

  // Create a new request
  const requestPromise = (async () => {
    try {
      const result = await StaffService.getStaffViaAPI({
        institution_id: institutionId,
        limit: 1000,
        isActive: true
      });
      const staffData = result.data as StaffMember[];
      staffCache.set(institutionId, { data: staffData, timestamp: Date.now() });
      return staffData;
    } finally {
      inFlightRequests.delete(institutionId);
    }
  })();

  inFlightRequests.set(institutionId, requestPromise);
  return requestPromise;
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
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const debouncedSearchTerm = useDebounceValue(searchTerm, 300);

  // Track initialization to prevent multiple onChange calls
  const hasInitializedRef = useRef(false);
  const mountedRef = useRef(true);

  // Create a stable signature of the value for dependency tracking
  const valueSignature = useMemo(() => {
    return value
      .map((v) => `${v.staff_id}:${v.assignment_id || ''}:${v.staff_type || ''}`)
      .sort()
      .join('|');
  }, [value]);

  // Memoize assignments with IDs
  const assignmentsWithIds = useMemo(() => {
    return value.map((assignment) => ({
      ...assignment,
      assignment_id: assignment.assignment_id || generateAssignmentId()
    }));
  }, [value]);

  // Memoize unique assignments (deduplicated)
  const uniqueAssignments = useMemo(() => {
    const seenStaffIds = new Set<string>();
    return assignmentsWithIds.filter((assignment) => {
      if (seenStaffIds.has(assignment.staff_id)) {
        return false;
      }
      seenStaffIds.add(assignment.staff_id);
      return true;
    });
  }, [assignmentsWithIds]);

  // Selected staff IDs for filtering available staff
  const selectedStaffIds = useMemo(() => {
    return uniqueAssignments.map((a) => a.staff_id);
  }, [uniqueAssignments]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Fetch staff list for institution (using global cache)
  useEffect(() => {
    if (!institutionId) {
      setStaffList([]);
      return;
    }

    let cancelled = false;

    async function loadStaff() {
      setIsLoading(true);
      try {
        const data = await fetchStaffForInstitution(institutionId);
        if (!cancelled && mountedRef.current) {
          setStaffList(data);
        }
      } catch (error) {
        console.error('[StaffSearchSelector] Failed to fetch staff:', error);
        if (!cancelled && mountedRef.current) {
          setStaffList([]);
        }
      } finally {
        if (!cancelled && mountedRef.current) {
          setIsLoading(false);
        }
      }
    }

    loadStaff();

    return () => {
      cancelled = true;
    };
  }, [institutionId]);

  // Handle search filtering (client-side)
  const filteredStaff = useMemo(() => {
    if (!debouncedSearchTerm || debouncedSearchTerm.length < 2) {
      return staffList;
    }
    const searchLower = debouncedSearchTerm.toLowerCase();
    return staffList.filter(
      (staff) =>
        staff.first_name.toLowerCase().includes(searchLower) ||
        staff.last_name.toLowerCase().includes(searchLower) ||
        (staff.designation && staff.designation.toLowerCase().includes(searchLower))
    );
  }, [staffList, debouncedSearchTerm]);

  // Available staff (not already assigned)
  const availableStaff = useMemo(() => {
    return filteredStaff.filter((staff) => !selectedStaffIds.includes(staff.id));
  }, [filteredStaff, selectedStaffIds]);

  // Sync assignment IDs only once on initial load
  // This ensures all assignments have unique IDs for React key management
  useEffect(() => {
    // Only initialize once per mount
    if (hasInitializedRef.current) {
      return;
    }

    // Check if we need to add assignment IDs or remove duplicates
    const needsUpdate =
      value.some((v) => !v.assignment_id) ||
      uniqueAssignments.length !== value.length;

    if (needsUpdate && value.length > 0) {
      hasInitializedRef.current = true;
      onChange(uniqueAssignments);
    } else if (value.length > 0) {
      // Mark as initialized even if no update needed
      hasInitializedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run once on mount

  // Reset initialization when value becomes empty (form reset)
  useEffect(() => {
    if (value.length === 0) {
      hasInitializedRef.current = false;
    }
  }, [value.length]);

  // Stable callback for adding staff
  const addStaffAssignment = useCallback(
    (staffId: string) => {
      if (!selectedStaffIds.includes(staffId)) {
        const newAssignment: StaffAssignment = {
          staff_id: staffId,
          staff_type: '',
          assignment_id: generateAssignmentId()
        };
        onChange([...uniqueAssignments, newAssignment]);
      }
      setOpen(false);
    },
    [selectedStaffIds, uniqueAssignments, onChange]
  );

  // Stable callback for removing staff
  const removeStaffAssignment = useCallback(
    (assignmentId: string) => {
      const updatedAssignments = uniqueAssignments.filter(
        (assignment) => assignment.assignment_id !== assignmentId
      );
      onChange(updatedAssignments);
    },
    [uniqueAssignments, onChange]
  );

  // Stable callback for updating staff assignment
  const updateStaffAssignment = useCallback(
    (assignmentId: string, updates: Partial<StaffAssignment>) => {
      const updatedAssignments = uniqueAssignments.map((assignment) =>
        assignment.assignment_id === assignmentId
          ? { ...assignment, ...updates }
          : assignment
      );
      onChange(updatedAssignments);
    },
    [uniqueAssignments, onChange]
  );

  // Get staff name from staff list
  const getStaffName = useCallback(
    (staffId: string) => {
      const staff = staffList.find((s) => s.id === staffId);
      if (isLoading && !staff) return 'Loading...';
      return staff ? `${staff.first_name} ${staff.last_name}` : 'Unknown Staff';
    },
    [staffList, isLoading]
  );

  // Get staff designation
  const getStaffDesignation = useCallback(
    (staffId: string) => {
      const staff = staffList.find((s) => s.id === staffId);
      return staff?.designation || '';
    },
    [staffList]
  );

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
                    : 'No staff members found.'}
                </CommandEmpty>
                <CommandGroup>
                  {availableStaff.length > 0 && (
                    <div className='px-2 py-1.5 text-xs text-muted-foreground border-b'>
                      {availableStaff.length} available staff members
                    </div>
                  )}
                  {availableStaff.map((staff) => (
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
