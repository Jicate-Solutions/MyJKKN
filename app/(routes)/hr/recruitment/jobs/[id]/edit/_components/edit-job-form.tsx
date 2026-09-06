'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Save,
  MapPin,
  Briefcase,
  FileText,
  Zap,
  BookOpen,
  RefreshCw,
  X,
  Loader2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { ContentLayout } from '@/components/layout/content-layout';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useDepartments } from '@/hooks/organization/use-departments';
import { useUpdateJob } from '@/hooks/hr/use-recruitment';
import type {
  HRRecruitmentJob,
  JobType,
  EmployerType,
  EducationLevel,
  SalaryDuration,
  JobSkill,
  RoleCategory,
  JobStatus,
} from '@/types/hr-recruitment';
import { JOB_STATUS_LABELS } from '@/types/hr-recruitment';

import { SkillsInput } from '../../../new/_components/skills-input';

// ---------------------------------------------------------------------------
// Location data (shared with create form)
// ---------------------------------------------------------------------------
const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim',
  'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

const TAMIL_NADU_CITIES = [
  'Komarapalayam', 'Namakkal', 'Salem', 'Erode', 'Coimbatore', 'Tirupur',
  'Chennai', 'Madurai', 'Trichy', 'Tirunelveli', 'Vellore', 'Thanjavur',
  'Dindigul', 'Kancheepuram', 'Karur', 'Dharmapuri', 'Krishnagiri',
  'Villupuram', 'Nagapattinam', 'Pudukottai', 'Sivaganga', 'Ramanathapuram',
  'Virudhunagar', 'Tenkasi', 'Ariyalur', 'Perambalur', 'Tiruvannamalai',
  'Ranipet', 'Kallakurichi', 'Thoothukudi', 'Chengalpattu', 'Kanyakumari',
  'Nilgiris', 'Cuddalore',
];

