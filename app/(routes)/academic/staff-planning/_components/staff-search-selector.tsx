'use client';

import { useState } from 'react';
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

interface StaffMember {
  id: string;
  first_name: string;
  last_name: string;
  designation?: string;
}

interface StaffAssignment {
  staff_id: string;
  hours_allocated: number;
  is_coordinator: boolean;
  staff_type: string;
}

interface StaffSearchSelectorProps {
  staffMembers: StaffMember[];
  value: StaffAssignment[];
  onChange: (assignments: StaffAssignment[]) => void;
  placeholder?: string;
  className?: string;
  courseName?: string;
}

export function StaffSearchSelector({
  staffMembers,
  value = [],
  onChange,
  placeholder = 'Search and select staff members...',
  className,
  courseName
}: StaffSearchSelectorProps) {
  const [open, setOpen] = useState(false);

  const selectedStaffIds = value.map((assignment) => assignment.staff_id);

  const addStaffAssignment = (staffId: string) => {
    if (!selectedStaffIds.includes(staffId)) {
      const newAssignment: StaffAssignment = {
        staff_id: staffId,
        hours_allocated: 0,
        is_coordinator: false,
        staff_type: ''
      };
      onChange([...value, newAssignment]);
    }
    setOpen(false);
  };

  const removeStaffAssignment = (staffId: string) => {
    const updatedAssignments = value.filter(
      (assignment) => assignment.staff_id !== staffId
    );
    onChange(updatedAssignments);
  };

  const updateStaffAssignment = (
    staffId: string,
    updates: Partial<StaffAssignment>
  ) => {
    const updatedAssignments = value.map((assignment) =>
      assignment.staff_id === staffId
        ? { ...assignment, ...updates }
        : assignment
    );
    onChange(updatedAssignments);
  };

  const getStaffName = (staffId: string) => {
    const staff = staffMembers.find((s) => s.id === staffId);
    return staff ? `${staff.first_name} ${staff.last_name}` : 'Unknown Staff';
  };

  const getStaffDesignation = (staffId: string) => {
    const staff = staffMembers.find((s) => s.id === staffId);
    return staff?.designation || '';
  };

  const handleCoordinatorToggle = (staffId: string, checked: boolean) => {
    if (checked) {
      // Remove coordinator status from all others when setting one as coordinator
      const updatedAssignments = value.map((assignment) => ({
        ...assignment,
        is_coordinator: assignment.staff_id === staffId
      }));
      onChange(updatedAssignments);
    } else {
      // Just remove coordinator status from this staff member
      updateStaffAssignment(staffId, { is_coordinator: false });
    }
  };

  const coordinatorStaff = value.find(
    (assignment) => assignment.is_coordinator
  );

  return (
    <div className={cn('space-y-4', className)}>
      {/* Course Header */}
      {courseName && (
        <div className='flex items-center justify-between'>
          <div>
            <h4 className='text-sm font-medium text-foreground'>
              {courseName}
            </h4>
            <p className='text-xs text-muted-foreground'>
              {value.length === 0
                ? 'No staff assigned'
                : `${value.length} staff member${
                    value.length === 1 ? '' : 's'
                  } assigned`}
            </p>
          </div>
          {value.length > 0 && (
            <div className='flex flex-wrap gap-1'>
              {value.map((assignment) => {
                const staffName = getStaffName(assignment.staff_id);
                return (
                  <Badge
                    key={assignment.staff_id}
                    variant={
                      assignment.is_coordinator ? 'default' : 'secondary'
                    }
                    className='text-xs'
                  >
                    {staffName
                      .split(' ')
                      .map((n) => n[0])
                      .join('.')}
                    {assignment.is_coordinator && (
                      <span className='ml-1 text-xs'>(C)</span>
                    )}
                  </Badge>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Staff Search and Add */}
      <div className='space-y-2'>
        <div className='flex items-center justify-between'>
          <Label className='text-sm'>Staff Members</Label>
          {coordinatorStaff && (
            <Badge variant='outline' className='text-xs'>
              Coordinator: {getStaffName(coordinatorStaff.staff_id)}
            </Badge>
          )}
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
              </div>
              <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
            </Button>
          </PopoverTrigger>
          <PopoverContent className='w-full p-0' align='start'>
            <Command>
              <CommandInput
                placeholder='Search staff members...'
                className='h-9'
              />
              <CommandList>
                <CommandEmpty>No staff member found.</CommandEmpty>
                <CommandGroup>
                  {staffMembers
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

      {/* Selected Staff Assignments */}
      {value.length > 0 && (
        <div className='space-y-3'>
          <div className='flex items-center gap-2'>
            <Label className='text-sm'>Staff Assignments</Label>
            <Badge variant='secondary' className='text-xs'>
              {value.length}
            </Badge>
          </div>

          <div className='space-y-3'>
            {value.map((assignment) => {
              const staffName = getStaffName(assignment.staff_id);
              const staffDesignation = getStaffDesignation(assignment.staff_id);

              return (
                <Card
                  key={assignment.staff_id}
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
                        {assignment.is_coordinator && (
                          <Badge variant='default' className='text-xs'>
                            Coordinator
                          </Badge>
                        )}
                      </div>
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() =>
                          removeStaffAssignment(assignment.staff_id)
                        }
                        className='h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive'
                      >
                        <X className='h-4 w-4' />
                      </Button>
                    </div>
                  </CardHeader>

                  <CardContent className='pt-0'>
                    <div className='grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'>
                      {/* Hours Allocated */}
                      <div className='space-y-2'>
                        <Label className='text-xs'>Hours Allocated</Label>
                        <Input
                          type='number'
                          min={0}
                          max={100}
                          value={assignment.hours_allocated || ''}
                          onChange={(e) => {
                            const value =
                              e.target.value === ''
                                ? 0
                                : Math.max(
                                    0,
                                    Math.min(100, parseInt(e.target.value))
                                  );
                            updateStaffAssignment(assignment.staff_id, {
                              hours_allocated: value
                            });
                          }}
                          placeholder='Enter hours'
                          className='h-8'
                        />
                      </div>

                      {/* Staff Type */}
                      <div className='space-y-2'>
                        <Label className='text-xs'>Staff Type</Label>
                        <Select
                          value={assignment.staff_type}
                          onValueChange={(value) =>
                            updateStaffAssignment(assignment.staff_id, {
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
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Course Coordinator */}
                      <div className='space-y-2'>
                        <Label className='text-xs'>Course Coordinator</Label>
                        <div className='flex items-center space-x-2'>
                          <Switch
                            checked={assignment.is_coordinator}
                            onCheckedChange={(checked) =>
                              handleCoordinatorToggle(
                                assignment.staff_id,
                                checked
                              )
                            }
                            className='scale-75'
                          />
                          <Label className='text-xs text-muted-foreground'>
                            {assignment.is_coordinator ? 'Yes' : 'No'}
                          </Label>
                        </div>
                      </div>
                    </div>

                    {/* Validation warnings */}
                    {(!assignment.hours_allocated ||
                      assignment.hours_allocated === 0) && (
                      <div className='mt-3 text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200'>
                        ⚠️ Hours allocated is required
                      </div>
                    )}

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

      {/* Summary */}
      {value.length > 0 && (
        <>
          <Separator />
          <div className='flex flex-wrap gap-2'>
            <Label className='text-xs text-muted-foreground'>Summary:</Label>
            {value.map((assignment) => {
              const staffName = getStaffName(assignment.staff_id);
              return (
                <Badge
                  key={assignment.staff_id}
                  variant='outline'
                  className='text-xs'
                >
                  {staffName}
                  {assignment.hours_allocated > 0 && (
                    <span className='ml-1'>
                      ({assignment.hours_allocated}h)
                    </span>
                  )}
                  {assignment.is_coordinator && (
                    <span className='ml-1 text-primary'>(Coordinator)</span>
                  )}
                </Badge>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
