'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';
import { useActiveLeaveTypes } from '@/hooks/academic/use-leave-types';
import { useDepartments } from '@/hooks/organization/use-departments';
import { useSemesters } from '@/hooks/organization/use-semesters';
import { useSections } from '@/hooks/organization/use-sections';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { LeaveService } from '@/lib/services/academic/leave-service';
import { LEAVE_SCOPE_OPTIONS } from '@/types/leaves';
import type { InstitutionLeave } from '@/types/leaves';
import type { Department, Semester, Section } from '@/types/organizations';

const leaveFormSchema = z.object({
  leave_type_id: z.string().min(1, 'Leave type is required'),
  leave_name: z.string().min(1, 'Leave name is required'),
  description: z.string().optional(),
  start_date: z.date({ required_error: 'Start date is required' }),
  end_date: z.date({ required_error: 'End date is required' }),
  scope_level: z.enum(['institution', 'department', 'semester', 'section']),
  department_ids: z.array(z.string()).optional(),
  semester_ids: z.array(z.string()).optional(),
  section_ids: z.array(z.string()).optional(),
  is_recurring: z.boolean().default(false)
}).refine((data) => data.end_date >= data.start_date, {
  message: 'End date must be after start date',
  path: ['end_date']
});

type LeaveFormData = z.infer<typeof leaveFormSchema>;

interface LeaveFormProps {
  leave?: InstitutionLeave;
  mode: 'create' | 'edit';
}

