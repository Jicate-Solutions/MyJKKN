'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
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
  FormDescription,
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
import { cn, getErrorMessage } from '@/lib/utils';
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
import { buildStaffSchema, extendedStaffSchema, type StaffFormValues } from './staff-form-schema';
import { LocationCombobox } from './location-combobox';
import {
  indianStates,
  getDistrictsByState,
  resolveLocationId,
  getLocationDisplayName,
} from '@/lib/data/locations';
import { TagsInput } from './tags-input';
import { useStaffTags } from '@/hooks/staff/use-staff-tags';
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

function buildDefaults(staff?: Staff) {
  return {
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
    biometric_id: (staff as any)?.biometric_id ?? '',
    biometric_institution_id: (staff as any)?.biometric_institution_id ?? '',
    profile_picture: staff?.profile_picture || '',
    address: staff?.address || '',
    // The columns store display NAMES; the pickers work in ids. resolveLocationId
    // passes an unrecognised value straight through instead of returning '',
    // so a legacy address stays visible rather than silently blanking.
    state: resolveLocationId(staff?.state, 'state'),
    district: resolveLocationId(
      staff?.district,
      'district',
      resolveLocationId(staff?.state, 'state')
    ),
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
    // 2026-05-15: view-only / labour staff flag. Defaults true (login user).
    // The form auto-derives from selected category's allows_login when the
    // user hasn't manually toggled it.
    login_enabled: staff?.login_enabled ?? true,
    // Optional free-form labels for external-API filtering. Empty = untagged.
    tags: staff?.tags ?? [],
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
  };
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

function mapFieldToTab(field: string): string | null {
  const map: Record<string, string> = {
    qualifications: 'academic', specialisations: 'academic', qualification_summary: 'academic',
    experience_years: 'experience', experience_entries: 'experience', professional_summary: 'experience',
    research_papers: 'research', publications: 'research', research_focus_areas: 'research',
    funded_projects: 'research', google_scholar_url: 'research', researchgate_url: 'research', orcid_url: 'research',
    awards_won: 'achievements', badges: 'achievements', awards: 'achievements',
    certifications: 'achievements', memberships: 'achievements', achievements: 'achievements',
    mentoring_description: 'mentoring', phd_scholars: 'mentoring', pg_dissertations_guided: 'mentoring',
    ug_projects_guided: 'mentoring', phd_scholars_list: 'mentoring',
    faqs: 'faqs',
  };
  return map[field] ?? null;
}

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
    Array<{ id: string; category_name: string; is_teaching: boolean; shows_extended_profile?: boolean; allows_login?: boolean }>
  >([]);
  const [roles, setRoles] = useState<CustomRole[]>([]);

  const [departments, setDepartments] = useState<
    Array<{ id: string; department_name: string }>
  >([]);

  // Track if this is the initial load to avoid unnecessary resets
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Biometric enrolment is required on CREATE only — see buildStaffSchema.
  const schema = useMemo(() => buildStaffSchema(!isEditing), [isEditing]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: buildDefaults(staff)
  });

  // ── Address pickers ────────────────────────────────────────────────────────
  const selectedStateId = useWatch({ control: form.control, name: 'state' });
  const availableDistricts = useMemo(
    () => (selectedStateId ? getDistrictsByState(selectedStateId) : []),
    [selectedStateId]
  );

  // Clear the district ONLY when the user actually changes state. Without the
  // ref guard this effect fires on mount and wipes a district that isn't in the
  // (possibly unrecognised) parent state's list — the exact regression that had
  // to be fixed in the learner form.
  const prevStateIdRef = useRef(selectedStateId);
  useEffect(() => {
    if (prevStateIdRef.current === selectedStateId) return;
    prevStateIdRef.current = selectedStateId;

    const currentDistrict = form.getValues('district');
    if (!currentDistrict) return;

    // Clear ONLY a district that is a real dataset id belonging to a different
    // state. A value that resolves to no known district is legacy free text
    // passed through by resolveLocationId — clearing that is precisely the
    // silent data loss this whole change is guarding against, and it would fire
    // here because the edit form calls form.reset() once the staff row loads.
    const isKnownDistrictId =
      getLocationDisplayName(currentDistrict, 'district') !== currentDistrict;

    if (isKnownDistrictId && !availableDistricts.some((d) => d.id === currentDistrict)) {
      form.setValue('district', '');
    }
  }, [selectedStateId, availableDistricts, form]);

  // ── Role ───────────────────────────────────────────────────────────────────
  // Only super admins may set or change a role (trg_staff_guard_role_key
  // enforces it in the database — this is the UI half). Role is required and
  // NOT NULL, so a non-super-admin creating staff would otherwise be stuck with
  // an unfillable field. Derive a safe, non-privileged default from the
  // employment category instead; a super admin adjusts it afterwards.
  const selectedCategoryId = useWatch({ control: form.control, name: 'category_id' });
  useEffect(() => {
    if (isSuperAdmin || isEditing || !selectedCategoryId) return;

    const category = categories.find((c) => c.id === selectedCategoryId);
    if (!category) return;

    const derived = category.is_teaching ? 'faculty' : 'staff';
    if (form.getValues('role_key') !== derived) {
      form.setValue('role_key', derived, { shouldValidate: true });
    }
  }, [selectedCategoryId, categories, isSuperAdmin, isEditing, form]);

  // Distinct tags already used across staff — powers the tags-input autocomplete.
  // Global (not institution-scoped) so the same vocabulary is suggested everywhere.
  const { data: tagSuggestions = [] } = useStaffTags();

  // Watch institution_id for departments loading
  const watchedInstitutionId = form.watch('institution_id');
  // Watch category to drive conditional department visibility
  const watchedCategoryId = form.watch('category_id');
  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === watchedCategoryId),
    [categories, watchedCategoryId]
  );
  const isTeachingCategory = selectedCategory?.is_teaching ?? false;
  // Drive the "Extended Faculty Profile" toggle visibility off the selected
  // category's shows_extended_profile flag.
  //
  // Resilience layer: also surface the toggle when the staff record itself
  // already has has_extended_profile = true. This handles the case where the
  // categories list (loaded via CategoryService.getCategories — RLS-scoped
  // per the user's role) returns a different subset than super_admin sees,
  // OR is still loading. Without this fallback, non-super-admin admins
  // editing an existing extended-profile staff would see the 3 admin fields
  // (slug/status/display_order) but the toggle (and the 6 extra tabs) would
  // silently vanish, making the form unusable for managing existing data.
  const canEnableExtended =
    !!selectedCategory?.shows_extended_profile ||
    staff?.has_extended_profile === true;

  // When category supports extended profile and the toggle is currently off,
  // auto-flip it on. Applies to BOTH create and edit modes so existing staff
  // under a newly-extended-enabled category get the 6 extra tabs surfaced
  // without requiring a manual toggle click. Users can still toggle off
  // per-record in the Profile Settings sub-section if they don't want it.
  useEffect(() => {
    if (canEnableExtended && form.getValues('has_extended_profile') === false) {
      form.setValue('has_extended_profile', true);
    }
  }, [canEnableExtended, form]);

  // Reset form when staff data changes (for edit mode)
  useEffect(() => {
    if (isEditing && staff) {
      console.log('Resetting form with staff data:', staff);
      form.reset(buildDefaults(staff));
    }
  }, [staff, isEditing, form]);

  // Separate useEffect for initial data loading
  useEffect(() => {
    async function loadInitialData() {
      // Always use the direct query (RLS handles per-role visibility).
      // We apply a client-side filter below for own-scoped roles instead of
      // going through the get_user_accessible_institutions RPC, which avoids
      // a timing issue where the RPC round-trip completes after the user has
      // already attempted to submit the form.
      //
      // Fixed: 2026-07-12 — these 3 fetches were run via Promise.all, which
      // fails atomically: if any single one rejected (e.g. a transient roles
      // query error), the catch block swallowed it into one toast and NONE
      // of institutions/categories/roles got set — even the ones that had
      // already resolved successfully. That made the Institution dropdown
      // (and, since it depends on a loaded category, the Department field)
      // appear to "vanish" whenever an unrelated fetch failed. Promise.allSettled
      // lets each list populate independently of the others' outcome.
      const [institutionsResult, categoriesResult, rolesResult] = await Promise.allSettled([
        OrganizationService.getInstitutionNames(true, undefined, 'all'),
        // Fixed: 2026-04-16 — CategoryService.getCategories defaults to limit=10,
        // which silently truncated the dropdown when active categories grew past 10.
        // Pass a generous limit so every active category appears in the select.
        CategoryService.getCategories({ isActive: true, limit: 100 }),
        // Privileged roles are withheld from everyone but super admins. The
        // database rejects them regardless (trg_staff_guard_role_key); this
        // just keeps them out of a dropdown nobody else may use.
        RoleService.getStaffAssignableRoles({ includePrivileged: isSuperAdmin })
      ]);

      if (institutionsResult.status === 'fulfilled') {
        // For own-scoped roles (HOD, etc.) restrict to the user's primary institution.
        // The direct SELECT may return extra institutions via legacy RLS policies
        // (institutions_select_faculty_hod_principal), so we filter client-side.
        const rawInstitutions = institutionsResult.value;
        const institutionsData = isInstitutionScoped && profile?.institution_id
          ? rawInstitutions.filter((i) => i.id === profile.institution_id)
          : rawInstitutions;
        setInstitutions(institutionsData);
      } else {
        console.error('Error loading institutions:', institutionsResult.reason);
        toast.error('Failed to load institutions');
      }

      if (categoriesResult.status === 'fulfilled') {
        setCategories(categoriesResult.value.data as any);
      } else {
        console.error('Error loading employment categories:', categoriesResult.reason);
        toast.error('Failed to load employment categories');
      }

      if (rolesResult.status === 'fulfilled') {
        setRoles(rolesResult.value);
      } else {
        console.error('Error loading staff-assignable roles:', rolesResult.reason);
        toast.error('Failed to load roles');
      }

      setIsInitialLoad(false);
    }

    // isInstitutionScoped in deps: usePermissions() fetches roles async, so on first
    // render isInstitutionScoped=false and the client-side filter above is skipped.
    // When roles settle and isInstitutionScoped flips to true, we re-run so the
    // institutions list is properly filtered to the user's own institution.
    //
    // isSuperAdmin is in deps for exactly the same reason: it is false until
    // permissions resolve, so the first fetch withholds privileged roles. Without
    // the re-run a genuine super admin would be left with a filtered dropdown.
    if (profile) {
      loadInitialData();
    }
  }, [profile, form, isEditing, isInstitutionScoped, isSuperAdmin]);

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

  // 2026-05-15: Auto-derive login_enabled from selected category's allows_login
  // unless the user has manually toggled the switch. This lets HR pick a labour
  // category (e.g. Driver toggled to allows_login=false in Categories admin) and
  // have the login switch auto-flip OFF — without forcing them to remember to do it.
  const userToggledLoginEnabled = useRef(false);
  useEffect(() => {
    if (userToggledLoginEnabled.current) return;
    if (!selectedCategory) return;
    if (typeof selectedCategory.allows_login !== 'boolean') return;
    const current = form.getValues('login_enabled');
    if (current !== selectedCategory.allows_login) {
      form.setValue('login_enabled', selectedCategory.allows_login, {
        shouldDirty: true
      });
    }
  }, [selectedCategory, form]);

  // Watch login_enabled so email / institution_email inputs can disable themselves.
  const loginEnabled = form.watch('login_enabled');

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

  const onSubmit = async (values: FormValues, opts: { strict: boolean } = { strict: true }) => {
    try {
      // Task 23 (P4.23) — When `strict` (Save & Publish), validate the extended
      // schema explicitly so partial faculty profiles can't be published.
      // Save Draft passes { strict: false } to skip this check.
      if (opts.strict && values.has_extended_profile) {
        const result = extendedStaffSchema.safeParse(values);
        if (!result.success) {
          result.error.issues.forEach((issue) => {
            form.setError(issue.path.join('.') as any, { message: issue.message });
          });
          // Switch to the first tab that has an error.
          const firstField = result.error.issues[0]?.path[0] as string | undefined;
          if (firstField) {
            const tabId = mapFieldToTab(firstField);
            if (tabId) {
              router.replace(`?tab=${tabId}`, { scroll: false });
            }
          }
          return;
        }
      }

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
      // 2026-05-15: for view-only staff (login_enabled=false) pass emails as
      // undefined so StaffService.createStaff invokes generateSyntheticEmail().
      // For login staff keep the historical fallback (empty string → 'required'
      // error from the service, which validates non-empty for login staff).
      const isViewOnlyStaff = values.login_enabled === false;
      // Biometric pairing: blank code clears BOTH columns, and a blank machine
      // id must reach the database as null — '' on a uuid FK is a 22P02.
      const biometricCode = (values.biometric_id ?? '').trim();
      const biometricInstitutionId = biometricCode
        ? (values.biometric_institution_id || null)
        : null;

      const formattedValues = {
        ...values,
        biometric_id: biometricCode || null,
        biometric_institution_id: biometricInstitutionId,
        // The pickers hold ids; the columns store display names, as the learner
        // profiles do. getLocationDisplayName passes an unrecognised id straight
        // through, so a value that arrived as legacy free text round-trips
        // unchanged rather than being written back as a meaningless slug.
        state: getLocationDisplayName(values.state, 'state'),
        district: getLocationDisplayName(values.district, 'district', values.state),
        department_id: normalizedDepartmentId,
        date_of_birth: values.date_of_birth.toISOString(),
        date_of_joining: values.date_of_joining.toISOString(),
        email: isViewOnlyStaff ? (values.email || undefined) : values.email,
        // Institution email is optional for ALL staff (BUG-003989/3980/3962).
        // Normalize blank to undefined so the service receives null instead
        // of '' which would collide on the UNIQUE index.
        institution_email: values.institution_email || undefined
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

      // getErrorMessage, NOT `error instanceof Error`. Supabase errors are
      // plain objects ({code, details, hint, message}), so the instanceof test
      // is always false and every branch below used to compare against the
      // literal fallback string — the whole ladder was dead code and a
      // constraint violation surfaced as "Failed to save staff: Failed to save
      // staff". (2026-08-09, reported against staff_biometric_uq.)
      const errorMessage = getErrorMessage(error);

      // Named-constraint branches first: the index name is the only reliable
      // discriminator. A substring test on the prose ("duplicate key … staff_id")
      // also matches staff_biometric_uq, whose definition contains no field
      // list at all.
      if (errorMessage.includes('staff_biometric_uq')) {
        // Resolve who holds the code before reporting. The normaliser folds
        // leading zeros, so the operator can collide with a code they never
        // typed; naming the holder is the difference between an error and an
        // instruction.
        const code = (form.getValues('biometric_id') ?? '').trim();
        const machineId = form.getValues('biometric_institution_id') ?? '';
        const machine = institutions.find((i) => i.id === machineId);
        const holder = await StaffService.findBiometricConflict(code, machineId).catch(
          () => null
        );

        form.setError('biometric_id', {
          type: 'manual',
          message: holder
            ? `Already used by ${holder.name}${holder.staff_id ? ` (${holder.staff_id})` : ''} on this machine.`
            : 'Already used by another staff member on this machine.'
        });

        toast.error(
          holder
            ? `Biometric code "${code}" is already enrolled to ${holder.name}${
                holder.staff_id ? ` (${holder.staff_id})` : ''
              }${machine ? ` on ${machine.name}` : ''}. Leading zeros are ignored, so 00002 and 2 are the same code.`
            : `Biometric code "${code}" is already enrolled on this machine. Leading zeros are ignored, so 00002 and 2 are the same code.`
        );
      } else if (
        errorMessage.includes('staff_staff_id_key') ||
        (errorMessage.includes('duplicate key') &&
          errorMessage.includes('staff_id'))
      ) {
        // Name the holder, same as the biometric branch above. The ID is
        // globally unique but the list is institution-scoped, so the
        // colliding row is frequently one this operator cannot see — without
        // the holder's name and college the error is a dead end.
        const enteredId = (form.getValues('staff_id') ?? '').trim();
        const holder = await StaffService.findStaffIdConflict(enteredId).catch(() => null);

        form.setError('staff_id', {
          type: 'manual',
          message: holder
            ? `Already used by ${holder.name} at ${holder.institution}.`
            : 'This ID is already taken.'
        });

        toast.error(
          holder
            ? `The ID "${enteredId}" belongs to ${holder.name} at ${holder.institution}${
                holder.is_active ? '' : ' (inactive)'
              }. These IDs are unique across all colleges — please use a different one.`
            : 'That ID already exists. Please use a different one.'
        );
      } else if (
        errorMessage.includes('staff_institution_email_key') ||
        errorMessage.includes('staff_email_key')
      ) {
        // Which constraint fired tells us which field the operator typed into;
        // the lookup tells us which field the address is stored in on the
        // OTHER row. Those differ often enough to be worth reporting, and the
        // holder is frequently at a college this operator cannot see.
        const isInstitutionField = errorMessage.includes('staff_institution_email_key');
        const field = isInstitutionField ? 'institution_email' : 'email';
        const entered = (form.getValues(field) ?? '').trim();
        const holder = await StaffService.findStaffEmailConflict(entered).catch(() => null);

        const heldAs =
          holder && holder.matchedField !== field
            ? holder.matchedField === 'email'
              ? ' — stored there as their personal email'
              : ' — stored there as their institution email'
            : '';

        form.setError(field, {
          type: 'manual',
          message: holder
            ? `Already used by ${holder.name}${holder.staff_id ? ` (${holder.staff_id})` : ''} at ${holder.institution}.`
            : isInstitutionField
              ? 'This institution email is already registered.'
              : 'This email is already registered.'
        });

        toast.error(
          holder
            ? `"${entered}" is already registered to ${holder.name}${
                holder.staff_id ? ` (${holder.staff_id})` : ''
              } at ${holder.institution}${heldAs}${
                holder.is_active ? '' : ' (inactive)'
              }. Each email can belong to only one team member record.`
            : isInstitutionField
              ? 'That institution email is already registered to another team member.'
              : 'That email is already registered to another team member.'
        );
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
              <FormLabel>
                Personal Email{' '}
                {loginEnabled && <span className='text-destructive'>*</span>}
              </FormLabel>
              <FormControl>
                <Input
                  type='email'
                  placeholder={
                    loginEnabled
                      ? 'Enter personal email'
                      : 'Auto-generated for view-only staff'
                  }
                  disabled={!loginEnabled}
                  {...field}
                  value={field.value ?? ''}
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

        {/* State and District are pickers over lib/data/locations.ts as of
            2026-08-28. Free text had produced nine spellings of "Tamil Nadu"
            and 50 district values for ~20 real districts, which made the data
            useless for grouping. The stored values were standardised in the
            same change, so every existing address resolves. */}
        <FormField
          control={form.control}
          name='state'
          render={({ field }) => (
            <FormItem data-field='state'>
              <FormLabel>State <span className='text-destructive'>*</span></FormLabel>
              <FormControl>
                <LocationCombobox
                  value={field.value}
                  onChange={field.onChange}
                  options={indianStates}
                  placeholder='Select state'
                  searchPlaceholder='Search state...'
                  emptyText='No state found.'
                />
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
              <FormLabel>District <span className='text-destructive'>*</span></FormLabel>
              <FormControl>
                <LocationCombobox
                  value={field.value}
                  onChange={field.onChange}
                  options={availableDistricts}
                  placeholder='Select district'
                  searchPlaceholder='Search district...'
                  emptyText='No district found.'
                  disabled={!selectedStateId}
                  disabledText='First select state'
                />
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

        <FormField
          control={form.control}
          name='tags'
          render={({ field }) => (
            <FormItem className='md:col-span-2' data-field='tags'>
              <FormLabel>Tags</FormLabel>
              <FormControl>
                <TagsInput
                  value={field.value ?? []}
                  onChange={field.onChange}
                  suggestions={tagSuggestions}
                  placeholder='e.g. placement_cell, nss — type and press Enter'
                />
              </FormControl>
              <p className='text-xs text-muted-foreground'>
                Optional labels for grouping staff (saved in lowercase). Used to
                fetch specific staff categories via the API
                (<code>?tags=placement_cell,nss</code>).
              </p>
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
        {/* Read-only since 2026-08-28. The ID is issued by trg_staff_autonumber
            from the institution code and the teaching flag (DCH001 / NOTDCH001)
            and frozen thereafter — the database rejects any change with P0001,
            for every role. The field stays registered so its value round-trips
            unchanged on save; sending a DIFFERENT value is what the guard
            rejects, not sending the same one. */}
        <FormField
          control={form.control}
          name='staff_id'
          render={({ field }) => (
            <FormItem data-field='staff_id'>
              <FormLabel>Staff ID</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={field.value ?? ''}
                  readOnly
                  disabled
                  className='bg-muted'
                  placeholder='Generated automatically on save'
                />
              </FormControl>
              <FormDescription>
                {staff?.legacy_staff_id
                  ? `System-generated and permanent. Previously ${staff.legacy_staff_id}.`
                  : 'System-generated from the institution and staff type, and permanent once issued.'}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Biometric enrolment (2026-08-06). Two fields, not one: each machine
            numbers its own enrolments from 1, so a code only identifies someone
            when paired with the machine that issued it. The machine is NOT
            necessarily where this person works — staff routinely punch on
            another institution's machine. Bulk mapping lives in the attendance
            import wizard; this is for one person or a correction. */}
        <FormField
          control={form.control}
          name='biometric_id'
          render={({ field }) => (
            <FormItem data-field='biometric_id'>
              {/* Required on CREATE only — see buildStaffSchema. The marker
                  follows that rule rather than being always-on, because 351
                  existing staff have no enrolment and their records must stay
                  editable without one. */}
              <FormLabel>
                Biometric code{' '}
                {!isEditing && <span className='text-destructive'>*</span>}
              </FormLabel>
              <FormControl>
                <Input
                  placeholder='Empcode from the machine, e.g. 00002'
                  {...field}
                  value={field.value ?? ''}
                />
              </FormControl>
              <FormDescription>
                Leading zeros do not matter — 00002, 002 and 2 are the same code.
                {isEditing
                  ? ' Leave blank to remove this person from biometric attendance.'
                  : ' New staff must be enrolled on a machine.'}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='biometric_institution_id'
          render={({ field }) => {
            const selectedMachine = institutions.find((i) => i.id === field.value);
            return (
              <FormItem data-field='biometric_institution_id'>
                <FormLabel>
                  Biometric machine{' '}
                  {!isEditing && <span className='text-destructive'>*</span>}
                </FormLabel>
                <Select
                  onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}
                  value={field.value || '__none__'}
                >
                  <FormControl>
                    <SelectTrigger>
                      {selectedMachine ? (
                        <span className='line-clamp-1 text-left'>{selectedMachine.name}</span>
                      ) : (
                        <span className='line-clamp-1 text-left text-muted-foreground'>
                          Not enrolled on a machine
                        </span>
                      )}
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className='max-h-60 overflow-y-auto'>
                    <SelectItem value='__none__'>Not enrolled on a machine</SelectItem>
                    {institutions.map((i) => (
                      <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Which machine issued the code — often, but not always, the
                  institution above.
                </FormDescription>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        <FormField
          control={form.control}
          name='institution_email'
          render={({ field }) => (
            <FormItem data-field='institution_email'>
              {/* Required whenever the person can sign in: this address IS the
                  login. sync_staff_to_profiles builds the profile row with
                  `email = NEW.institution_email` and skips the whole block when
                  it is blank, so leaving it empty produces a staff member with
                  login_enabled = true and no profile — no error, no login. */}
              <FormLabel>
                Institution Email{' '}
                {loginEnabled && <span className='text-destructive'>*</span>}
              </FormLabel>
              <FormControl>
                <Input
                  type='email'
                  placeholder={
                    loginEnabled
                      ? 'Enter institution email'
                      : 'Auto-generated for view-only staff'
                  }
                  disabled={!loginEnabled}
                  {...field}
                  value={field.value || ''}
                />
              </FormControl>
              <FormDescription>
                {loginEnabled
                  ? 'This becomes the sign-in address and creates the user account.'
                  : 'Not needed — a placeholder address is generated for view-only staff.'}
              </FormDescription>
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
              <Select
                onValueChange={field.onChange}
                value={field.value}
                disabled={!isSuperAdmin}
              >
                <FormControl>
                  <SelectTrigger className={!isSuperAdmin ? 'bg-muted' : undefined}>
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
                {isSuperAdmin
                  ? 'Drives the user’s permissions after first login. Pick the role that matches the staff member’s responsibilities.'
                  : isEditing
                    ? 'Only a super administrator can change a role. Ask them if this is wrong.'
                    : 'Set automatically from the employment category. A super administrator can change it after the record is created.'}
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
                {/* This field is WHERE THE PERSON WORKS (2026-07-31). It drives
                    every "own institution" scope in the app, so changing it
                    changes what this person can see. Who pays their salary is a
                    separate HR-only record — /hr/payroll/organisation — and is
                    deliberately not editable here. */}
                <FormLabel>Institution — works at <span className='text-destructive'>*</span></FormLabel>
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

      <FormField
        control={form.control}
        name='login_enabled'
        render={({ field }) => (
          <FormItem
            className='flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm'
            data-field='login_enabled'
          >
            <div className='space-y-0.5'>
              <FormLabel>Login user — can sign in to MyJKKN</FormLabel>
              <div className='text-sm text-muted-foreground'>
                Off = view-only staff. Emails optional and auto-generated;
                profile is deactivated. Phone is still required. Default flips
                from the selected category&apos;s &quot;Login default&quot;.
              </div>
            </div>
            <FormControl>
              <Switch
                checked={field.value}
                onCheckedChange={(v) => {
                  userToggledLoginEnabled.current = true;
                  field.onChange(v);
                }}
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
      // canEnableExtended is now driven by category.shows_extended_profile
      // (Task 23, P4.23) — replaced the hardcoded `true`.
      content: (
        <BasicTab
          form={form}
          personalSection={personalSection}
          contactSection={contactSection}
          additionalSection={additionalSection}
          employmentSection={employmentSection}
          statusSection={statusSection}
          canEnableExtended={canEnableExtended}
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

        {/* Form Actions — Cancel / primary save / Save & Publish.
            Save & Publish only appears when has_extended_profile is on.

            2026-08-30: the primary button used to be labelled "Save Draft" and
            hard-coded `status: 'draft'`. Two things were wrong with that.
            `staff.status` is the PUBLIC-DIRECTORY publishing flag, not a
            form-completeness state, so (a) on a record without an extended
            profile this was the ONLY save button, meaning the sole way to
            update an employee was a button that said you were saving a draft;
            and (b) it silently overrode the "Profile Status" dropdown a few
            fields above — set that to Published, save, and it reverted to
            draft, un-publishing anyone already live.

            The primary now saves the status the form actually holds, and
            validates the extended schema whenever the record will end up
            publicly visible. */}
        <div className='flex flex-wrap items-center justify-end gap-2 pt-4 border-t'>
          <Button
            type='button'
            variant='ghost'
            onClick={() => router.back()}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type='button'
            variant={hasExtended ? 'outline' : 'default'}
            onClick={form.handleSubmit((values) => {
              const nextStatus = values.status ?? 'draft';
              return onSubmit(values, {
                // A published record is on the public site, so its extended
                // fields must pass validation however it got there.
                strict: Boolean(values.has_extended_profile) && nextStatus === 'published',
              });
            }, onInvalid)}
            disabled={isSubmitting}
          >
            {isEditing ? 'Update Employee' : 'Create Employee'}
          </Button>
          {hasExtended && (
            <Button
              type='button'
              onClick={form.handleSubmit(
                (values) => onSubmit({ ...values, status: 'published' }, { strict: true }),
                onInvalid
              )}
              disabled={isSubmitting}
            >
              Save &amp; Publish
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
