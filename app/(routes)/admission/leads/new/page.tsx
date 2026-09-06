'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { AdmissionYearSelect } from '@/components/admission/admission-year-select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useLeadMutations, useCounselorProfiles } from '@/hooks/admission';
import { useActiveLeadSources } from '@/hooks/admission/use-active-lead-sources';
import { useConsultantsForDropdown } from '@/hooks/admission/use-consultants';
import {
  useReferralInstitutions,
  useReferralDepartments,
  useReferralStudents,
  useReferralStaff,
} from '@/hooks/admission/use-referral-dropdowns-hierarchy';
import type { ReferralType } from '@/types/admission';
import { CounselorDailyViewService } from '@/lib/services/admission/counselor-daily-view-service';
import { LeadService } from '@/lib/services/admission/lead-service';
import { ConsultantService } from '@/lib/services/admission/consultant-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ArrowLeft, Save, Loader2, ChevronsUpDown, X, Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { AdmissionErrorBoundary } from '@/components/admission';
import { indianStates, getDistrictsByState } from '@/lib/data/locations';

/**
 * navMeta — documents that this page is invoked via a button click on the
 * parent listing page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 */
export const navMeta = {
  invokedFrom: '/admission/leads',
} as const;


// Source options now come from useActiveLeadSources() — admin-curated rows
// in admission_lead_sources_master replace this once-static list.

const REFERRAL_TYPES = [
  { value: 'consultant', label: 'Consultant' },
  { value: 'student', label: 'Student' },
  { value: 'faculty', label: 'Faculty' },
];

const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' }
];

interface FormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  alternate_phone: string;
  date_of_birth: string;
  gender: string;
  parent_name: string;
  parent_phone: string;
  parent_email: string;
  address_line1: string;
  city: string;
  state: string;
  district: string;
  pincode: string;
  first_touch_source: string;
  notes: string;
  // JKKN Tier-1 fields
  student_interest_level: string;
  parent_decision_status: string;
  admission_year_id: string;
}

interface ProgramOption {
  id: string;
  program_name: string;
  display_name: string | null;
  degree_name: string | null;
  department_name: string | null;
}