export function LeaveForm({ leave, mode }: LeaveFormProps) {
  const router = useRouter();
  const { userProfile, isSuperAdmin } = usePermissions();
  const baseInstitutionId = userProfile?.institution_id ?? undefined;

  // For super admins, allow selecting institution; for others, use their institution
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string | undefined>(
    leave?.institution_id || baseInstitutionId
  );

  // Use selected institution for super admins, or user's institution for others
  const institutionId = isSuperAdmin ? selectedInstitutionId : baseInstitutionId;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>(
    leave?.department_ids || []
  );
  const [selectedSemesters, setSelectedSemesters] = useState<string[]>(
    leave?.semester_ids || []
  );
  const [selectedSections, setSelectedSections] = useState<string[]>(
    leave?.section_ids || []
  );

  const { leaveTypes } = useActiveLeaveTypes(institutionId);
  const { institutions } = useInstitutionsWithAccess({ isActive: true });
  const departmentsQuery = useDepartments({ institution_id: institutionId });
  const semestersQuery = useSemesters({ institution_id: institutionId });
  const sectionsQuery = useSections({ institution_id: institutionId });

  const departments = (departmentsQuery.data?.data || []) as Department[];
  const semesters = (semestersQuery.data?.data || []) as Semester[];
  const sections = (sectionsQuery.data?.data || []) as Section[];

  // Get current institution name for display (for non-super admins)
  const currentInstitution = institutions.find((i) => i.id === baseInstitutionId);

  const form = useForm<LeaveFormData>({
    resolver: zodResolver(leaveFormSchema),
    defaultValues: {
      leave_type_id: leave?.leave_type_id || '',
      leave_name: leave?.leave_name || '',
      description: leave?.description || '',
      start_date: leave ? new Date(leave.start_date) : undefined,
      end_date: leave ? new Date(leave.end_date) : undefined,
      scope_level: leave?.scope_level || 'institution',
      department_ids: leave?.department_ids || [],
      semester_ids: leave?.semester_ids || [],
      section_ids: leave?.section_ids || [],
      is_recurring: leave?.is_recurring || false
    }
  });

  const scopeLevel = form.watch('scope_level');

  // Update form values when scope arrays change
  useEffect(() => {
    form.setValue('department_ids', selectedDepartments);
  }, [selectedDepartments, form]);

  useEffect(() => {
    form.setValue('semester_ids', selectedSemesters);
  }, [selectedSemesters, form]);

  useEffect(() => {
    form.setValue('section_ids', selectedSections);
  }, [selectedSections, form]);

  const onSubmit = async (data: LeaveFormData) => {
    if (!institutionId && !isSuperAdmin) {
      toast.error('Institution not found');
      return;
    }

    try {
      setIsSubmitting(true);

      const payload = {
        ...data,
        institution_id: institutionId!,
        start_date: format(data.start_date, 'yyyy-MM-dd'),
        end_date: format(data.end_date, 'yyyy-MM-dd'),
        requested_by: userProfile?.id || ''
      };

      if (mode === 'create') {
        await LeaveService.createLeave(payload);
        toast.success('Leave created successfully');
      } else {
        await LeaveService.updateLeave(leave!.id, {
          ...data,
          start_date: format(data.start_date, 'yyyy-MM-dd'),
          end_date: format(data.end_date, 'yyyy-MM-dd')
        });
        toast.success('Leave updated successfully');
      }

      router.push('/academic/leaves');
      router.refresh();
    } catch (error) {
      console.error('Error saving leave:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to save leave'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleDepartment = (id: string) => {
    setSelectedDepartments((prev) =>
      prev.includes(id)
        ? prev.filter((d) => d !== id)
        : [...prev, id]
    );
  };

  const toggleSemester = (id: string) => {
    setSelectedSemesters((prev) =>
      prev.includes(id)
        ? prev.filter((s) => s !== id)
        : [...prev, id]
    );
  };

  const toggleSection = (id: string) => {
    setSelectedSections((prev) =>
      prev.includes(id)
        ? prev.filter((s) => s !== id)
        : [...prev, id]
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
        {/* Institution Field - Always show */}
        <div className='bg-blue-50 border border-blue-200 rounded-md p-4'>
          <FormLabel>Institution</FormLabel>
          {isSuperAdmin ? (
            // Super Admin: Dropdown to select institution
            <>
              <Select
                onValueChange={setSelectedInstitutionId}
                value={selectedInstitutionId}
              >
                <SelectTrigger className='mt-2'>
                  <SelectValue placeholder='Select institution' />
                </SelectTrigger>
                <SelectContent>
                  {institutions.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.name} ({inst.counselling_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className='text-sm text-muted-foreground mt-2'>
                Select an institution to manage leaves
              </p>
            </>
          ) : (
            // Regular User: Display their institution (read-only)
            <>
              <div className='mt-2 p-3 bg-white border rounded-md text-sm font-medium'>
                {currentInstitution
                  ? `${currentInstitution.name} (${currentInstitution.counselling_code})`
                  : 'Loading...'}
              </div>
              <p className='text-sm text-muted-foreground mt-2'>
                Your institution (cannot be changed)
              </p>
            </>
          )}
        </div>

        <div className='grid gap-6 md:grid-cols-2'>
          {/* Leave Type */}
          <FormField
            control={form.control}
            name='leave_type_id'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Leave Type</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={!institutionId}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={!institutionId ? 'Select institution first' : 'Select leave type'} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {leaveTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        <span className='flex items-center gap-2'>
                          <span
                            className='w-3 h-3 rounded-full'
                            style={{ backgroundColor: type.color_code }}
                          />
                          {type.leave_type_name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Leave Name */}
          <FormField
            control={form.control}
            name='leave_name'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Leave Name</FormLabel>
                <FormControl>
                  <Input placeholder='e.g., Pongal Holiday' {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Description */}
        <FormField
          control={form.control}
          name='description'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder='Enter description (optional)'
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className='grid gap-6 md:grid-cols-2'>
          {/* Start Date */}
          <FormField
            control={form.control}
            name='start_date'
            render={({ field }) => (
              <FormItem className='flex flex-col'>
                <FormLabel>Start Date</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant='outline'
                        className={cn(
                          'pl-3 text-left font-normal',
                          !field.value && 'text-muted-foreground'
                        )}
                      >
                        {field.value ? (
                          format(field.value, 'PPP')
                        ) : (
                          <span>Pick a date</span>
                        )}
                        <CalendarIcon className='ml-auto h-4 w-4 opacity-50' />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className='w-auto p-0' align='start'>
                    <Calendar
                      mode='single'
                      selected={field.value}
                      onSelect={field.onChange}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* End Date */}
          <FormField
            control={form.control}
            name='end_date'
            render={({ field }) => (
              <FormItem className='flex flex-col'>
                <FormLabel>End Date</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant='outline'
                        className={cn(
                          'pl-3 text-left font-normal',
                          !field.value && 'text-muted-foreground'
                        )}
                      >
                        {field.value ? (
                          format(field.value, 'PPP')
                        ) : (
                          <span>Pick a date</span>
                        )}
                        <CalendarIcon className='ml-auto h-4 w-4 opacity-50' />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className='w-auto p-0' align='start'>
                    <Calendar
                      mode='single'
                      selected={field.value}
                      onSelect={field.onChange}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Scope Level */}
        <FormField
          control={form.control}
          name='scope_level'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Scope</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder='Select scope' />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {LEAVE_SCOPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div>
                        <div>{option.label}</div>
                        <div className='text-xs text-muted-foreground'>
                          {option.description}
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                Select how widely this leave applies
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Scope Selection - Department */}
        {scopeLevel === 'department' && (
          <div className='space-y-2'>
            <FormLabel>Select Departments</FormLabel>
            <div className='border rounded-md p-4 max-h-48 overflow-y-auto space-y-2'>
              {departments.length === 0 ? (
                <p className='text-sm text-muted-foreground'>
                  No departments available
                </p>
              ) : (
                departments.map((dept) => (
                  <div key={dept.id} className='flex items-center gap-2'>
                    <Checkbox
                      id={dept.id}
                      checked={selectedDepartments.includes(dept.id)}
                      onCheckedChange={() => toggleDepartment(dept.id)}
                    />
                    <label htmlFor={dept.id} className='text-sm cursor-pointer'>
                      {dept.department_name}
                    </label>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Scope Selection - Semester */}
        {scopeLevel === 'semester' && (
          <div className='space-y-2'>
            <FormLabel>Select Semesters</FormLabel>
            <div className='border rounded-md p-4 max-h-48 overflow-y-auto space-y-2'>
              {semesters.length === 0 ? (
                <p className='text-sm text-muted-foreground'>
                  No semesters available
                </p>
              ) : (
                semesters.map((sem) => (
                  <div key={sem.id} className='flex items-center gap-2'>
                    <Checkbox
                      id={sem.id}
                      checked={selectedSemesters.includes(sem.id)}
                      onCheckedChange={() => toggleSemester(sem.id)}
                    />
                    <label htmlFor={sem.id} className='text-sm cursor-pointer'>
                      {sem.semester_name}
                    </label>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Scope Selection - Section */}
        {scopeLevel === 'section' && (
          <div className='space-y-2'>
            <FormLabel>Select Sections</FormLabel>
            <div className='border rounded-md p-4 max-h-48 overflow-y-auto space-y-2'>
              {sections.length === 0 ? (
                <p className='text-sm text-muted-foreground'>
                  No sections available
                </p>
              ) : (
                sections.map((sec) => (
                  <div key={sec.id} className='flex items-center gap-2'>
                    <Checkbox
                      id={sec.id}
                      checked={selectedSections.includes(sec.id)}
                      onCheckedChange={() => toggleSection(sec.id)}
                    />
                    <label htmlFor={sec.id} className='text-sm cursor-pointer'>
                      {sec.section_name}
                    </label>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Recurring */}
        <FormField
          control={form.control}
          name='is_recurring'
          render={({ field }) => (
            <FormItem className='flex flex-row items-start space-x-3 space-y-0'>
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className='space-y-1 leading-none'>
                <FormLabel>Recurring Leave</FormLabel>
                <FormDescription>
                  Mark if this leave repeats annually
                </FormDescription>
              </div>
            </FormItem>
          )}
        />

        {/* Actions */}
        <div className='flex justify-end gap-4'>
          <Button
            type='button'
            variant='outline'
            onClick={() => router.back()}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type='submit' disabled={isSubmitting}>
            {isSubmitting
              ? mode === 'create'
                ? 'Creating...'
                : 'Updating...'
              : mode === 'create'
              ? 'Create Leave'
              : 'Update Leave'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
