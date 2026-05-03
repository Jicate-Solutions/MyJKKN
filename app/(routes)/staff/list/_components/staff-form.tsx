'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import type { FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'react-hot-toast';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { Staff } from '@/types/staff';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
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
import { Calendar } from '@/components/ui/calendar';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { CategoryService } from '@/lib/services/staff/category-service';

import { DepartmentService } from '@/lib/services/organization/department-service';
import { useAuth } from '@/hooks/use-auth';
import { StaffService } from '@/lib/services/staff/staff-service';
import { StaffImageUpload } from '@/components/ImageUpload/staff-image-upload';
import { DateInput } from '@/components/ui/date-input';
import { StorageService } from '@/lib/storage/storage-service';
import { getFirstErrorField } from '@/lib/utils/form-errors';
import { RoleService } from '@/lib/services/roles/role-service';
import { usePermissions } from '@/hooks/use-permissions';
import type { CustomRole } from '@/types/auth';
import { fullStaffSchema, type StaffFormValues } from './staff-form-schema';
import { TabbedFormShell, type TabSpec } from '@/components/forms';
import { BasicTab } from './staff-form-tabs/basic-tab';
import { AcademicTab } from './staff-form-tabs/academic-tab';
import { ExperienceTab } from './staff-form-tabs/experience-tab';
import { ResearchTab } from './staff-form-tabs/research-tab';
import { AchievementsTab } from './staff-form-tabs/achievements-tab';
import { MentoringTab } from './staff-form-tabs/mentoring-tab';
import { FaqsTab } from './staff-form-tabs/faqs-tab';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

type FormValues = StaffFormValues;

interface StaffFormProps {
  staff?: Staff;
  isEditing?: boolean;
}

const staffFieldOrder: Array<keyof FormValues> = [
  'first_name',
  'last_name',
  'gender',
  'date_of_birth',
  'email',
  'phone',
  'address',
  'state',
  'district',
  'pincode',
  'marital_status',
  'blood_group',
  'profile_picture',
  'staff_id',
  'institution_email',
  'date_of_joining',
  'designation',
  'category_id',
  'role_key',
  'institution_id',
  'department_id',
  'is_active'
];

