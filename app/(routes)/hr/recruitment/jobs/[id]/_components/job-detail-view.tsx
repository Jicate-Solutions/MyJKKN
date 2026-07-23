'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Pencil,
  MapPin,
  Briefcase,
  GraduationCap,
  Clock,
  Building2,
  Users,
  CalendarDays,
  Globe,
  FileText,
  Zap,
  AlertCircle,
  BookOpen,
  DollarSign,
  Info,
  Hash,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ContentLayout } from '@/components/layout/content-layout';
import { RichTextDisplay } from '@/components/ui/rich-text-editor';
import { useJob } from '@/hooks/hr/use-recruitment';
import { ApplicationsSection } from './applications-section';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useDepartments } from '@/hooks/organization/use-departments';
import {
  JOB_STATUS_LABELS,
  JOB_TYPE_LABELS,
  EDUCATION_LEVEL_LABELS,
  SALARY_DURATION_LABELS,
  EMPLOYER_TYPE_LABELS,
  ROLE_CATEGORY_LABELS,
  type JobSkill,
  type SkillProficiency,
} from '@/types/hr-recruitment';

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { className: string }> = {
  open: {
    className:
      'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  },
  draft: {
    className:
      'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
  on_hold: {
    className:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  },
  closed: {
    className:
      'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300',
  },
  filled: {
    className:
      'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
  },
};

const PROFICIENCY_INDEX: Record<SkillProficiency, number> = {
  basic: 1,
  intermediate: 2,
  pro: 3,
  expert: 4,
};

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

const fmtDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : null;

const fmtCurrency = (n: number | null | undefined, currency = 'INR') => {
  if (n == null) return null;
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(n);
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Card with a colored icon in the header — gives each section visual identity */
function SectionCard({
  iconBg,
  icon,
  title,
  children,
}: {
  iconBg: string;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-3 text-base font-semibold">
          <span
            className={cn(
              'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg',
              iconBg
            )}
          >
            {icon}
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Meta chip in the hero band — larger than before, with colored icon */
function MetaChip({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-lg border bg-background/80 px-3 py-1.5 text-sm font-medium shadow-sm backdrop-blur-sm">
      <span className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center">{icon}</span>
      {children}
    </div>
  );
}

/** Proficiency bar — 4-segment horizontal indicator */
function ProficiencyBar({
  level,
  type,
}: {
  level: number;
  type: 'required' | 'nice_to_have';
}) {
  return (
    <span className="ml-1 inline-flex items-center gap-0.5">
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={cn(
            'h-1.5 w-3 rounded-full',
            i <= level
              ? type === 'required'
                ? 'bg-primary'
                : 'bg-amber-500'
              : 'bg-slate-200 dark:bg-slate-700'
          )}
        />
      ))}
    </span>
  );
}

/** Skill chip — tinted background per type, proficiency bar inline */
function SkillChip({ skill }: { skill: JobSkill }) {
  const level = PROFICIENCY_INDEX[skill.proficiency] ?? 2;
  const isRequired = skill.type === 'required';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium',
        isRequired
          ? 'border-primary/20 bg-primary/10 text-primary'
          : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
      )}
    >
      {skill.name}
      <ProficiencyBar level={level} type={skill.type} />
    </span>
  );
}