const SECTIONS = [
  { id: 'basic-details', label: 'Basic Details', Icon: Briefcase },
  { id: 'location', label: 'Location', Icon: MapPin },
  { id: 'job-specification', label: 'Job Specification', Icon: BookOpen },
  { id: 'job-description', label: 'Job Description', Icon: FileText },
  { id: 'skills', label: 'Skills', Icon: Zap },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function EditJobForm({ job }: { job: HRRecruitmentJob }) {
  const router = useRouter();
  const updateJob = useUpdateJob();

  // ---- Reference data ----
  const { institutions } = useInstitutionsWithAccess();
  const { data: deptResp } = useDepartments({ isActive: true, limit: 1000 });

  const deptsByInstitution = useMemo(() => {
    const map = new Map<string, { value: string; label: string }[]>();
    for (const d of deptResp?.data ?? []) {
      const opt = { value: d.id, label: d.display_name || d.department_name };
      const list = map.get(d.institution_id);
      if (list) list.push(opt);
      else map.set(d.institution_id, [opt]);
    }
    return map;
  }, [deptResp]);

  // ---- Initial requirements parse ----
  const initialReqs = job.requirements as {
    qualifications?: string[];
    skills?: JobSkill[];
  } | null;

  // ---- Basic Details (institution is locked) ----
  const [title, setTitle] = useState(job.title);
  const [jobCode, setJobCode] = useState(job.job_code ?? '');
  const [departmentId, setDepartmentId] = useState(job.department_id ?? '');
  const [roleCategory, setRoleCategory] = useState<RoleCategory>(job.role_category);
  const [jobType, setJobType] = useState<JobType | ''>(job.job_type ?? '');
  const [industry, setIndustry] = useState(job.industry ?? '');
  const [employerType, setEmployerType] = useState<EmployerType | ''>(job.employer_type ?? '');

  // ---- Location ----
  const [country, setCountry] = useState(job.country ?? 'India');
  const [locationState, setLocationState] = useState(job.state ?? 'Tamil Nadu');
  const [city, setCity] = useState(job.city ?? '');
  const [zipCode, setZipCode] = useState(job.zip_code ?? '');

  // ---- Job Specification ----
  const [educationLevel, setEducationLevel] = useState<EducationLevel | ''>(
    job.education_level ?? ''
  );
  const [qualifications, setQualifications] = useState<string[]>(
    initialReqs?.qualifications ?? []
  );
  const [qualInput, setQualInput] = useState('');
  const [minExpYears, setMinExpYears] = useState<number | ''>(job.min_experience_years ?? '');
  const [maxExpYears, setMaxExpYears] = useState<number | ''>(job.max_experience_years ?? '');
  const [salaryCurrency, setSalaryCurrency] = useState(job.salary_currency ?? 'INR');
  const [minSalary, setMinSalary] = useState<number | ''>(job.min_monthly_salary ?? '');
  const [maxSalary, setMaxSalary] = useState<number | ''>(job.max_monthly_salary ?? '');
  const [salaryDuration, setSalaryDuration] = useState<SalaryDuration>(
    job.salary_duration ?? 'per_month'
  );
  const [displaySalary, setDisplaySalary] = useState(job.display_salary ?? false);

  // ---- Description + Skills ----
  const [description, setDescription] = useState(job.description ?? '');
  const [skills, setSkills] = useState<JobSkill[]>(initialReqs?.skills ?? []);

  // ---- Meta (edit-only fields) ----
  const [status, setStatus] = useState<JobStatus>(job.status);
  const [positionsOpen, setPositionsOpen] = useState(job.positions_open ?? 1);
  const [positionsFilled, setPositionsFilled] = useState(job.positions_filled ?? 0);
  const [isPublic, setIsPublic] = useState(job.is_public ?? false);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Derived ----
  const institutionName = useMemo(
    () => institutions.find((i) => i.id === job.institution_id)?.name ?? '',
    [institutions, job.institution_id]
  );
  const deptOptions = useMemo(
    () => deptsByInstitution.get(job.institution_id ?? '') ?? [],
    [deptsByInstitution, job.institution_id]
  );

  // ---- Scroll-spy ----
  const [activeSection, setActiveSection] = useState<SectionId>('basic-details');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id as SectionId);
            break;
          }
        }
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 }
    );
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const scrollToSection = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const genJobCode = useCallback(() => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'JOB-';
    for (let i = 0; i < 7; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    setJobCode(result);
  }, []);

  // ---- Save handler ----
  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      setError('Job title is required.');
      scrollToSection('basic-details');
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      await updateJob.mutateAsync({
        id: job.id,
        patch: {
          title: title.trim(),
          role_category: roleCategory,
          job_code: jobCode.trim() || null,
          job_type: (jobType || null) as JobType | null,
          industry: industry || null,
          employer_type: (employerType || null) as EmployerType | null,
          country: country || null,
          state: locationState || null,
          city: city || null,
          zip_code: zipCode || null,
          education_level: (educationLevel || null) as EducationLevel | null,
          min_experience_years: minExpYears !== '' ? minExpYears : null,
          max_experience_years: maxExpYears !== '' ? maxExpYears : null,
          min_monthly_salary: minSalary !== '' ? minSalary : null,
          max_monthly_salary: maxSalary !== '' ? maxSalary : null,
          salary_currency: salaryCurrency,
          salary_duration: salaryDuration,
          display_salary: displaySalary,
          description: description || null,
          requirements: {
            qualifications: qualifications.length > 0 ? qualifications : undefined,
            skills: skills.length > 0 ? skills : undefined,
          },
          department_id: departmentId || null,
          positions_open: positionsOpen,
          positions_filled: positionsFilled,
          status,
          is_public: isPublic,
        },
      });
      toast.success('Job posting updated');
      router.push(`/hr/recruitment/jobs/${job.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Update failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  }, [
    title, roleCategory, jobCode, jobType, industry, employerType,
    country, locationState, city, zipCode, educationLevel,
    minExpYears, maxExpYears, minSalary, maxSalary, salaryCurrency,
    salaryDuration, displaySalary, description, qualifications, skills,
    departmentId, positionsOpen, positionsFilled, status, isPublic,
    updateJob, job.id, router, scrollToSection,
  ]);

  // ---- Qualification tag helpers ----
  const addQual = useCallback(() => {
    const v = qualInput.trim();
    if (!v || qualifications.includes(v)) return;
    setQualifications((prev) => [...prev, v]);
    setQualInput('');
  }, [qualInput, qualifications]);

  const removeQual = useCallback(
    (q: string) => setQualifications((prev) => prev.filter((x) => x !== q)),
    []
  );

  return (
    <ContentLayout title={`Edit: ${job.title}`}>
      {/* ── Sticky top header ───────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" asChild className="flex-shrink-0">
            <Link href={`/hr/recruitment/jobs/${job.id}`}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-none truncate">Edit Job Posting</h1>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {institutionName || job.title}
            </p>
          </div>
          <Badge variant="outline" className="flex-shrink-0 font-mono text-xs">
            {job.job_code ?? 'No code'}
          </Badge>
        </div>
        <Button size="sm" onClick={handleSave} disabled={isSaving} className="flex-shrink-0">
          {isSaving ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-1.5" />
          )}
          <span className="hidden sm:inline">Save Changes</span>
          <span className="sm:hidden">Save</span>
        </Button>
      </div>

      {/* ── Two-column body ─────────────────────────────────────────────── */}
      <div className="flex gap-6 pb-24">
        {/* Left sidebar — section nav + meta settings */}
        <aside className="hidden lg:block w-52 flex-shrink-0">
          <div className="sticky top-24 space-y-0.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 pb-2">
              Sections
            </p>
            {SECTIONS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => scrollToSection(id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-left transition-colors',
                  activeSection === id
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {label}
              </button>
            ))}

            {/* Sidebar posting settings */}
            <div className="mt-5 px-3 space-y-3 pt-4">
              <Separator />

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as JobStatus)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(JOB_STATUS_LABELS) as JobStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {JOB_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Positions Open</Label>
                <Input
                  type="number"
                  min={1}
                  value={positionsOpen}
                  onChange={(e) => setPositionsOpen(Math.max(1, parseInt(e.target.value) || 1))}
                  className="h-8 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Positions Filled</Label>
                <Input
                  type="number"
                  min={0}
                  max={positionsOpen}
                  value={positionsFilled}
                  onChange={(e) =>
                    setPositionsFilled(
                      Math.min(positionsOpen, Math.max(0, parseInt(e.target.value) || 0))
                    )
                  }
                  className="h-8 text-sm"
                />
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Public on /careers</Label>
                <Switch
                  checked={isPublic}
                  onCheckedChange={setIsPublic}
                  aria-label="Public on careers page"
                />
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main content ──────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-6">

          {/* ── Section 1: Basic Details ─────────────────────────────── */}
          <Card id="basic-details">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Briefcase className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">Basic Details</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    The essentials — title, code and how this role is classified.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Job Title + Job Code */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="job-title">
                    Job Title <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="job-title"
                    placeholder="e.g. Assistant Professor — Computer Science"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={100}
                  />
                  <p className="text-xs text-muted-foreground">{title.length}/100</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="job-code">Job Code</Label>
                  <div className="relative">
                    <Input
                      id="job-code"
                      placeholder="e.g. JOB-XXXX"
                      value={jobCode}
                      onChange={(e) => setJobCode(e.target.value)}
                      className="pr-9"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1 h-7 w-7 p-0"
                      onClick={genJobCode}
                      title="Generate a random code"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Institution (locked) + Department */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Institution</Label>
                  <Input
                    value={institutionName || job.institution_id || '—'}
                    readOnly
                    disabled
                    className="bg-muted/50 cursor-not-allowed"
                  />
                  <p className="text-xs text-muted-foreground">
                    Institution is locked after creation.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="department">Department</Label>
                  <Select
                    value={departmentId || '__none__'}
                    onValueChange={(v) => setDepartmentId(v === '__none__' ? '' : v)}
                  >
                    <SelectTrigger id="department">
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60 overflow-y-auto">
                      <SelectItem value="__none__">No specific department</SelectItem>
                      {deptOptions.map((d) => (
                        <SelectItem key={d.value} value={d.value}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Role Category + Job Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="role-category">
                    Role Category <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={roleCategory}
                    onValueChange={(v) => setRoleCategory(v as RoleCategory)}
                  >
                    <SelectTrigger id="role-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="teaching_faculty">Teaching Faculty</SelectItem>
                      <SelectItem value="medical">Medical</SelectItem>
                      <SelectItem value="non_teaching">Non-Teaching</SelectItem>
                      <SelectItem value="senior_leadership">Senior Leadership</SelectItem>
                      <SelectItem value="contract">Contract</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="job-type">Job Type</Label>
                  <Select
                    value={jobType || '__none__'}
                    onValueChange={(v) => setJobType(v === '__none__' ? '' : (v as JobType))}
                  >
                    <SelectTrigger id="job-type">
                      <SelectValue placeholder="Select job type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Not specified</SelectItem>
                      <SelectItem value="full_time">Full Time</SelectItem>
                      <SelectItem value="part_time">Part Time</SelectItem>
                      <SelectItem value="contract">Contract</SelectItem>
                      <SelectItem value="internship">Internship</SelectItem>
                      <SelectItem value="freelance">Freelance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Industry + Employer Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="industry">Industry</Label>
                  <Select
                    value={industry || '__none__'}
                    onValueChange={(v) => setIndustry(v === '__none__' ? '' : v)}
                  >
                    <SelectTrigger id="industry">
                      <SelectValue placeholder="Select industry" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Not specified</SelectItem>
                      <SelectItem value="education">Education</SelectItem>
                      <SelectItem value="healthcare">Healthcare / Medical</SelectItem>
                      <SelectItem value="technology">Technology / IT</SelectItem>
                      <SelectItem value="engineering">Engineering</SelectItem>
                      <SelectItem value="management">Management</SelectItem>
                      <SelectItem value="science_research">Science &amp; Research</SelectItem>
                      <SelectItem value="arts_humanities">Arts &amp; Humanities</SelectItem>
                      <SelectItem value="law">Law</SelectItem>
                      <SelectItem value="commerce_finance">Commerce &amp; Finance</SelectItem>
                      <SelectItem value="others">Others</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="employer-type">Employer Type</Label>
                  <Select
                    value={employerType || '__none__'}
                    onValueChange={(v) =>
                      setEmployerType(v === '__none__' ? '' : (v as EmployerType))
                    }
                  >
                    <SelectTrigger id="employer-type">
                      <SelectValue placeholder="Select employer type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Not specified</SelectItem>
                      <SelectItem value="educational">Educational Institution</SelectItem>
                      <SelectItem value="government">Government</SelectItem>
                      <SelectItem value="private">Private</SelectItem>
                      <SelectItem value="public_sector">Public Sector</SelectItem>
                      <SelectItem value="non_profit">Non-Profit / Trust</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Section 2: Location ──────────────────────────────────── */}
          <Card id="location">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                  <MapPin className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <CardTitle className="text-base">Location</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Where the role is based.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="country">Country</Label>
                  <Select value={country} onValueChange={setCountry}>
                    <SelectTrigger id="country">
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="India">India</SelectItem>
                      <SelectItem value="United States">United States</SelectItem>
                      <SelectItem value="United Kingdom">United Kingdom</SelectItem>
                      <SelectItem value="Canada">Canada</SelectItem>
                      <SelectItem value="Australia">Australia</SelectItem>
                      <SelectItem value="Singapore">Singapore</SelectItem>
                      <SelectItem value="UAE">UAE</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="state">State</Label>
                  <Select
                    value={locationState}
                    onValueChange={(v) => {
                      setLocationState(v);
                      setCity('');
                    }}
                  >
                    <SelectTrigger id="state">
                      <SelectValue placeholder="Select state" />
                    </SelectTrigger>
                    <SelectContent className="max-h-64 overflow-y-auto">
                      <SelectItem value="Tamil Nadu">Tamil Nadu</SelectItem>
                      <div className="mx-2 my-1 border-t" />
                      {INDIAN_STATES.filter((s) => s !== 'Tamil Nadu').map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="city">City / District</Label>
                  {locationState === 'Tamil Nadu' ? (
                    <Select value={city} onValueChange={setCity}>
                      <SelectTrigger id="city">
                        <SelectValue placeholder="Select city" />
                      </SelectTrigger>
                      <SelectContent className="max-h-64 overflow-y-auto">
                        {TAMIL_NADU_CITIES.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="city"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="City"
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="zip-code">Zip Code</Label>
                  <Input
                    id="zip-code"
                    value={zipCode}
                    onChange={(e) => setZipCode(e.target.value)}
                    placeholder="638183"
                    maxLength={10}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Section 3: Job Specification ─────────────────────────── */}
          <Card id="job-specification">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
                  <BookOpen className="h-4 w-4 text-green-500" />
                </div>
                <div>
                  <CardTitle className="text-base">Job Specification</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Education, experience and salary requirements.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="education-level">Education Level</Label>
                  <Select
                    value={educationLevel || '__none__'}
                    onValueChange={(v) =>
                      setEducationLevel(v === '__none__' ? '' : (v as EducationLevel))
                    }
                  >
                    <SelectTrigger id="education-level">
                      <SelectValue placeholder="Select education level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Not specified</SelectItem>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="high_school">High School</SelectItem>
                      <SelectItem value="diploma">Diploma</SelectItem>
                      <SelectItem value="bachelors">Bachelor&apos;s</SelectItem>
                      <SelectItem value="masters">Master&apos;s</SelectItem>
                      <SelectItem value="phd">Ph.D.</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="qualifications">Qualifications</Label>
                  <Input
                    id="qualifications"
                    value={qualInput}
                    onChange={(e) => setQualInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addQual();
                      }
                    }}
                    placeholder="e.g. B.E/B.Tech — press Enter to add"
                  />
                  {qualifications.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {qualifications.map((q) => (
                        <Badge key={q} variant="secondary" className="gap-1 pl-2 pr-1">
                          {q}
                          <button
                            type="button"
                            onClick={() => removeQual(q)}
                            className="h-3.5 w-3.5 rounded-full hover:bg-muted-foreground/20 flex items-center justify-center ml-0.5"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="min-exp">Min Experience</Label>
                  <Select
                    value={minExpYears === '' ? 'any' : String(minExpYears)}
                    onValueChange={(v) => setMinExpYears(v === 'any' ? '' : parseInt(v))}
                  >
                    <SelectTrigger id="min-exp">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n === 0 ? 'Fresher (0 yrs)' : `${n} year${n !== 1 ? 's' : ''}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="max-exp">Max Experience</Label>
                  <Select
                    value={maxExpYears === '' ? 'any' : String(maxExpYears)}
                    onValueChange={(v) => setMaxExpYears(v === 'any' ? '' : parseInt(v))}
                  >
                    <SelectTrigger id="max-exp">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n} year{n !== 1 ? 's' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Salary Range</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={salaryCurrency} onValueChange={setSalaryCurrency}>
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INR">INR</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    placeholder="Min"
                    value={minSalary}
                    onChange={(e) => setMinSalary(e.target.value ? parseInt(e.target.value) : '')}
                    className="w-32"
                    min={0}
                  />
                  <span className="text-muted-foreground text-sm">to</span>
                  <Input
                    type="number"
                    placeholder="Max"
                    value={maxSalary}
                    onChange={(e) => setMaxSalary(e.target.value ? parseInt(e.target.value) : '')}
                    className="w-32"
                    min={0}
                  />
                  <Select
                    value={salaryDuration}
                    onValueChange={(v) => setSalaryDuration(v as SalaryDuration)}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="per_hour">Per Hour</SelectItem>
                      <SelectItem value="per_day">Per Day</SelectItem>
                      <SelectItem value="per_month">Per Month</SelectItem>
                      <SelectItem value="per_year">Per Year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Switch
                    id="display-salary"
                    checked={displaySalary}
                    onCheckedChange={setDisplaySalary}
                  />
                  <Label htmlFor="display-salary" className="text-sm font-normal cursor-pointer">
                    Display salary information on the job page
                  </Label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Section 4: Job Description ───────────────────────────── */}
          <Card id="job-description">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                  <FileText className="h-4 w-4 text-amber-500" />
                </div>
                <div>
                  <CardTitle className="text-base">Job Description</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Clear responsibilities and must-haves outperform long paragraphs.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <RichTextEditor
                value={description}
                onChange={setDescription}
                placeholder="Describe the role, key responsibilities, and what success looks like…"
                className="min-h-[220px]"
              />
            </CardContent>
          </Card>

          {/* ── Section 5: Skills ────────────────────────────────────── */}
          <Card id="skills">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                  <Zap className="h-4 w-4 text-violet-500" />
                </div>
                <div>
                  <CardTitle className="text-base">Skills</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Mark required vs preferred and set proficiency.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <SkillsInput skills={skills} onChange={setSkills} />
            </CardContent>
          </Card>

          {/* Mobile-only: status + positions + public */}
          <Card className="lg:hidden">
            <CardContent className="pt-4 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as JobStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(JOB_STATUS_LABELS) as JobStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {JOB_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">Positions Open</Label>
                  <Input
                    type="number"
                    min={1}
                    value={positionsOpen}
                    onChange={(e) =>
                      setPositionsOpen(Math.max(1, parseInt(e.target.value) || 1))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Positions Filled</Label>
                  <Input
                    type="number"
                    min={0}
                    max={positionsOpen}
                    value={positionsFilled}
                    onChange={(e) =>
                      setPositionsFilled(
                        Math.min(positionsOpen, Math.max(0, parseInt(e.target.value) || 0))
                      )
                    }
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Public on /careers</Label>
                <div className="flex items-center h-10">
                  <Switch
                    checked={isPublic}
                    onCheckedChange={setIsPublic}
                    aria-label="Public on careers page"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Fixed bottom bar ─────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground truncate">
          {error ? (
            <span className="text-destructive font-medium">{error}</span>
          ) : (
            'Changes are saved to the posting immediately.'
          )}
        </p>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/hr/recruitment/jobs/${job.id}`}>Discard</Link>
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
            Save Changes
          </Button>
        </div>
      </div>
    </ContentLayout>
  );
}
