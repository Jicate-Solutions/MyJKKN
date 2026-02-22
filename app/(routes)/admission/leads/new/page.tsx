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
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useLeadMutations } from '@/hooks/admission';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ArrowLeft, Save, Loader2, ChevronsUpDown, X } from 'lucide-react';
import Link from 'next/link';
import { AdmissionErrorBoundary } from '@/components/admission';
import { indianStates, getDistrictsByState } from '@/lib/data/locations';

// Must match LeadSource type from types/admission.ts
const LEAD_SOURCES = [
  { value: 'website', label: 'Website' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'referral', label: 'Referral' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'newspaper', label: 'Newspaper' },
  { value: 'education_fair', label: 'Education Fair' },
  { value: 'agent', label: 'Agent/Partner' },
  { value: 'publisher', label: 'Publisher' },
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'facebook_ads', label: 'Facebook Ads' },
  { value: 'other', label: 'Other' }
];

const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' }
];

interface FormData {
  full_name: string;
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
  academic_year: string;
}

interface ProgramOption {
  id: string;
  program_name: string;
  display_name: string | null;
  degree_name: string | null;
  department_name: string | null;
}

function NewLeadPageContent() {
  const router = useRouter();
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess();
  const { createLeadWithProfile } = useLeadMutations();

  // Institution selection — all users can see & select from their accessible institutions
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>('');

  // Auto-set institution if user has only one
  useEffect(() => {
    if (!isSuperAdmin && profile?.institution_id) {
      setSelectedInstitutionId(profile.institution_id);
    } else if (institutions.length === 1) {
      setSelectedInstitutionId(institutions[0].id);
    }
  }, [profile?.institution_id, isSuperAdmin, institutions]);

  const institutionId = selectedInstitutionId;

  // Programs loaded based on selected institution
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [programsLoading, setProgramsLoading] = useState(false);
  const [selectedProgramIds, setSelectedProgramIds] = useState<string[]>([]);
  const [programsPopoverOpen, setProgramsPopoverOpen] = useState(false);

  // Academic years loaded based on selected institution
  const [academicYears, setAcademicYears] = useState<{ id: string; academic_year_name: string; is_active: boolean }[]>([]);
  const [academicYearsLoading, setAcademicYearsLoading] = useState(false);

  // Entry date — auto-populated to today (local timezone, not UTC)
  const [entryDate] = useState<string>(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  // Fetch programs when institution changes
  useEffect(() => {
    if (!institutionId) {
      setPrograms([]);
      setSelectedProgramIds([]);
      return;
    }

    setProgramsLoading(true);
    setSelectedProgramIds([]);
    const supabase = createClientSupabaseClient();

    (supabase as any)
      .from('programs')
      .select(`
        id,
        program_name,
        display_name,
        degree:degrees!fk_programs_degree(degree_name),
        department:departments!fk_programs_department(department_name)
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

  // Fetch academic years when institution changes; auto-select the active one
  useEffect(() => {
    if (!institutionId) {
      setAcademicYears([]);
      return;
    }
    setAcademicYearsLoading(true);
    const supabase = createClientSupabaseClient();
    (supabase as any)
      .from('academic_years')
      .select('id, academic_year_name, is_active')
      .eq('institution_id', institutionId)
      .order('start_date', { ascending: false })
      .then(({ data, error }: { data: any; error: any }) => {
        if (error) {
          console.error('[admission/leads] Failed to fetch academic years:', error.message);
          setAcademicYears([]);
        } else {
          const years = (data || []) as { id: string; academic_year_name: string; is_active: boolean }[];
          setAcademicYears(years);
          // Auto-select the active academic year
          const active = years.find((y) => y.is_active);
          if (active) {
            setFormData((prev) => ({ ...prev, academic_year: active.academic_year_name.trim() }));
          }
        }
        setAcademicYearsLoading(false);
      });
  }, [institutionId]);

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

  const toggleProgram = (programId: string) => {
    setSelectedProgramIds((prev) =>
      prev.includes(programId) ? prev.filter((id) => id !== programId) : [...prev, programId]
    );
  };

  const selectedProgramNames = useMemo(() => {
    return selectedProgramIds
      .map((id) => programs.find((p) => p.id === id))
      .filter(Boolean)
      .map((p) => p!.display_name || p!.program_name);
  }, [selectedProgramIds, programs]);

  const [formData, setFormData] = useState<FormData>({
    full_name: '',
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
    academic_year: '',
  });

  const [errors, setErrors] = useState<Partial<Record<keyof FormData | 'institution', string>>>({});

  const handleChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
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

    if (!formData.full_name.trim()) {
      newErrors.full_name = 'Full name is required';
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (!/^\d{10}$/.test(formData.phone.replace(/\D/g, ''))) {
      newErrors.phone = 'Invalid phone number';
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

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
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
      full_name: formData.full_name.trim(),
      email: formData.email?.trim() || null,
      phone: formData.phone.trim(),
      source: formData.first_touch_source as any,
      tags: [] as string[],
      interested_programs: selectedProgramIds.length > 0 ? selectedProgramIds : null,
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
      academic_year: formData.academic_year?.trim() || null,
    };

    createLeadWithProfile.mutate(
      leadPayload,
      {
        onSuccess: (lead) => {
          toast.success('Lead created successfully');
          router.push(`/admission/leads/${lead.id}`);
        },
        onError: (error: Error) => {
          const errorMessage = error.message || 'Failed to create lead';
          toast.error(errorMessage);
          console.error('[admission/leads] Failed to create lead:', error);
        }
      }
    );
  };

  // Determine if user can change institution (super admin or has access to multiple)
  const canSelectInstitution = isSuperAdmin || institutions.length > 1;
  const selectedInstitutionName = institutions.find((i) => i.id === institutionId)?.name;

  return (
    <PermissionGuard module="admission" action="create">
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
                        <Label htmlFor="full_name">
                          Full Name <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="full_name"
                          value={formData.full_name}
                          onChange={(e) => handleChange('full_name', e.target.value)}
                          placeholder="Enter full name"
                          className={errors.full_name ? 'border-destructive' : ''}
                        />
                        {errors.full_name && (
                          <p className="text-xs text-destructive">{errors.full_name}</p>
                        )}
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
                          disabled
                          className="bg-muted"
                        />
                        <p className="text-xs text-muted-foreground">Auto-set to today&apos;s date</p>
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

                    {/* Interested Programs — Multi-select */}
                    <div className="space-y-2">
                      <Label>Interested Programs</Label>
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
                        <>
                          <Popover open={programsPopoverOpen} onOpenChange={setProgramsPopoverOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={programsPopoverOpen}
                                className="w-full justify-between font-normal"
                              >
                                {selectedProgramIds.length > 0
                                  ? `${selectedProgramIds.length} program${selectedProgramIds.length > 1 ? 's' : ''} selected`
                                  : 'Select interested programs'}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                              <Command>
                                <CommandInput placeholder="Search programs..." />
                                <CommandList>
                                  <CommandEmpty>No programs found.</CommandEmpty>
                                  {Object.entries(programsByDegree).map(([degreeName, degreePrograms]) => (
                                    <CommandGroup key={degreeName} heading={degreeName}>
                                      {degreePrograms.map((program) => (
                                        <CommandItem
                                          key={program.id}
                                          value={program.program_name}
                                          onSelect={() => toggleProgram(program.id)}
                                        >
                                          <Checkbox
                                            checked={selectedProgramIds.includes(program.id)}
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
                                  ))}
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>

                          {/* Selected programs as badges */}
                          {selectedProgramNames.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {selectedProgramIds.map((id) => {
                                const prog = programs.find((p) => p.id === id);
                                if (!prog) return null;
                                return (
                                  <Badge key={id} variant="secondary" className="gap-1">
                                    {prog.display_name || prog.program_name}
                                    <button
                                      type="button"
                                      onClick={() => toggleProgram(id)}
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

                    {/* Academic Year */}
                    <div className="space-y-2">
                      <Label htmlFor="academic_year">Academic Year</Label>
                      <Select
                        value={formData.academic_year}
                        onValueChange={(value) => handleChange('academic_year', value)}
                        disabled={academicYearsLoading || !institutionId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={
                            !institutionId
                              ? 'Select institution first'
                              : academicYearsLoading
                              ? 'Loading...'
                              : 'Select academic year'
                          } />
                        </SelectTrigger>
                        <SelectContent>
                          {academicYears.map((year) => (
                            <SelectItem key={year.id} value={year.academic_year_name.trim()}>
                              {year.academic_year_name.trim()}
                              {year.is_active && (
                                <span className="ml-2 text-xs text-muted-foreground">(Active)</span>
                              )}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
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
                          {LEAD_SOURCES.map((source) => (
                            <SelectItem key={source.value} value={source.value}>
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
                            Creating...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-2" />
                            Create Lead
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