function NewLeadPageContent() {
  // Admin-curated source list (replaces static LEAD_SOURCES). Falls back to
  // empty array while loading; the dropdown handles empty gracefully.
  const router = useRouter();
  const { profile } = useAuth();
  const { options: leadSources } = useActiveLeadSources({
    institutionId: profile?.institution_id ?? null,
  });
  const { isSuperAdmin, isAdmissionGlobalUser } = usePermissions();
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess();
  const { createLeadWithProfile } = useLeadMutations();

  // Institution selection — all users can see & select from their accessible institutions
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>('');

  // Counselor assignment (optional at creation time)
  const [selectedCounselorProfileId, setSelectedCounselorProfileId] = useState<string>('');

  // Consultant attribution (optional at creation time)
  const [selectedConsultantId, setSelectedConsultantId] = useState<string>('');

  // Referral type sub-selection
  const [referralType, setReferralType] = useState<ReferralType | ''>('');
  const [selectedReferrerId, setSelectedReferrerId] = useState<string>('');

  // Fallback for a staff/student referrer with no record in the system. Mutually
  // exclusive with selectedReferrerId — whichever the operator sets last wins,
  // so a lead can never carry a picked person AND a contradicting typed name.
  const [manualReferrerName, setManualReferrerName] = useState<string>('');

  // Inline consultant creation. A consultant is never left as free text: if the
  // agency is missing it is created here and the new id is selected immediately.
  const [createConsultantOpen, setCreateConsultantOpen] = useState(false);
  const [newConsultantName, setNewConsultantName] = useState('');
  const [newConsultantPhone, setNewConsultantPhone] = useState('');
  const [creatingConsultant, setCreatingConsultant] = useState(false);

  // Referrer hierarchy filters — INDEPENDENT of the lead's institution.
  // A student at Institution A may refer a lead for Institution B, so we let
  // the user browse any institution/department when picking a referrer.
  const [referrerInstitutionId, setReferrerInstitutionId] = useState<string>('');
  const [referrerDepartmentId, setReferrerDepartmentId] = useState<string>('');

  // Auto-set institution if user has only one
  useEffect(() => {
    if (!isSuperAdmin && !isAdmissionGlobalUser && profile?.institution_id) {
      setSelectedInstitutionId(profile.institution_id);
    } else if (institutions.length === 1) {
      setSelectedInstitutionId(institutions[0].id);
    }
  }, [profile?.institution_id, isSuperAdmin, isAdmissionGlobalUser, institutions]);

  // Seed referrer institution from the lead institution the first time user picks
  // a student/faculty referral type — they can still change it afterwards.
  useEffect(() => {
    if (
      (referralType === 'student' || referralType === 'faculty') &&
      !referrerInstitutionId &&
      selectedInstitutionId
    ) {
      setReferrerInstitutionId(selectedInstitutionId);
    }
  }, [referralType, referrerInstitutionId, selectedInstitutionId]);

  const institutionId = selectedInstitutionId;
  // Mirror the exact same institution-resolution logic as the auto-set useEffect so
  // consultants load immediately on first render — before setState fires.
  // Priority: explicit form selection → profile institution (non-super-admin) → only accessible institution
  const effectiveInstitutionId =
    institutionId ||
    (!isSuperAdmin && !isAdmissionGlobalUser && profile?.institution_id ? profile.institution_id : undefined) ||
    (institutions.length === 1 ? institutions[0].id : undefined);

  // Counselors and consultants are shared across ALL institutions — always fetch the
  // full list regardless of which institution is selected or which role the user has.
  const { data: counselorProfiles } = useCounselorProfiles(null);
  const { data: consultants = [] } = useConsultantsForDropdown();

  // Referrer pickers use the cross-institution API so admission_staff (own-scope)
  // can still pick students/staff from any institution.
  const { data: referrerInstitutions = [], isLoading: referrerInstitutionsLoading } =
    useReferralInstitutions();
  const { data: referrerDepartments = [], isLoading: referrerDepartmentsLoading } =
    useReferralDepartments(referrerInstitutionId || undefined);
  const { data: studentsDropdown = [], isLoading: studentsLoading } = useReferralStudents(
    referrerInstitutionId || undefined,
    referrerDepartmentId || undefined
  );
  const { data: facultyDropdown = [], isLoading: facultyLoading } = useReferralStaff(
    referrerInstitutionId || undefined,
    referrerDepartmentId || undefined
  );

  const queryClient = useQueryClient();

  /**
   * Create the missing consultant, then select it — so the lead is attributed to
   * a real education_consultants row rather than an unjoinable string. Only
   * `name` is required; consultant_type / status / tier carry DB defaults.
   */
  const handleCreateConsultant = async () => {
    const name = newConsultantName.trim();
    if (!name) {
      toast.error('Consultant name is required');
      return;
    }
    setCreatingConsultant(true);
    try {
      const created = await ConsultantService.createConsultant({
        name,
        phone: newConsultantPhone.trim() || null,
        consultant_type: 'external',
      } as any);

      // Seed the cache so the picker shows the new name immediately; the
      // invalidate then reconciles with the server copy.
      queryClient.setQueryData(
        ['consultants-dropdown', 'all'],
        (old: any[] = []) => [...old, { id: created.id, name: created.name, value: created.id, label: created.name }]
      );
      queryClient.invalidateQueries({ queryKey: ['consultants-dropdown'] });

      setSelectedConsultantId(created.id);
      setCreateConsultantOpen(false);
      setNewConsultantName('');
      setNewConsultantPhone('');
      toast.success(`Consultant "${created.name}" created and selected`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create consultant');
    } finally {
      setCreatingConsultant(false);
    }
  };

  // Programs loaded based on selected institution
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [programsLoading, setProgramsLoading] = useState(false);
  // 2026-04-21 — single primary interested program + multi alternatives
  const [selectedProgramId, setSelectedProgramId] = useState<string>(''); // primary
  const [selectedAlternativeProgramIds, setSelectedAlternativeProgramIds] =
    useState<string[]>([]);
  const [alternativesPopoverOpen, setAlternativesPopoverOpen] = useState(false);

  // Open-state for the searchable referrer pickers
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [facultyPickerOpen, setFacultyPickerOpen] = useState(false);
  const [consultantPickerOpen, setConsultantPickerOpen] = useState(false);

  // Admission years cascade extracted to <AdmissionYearSelect/> (2026-04-23) —
  // one shared component now serves leads/new, leads/[id] edit, and the
  // learner enquiry form (PR-3). The per-page useState/useEffect duplication
  // is gone; the shared <AdmissionYearSelect> owns fetch + placeholder copy +
  // rich-label rendering.

  // Entry date — defaults to today (local timezone, not UTC). Admission-global
  // users and super admins may backdate it, which is required when entering
  // historical referrals from a prior academic year.
  const todayLocal = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const [entryDate, setEntryDate] = useState<string>(todayLocal);

  // Floor for backdating. Deliberately not open-ended: a mistyped year (2015
  // for 2025) would otherwise be accepted silently and file the lead under the
  // wrong admission year. 2025-01-01 covers the whole 2025-26 intake.
  const ENTRY_DATE_MIN = '2025-01-01';

  // Fetch programs when institution changes
  useEffect(() => {
    if (!institutionId) {
      setPrograms([]);
      setSelectedProgramId('');
      setSelectedAlternativeProgramIds([]);
      return;
    }

    setProgramsLoading(true);
    setSelectedProgramId('');
    setSelectedAlternativeProgramIds([]);
    const supabase = createClientSupabaseClient();

    (supabase as any)
      .from('programs')
      .select(`
        id,
        program_name,
        display_name,
        degree:degrees(degree_name),
        department:departments(department_name)
      `)
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .order('program_name')
      .then(({ data, error }: { data: any; error: any }) => {
        if (error) {
          console.error('[admission/leads] Failed to fetch programs:', error.message);
          setPrograms([]);
        } else {
          setPrograms(
            (data || []).map((p: any) => ({
              id: p.id,
              program_name: p.program_name,
              display_name: p.display_name,
              degree_name: p.degree?.degree_name || null,
              department_name: p.department?.department_name || null,
            }))
          );
        }
        setProgramsLoading(false);
      });
  }, [institutionId]);

  // (Admission-years fetch effect removed; lives inside <AdmissionYearSelect/>.)

  // Clear admission_year_id when the institution changes — admission years are
  // institution-scoped, so switching institution invalidates the old value and
  // re-triggers <AdmissionYearSelect autoSelectCurrent> for the new institution.
  useEffect(() => {
    setFormData((prev) =>
      prev.admission_year_id ? { ...prev, admission_year_id: '' } : prev
    );
  }, [selectedInstitutionId]);


  // Group programs by degree for organized display
  const programsByDegree = useMemo(() => {
    const grouped: Record<string, ProgramOption[]> = {};
    programs.forEach((p) => {
      const key = p.degree_name || 'Other';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(p);
    });
    return grouped;
  }, [programs]);

  // Toggle for alternative programs — excludes the currently-selected primary.
  const toggleAlternativeProgram = (programId: string) => {
    // Don't let the user also mark the primary as an alternative
    if (programId === selectedProgramId) return;
    setSelectedAlternativeProgramIds((prev) =>
      prev.includes(programId)
        ? prev.filter((id) => id !== programId)
        : [...prev, programId]
    );
  };

  const selectedAlternativeProgramNames = useMemo(() => {
    return selectedAlternativeProgramIds
      .map((id) => programs.find((p) => p.id === id))
      .filter(Boolean)
      .map((p) => p!.display_name || p!.program_name);
  }, [selectedAlternativeProgramIds, programs]);

  const [formData, setFormData] = useState<FormData>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    alternate_phone: '',
    date_of_birth: '',
    gender: '',
    parent_name: '',
    parent_phone: '',
    parent_email: '',
    address_line1: '',
    city: '',
    state: 'tamil_nadu',
    district: '',
    pincode: '',
    first_touch_source: '',
    notes: '',
    student_interest_level: '',
    parent_decision_status: '',
    admission_year_id: '',
  });

  const [errors, setErrors] = useState<Partial<Record<keyof FormData | 'institution', string>>>({});

  const handleChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    // When source changes, clear the irrelevant assignment
    if (field === 'first_touch_source') {
      if (value === 'referral') {
        setSelectedCounselorProfileId('');
      } else {
        setSelectedConsultantId('');
        setReferralType('');
        setSelectedReferrerId('');
      }
    }
  };

  const handleInstitutionChange = (value: string) => {
    setSelectedInstitutionId(value);
    if (errors.institution) {
      setErrors((prev) => ({ ...prev, institution: undefined }));
    }
  };

  // Cascading districts from selected state
  const availableDistricts = useMemo(() => {
    return formData.state ? getDistrictsByState(formData.state) : [];
  }, [formData.state]);

  const handleStateChange = (stateId: string) => {
    setFormData((prev) => ({ ...prev, state: stateId, district: '' }));
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof FormData | 'institution', string>> = {};

    if (!formData.first_name.trim()) {
      newErrors.first_name = 'First name is required';
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else {
      const cleaned = formData.phone.replace(/[\s\-()]/g, '');
      if (!/^(\+91|0)?[6-9]\d{9}$/.test(cleaned)) {
        newErrors.phone = 'Enter a valid 10-digit Indian mobile number (starting with 6–9)';
      }
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email address';
    }

    if (!formData.first_touch_source) {
      newErrors.first_touch_source = 'Lead source is required';
    }

    if (!institutionId) {
      newErrors.institution = 'Institution is required';
    }

    // Required since 2026-07-25 — a lead with no cohort cannot be matched to a
    // fee structure, seat plan or admission-year report downstream. The picker
    // pre-fills the institution's current cohort, so this only fires when the
    // institution has no admission years configured or the user cleared it.
    if (!formData.admission_year_id) {
      newErrors.admission_year_id = 'Admission year is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const resetForm = () => {
    setFormData({
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      alternate_phone: '',
      date_of_birth: '',
      gender: '',
      parent_name: '',
      parent_phone: '',
      parent_email: '',
      address_line1: '',
      city: '',
      state: 'tamil_nadu',
      district: '',
      pincode: '',
      first_touch_source: '',
      notes: '',
      student_interest_level: '',
      parent_decision_status: '',
      admission_year_id: '',
    });
    setSelectedProgramId('');
    setSelectedAlternativeProgramIds([]);
    setSelectedCounselorProfileId('');
    setSelectedConsultantId('');
    setReferralType('');
    setSelectedReferrerId('');
    setReferrerInstitutionId('');
    setReferrerDepartmentId('');
    setErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Please fill all required fields');
      return;
    }

    const selectedState = indianStates.find((s) => s.id === formData.state);
    const selectedDistrict = availableDistricts.find((d) => d.id === formData.district);

    const leadPayload = {
      institution_id: institutionId!,
      first_name: formData.first_name.trim(),
      last_name: formData.last_name.trim() || null,
      email: formData.email?.trim() || null,
      phone: formData.phone.trim(),
      source: formData.first_touch_source as any,
      tags: [] as string[],
      program_id: selectedProgramId || null,
      alternative_programs:
        selectedAlternativeProgramIds.length > 0
          ? selectedAlternativeProgramIds
          : null,
      entry_date: new Date(entryDate + 'T00:00:00').toISOString(),
      // Address fields
      address_line1: formData.address_line1?.trim() || null,
      state: selectedState?.name || null,
      district: selectedDistrict?.name || null,
      city: formData.city?.trim() || null,
      pincode: formData.pincode?.trim() || null,
      // Personal details
      alternate_phone: formData.alternate_phone?.trim() || null,
      date_of_birth: formData.date_of_birth || null,
      gender: formData.gender || null,
      // Parent/Guardian
      parent_name: formData.parent_name?.trim() || null,
      parent_phone: formData.parent_phone?.trim() || null,
      parent_email: formData.parent_email?.trim() || null,
      // Notes
      notes: formData.notes?.trim() || null,
      // JKKN Tier-1 fields
      student_interest_level: formData.student_interest_level || null,
      parent_decision_status: formData.parent_decision_status || null,
      admission_year_id: formData.admission_year_id || null,
      // Referral fields
      referral_type: formData.first_touch_source === 'referral' && referralType ? referralType : null,
      referred_by_id: (() => {
        if (formData.first_touch_source !== 'referral' || !referralType) return null;
        if (referralType === 'consultant') {
          return selectedConsultantId && selectedConsultantId !== '_none' ? selectedConsultantId : null;
        }
        return selectedReferrerId && selectedReferrerId !== '_none' ? selectedReferrerId : null;
      })(),
      referred_by_name: (() => {
        if (formData.first_touch_source !== 'referral' || !referralType) return null;
        if (referralType === 'consultant') {
          const c = consultants.find((x) => x.id === selectedConsultantId);
          return c?.name || null;
        }
        // Staff and learners are owned by HR / Admissions — we cannot mint a
        // record for a referrer who has none. A typed name with a NULL
        // referred_by_id is the honest representation and is explicitly
        // supported by the schema (referred_by_id is nullable). Consultants
        // never reach here: they are created first, then linked.
        const manual = manualReferrerName.trim();
        if (referralType === 'student') {
          const s = studentsDropdown.find((x) => x.id === selectedReferrerId);
          return s?.name || manual || null;
        }
        if (referralType === 'faculty') {
          const f = facultyDropdown.find((x) => x.id === selectedReferrerId);
          return f?.name || manual || null;
        }
        return null;
      })(),
    };

    try {
      const lead = await createLeadWithProfile.mutateAsync(leadPayload);

      // Best-effort counselor assignment — does not block navigation
      if (selectedCounselorProfileId && selectedCounselorProfileId !== '_none') {
        try {
          const counselorId = await CounselorDailyViewService.resolveOrCreateCounselor(
            selectedCounselorProfileId,
            institutionId || undefined
          );
          await LeadService.assignCounselor(lead.id, counselorId, selectedCounselorProfileId);
        } catch (e) {
          console.warn('[leads/new] Could not assign counselor (best-effort):', e);
        }
      }

      // Best-effort consultant attribution (only for consultant referral type)
      if (referralType === 'consultant' && selectedConsultantId && selectedConsultantId !== '_none' && institutionId) {
        try {
          await ConsultantService.createLeadAttribution({
            institution_id: institutionId,
            lead_id: lead.id,
            consultant_id: selectedConsultantId,
            attribution_type: 'primary',
            attribution_percentage: 100,
          });
        } catch (e) {
          console.warn('[leads/new] Could not create consultant attribution (best-effort):', e);
        }
      }

      toast.success('Lead created successfully');
      resetForm();
      router.push(`/admission/leads/${lead.id}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create lead';

      if (errorMessage.startsWith('Duplicate lead:')) {
        toast.error('A lead with this phone number already exists', {
          description: 'Update the existing lead or mark it as lost before creating a new one.',
          duration: 6000,
        });
        setErrors((prev) => ({ ...prev, phone: 'This phone number already exists for this institution' }));
      } else if (errorMessage.includes('Invalid phone number')) {
        toast.error('Invalid phone number', {
          description: errorMessage,
          duration: 5000,
        });
        setErrors((prev) => ({ ...prev, phone: errorMessage }));
      } else {
        toast.error(errorMessage);
      }

      console.error('[admission/leads] Failed to create lead:', error);
    }
  };

  // Determine if user can change institution (super admin or has access to multiple)
  const canSelectInstitution = isSuperAdmin || isAdmissionGlobalUser || institutions.length > 1;

  // Only admission-global users and super admins may backdate the entry date.
  // Note the deliberate absence of `institutions.length > 1` here: being able to
  // pick an institution is not a reason to be able to rewrite when a lead arrived.
  const canBackdateEntryDate = isSuperAdmin || isAdmissionGlobalUser;
  const selectedInstitutionName = institutions.find((i) => i.id === institutionId)?.name;

  return (
    <PermissionGuard module="admission" action="leads.create">
      <ContentLayout title="Add New Lead">
        <div className="space-y-6">
          {/* Breadcrumb */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/leads">Leads</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>New Lead</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main Form */}
              <div className="lg:col-span-2 space-y-6">
                {/* Basic Information */}
                <Card>
                  <CardHeader>
                    <CardTitle>Basic Information</CardTitle>
                    <CardDescription>Enter the lead&apos;s contact details</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="first_name">
                          First Name <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="first_name"
                          value={formData.first_name}
                          onChange={(e) => handleChange('first_name', e.target.value)}
                          placeholder="Enter first name"
                          className={errors.first_name ? 'border-destructive' : ''}
                        />
                        {errors.first_name && (
                          <p className="text-xs text-destructive">{errors.first_name}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="last_name">Last Name</Label>
                        <Input
                          id="last_name"
                          value={formData.last_name}
                          onChange={(e) => handleChange('last_name', e.target.value)}
                          placeholder="Enter last name (optional)"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => handleChange('email', e.target.value)}
                          placeholder="Enter email address"
                          className={errors.email ? 'border-destructive' : ''}
                        />
                        {errors.email && (
                          <p className="text-xs text-destructive">{errors.email}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="phone">
                          Phone <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="phone"
                          value={formData.phone}
                          onChange={(e) => handleChange('phone', e.target.value)}
                          placeholder="Enter phone number"
                          className={errors.phone ? 'border-destructive' : ''}
                        />
                        {errors.phone && (
                          <p className="text-xs text-destructive">{errors.phone}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="alternate_phone">Alternate Phone</Label>
                        <Input
                          id="alternate_phone"
                          value={formData.alternate_phone}
                          onChange={(e) => handleChange('alternate_phone', e.target.value)}
                          placeholder="Enter alternate phone"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="date_of_birth">Date of Birth</Label>
                        <Input
                          id="date_of_birth"
                          type="date"
                          value={formData.date_of_birth}
                          onChange={(e) => handleChange('date_of_birth', e.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="gender">Gender</Label>
                        <Select
                          value={formData.gender}
                          onValueChange={(value) => handleChange('gender', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select gender" />
                          </SelectTrigger>
                          <SelectContent>
                            {GENDERS.map((gender) => (
                              <SelectItem key={gender.value} value={gender.value}>
                                {gender.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="entry_date">Entry Date</Label>
                        <Input
                          id="entry_date"
                          type="date"
                          value={entryDate}
                          min={ENTRY_DATE_MIN}
                          max={todayLocal()}
                          onChange={(e) => {
                            // `min`/`max` constrain the picker but a typed value
                            // can still fall outside the range, so clamp here too.
                            const v = e.target.value;
                            if (!v) return setEntryDate(todayLocal());
                            if (v < ENTRY_DATE_MIN) return setEntryDate(ENTRY_DATE_MIN);
                            if (v > todayLocal()) return setEntryDate(todayLocal());
                            setEntryDate(v);
                          }}
                          disabled={!canBackdateEntryDate}
                          className={canBackdateEntryDate ? undefined : 'bg-muted'}
                        />
                        <p className="text-xs text-muted-foreground">
                          {canBackdateEntryDate
                            ? `Defaults to today. Can be backdated to ${ENTRY_DATE_MIN} for historical entries.`
                            : "Auto-set to today's date"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Academic Details */}
                <Card>
                  <CardHeader>
                    <CardTitle>Academic Details</CardTitle>
                    <CardDescription>Institution and program interest</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Institution */}
                    <div className="space-y-2">
                      <Label htmlFor="institution">
                        Institution <span className="text-destructive">*</span>
                      </Label>
                      {canSelectInstitution ? (
                        <Select
                          value={selectedInstitutionId}
                          onValueChange={handleInstitutionChange}
                          disabled={institutionsLoading}
                        >
                          <SelectTrigger className={errors.institution ? 'border-destructive' : ''}>
                            <SelectValue placeholder={institutionsLoading ? 'Loading...' : 'Select institution'} />
                          </SelectTrigger>
                          <SelectContent>
                            {institutions.map((inst) => (
                              <SelectItem key={inst.id} value={inst.id}>
                                {inst.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          value={selectedInstitutionName || 'Loading...'}
                          disabled
                          className="bg-muted"
                        />
                      )}
                      {errors.institution && (
                        <p className="text-xs text-destructive">{errors.institution}</p>
                      )}
                    </div>

                    {/* Interested Program — single select (2026-04-21) */}
                    <div className="space-y-2">
                      <Label htmlFor="interested_program">Interested Program</Label>
                      {!institutionId ? (
                        <p className="text-sm text-muted-foreground">Select an institution first to view programs</p>
                      ) : programsLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading programs...
                        </div>
                      ) : programs.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No programs found for this institution</p>
                      ) : (
                        <Select
                          value={selectedProgramId}
                          onValueChange={(v) => setSelectedProgramId(v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select the primary program this lead is applying for" />
                          </SelectTrigger>
                          <SelectContent className="max-h-72">
                            {Object.entries(programsByDegree).map(([degreeName, degreePrograms]) => (
                              <div key={degreeName}>
                                <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                  {degreeName}
                                </div>
                                {degreePrograms.map((program) => (
                                  <SelectItem key={program.id} value={program.id}>
                                    <div className="flex flex-col">
                                      <span>{program.display_name || program.program_name}</span>
                                      {program.department_name && (
                                        <span className="text-xs text-muted-foreground">
                                          {program.department_name}
                                        </span>
                                      )}
                                    </div>
                                  </SelectItem>
                                ))}
                              </div>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Drives the Admission Year list — only cohorts for this program are shown below.
                      </p>
                    </div>

                    {/* Alternative Programs — multi-select (2026-04-21). Excludes the primary. */}
                    <div className="space-y-2">
                      <Label>Alternative Programs <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
                      {!institutionId || programs.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          {!institutionId ? 'Select an institution first' : 'No other programs available'}
                        </p>
                      ) : !selectedProgramId ? (
                        <p className="text-sm text-muted-foreground">
                          Pick an Interested Program first to add backup options.
                        </p>
                      ) : (
                        <>
                          <Popover open={alternativesPopoverOpen} onOpenChange={setAlternativesPopoverOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={alternativesPopoverOpen}
                                className="w-full justify-between font-normal"
                              >
                                {selectedAlternativeProgramIds.length > 0
                                  ? `${selectedAlternativeProgramIds.length} alternative${selectedAlternativeProgramIds.length > 1 ? 's' : ''} selected`
                                  : 'Add backup programs the lead is also considering'}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                              <Command>
                                <CommandInput placeholder="Search alternatives..." />
                                <CommandList>
                                  <CommandEmpty>No programs found.</CommandEmpty>
                                  {Object.entries(programsByDegree).map(([degreeName, degreePrograms]) => {
                                    const eligible = degreePrograms.filter(p => p.id !== selectedProgramId);
                                    if (eligible.length === 0) return null;
                                    return (
                                      <CommandGroup key={degreeName} heading={degreeName}>
                                        {eligible.map((program) => (
                                          <CommandItem
                                            key={program.id}
                                            value={program.program_name}
                                            onSelect={() => toggleAlternativeProgram(program.id)}
                                          >
                                            <Checkbox
                                              checked={selectedAlternativeProgramIds.includes(program.id)}
                                              className="mr-2"
                                            />
                                            <div className="flex flex-col">
                                              <span>{program.display_name || program.program_name}</span>
                                              {program.department_name && (
                                                <span className="text-xs text-muted-foreground">
                                                  {program.department_name}
                                                </span>
                                              )}
                                            </div>
                                          </CommandItem>
                                        ))}
                                      </CommandGroup>
                                    );
                                  })}
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>

                          {selectedAlternativeProgramNames.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {selectedAlternativeProgramIds.map((id) => {
                                const prog = programs.find((p) => p.id === id);
                                if (!prog) return null;
                                return (
                                  <Badge key={id} variant="secondary" className="gap-1">
                                    {prog.display_name || prog.program_name}
                                    <button
                                      type="button"
                                      onClick={() => toggleAlternativeProgram(id)}
                                      className="ml-0.5 rounded-full hover:bg-muted-foreground/20"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </Badge>
                                );
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Admission Year — shared institution-scoped picker (2026-04-23) */}
                    <AdmissionYearSelect
                      institutionId={institutionId}
                      value={formData.admission_year_id}
                      onChange={(value) => handleChange('admission_year_id', value)}
                      autoSelectCurrent
                      required
                      error={errors.admission_year_id}
                    />
                  </CardContent>
                </Card>

                {/* Parent / Guardian */}
                <Card>
                  <CardHeader>
                    <CardTitle>Parent / Guardian</CardTitle>
                    <CardDescription>Parent or guardian contact information</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="parent_name">Parent / Guardian Name</Label>
                        <Input
                          id="parent_name"
                          value={formData.parent_name}
                          onChange={(e) => handleChange('parent_name', e.target.value)}
                          placeholder="Enter parent or guardian name"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="parent_phone">Parent / Guardian Phone</Label>
                        <Input
                          id="parent_phone"
                          value={formData.parent_phone}
                          onChange={(e) => handleChange('parent_phone', e.target.value)}
                          placeholder="Enter phone number"
                        />
                      </div>

                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="parent_email">Parent / Guardian Email</Label>
                        <Input
                          id="parent_email"
                          type="email"
                          value={formData.parent_email}
                          onChange={(e) => handleChange('parent_email', e.target.value)}
                          placeholder="Enter email address"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Address */}
                <Card>
                  <CardHeader>
                    <CardTitle>Address</CardTitle>
                    <CardDescription>Enter the lead&apos;s address details</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="address_line1">Address</Label>
                      <Input
                        id="address_line1"
                        value={formData.address_line1}
                        onChange={(e) => handleChange('address_line1', e.target.value)}
                        placeholder="Enter street address"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="state">State</Label>
                        <Select
                          value={formData.state}
                          onValueChange={handleStateChange}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select state" />
                          </SelectTrigger>
                          <SelectContent>
                            {indianStates.map((state) => (
                              <SelectItem key={state.id} value={state.id}>
                                {state.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="district">District</Label>
                        <Select
                          value={formData.district}
                          onValueChange={(value) => handleChange('district', value)}
                          disabled={!formData.state}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={formData.state ? 'Select district' : 'Select state first'} />
                          </SelectTrigger>
                          <SelectContent>
                            {availableDistricts.map((district) => (
                              <SelectItem key={district.id} value={district.id}>
                                {district.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="city">City / Town</Label>
                        <Input
                          id="city"
                          value={formData.city}
                          onChange={(e) => handleChange('city', e.target.value)}
                          placeholder="Enter city or town"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="pincode">Pincode</Label>
                        <Input
                          id="pincode"
                          value={formData.pincode}
                          onChange={(e) => handleChange('pincode', e.target.value)}
                          placeholder="Enter pincode"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Notes */}
                <Card>
                  <CardHeader>
                    <CardTitle>Additional Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={formData.notes}
                      onChange={(e) => handleChange('notes', e.target.value)}
                      placeholder="Enter any additional notes about this lead..."
                      rows={4}
                    />
                  </CardContent>
                </Card>
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                {/* Lead Source */}
                <Card>
                  <CardHeader>
                    <CardTitle>Lead Source</CardTitle>
                    <CardDescription>How did this lead find you?</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <Label htmlFor="first_touch_source">
                        Source <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={formData.first_touch_source}
                        onValueChange={(value) => handleChange('first_touch_source', value)}
                      >
                        <SelectTrigger className={errors.first_touch_source ? 'border-destructive' : ''}>
                          <SelectValue placeholder="Select source" />
                        </SelectTrigger>
                        <SelectContent>
                          {leadSources.map((source) => (
                            <SelectItem key={source.masterId} value={source.value}>
                              {source.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.first_touch_source && (
                        <p className="text-xs text-destructive">{errors.first_touch_source}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* JKKN Assessment */}
                <Card>
                  <CardHeader>
                    <CardTitle>Assessment</CardTitle>
                    <CardDescription>JKKN-specific lead assessment</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="student_interest_level">Student Interest Level</Label>
                      <Select
                        value={formData.student_interest_level}
                        onValueChange={(value) => handleChange('student_interest_level', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select interest level" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="very_high">Very High</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="undecided">Undecided</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="parent_decision_status">Parent Decision Status</Label>
                      <Select
                        value={formData.parent_decision_status}
                        onValueChange={(value) => handleChange('parent_decision_status', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select decision status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="supportive">Supportive</SelectItem>
                          <SelectItem value="considering">Considering</SelectItem>
                          <SelectItem value="neutral">Neutral</SelectItem>
                          <SelectItem value="reluctant">Reluctant</SelectItem>
                          <SelectItem value="opposed">Opposed</SelectItem>
                          <SelectItem value="unknown">Unknown</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                {/* Show Referral Type section for referral source, Counselor for all others */}
                {formData.first_touch_source === 'referral' ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>Referral Details</CardTitle>
                      <CardDescription>Select the type of referral and the referrer</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Referral Type Selection */}
                      <div className="space-y-2">
                        <Label>Referral Type</Label>
                        <Select
                          value={referralType}
                          onValueChange={(value) => {
                            setReferralType(value as ReferralType);
                            setSelectedConsultantId('');
                            setSelectedReferrerId('');
                            setManualReferrerName('');
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select referral type" />
                          </SelectTrigger>
                          <SelectContent>
                            {REFERRAL_TYPES.map((rt) => (
                              <SelectItem key={rt.value} value={rt.value}>
                                {rt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Consultant Searchable Picker */}
                      {referralType === 'consultant' && (
                        <div className="space-y-2">
                          <Label>Select Consultant</Label>
                          <Popover open={consultantPickerOpen} onOpenChange={setConsultantPickerOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={consultantPickerOpen}
                                className="w-full justify-between font-normal"
                              >
                                <span className="truncate">
                                  {selectedConsultantId && selectedConsultantId !== '_none'
                                    ? consultants.find((c) => c.id === selectedConsultantId)?.name ||
                                      'Select consultant'
                                    : `Search & select consultant${
                                        consultants.length > 0 ? ` (${consultants.length})` : ''
                                      }`}
                                </span>
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                              <Command>
                                <CommandInput placeholder="Type to search consultants..." />
                                <CommandList>
                                  <CommandEmpty>
                                    <button
                                      type="button"
                                      className="flex w-full items-center justify-center gap-1.5 px-2 py-3 text-sm font-medium text-primary hover:underline"
                                      onClick={() => {
                                        setConsultantPickerOpen(false);
                                        setCreateConsultantOpen(true);
                                      }}
                                    >
                                      <Plus className="h-4 w-4" />
                                      Add this consultant
                                    </button>
                                  </CommandEmpty>
                                  <CommandGroup>
                                    <CommandItem
                                      value="__add-new-consultant"
                                      onSelect={() => {
                                        setConsultantPickerOpen(false);
                                        setCreateConsultantOpen(true);
                                      }}
                                    >
                                      <Plus className="mr-2 h-4 w-4 text-primary" />
                                      <span className="font-medium text-primary">
                                        Add new consultant
                                      </span>
                                    </CommandItem>
                                    <CommandItem
                                      value="no-consultant"
                                      onSelect={() => {
                                        setSelectedConsultantId('_none');
                                        setConsultantPickerOpen(false);
                                      }}
                                    >
                                      <span className="text-muted-foreground">No consultant</span>
                                    </CommandItem>
                                    {consultants.map((c) => (
                                      <CommandItem
                                        key={c.id}
                                        value={c.name}
                                        onSelect={() => {
                                          setSelectedConsultantId(c.id);
                                          setConsultantPickerOpen(false);
                                        }}
                                      >
                                        {c.name}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </div>
                      )}

                      {/* Hierarchy filters for student / faculty referrer — any institution allowed */}
                      {(referralType === 'student' || referralType === 'faculty') && (
                        <>
                          <div className="space-y-2">
                            <Label>Referrer Institution</Label>
                            <Select
                              value={referrerInstitutionId}
                              onValueChange={(value) => {
                                setReferrerInstitutionId(value);
                                setReferrerDepartmentId('');
                                setSelectedReferrerId('');
                              }}
                              disabled={referrerInstitutionsLoading}
                            >
                              <SelectTrigger>
                                <SelectValue
                                  placeholder={
                                    referrerInstitutionsLoading
                                      ? 'Loading institutions...'
                                      : 'Select institution'
                                  }
                                />
                              </SelectTrigger>
                              <SelectContent>
                                {referrerInstitutions.map((inst) => (
                                  <SelectItem key={inst.id} value={inst.id}>
                                    {inst.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label>
                              Department <span className="text-muted-foreground text-xs">(optional)</span>
                            </Label>
                            <Select
                              value={referrerDepartmentId || '_all'}
                              onValueChange={(value) => {
                                setReferrerDepartmentId(value === '_all' ? '' : value);
                                setSelectedReferrerId('');
                              }}
                              disabled={!referrerInstitutionId || referrerDepartmentsLoading}
                            >
                              <SelectTrigger>
                                <SelectValue
                                  placeholder={
                                    !referrerInstitutionId
                                      ? 'Select institution first'
                                      : referrerDepartmentsLoading
                                      ? 'Loading departments...'
                                      : 'All departments'
                                  }
                                />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="_all">All departments</SelectItem>
                                {referrerDepartments.map((d) => (
                                  <SelectItem key={d.id} value={d.id}>
                                    {d.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </>
                      )}

                      {/* Student Searchable Picker */}
                      {referralType === 'student' && (
                        <div className="space-y-2">
                          <Label>Select Student</Label>
                          <Popover open={studentPickerOpen} onOpenChange={setStudentPickerOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={studentPickerOpen}
                                disabled={!referrerInstitutionId || studentsLoading}
                                className="w-full justify-between font-normal"
                              >
                                <span className="truncate">
                                  {!referrerInstitutionId
                                    ? 'Select institution first'
                                    : studentsLoading
                                    ? 'Loading students...'
                                    : selectedReferrerId && selectedReferrerId !== '_none'
                                    ? studentsDropdown.find((s) => s.id === selectedReferrerId)?.name ||
                                      'Select student'
                                    : `Search & select student${
                                        studentsDropdown.length > 0
                                          ? ` (${studentsDropdown.length})`
                                          : ''
                                      }`}
                                </span>
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                              <Command>
                                <CommandInput placeholder="Type to search students..." />
                                <CommandList>
                                  <CommandEmpty>
                                    {studentsLoading ? 'Loading...' : 'No students found.'}
                                  </CommandEmpty>
                                  <CommandGroup>
                                    <CommandItem
                                      value="no-student"
                                      onSelect={() => {
                                        setSelectedReferrerId('_none');
                                        setStudentPickerOpen(false);
                                      }}
                                    >
                                      <span className="text-muted-foreground">No student</span>
                                    </CommandItem>
                                    {studentsDropdown.map((s) => (
                                      <CommandItem
                                        key={s.id}
                                        value={s.name}
                                        onSelect={() => {
                                          setSelectedReferrerId(s.id);
                                          setManualReferrerName('');
                                          setStudentPickerOpen(false);
                                        }}
                                      >
                                        {s.name}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </div>
                      )}

                      {/* Faculty Searchable Picker */}
                      {referralType === 'faculty' && (
                        <div className="space-y-2">
                          <Label>Select Faculty</Label>
                          <Popover open={facultyPickerOpen} onOpenChange={setFacultyPickerOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={facultyPickerOpen}
                                disabled={!referrerInstitutionId || facultyLoading}
                                className="w-full justify-between font-normal"
                              >
                                <span className="truncate">
                                  {!referrerInstitutionId
                                    ? 'Select institution first'
                                    : facultyLoading
                                    ? 'Loading staff...'
                                    : selectedReferrerId && selectedReferrerId !== '_none'
                                    ? facultyDropdown.find((f) => f.id === selectedReferrerId)?.name ||
                                      'Select faculty'
                                    : `Search & select faculty${
                                        facultyDropdown.length > 0
                                          ? ` (${facultyDropdown.length})`
                                          : ''
                                      }`}
                                </span>
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                              <Command>
                                <CommandInput placeholder="Type to search faculty / staff..." />
                                <CommandList>
                                  <CommandEmpty>
                                    {facultyLoading ? 'Loading...' : 'No staff found.'}
                                  </CommandEmpty>
                                  <CommandGroup>
                                    <CommandItem
                                      value="no-faculty"
                                      onSelect={() => {
                                        setSelectedReferrerId('_none');
                                        setFacultyPickerOpen(false);
                                      }}
                                    >
                                      <span className="text-muted-foreground">No faculty</span>
                                    </CommandItem>
                                    {facultyDropdown.map((f) => (
                                      <CommandItem
                                        key={f.id}
                                        value={f.name}
                                        onSelect={() => {
                                          setSelectedReferrerId(f.id);
                                          setManualReferrerName('');
                                          setFacultyPickerOpen(false);
                                        }}
                                      >
                                        {f.name}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </div>
                      )}

                      {/* Plain-text fallback — staff and learners only.
                        * These records belong to HR and Admissions; we cannot
                        * create one from here, so a name with no id is the
                        * truthful record. Consultants are excluded on purpose:
                        * they get created above and always carry a real id. */}
                      {(referralType === 'student' || referralType === 'faculty') && (
                        <div className="space-y-2 rounded-md border border-dashed p-3">
                          <Label htmlFor="manual-referrer">
                            Not in the list?{' '}
                            <span className="font-normal text-muted-foreground">
                              Type the {referralType === 'student' ? 'student' : 'staff'} name
                            </span>
                          </Label>
                          <Input
                            id="manual-referrer"
                            placeholder="e.g. M.KRISHNAVENI / AP / Nursing"
                            value={manualReferrerName}
                            onChange={(e) => {
                              setManualReferrerName(e.target.value);
                              // A typed name and a picked person would contradict
                              // each other — keep exactly one of them set.
                              if (e.target.value.trim()) setSelectedReferrerId('');
                            }}
                            disabled={!!selectedReferrerId && selectedReferrerId !== '_none'}
                          />
                          <p className="text-xs text-muted-foreground">
                            {selectedReferrerId && selectedReferrerId !== '_none'
                              ? 'Clear the selection above to type a name instead.'
                              : 'Saved as a name only — no linked record, so this referral will not appear in referrer reports.'}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle>Assign Counselor</CardTitle>
                      <CardDescription>Optional — assign on creation</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Select
                        value={selectedCounselorProfileId}
                        onValueChange={setSelectedCounselorProfileId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select counselor" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">No counselor</SelectItem>
                          {(counselorProfiles || []).map((c) => (
                            <SelectItem key={c.profile_id} value={c.profile_id}>
                              {c.name}{c.designation ? ` (${c.designation})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </CardContent>
                  </Card>
                )}

                {/* Actions */}
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex flex-col gap-3">
                      <Button
                        type="submit"
                        disabled={createLeadWithProfile.isPending}
                        className="w-full"
                      >
                        {createLeadWithProfile.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            {/* BUG-003226 part 2: users asked for "Save Details"
                                or "Submit" — "Save Details" reads more naturally
                                for counselors at a busy counter and matches the
                                Save icon already in use. Loading state mirrors. */}
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-2" />
                            Save Details
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        asChild
                      >
                        <Link href="/admission/leads">
                          <ArrowLeft className="h-4 w-4 mr-2" />
                          Cancel
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </form>
        </div>

        {/* Inline consultant creation — keeps the operator on the lead form.
          * Minimal on purpose: name is the only required column, everything
          * else (type / status / tier) carries a DB default and can be
          * enriched later in the Consultants module. */}
        <Dialog open={createConsultantOpen} onOpenChange={setCreateConsultantOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add new consultant</DialogTitle>
              <DialogDescription>
                Creates a record in the Consultants module and selects it for this lead,
                so the referral is properly attributed.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-1">
              <div className="space-y-1.5">
                <Label htmlFor="new-consultant-name">
                  Consultant / agency name<span className="ml-0.5 text-destructive">*</span>
                </Label>
                <Input
                  id="new-consultant-name"
                  value={newConsultantName}
                  onChange={(e) => setNewConsultantName(e.target.value)}
                  placeholder="e.g. SMET"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-consultant-phone">
                  Phone <span className="text-xs text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="new-consultant-phone"
                  value={newConsultantPhone}
                  onChange={(e) => setNewConsultantPhone(e.target.value)}
                  placeholder="10-digit mobile"
                  inputMode="numeric"
                />
                <p className="text-xs text-muted-foreground">
                  Recommended — the phone number is what tells two consultants with the
                  same name apart later.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateConsultantOpen(false)}
                disabled={creatingConsultant}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleCreateConsultant}
                disabled={creatingConsultant || !newConsultantName.trim()}
              >
                {creatingConsultant ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create & select'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function NewLeadPage() {
  return (
    <AdmissionErrorBoundary>
      <NewLeadPageContent />
    </AdmissionErrorBoundary>
  );
}