export function StaffForm({ staff, isEditing }: StaffFormProps) {
  const router = useRouter();
  const { profile } = useAuth();
  // Drives "scoped to your own institution" UX (replaces hardcoded
  // profile.role === 'hod'). Any role with institution_scope='own' qualifies.
  const { isInstitutionScoped, isSuperAdmin, getModuleScope } = usePermissions();
  // Users whose effective scope on the staff module is 'own_records' may only
  // edit personal/contact details on their own row — not Employment Information
  // (designation, category, role, institution, department). RLS enforces this
  // at the DB layer too; this is the UX gate.
  const staffScope = getModuleScope('staff');
  const canEditEmployment =
    !isEditing || isSuperAdmin || staffScope !== 'own_records';
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create stable date strings to prevent hydration mismatches
  const maxDate = useMemo(() => {
    // Use a more stable approach for SSR compatibility
    try {
      const today = new Date();
      // Force UTC to avoid timezone differences between server/client
      const utcDate = new Date(today.getTime() + (today.getTimezoneOffset() * 60000));
      return utcDate.toISOString().split('T')[0];
    } catch {
      // Fallback to a reasonable current date
      return '2024-12-31';
    }
  }, []);

  const minDate = '1900-01-01';
  const [initialProfilePicture, setInitialProfilePicture] = useState<
    string | undefined
  >(staff?.profile_picture);
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [categories, setCategories] = useState<
    Array<{ id: string; category_name: string; is_teaching: boolean }>
  >([]);
  const [roles, setRoles] = useState<CustomRole[]>([]);

  const [departments, setDepartments] = useState<
    Array<{ id: string; department_name: string }>
  >([]);

  // Track if this is the initial load to avoid unnecessary resets
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const form = useForm<FormValues>({
    resolver: zodResolver(fullStaffSchema),
    defaultValues: {
      first_name: staff?.first_name || '',
      last_name: staff?.last_name || '',
      gender: staff?.gender || 'male',
      date_of_birth: staff?.date_of_birth
        ? new Date(staff.date_of_birth)
        : undefined,
      marital_status: staff?.marital_status || 'single',
      blood_group: staff?.blood_group,
      email: staff?.email || '',
      institution_email: staff?.institution_email || '',
      phone: staff?.phone || '',
      staff_id: staff?.staff_id || '',
      profile_picture: staff?.profile_picture || '',
      address: staff?.address || '',
      state: staff?.state || '',
      district: staff?.district || '',
      pincode: staff?.pincode || '',
      date_of_joining: staff?.date_of_joining
        ? new Date(staff.date_of_joining)
        : undefined,
      designation: staff?.designation || '',
      category_id: staff?.category_id || '',
      role_key: (staff as any)?.role_key || '',
      institution_id: staff?.institution_id || '',
      department_id: staff?.department_id || '',
      is_active: staff?.is_active ?? true,
      // Extended-profile defaults — keep RHF from seeing `undefined` for any of
      // these fields (which would silently fail Zod required-checks once the
      // user toggles `has_extended_profile=true`).
      has_extended_profile: staff?.has_extended_profile ?? false,
      slug: staff?.slug ?? null,
      status: staff?.status ?? 'draft',
      display_order: staff?.display_order ?? 0,
      experience_years: staff?.experience_years ?? 0,
      research_papers: staff?.research_papers ?? 0,
      phd_scholars: staff?.phd_scholars ?? 0,
      awards_won: staff?.awards_won ?? 0,
      pg_dissertations_guided: staff?.pg_dissertations_guided ?? 0,
      ug_projects_guided: staff?.ug_projects_guided ?? 0,
      qualification_summary: staff?.qualification_summary ?? null,
      professional_summary: staff?.professional_summary ?? null,
      mentoring_description: staff?.mentoring_description ?? null,
      google_scholar_url: staff?.google_scholar_url ?? null,
      researchgate_url: staff?.researchgate_url ?? null,
      orcid_url: staff?.orcid_url ?? null,
      badges: staff?.badges ?? [],
      qualifications: staff?.qualifications ?? [],
      specialisations: staff?.specialisations ?? [],
      experience_entries: staff?.experience_entries ?? [],
      research_focus_areas: staff?.research_focus_areas ?? [],
      publications: staff?.publications ?? [],
      funded_projects: staff?.funded_projects ?? [],
      certifications: staff?.certifications ?? [],
      awards: staff?.awards ?? [],
      memberships: staff?.memberships ?? [],
      phd_scholars_list: staff?.phd_scholars_list ?? [],
      faqs: staff?.faqs ?? [],
      achievements: staff?.achievements ?? []
    }
  });

  // Watch institution_id for departments loading
  const watchedInstitutionId = form.watch('institution_id');
  // Watch category to drive conditional department visibility
  const watchedCategoryId = form.watch('category_id');
  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === watchedCategoryId),
    [categories, watchedCategoryId]
  );
  const isTeachingCategory = selectedCategory?.is_teaching ?? false;

  // Reset form when staff data changes (for edit mode)
  useEffect(() => {
    if (isEditing && staff) {
      console.log('Resetting form with staff data:', staff);
      form.reset({
        first_name: staff.first_name || '',
        last_name: staff.last_name || '',
        gender: staff.gender || 'male',
        date_of_birth: staff.date_of_birth
          ? new Date(staff.date_of_birth)
          : undefined,
        marital_status: staff.marital_status || 'single',
        blood_group: staff.blood_group,
        email: staff.email || '',
        institution_email: staff.institution_email || '',
        phone: staff.phone || '',
        staff_id: staff.staff_id || '',
        profile_picture: staff.profile_picture || '',
        address: staff.address || '',
        state: staff.state || '',
        district: staff.district || '',
        pincode: staff.pincode || '',
        date_of_joining: staff.date_of_joining
          ? new Date(staff.date_of_joining)
          : undefined,
        designation: staff.designation || '',
        category_id: staff.category_id || '',
        role_key: (staff as any).role_key || '',
        institution_id: staff.institution_id || '',
        department_id: staff.department_id || '',
        is_active: staff.is_active ?? true
      });
    }
  }, [staff, isEditing, form]);

  // Separate useEffect for initial data loading
  useEffect(() => {
    async function loadInitialData() {
      try {
        // Always use the direct query (RLS handles per-role visibility).
        // We apply a client-side filter below for own-scoped roles instead of
        // going through the get_user_accessible_institutions RPC, which avoids
        // a timing issue where the RPC round-trip completes after the user has
        // already attempted to submit the form.
        const [rawInstitutions, categoriesData, rolesData] = await Promise.all([
          OrganizationService.getInstitutionNames(true, undefined, 'all'),
          // Fixed: 2026-04-16 — CategoryService.getCategories defaults to limit=10,
          // which silently truncated the dropdown when active categories grew past 10.
          // Pass a generous limit so every active category appears in the select.
          CategoryService.getCategories({ isActive: true, limit: 100 }),
          RoleService.getStaffAssignableRoles()
        ]);

        // For own-scoped roles (HOD, etc.) restrict to the user's primary institution.
        // The direct SELECT may return extra institutions via legacy RLS policies
        // (institutions_select_faculty_hod_principal), so we filter client-side.
        const institutionsData = isInstitutionScoped && profile?.institution_id
          ? rawInstitutions.filter((i) => i.id === profile.institution_id)
          : rawInstitutions;

        setInstitutions(institutionsData);
        setCategories(categoriesData.data as any);
        setRoles(rolesData);

        setIsInitialLoad(false);
      } catch (error) {
        console.error('Error loading initial data:', error);
        toast.error('Failed to load initial data');
      }
    }

    // isInstitutionScoped in deps: usePermissions() fetches roles async, so on first
    // render isInstitutionScoped=false and the client-side filter above is skipped.
    // When roles settle and isInstitutionScoped flips to true, we re-run so the
    // institutions list is properly filtered to the user's own institution.
    if (profile) {
      loadInitialData();
    }
  }, [profile, form, isEditing, isInstitutionScoped]);

  // Auto-select institution for own-scoped roles (HOD, principal, etc.).
  // We re-run on `institutions.length` so the setValue fires AFTER the async
  // institutions list has loaded — without that dep the Radix Select can't
  // register a matching <SelectItem> for the value and falls back to the
  // placeholder while the trigger is disabled.
  useEffect(() => {
    if (
      !isEditing &&
      isInstitutionScoped &&
      profile?.institution_id &&
      institutions.length > 0 &&
      !form.getValues('institution_id')
    ) {
      form.setValue('institution_id', profile.institution_id, {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      });
    }
  }, [isInstitutionScoped, profile?.institution_id, isEditing, form, institutions.length]);

  // Separate useEffect for loading departments when institution changes
  useEffect(() => {
    async function loadDepartments() {
      if (!watchedInstitutionId) {
        setDepartments([]);
        return;
      }

      try {
        const depsData = await DepartmentService.getDepartmentsByInstitution(
          watchedInstitutionId
        );
        setDepartments(depsData);

        // Only reset department field in create mode and after initial load
        if (!isEditing && !isInitialLoad) {
          form.setValue('department_id', '');
        } else if (isEditing && staff?.department_id && !isInitialLoad) {
          // In edit mode, only reset if current department doesn't belong to new institution
          const currentDepartmentExists = depsData.some(
            (d) => d.id === staff.department_id
          );
          if (!currentDepartmentExists) {
            form.setValue('department_id', '');
          }
        }
      } catch (error) {
        console.error('Error loading departments:', error);
        toast.error('Failed to load departments');
      }
    }
    loadDepartments();
  }, [
    watchedInstitutionId,
    isEditing,
    staff?.department_id,
    form,
    isInitialLoad
  ]);

  // When category switches to non-teaching, clear department_id
  // (DB trigger also clears it defensively; this keeps the form state consistent).
  useEffect(() => {
    if (selectedCategory && !selectedCategory.is_teaching) {
      if (form.getValues('department_id')) {
        form.setValue('department_id', '');
      }
    }
  }, [selectedCategory, form]);

  const onInvalid = (errors: FieldErrors<FormValues>) => {
    const firstErrorField = getFirstErrorField(errors, staffFieldOrder);
    if (!firstErrorField) {
      return;
    }

    requestAnimationFrame(() => {
      const fieldContainer = document.querySelector(
        `[data-field="${String(firstErrorField)}"]`
      );
      const fallbackTarget = document.querySelector('[aria-invalid="true"]');
      const target = (fieldContainer || fallbackTarget) as HTMLElement | null;

      if (!target) {
        return;
      }

      target.scrollIntoView({ behavior: 'smooth', block: 'center' });

      const focusTarget =
        target.querySelector<HTMLElement>(
          'input, button, textarea, select, [tabindex]:not([tabindex="-1"])'
        ) ?? target;

      if (typeof focusTarget.focus === 'function') {
        focusTarget.focus({ preventScroll: true });
      }
    });
  };

  const onSubmit = async (values: FormValues) => {
    try {
      // Conditional department enforcement (mirrors DB trigger).
      const cat = categories.find((c) => c.id === values.category_id);
      if (cat?.is_teaching && !values.department_id) {
        form.setError('department_id', {
          type: 'manual',
          message: 'Department is required for teaching staff'
        });
        return;
      }

      setIsSubmitting(true);

      // Check if profile picture was removed
      if (isEditing && initialProfilePicture && !values.profile_picture) {
        await StorageService.deleteStaffImageByUrl(initialProfilePicture);
        toast.success('Profile picture deleted from storage.');
      }

      // Non-teaching staff must not carry department_id.
      const normalizedDepartmentId =
        cat?.is_teaching === false ? null : values.department_id || null;

      // Format dates to ISO strings
      const formattedValues = {
        ...values,
        department_id: normalizedDepartmentId,
        date_of_birth: values.date_of_birth.toISOString(),
        date_of_joining: values.date_of_joining.toISOString(),
        institution_email: values.institution_email || ''
      };

      if (isEditing && staff) {
        await StaffService.updateStaff(staff.id, formattedValues as any);
        toast.success('Staff updated successfully');
      } else {
        await StaffService.createStaff(formattedValues as any);
        toast.success('Staff created successfully');
      }

      router.push('/staff/list');
      // Remove router.refresh() - React Query will handle data refresh automatically
    } catch (error) {
      console.error('Form submission error:', error);

      // Extract the error message
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to save staff';

      // Handle specific validation errors
      if (
        errorMessage.includes('staff_staff_id_key') ||
        (errorMessage.includes('duplicate key') &&
          errorMessage.includes('staff_id'))
      ) {
        toast.error('Staff ID already exists. Please use a different ID.');
      }
      // Check for other common validation patterns
      else if (
        errorMessage.toLowerCase().includes('unique constraint') ||
        errorMessage.toLowerCase().includes('duplicate key')
      ) {
        // Try to extract the field name from the error
        const fieldMatch = errorMessage.match(/\((.*?)\)/);
        if (fieldMatch && fieldMatch[1]) {
          const field = fieldMatch[1].replace(/_/g, ' ');
          toast.error(`A record with this ${field} already exists.`);
        } else {
          toast.error('A record with this information already exists.');
        }
      }
      // Backend validation errors (non-DB constraint related)
      else if (errorMessage.toLowerCase().includes('validation')) {
        toast.error(`Validation error: ${errorMessage}`);
      }
      // Generic database errors
      else if (
        errorMessage.toLowerCase().includes('database') ||
        errorMessage.toLowerCase().includes('db error')
      ) {
        toast.error('Database error occurred. Please try again later.');
      }
      // Other specific errors related to staff
      else if (
        errorMessage.toLowerCase().includes('email') &&
        (errorMessage.toLowerCase().includes('invalid') ||
          errorMessage.toLowerCase().includes('already exists'))
      ) {
        toast.error('Invalid or duplicate email address.');
      }
      // Fallback error message
      else {
        toast.error(`Failed to save staff: ${errorMessage}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Section JSX hoisted into named consts ──────────────────────────────────
  // These are unchanged from the previous vertical layout — they're hoisted so
  // we can pass them as React.ReactNode props into <BasicTab> rather than
  // rendering them directly in the form return.
  const personalSection = (
    <div className='space-y-4'>
      <h2 className='text-lg font-semibold'>Personal Information</h2>
      <div className='grid gap-4 md:grid-cols-2'>
        <FormField
          control={form.control}
          name='first_name'
          render={({ field }) => (
            <FormItem data-field='first_name'>
              <FormLabel>First Name <span className='text-destructive'>*</span></FormLabel>
              <FormControl>
                <Input placeholder='Enter first name' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='last_name'
          render={({ field }) => (
            <FormItem data-field='last_name'>
              <FormLabel>Last Name <span className='text-destructive'>*</span></FormLabel>
              <FormControl>
                <Input placeholder='Enter last name' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='gender'
          render={({ field }) => (
            <FormItem data-field='gender'>
              <FormLabel>Gender <span className='text-destructive'>*</span></FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder='Select gender' />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value='male'>Male</SelectItem>
                  <SelectItem value='female'>Female</SelectItem>
                  <SelectItem value='bigender'>Bigender</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='date_of_birth'
          render={({ field }) => (
            <FormItem className='flex flex-col' data-field='date_of_birth'>
              <FormLabel>Date of Birth <span className='text-destructive'>*</span></FormLabel>
              <FormControl>
                <DateInput
                  value={field.value}
                  onChange={field.onChange}
                  max={maxDate}
                  min={minDate}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );

  const contactSection = (
    <div className='space-y-4'>
      <h2 className='text-lg font-semibold'>Contact Information</h2>
      <div className='grid gap-4 md:grid-cols-2'>
        <FormField
          control={form.control}
          name='email'
          render={({ field }) => (
            <FormItem data-field='email'>
              <FormLabel>Personal Email <span className='text-destructive'>*</span></FormLabel>
              <FormControl>
                <Input
                  type='email'
                  placeholder='Enter personal email'
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='phone'
          render={({ field }) => (
            <FormItem data-field='phone'>
              <FormLabel>Phone <span className='text-destructive'>*</span></FormLabel>
              <FormControl>
                <Input
                  placeholder='Enter phone number'
                  type='number'
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='address'
          render={({ field }) => (
            <FormItem data-field='address'>
              <FormLabel>Address</FormLabel>
              <FormControl>
                <Input placeholder='Enter address' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='state'
          render={({ field }) => (
            <FormItem data-field='state'>
              <FormLabel>State</FormLabel>
              <FormControl>
                <Input placeholder='Enter state' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='district'
          render={({ field }) => (
            <FormItem data-field='district'>
              <FormLabel>District</FormLabel>
              <FormControl>
                <Input placeholder='Enter district' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='pincode'
          render={({ field }) => (
            <FormItem data-field='pincode'>
              <FormLabel>PIN Code</FormLabel>
              <FormControl>
                <Input
                  placeholder='Enter PIN code'
                  type='number'
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );

  const additionalSection = (
    <div className='space-y-4'>
      <h2 className='text-lg font-semibold'>Additional Information</h2>
      <div className='grid gap-4 md:grid-cols-2'>
        <FormField
          control={form.control}
          name='marital_status'
          render={({ field }) => (
            <FormItem data-field='marital_status'>
              <FormLabel>Marital Status <span className='text-destructive'>*</span></FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder='Select marital status' />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value='single'>Single</SelectItem>
                  <SelectItem value='married'>Married</SelectItem>
                  <SelectItem value='divorced'>Divorced</SelectItem>
                  <SelectItem value='widow'>Widow</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='blood_group'
          render={({ field }) => (
            <FormItem data-field='blood_group'>
              <FormLabel>Blood Group</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value || ''}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder='Select blood group' />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value='A+'>A+</SelectItem>
                  <SelectItem value='A-'>A-</SelectItem>
                  <SelectItem value='B+'>B+</SelectItem>
                  <SelectItem value='B-'>B-</SelectItem>
                  <SelectItem value='AB+'>AB+</SelectItem>
                  <SelectItem value='AB-'>AB-</SelectItem>
                  <SelectItem value='O+'>O+</SelectItem>
                  <SelectItem value='O-'>O-</SelectItem>
                  <SelectItem value='A1+'>A1+</SelectItem>
                  <SelectItem value='A1B'>A1B</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='profile_picture'
          render={({ field }) => (
            <FormItem data-field='profile_picture'>
              <FormLabel>Profile Picture</FormLabel>
              <FormControl>
                <StaffImageUpload
                  value={field.value}
                  onChange={field.onChange}
                  onRemove={() => field.onChange('')}
                  staffId={isEditing ? (staff?.id as string) : 'temp'}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );

  // Employment Information — hidden in edit mode for users whose
  // staff scope is 'own_records' (they may only update their own
  // personal/contact info, not their designation/role/etc.).
  const employmentSection = !canEditEmployment ? (
    <div className='rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground'>
      Your role only allows editing personal details on your own
      employee record. Employment information (designation, role,
      institution, department) is managed by HR.
    </div>
  ) : (
    <div className='space-y-4'>
      <h2 className='text-lg font-semibold'>Employment Information</h2>
      <div className='grid gap-4 md:grid-cols-2'>
        <FormField
          control={form.control}
          name='staff_id'
          render={({ field }) => (
            <FormItem data-field='staff_id'>
              <FormLabel>Staff ID</FormLabel>
              <FormControl>
                <Input placeholder='Enter staff ID' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='institution_email'
          render={({ field }) => (
            <FormItem data-field='institution_email'>
              <FormLabel>Institution Email</FormLabel>
              <FormControl>
                <Input
                  type='email'
                  placeholder='Enter institution email'
                  {...field}
                  value={field.value || ''}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='date_of_joining'
          render={({ field }) => (
            <FormItem className='flex flex-col' data-field='date_of_joining'>
              <FormLabel>Date of Joining <span className='text-destructive'>*</span></FormLabel>
              <FormControl>
                <DateInput
                  value={field.value}
                  onChange={field.onChange}
                  max={maxDate}
                  min={minDate}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='designation'
          render={({ field }) => (
            <FormItem data-field='designation'>
              <FormLabel>Designation <span className='text-destructive'>*</span></FormLabel>
              <FormControl>
                <Input placeholder='Enter designation' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='category_id'
          render={({ field }) => (
            <FormItem data-field='category_id'>
              <FormLabel>Employment Category <span className='text-destructive'>*</span></FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder='Select category' />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.category_name}
                      {category.is_teaching ? ' (Teaching)' : ' (Non-Teaching)'}
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
          name='role_key'
          render={({ field }) => (
            <FormItem data-field='role_key'>
              <FormLabel>Role <span className='text-destructive'>*</span></FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder='Select role' />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.role_key} value={role.role_key}>
                      {role.role_name}
                      <span className='ml-2 text-xs text-muted-foreground'>
                        ({role.role_key})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className='text-xs text-muted-foreground'>
                Drives the user&apos;s permissions after first login. Pick the role
                that matches the staff member&apos;s responsibilities.
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='institution_id'
          render={({ field }) => {
            // Radix Select only registers <SelectItem> children once the
            // popover opens. For users whose Select is disabled (own-scoped
            // roles like HOD) the popover never opens, so <SelectValue>
            // never gets a registered name for the controlled value and
            // falls back to the placeholder. Render our own span with the
            // looked-up name when there is a selection — and fall back to
            // <SelectValue> ONLY in the empty state so Radix never owns
            // both children and a portal ref on the same element (which
            // crashes under React 19 strict rendering).
            const selectedInstitution = institutions.find(
              (i) => i.id === field.value
            );
            return (
              <FormItem data-field='institution_id'>
                <FormLabel>Institution <span className='text-destructive'>*</span></FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  // Lock institution for users scoped to a single accessible institution
                  disabled={isInstitutionScoped && institutions.length === 1}
                >
                  <FormControl>
                    <SelectTrigger>
                      {selectedInstitution ? (
                        <span className='line-clamp-1 text-left'>
                          {selectedInstitution.name}
                        </span>
                      ) : (
                        <SelectValue placeholder='Select institution' />
                      )}
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {institutions.map((inst) => (
                      <SelectItem key={inst.id} value={inst.id}>
                        {inst.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
                {isInstitutionScoped && institutions.length === 1 && (
                  <p className="text-xs text-muted-foreground">
                    Your role is scoped to a single institution.
                  </p>
                )}
              </FormItem>
            );
          }}
        />

        {isTeachingCategory ? (
          <FormField
            control={form.control}
            name='department_id'
            render={({ field }) => (
              <FormItem data-field='department_id'>
                <FormLabel>Department <span className='text-destructive'>*</span></FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value ?? ''}
                  disabled={!form.watch('institution_id')}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder='Select department' />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.department_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
                {isInstitutionScoped && departments.length > 0 && (
                  <p className='text-xs text-muted-foreground'>
                    You can create staff for any department in your institution.
                  </p>
                )}
              </FormItem>
            )}
          />
        ) : watchedCategoryId ? (
          <div className='flex items-center rounded-lg border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground'>
            Non-teaching staff don&apos;t require a department.
          </div>
        ) : null}
      </div>
    </div>
  );

  const statusSection = (
    <div className='space-y-4'>
      <FormField
        control={form.control}
        name='is_active'
        render={({ field }) => (
          <FormItem
            className='flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm'
            data-field='is_active'
          >
            <div className='space-y-0.5'>
              <FormLabel>Active Status</FormLabel>
              <div className='text-sm text-muted-foreground'>
                Disable to temporarily deactivate staff account
              </div>
            </div>
            <FormControl>
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            </FormControl>
          </FormItem>
        )}
      />
    </div>
  );

  // ─── Tab spec ──────────────────────────────────────────────────────────────
  // hasExtended drives visibility of the 6 extended-profile tabs; the dirty
  // dot is just a small UX hint and is not load-bearing.
  const hasExtended = form.watch('has_extended_profile');
  const dirty = form.formState.dirtyFields as Record<string, unknown>;
  const isDirty = (prefixes: string[]) =>
    prefixes.some((p) => Object.keys(dirty).some((k) => k === p || k.startsWith(`${p}.`)));

  const tabs: TabSpec[] = [
    {
      id: 'basic',
      label: 'Basic',
      dirty: isDirty([
        'first_name','last_name','gender','date_of_birth','email','phone',
        'address','state','district','pincode','marital_status','blood_group',
        'profile_picture','staff_id','institution_email','date_of_joining',
        'designation','category_id','role_key','institution_id','department_id',
        'is_active','slug','status','display_order','has_extended_profile'
      ]),
      // canEnableExtended is hardcoded to true here — Task 23 (P4.23) replaces
      // it with the category-driven check (only teaching categories can enable).
      content: (
        <BasicTab
          form={form}
          personalSection={personalSection}
          contactSection={contactSection}
          additionalSection={additionalSection}
          employmentSection={employmentSection}
          statusSection={statusSection}
          canEnableExtended={true}
        />
      )
    },
    {
      id: 'academic',
      label: 'Academic',
      hidden: !hasExtended,
      dirty: isDirty(['qualifications','specialisations','qualification_summary']),
      content: <AcademicTab form={form} />
    },
    {
      id: 'experience',
      label: 'Experience',
      hidden: !hasExtended,
      dirty: isDirty(['experience_years','experience_entries','professional_summary']),
      content: <ExperienceTab form={form} />
    },
    {
      id: 'research',
      label: 'Research',
      hidden: !hasExtended,
      dirty: isDirty([
        'research_papers','publications','research_focus_areas','funded_projects',
        'google_scholar_url','researchgate_url','orcid_url'
      ]),
      content: <ResearchTab form={form} />
    },
    {
      id: 'achievements',
      label: 'Achievements',
      hidden: !hasExtended,
      dirty: isDirty(['awards_won','badges','awards','certifications','memberships','achievements']),
      content: <AchievementsTab form={form} />
    },
    {
      id: 'mentoring',
      label: 'Mentoring',
      hidden: !hasExtended,
      dirty: isDirty([
        'mentoring_description','phd_scholars','pg_dissertations_guided',
        'ug_projects_guided','phd_scholars_list'
      ]),
      content: <MentoringTab form={form} />
    },
    {
      id: 'faqs',
      label: 'FAQs',
      hidden: !hasExtended,
      dirty: isDirty(['faqs']),
      content: <FaqsTab form={form} />
    }
  ];

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit, onInvalid)}
        className='space-y-6'
        suppressHydrationWarning
      >
        <p className='text-xs text-muted-foreground'>
          Fields marked with <span className='text-destructive'>*</span> are required.
        </p>

        <TabbedFormShell tabs={tabs} defaultTab='basic' />

        {/* Form Actions — Task 23 (P4.23) will replace this with the
            Save Draft / Save & Publish split. Keep the existing single
            Submit button for now so the form is still usable. */}
        <div className='flex justify-end gap-4 pt-4 border-t'>
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
              ? isEditing
                ? 'Saving...'
                : 'Creating...'
              : isEditing
              ? 'Save Changes'
              : 'Create Staff'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
