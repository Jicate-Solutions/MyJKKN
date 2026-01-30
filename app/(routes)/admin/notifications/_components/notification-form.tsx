'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
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
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Bell, Send, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useDepartments } from '@/hooks/organization/use-departments';
import { usePrograms } from '@/hooks/organization/use-programs';
import { useSemesters } from '@/hooks/organization/use-semesters';
import { useSections } from '@/hooks/organization/use-sections';
import { useRoles } from '@/hooks/organization/use-roles';
import { usePermissions } from '@/hooks/use-permissions';

// Define categories for the dropdown
const notificationCategories = [
  'General',
  'Announcement',
  'Reminder',
  'Alert',
  'Event',
  'Update',
  'Maintenance'
];

const notificationSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(100, 'Title must be less than 100 characters'),
  body: z
    .string()
    .min(1, 'Body is required')
    .max(500, 'Body must be less than 500 characters'),
  url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  icon: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  category: z.string().min(1, 'Category is required'),
  expires_at: z.string().optional(),
  // Targeting fields
  institution_id: z.string().optional(),
  department_id: z.string().optional(),
  program_id: z.string().optional(),
  semester_id: z.string().optional(),
  section_id: z.string().optional(),
  target_roles: z.array(z.string()).optional()
});

type NotificationFormData = z.infer<typeof notificationSchema>;