/** Sidebar detail row — label as uppercase micro-header + icon */
function SidebarDetailRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | null | undefined;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 border-b py-3 last:border-b-0">
      {icon && (
        <span className="mt-0.5 inline-flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center text-muted-foreground">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </dt>
        <dd className="mt-0.5 truncate text-sm font-medium text-foreground">{value || '—'}</dd>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function JobDetailSkeleton() {
  return (
    <ContentLayout title="Job Details">
      <div className="space-y-6">
        <Skeleton className="h-52 w-full rounded-xl" />
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="flex-1 space-y-4">
            <Skeleton className="h-52 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-36 w-full rounded-xl" />
          </div>
          <div className="w-full space-y-4 lg:w-72">
            <Skeleton className="h-36 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-56 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function JobDetailView({ id }: { id: string }) {
  const { data: job, isLoading, error } = useJob(id);
  const { institutions } = useInstitutionsWithAccess();
  const { data: deptResp } = useDepartments({ isActive: true, limit: 1000 });

  const institutionName = useMemo(
    () => institutions.find((i) => i.id === job?.institution_id)?.name ?? '',
    [institutions, job?.institution_id]
  );
  const departmentName = useMemo(() => {
    if (!job?.department_id) return '';
    const d = deptResp?.data?.find((d) => d.id === job.department_id);
    return d?.display_name || d?.department_name || '';
  }, [deptResp, job?.department_id]);

  if (isLoading) return <JobDetailSkeleton />;

  if (error || !job) {
    return (
      <ContentLayout title="Job Not Found">
        <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <AlertCircle className="h-7 w-7 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="text-lg font-semibold">
              {error ? 'Failed to load job posting' : 'Job posting not found'}
            </p>
            <p className="text-sm text-muted-foreground max-w-sm">
              {error instanceof Error
                ? error.message
                : 'This posting may have been removed or deleted.'}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/hr/recruitment/jobs">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Jobs
            </Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  // Derived values
  const requirements = job.requirements as {
    qualifications?: string[];
    skills?: JobSkill[];
  } | null;
  const qualifications = requirements?.qualifications ?? [];
  const skills = requirements?.skills ?? [];
  const requiredSkills = skills.filter((s) => s.type === 'required');
  const niceSkills = skills.filter((s) => s.type === 'nice_to_have');

  const filledPct =
    job.positions_open > 0
      ? Math.min(100, Math.round((job.positions_filled / job.positions_open) * 100))
      : 0;

  const location = [job.city, job.state, job.country].filter(Boolean).join(', ');

  const salaryText = (() => {
    const cur = job.salary_currency ?? 'INR';
    if (job.min_monthly_salary == null && job.max_monthly_salary == null) return null;
    const minFmt = fmtCurrency(job.min_monthly_salary, cur) ?? '—';
    const maxFmt = fmtCurrency(job.max_monthly_salary, cur) ?? '—';
    return `${minFmt} – ${maxFmt}`;
  })();
  const durLabel = job.salary_duration
    ? SALARY_DURATION_LABELS[job.salary_duration]
    : 'per month';

  const expText = (() => {
    const min = job.min_experience_years;
    const max = job.max_experience_years;
    if (min == null && max == null) return null;
    if (min != null && max != null)
      return `${min === 0 ? 'Fresher' : `${min} yr`} – ${max} yr exp`;
    if (min != null) return min === 0 ? 'Fresher' : `${min}+ yr exp`;
    return `Up to ${max} yr exp`;
  })();

  const statusConfig = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.draft;

  return (
    <ContentLayout title={job.title}>
      {/* ── Sticky top nav ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 -mx-4 flex items-center justify-between gap-4 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6 mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/hr/recruitment/jobs">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back to Jobs
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/hr/recruitment/jobs/${id}/edit`}>
            <Pencil className="h-4 w-4 mr-1.5" />
            Edit Posting
          </Link>
        </Button>
      </div>

      {/* ── Hero band ──────────────────────────────────────────────────────── */}
      <div className="mb-6 rounded-xl border border-border/60 bg-gradient-to-br from-primary/5 via-background to-background p-6 shadow-sm">
        {/* Badges row */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {job.job_code && (
            <span className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 font-mono text-xs font-semibold tracking-widest text-muted-foreground shadow-sm">
              <Hash className="h-3 w-3" />
              {job.job_code}
            </span>
          )}
          <span
            className={cn(
              'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold',
              statusConfig.className
            )}
          >
            {JOB_STATUS_LABELS[job.status] ?? job.status}
          </span>
          {job.is_public && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300">
              <Globe className="h-3 w-3" />
              On /careers
            </span>
          )}
        </div>

        {/* Title */}
        <h1 className="mb-1.5 text-2xl font-bold leading-tight tracking-tight text-foreground">
          {job.title}
        </h1>

        {/* Subtitle */}
        <p className="mb-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {ROLE_CATEGORY_LABELS[job.role_category] ?? job.role_category}
          </span>
          {institutionName && <> · {institutionName}</>}
          {departmentName && <> · {departmentName}</>}
        </p>

        {/* Meta chips */}
        <div className="flex flex-wrap gap-2">
          {job.job_type && (
            <MetaChip icon={<Briefcase className="text-blue-600" />}>
              {JOB_TYPE_LABELS[job.job_type]}
            </MetaChip>
          )}
          {location && (
            <MetaChip icon={<MapPin className="text-rose-500" />}>{location}</MetaChip>
          )}
          {expText && (
            <MetaChip icon={<Clock className="text-violet-600" />}>{expText}</MetaChip>
          )}
          {job.education_level && (
            <MetaChip icon={<GraduationCap className="text-emerald-600" />}>
              {EDUCATION_LEVEL_LABELS[job.education_level]}
            </MetaChip>
          )}
          {job.employer_type && (
            <MetaChip icon={<Building2 className="text-slate-500" />}>
              {EMPLOYER_TYPE_LABELS[job.employer_type]}
            </MetaChip>
          )}
          {job.industry && (
            <MetaChip icon={<Globe className="text-cyan-600" />}>{job.industry}</MetaChip>
          )}
        </div>
      </div>

      {/* ── Two-column layout ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* ── Left: main content ── */}
        <div className="min-w-0 flex-1 space-y-5">
          {/* Job description */}
          {job.description ? (
            <SectionCard
              iconBg="bg-blue-100 dark:bg-blue-950"
              icon={<FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
              title="About this Role"
            >
              <RichTextDisplay content={job.description} />
            </SectionCard>
          ) : (
            <Card className="border-dashed shadow-none">
              <CardContent className="py-12 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <FileText className="h-5 w-5 text-muted-foreground/50" />
                </div>
                <p className="text-sm text-muted-foreground">No description added yet.</p>
              </CardContent>
            </Card>
          )}

          {/* Qualifications */}
          {qualifications.length > 0 && (
            <SectionCard
              iconBg="bg-violet-100 dark:bg-violet-950"
              icon={<BookOpen className="h-4 w-4 text-violet-600 dark:text-violet-400" />}
              title="Qualifications"
            >
              <div className="flex flex-wrap gap-2">
                {qualifications.map((q) => (
                  <span
                    key={q}
                    className="inline-flex items-center rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-900 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300"
                  >
                    {q}
                  </span>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Skills */}
          {skills.length > 0 && (
            <SectionCard
              iconBg="bg-amber-100 dark:bg-amber-950"
              icon={<Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
              title="Skills"
            >
              <div className="space-y-6">
                {requiredSkills.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
                      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        Required
                      </span>
                      <span className="rounded-full border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {requiredSkills.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {requiredSkills.map((s) => (
                        <SkillChip key={s.name} skill={s} />
                      ))}
                    </div>
                  </div>
                )}
                {niceSkills.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 flex-shrink-0 rounded-full bg-amber-500" />
                      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        Nice to Have
                      </span>
                      <span className="rounded-full border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {niceSkills.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {niceSkills.map((s) => (
                        <SkillChip key={s.name} skill={s} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {/* Applications — screening → promote to approval pipeline */}
          <ApplicationsSection jobId={id} />
        </div>

        {/* ── Right: sidebar ── */}
        <aside className="w-full flex-shrink-0 space-y-4 lg:sticky lg:top-[4.5rem] lg:w-72">
          {/* Hiring status */}
          <Card className="overflow-hidden shadow-sm">
            <div className="h-1 w-full bg-gradient-to-r from-primary via-primary/60 to-primary/20" />
            <CardHeader className="pb-3 pt-4">
              <CardTitle className="flex items-center gap-2.5 text-sm font-semibold">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950">
                  <Users className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                </span>
                Hiring Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-4xl font-bold tabular-nums tracking-tight">
                  {job.positions_filled}
                </span>
                <span className="text-right text-sm leading-tight text-muted-foreground">
                  of {job.positions_open}
                  <br />
                  <span className="text-xs">
                    {job.positions_open === 1 ? 'position' : 'positions'} filled
                  </span>
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    filledPct >= 100 ? 'bg-emerald-500' : 'bg-primary'
                  )}
                  style={{ width: `${filledPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{filledPct}% filled</p>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    filledPct >= 100
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-primary/10 text-primary'
                  )}
                >
                  {job.positions_open - job.positions_filled} remaining
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Compensation */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2.5 text-sm font-semibold">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-100 dark:bg-green-950">
                  <DollarSign className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                </span>
                Compensation
              </CardTitle>
            </CardHeader>
            <CardContent>
              {salaryText ? (
                <div>
                  <p className="text-lg font-bold text-foreground">{salaryText}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{durLabel}</p>
                  {!job.display_salary && (
                    <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                      <Info className="h-3 w-3" />
                      Not shown publicly
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm italic text-muted-foreground">Not specified</p>
              )}
            </CardContent>
          </Card>

          {/* Details */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2.5 text-sm font-semibold">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                  <Info className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
                </span>
                Details
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <dl>
                <SidebarDetailRow
                  label="Institution"
                  value={institutionName}
                  icon={<Building2 className="h-3.5 w-3.5" />}
                />
                <SidebarDetailRow
                  label="Department"
                  value={departmentName}
                  icon={<Briefcase className="h-3.5 w-3.5" />}
                />
                {job.industry && (
                  <SidebarDetailRow
                    label="Industry"
                    value={job.industry}
                    icon={<Globe className="h-3.5 w-3.5" />}
                  />
                )}
                {job.employer_type && (
                  <SidebarDetailRow
                    label="Employer Type"
                    value={EMPLOYER_TYPE_LABELS[job.employer_type]}
                    icon={<Building2 className="h-3.5 w-3.5" />}
                  />
                )}
                {job.zip_code && (
                  <SidebarDetailRow
                    label="ZIP Code"
                    value={job.zip_code}
                    icon={<MapPin className="h-3.5 w-3.5" />}
                  />
                )}
                <SidebarDetailRow
                  label="Posted On"
                  value={fmtDate(job.posted_at) ?? fmtDate(job.created_at)}
                  icon={<CalendarDays className="h-3.5 w-3.5" />}
                />
                <SidebarDetailRow
                  label="Closes On"
                  value={fmtDate(job.closes_at)}
                  icon={<CalendarDays className="h-3.5 w-3.5" />}
                />
              </dl>
            </CardContent>
          </Card>
        </aside>
      </div>
    </ContentLayout>
  );
}