export function NotificationForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  // Check permissions
  const { permissions, isSuperAdmin } = usePermissions();
  const canSendToAll =
    isSuperAdmin ||
    permissions['notifications.send.all'] ||
    permissions['notifications.send'];
  const canSendToInstitution =
    isSuperAdmin ||
    permissions['notifications.send'] ||
    permissions['notifications.view.all'];

  const form = useForm<NotificationFormData>({
    resolver: zodResolver(notificationSchema),
    defaultValues: {
      title: '',
      body: '',
      url: '',
      icon: '',
      priority: 'normal',
      category: undefined,
      expires_at: '',
      institution_id: undefined,
      department_id: undefined,
      program_id: undefined,
      semester_id: undefined,
      section_id: undefined,
      target_roles: []
    }
  });

  // Watch form values for hierarchical dependencies
  const watchedValues = form.watch();
  const selectedInstitutionId = watchedValues.institution_id;
  const selectedDepartmentId = watchedValues.department_id;
  const selectedProgramId = watchedValues.program_id;
  const selectedSemesterId = watchedValues.semester_id;

  // Fetch data with hierarchical dependencies
  const { institutions: institutionsData } = useInstitutionsWithAccess({});

  const { data: departmentsResponse } = useDepartments({
    bypassInstitutionFilter: true,
    institution_id: selectedInstitutionId,
    isActive: true,
    page: 1,
    limit: 100
  });

  const { data: programsResponse } = usePrograms({
    bypassInstitutionFilter: true,
    institution_id: selectedInstitutionId,
    department_id: selectedDepartmentId,
    isActive: true,
    page: 1,
    limit: 100
  });

  const { data: semestersResponse } = useSemesters({
    bypassInstitutionFilter: true,
    institution_id: selectedInstitutionId,
    department_id: selectedDepartmentId,
    program_id: selectedProgramId,
    isActive: true,
    page: 1,
    limit: 100
  });

  const { data: sectionsResponse } = useSections({
    bypassInstitutionFilter: true,
    institution_id: selectedInstitutionId,
    department_id: selectedDepartmentId,
    program_id: selectedProgramId,
    semester_id: selectedSemesterId,
    isActive: true,
    page: 1,
    limit: 1000 // Fixed: 2025-01-30 - Increased from 100 to fetch all sections for notifications
  });

  const institutions = institutionsData || [];
  const departments = departmentsResponse?.data || [];
  const programs = programsResponse?.data || [];
  const semesters = semestersResponse?.data || [];
  const sections = sectionsResponse?.data || [];

  // Fetch roles dynamically from database
  const { data: rolesResponse, isLoading: rolesLoading } = useRoles({
    includeSystemRoles: true
  });

  const availableRoles =
    rolesResponse?.map((role) => ({
      value: role.role_key,
      label: role.role_name,
      description: role.description
    })) || [];

  // Get degree_id from selected department (after departments are fetched)
  const selectedDepartment = departments.find(
    (d: any) => d.id === selectedDepartmentId
  );
  const selectedDegreeId = selectedDepartment?.degree_id;

  // Reset child fields when parent changes
  const handleInstitutionChange = (value: string) => {
    form.setValue('institution_id', value);
    // Reset all child fields
    form.setValue('department_id', undefined);
    form.setValue('program_id', undefined);
    form.setValue('semester_id', undefined);
    form.setValue('section_id', undefined);
  };

  const handleDepartmentChange = (value: string) => {
    form.setValue('department_id', value);
    // Reset child fields
    form.setValue('program_id', undefined);
    form.setValue('semester_id', undefined);
    form.setValue('section_id', undefined);
  };

  const handleProgramChange = (value: string) => {
    form.setValue('program_id', value);
    // Reset child fields
    form.setValue('semester_id', undefined);
    form.setValue('section_id', undefined);
  };

  const handleSemesterChange = (value: string) => {
    form.setValue('semester_id', value);
    // Reset section only
    form.setValue('section_id', undefined);
  };

  const handleSectionChange = (value: string) => {
    form.setValue('section_id', value);
  };

  const clearAllTargeting = () => {
    form.setValue('institution_id', undefined);
    form.setValue('department_id', undefined);
    form.setValue('program_id', undefined);
    form.setValue('semester_id', undefined);
    form.setValue('section_id', undefined);
    form.setValue('target_roles', []);
  };

  const onSubmit = async (data: NotificationFormData) => {
    try {
      setIsSubmitting(true);

      // Check if trying to send to all users without permission
      const isTargetingAll =
        !data.institution_id &&
        !data.department_id &&
        !data.program_id &&
        !data.semester_id &&
        !data.section_id &&
        (!data.target_roles || data.target_roles.length === 0);

      if (isTargetingAll && !canSendToAll) {
        toast.error(
          "You don't have permission to send notifications to all users. Please select specific targeting criteria."
        );
        return;
      }

      // Prepare the notification data
      const notificationData = {
        title: data.title,
        body: data.body,
        url: data.url || undefined,
        icon: data.icon || undefined,
        priority: data.priority,
        category: data.category,
        expires_at: data.expires_at || undefined,
        targeting: {
          institution_id: data.institution_id || undefined,
          department_id: data.department_id || undefined,
          program_id: data.program_id || undefined,
          semester_id: data.semester_id || undefined,
          section_id: data.section_id || undefined,
          target_roles:
            data.target_roles && data.target_roles.length > 0
              ? data.target_roles
              : undefined
        }
      };

      const response = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(notificationData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send notification');
      }

      const result = await response.json();

      toast.success(
        `Notification sent successfully to ${result.target_users_count} users!`
      );
      router.push('/admin/notifications');
    } catch (error) {
      console.error('Error sending notification:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to send notification'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTargetSummary = () => {
    const targets: string[] = [];

    if (watchedValues.institution_id) {
      const institution = institutions.find(
        (i: any) => i.id === watchedValues.institution_id
      );
      targets.push(`Institution: ${institution?.name || 'Selected'}`);
    }

    if (watchedValues.department_id) {
      const department = departments.find(
        (d: any) => d.id === watchedValues.department_id
      );
      targets.push(`Department: ${(department as any)?.name || 'Selected'}`);
    }

    if (watchedValues.program_id) {
      const program = programs.find(
        (p: any) => p.id === watchedValues.program_id
      );
      targets.push(
        `Program: ${
          (program as any)?.program_name || (program as any)?.name || 'Selected'
        }`
      );
    }

    if (watchedValues.semester_id) {
      const semester = semesters.find(
        (s: any) => s.id === watchedValues.semester_id
      );
      targets.push(`Semester: ${semester?.semester_name || 'Selected'}`);
    }

    if (watchedValues.section_id) {
      const section = sections.find(
        (s: any) => s.id === watchedValues.section_id
      );
      targets.push(`Section: ${section?.section_name || 'Selected'}`);
    }

    if (watchedValues.target_roles && watchedValues.target_roles.length > 0) {
      const roleLabels = watchedValues.target_roles.map((roleValue: string) => {
        const role = availableRoles.find((r) => r.value === roleValue);
        return role?.label || roleValue;
      });
      targets.push(`Roles: ${roleLabels.join(', ')}`);
    }

    if (targets.length > 0) {
      return targets;
    }

    // Show "All Users" only if user has permission, otherwise show guidance
    return canSendToAll ? ['All Users'] : ['Select targeting criteria'];
  };

  return (
    <div className='space-y-6'>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
          {/* Basic Information */}
          <div className='grid gap-4'>
            <FormField
              control={form.control}
              name='title'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='Enter notification title'
                      {...field}
                      maxLength={100}
                    />
                  </FormControl>
                  <FormDescription>
                    A short, descriptive title for the notification
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='body'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Message *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='Enter notification message'
                      {...field}
                      rows={4}
                      maxLength={500}
                    />
                  </FormControl>
                  <FormDescription>
                    The main content of the notification message
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='priority'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select priority' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value='low'>Low</SelectItem>
                        <SelectItem value='normal'>Normal</SelectItem>
                        <SelectItem value='high'>High</SelectItem>
                        <SelectItem value='urgent'>Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='category'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select a category' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {notificationCategories.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='url'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Action URL (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='https://example.com/page'
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      URL to open when notification is clicked
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='icon'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Icon URL (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='https://example.com/icon.png'
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Custom icon for the notification
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <Separator />

          {/* Targeting Options */}
          <div>
            <div className='mb-4'>
              <h3 className='text-lg font-medium'>Target Audience</h3>
              <p className='text-sm text-muted-foreground mt-1'>
                {canSendToAll
                  ? 'Leave all fields empty to send to ALL USERS, or select specific targeting criteria: Institution → Department → Program → Semester → Section'
                  : 'Select targeting criteria in hierarchy: Institution → Department → Program → Semester → Section'}
              </p>
              {!canSendToAll && (
                <div className='mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800'>
                  <strong>Note:</strong> You don&apos;t have permission to send
                  notifications to all users. Please select specific targeting
                  criteria.
                </div>
              )}
            </div>
            <div className='grid gap-4'>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <FormField
                  control={form.control}
                  name='institution_id'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Institution</FormLabel>
                      <Select
                        onValueChange={handleInstitutionChange}
                        value={field.value || ''}
                        key={`inst-${field.value || 'cleared'}`}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder='All institutions' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {institutions.map((institution: any) => (
                            <SelectItem
                              key={institution.id}
                              value={institution.id}
                            >
                              {institution.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='department_id'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department</FormLabel>
                      <Select
                        onValueChange={handleDepartmentChange}
                        value={field.value || ''}
                        disabled={!selectedInstitutionId}
                        key={`dept-${selectedInstitutionId}`}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                selectedInstitutionId
                                  ? 'All departments'
                                  : 'Select institution first'
                              }
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {departments.length > 0 ? (
                            departments.map((department: any) => (
                              <SelectItem
                                key={department.id}
                                value={department.id}
                              >
                                {(department as any).department_name ||
                                  (department as any).name}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value='no-departments' disabled>
                              {selectedInstitutionId
                                ? 'No departments found'
                                : 'Select institution first'}
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                <FormField
                  control={form.control}
                  name='program_id'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Program</FormLabel>
                      <Select
                        onValueChange={handleProgramChange}
                        value={field.value || ''}
                        disabled={!selectedDepartmentId}
                        key={`prog-${selectedDepartmentId}`}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                selectedDepartmentId
                                  ? 'All programs'
                                  : 'Select department first'
                              }
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {programs.length > 0 ? (
                            programs.map((program: any) => (
                              <SelectItem key={program.id} value={program.id}>
                                {(program as any).program_name ||
                                  (program as any).name}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value='no-programs' disabled>
                              {selectedDepartmentId
                                ? 'No programs found'
                                : 'Select department first'}
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='semester_id'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Semester</FormLabel>
                      <Select
                        onValueChange={handleSemesterChange}
                        value={field.value || ''}
                        disabled={!selectedProgramId}
                        key={`sem-${selectedProgramId}`}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                selectedProgramId
                                  ? 'All semesters'
                                  : 'Select program first'
                              }
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {semesters.length > 0 ? (
                            semesters.map((semester: any) => (
                              <SelectItem key={semester.id} value={semester.id}>
                                {semester.semester_name ||
                                  `Semester ${semester.semester_code}`}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value='no-semesters' disabled>
                              {selectedProgramId
                                ? 'No semesters found'
                                : 'Select program first'}
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='section_id'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Section</FormLabel>
                      <Select
                        onValueChange={handleSectionChange}
                        value={field.value || ''}
                        disabled={!selectedSemesterId}
                        key={`sec-${selectedSemesterId}`}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                selectedSemesterId
                                  ? 'All sections'
                                  : 'Select semester first'
                              }
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {sections.length > 0 ? (
                            sections.map((section: any) => (
                              <SelectItem key={section.id} value={section.id}>
                                {section.section_name}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value='no-sections' disabled>
                              {selectedSemesterId
                                ? 'No sections found'
                                : 'Select semester first'}
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Role-based Targeting */}
              <div>
                <h4 className='text-md font-medium mb-3'>
                  Role-based Targeting (Optional)
                </h4>
                <p className='text-sm text-muted-foreground mb-3'>
                  Select specific user roles to target. If no roles are
                  selected, all roles will receive the notification.
                </p>
                <FormField
                  control={form.control}
                  name='target_roles'
                  render={({ field }) => (
                    <FormItem>
                      {rolesLoading ? (
                        <div className='flex items-center justify-center py-8'>
                          <div className='text-sm text-muted-foreground'>
                            Loading roles...
                          </div>
                        </div>
                      ) : (
                        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
                          {availableRoles.map((role) => (
                            <div
                              key={role.value}
                              className='flex items-center justify-center space-x-2 p-3 border rounded-lg hover:bg-muted/50 transition-colors'
                            >
                              <Checkbox
                                id={role.value}
                                checked={
                                  field.value?.includes(role.value) || false
                                }
                                onCheckedChange={(checked) => {
                                  const currentRoles = field.value || [];
                                  if (checked) {
                                    field.onChange([
                                      ...currentRoles,
                                      role.value
                                    ]);
                                  } else {
                                    field.onChange(
                                      currentRoles.filter(
                                        (r: string) => r !== role.value
                                      )
                                    );
                                  }
                                }}
                                className='mt-0.5'
                              />
                              <div className='flex-1'>
                                <label
                                  htmlFor={role.value}
                                  className='text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer'
                                >
                                  {role.label}
                                </label>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Target Summary */}
              <Card>
                <CardHeader className='pb-3'>
                  <CardTitle className='text-sm flex items-center justify-between'>
                    <div className='flex items-center gap-2'>
                      <Users className='h-4 w-4' />
                      Target Summary
                    </div>
                    {(watchedValues.institution_id ||
                      watchedValues.department_id ||
                      watchedValues.program_id ||
                      watchedValues.semester_id ||
                      watchedValues.section_id ||
                      (watchedValues.target_roles &&
                        watchedValues.target_roles.length > 0)) && (
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        onClick={clearAllTargeting}
                        className='text-xs'
                      >
                        Clear All
                      </Button>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className='pt-0'>
                  <div className='flex flex-wrap gap-2'>
                    {getTargetSummary().map((target, index) => (
                      <Badge key={index} variant='secondary'>
                        {target}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <Separator />

          {/* Preview */}
          {previewMode && (
            <Card>
              <CardHeader>
                <CardTitle className='text-sm flex items-center gap-2'>
                  <Bell className='h-4 w-4' />
                  Notification Preview
                </CardTitle>
                <CardDescription>
                  This is how your notification will appear to users
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className='border rounded-lg p-4 bg-muted/50'>
                  <div className='flex items-start gap-3'>
                    <div className='w-8 h-8 bg-primary rounded-lg flex items-center justify-center'>
                      <Bell className='h-4 w-4 text-primary-foreground' />
                    </div>
                    <div className='flex-1'>
                      <h4 className='font-medium'>
                        {watchedValues.title || 'Notification Title'}
                      </h4>
                      <p className='text-sm text-muted-foreground mt-1'>
                        {watchedValues.body || 'Notification message body...'}
                      </p>
                      <div className='flex items-center gap-2 mt-2'>
                        <Badge variant='outline' className='text-xs'>
                          {watchedValues.priority}
                        </Badge>
                        <span className='text-xs text-muted-foreground'>
                          just now
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className='flex items-center justify-between'>
            <Button
              type='button'
              variant='outline'
              onClick={() => setPreviewMode(!previewMode)}
            >
              {previewMode ? 'Hide Preview' : 'Show Preview'}
            </Button>

            <div className='flex items-center gap-2'>
              <Button
                type='button'
                variant='outline'
                onClick={() => router.back()}
              >
                Cancel
              </Button>
              <Button type='submit' disabled={isSubmitting}>
                {isSubmitting ? (
                  'Sending...'
                ) : (
                  <>
                    <Send className='mr-2 h-4 w-4' />
                    Send Notification
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
