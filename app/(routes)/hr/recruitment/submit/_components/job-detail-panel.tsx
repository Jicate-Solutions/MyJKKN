'use client';

import {
  ArrowLeft, MapPin, Briefcase, GraduationCap, Clock, Building2,
  Users, Globe, FileText, Zap, BookOpen, DollarSign, Info, Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RichTextDisplay } from '@/components/ui/rich-text-editor';
import { cn } from '@/lib/utils';
import type { HRRecruitmentJob, JobSkill } from '@/types/hr-recruitment';
import {
  JOB_STATUS_LABELS, JOB_TYPE_LABELS, EDUCATION_LEVEL_LABELS,
  SALARY_DURATION_LABELS, ROLE_CATEGORY_LABELS,
} from '@/types/hr-recruitment';

interface JobDetailPanelProps {
  job: HRRecruitmentJob;
  institutionName?: string;
  onBack: () => void;
  onApply: () => void;
}

function SectionCard({
  iconBg, icon, title, children,
}: {
  iconBg: string; icon: React.ReactNode; title: string; children: React.ReactNode;
}) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-3 text-base font-semibold">
          <span className={cn('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg', iconBg)}>
            {icon}
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function SidebarRow({ label, value, icon }: { label: string; value?: string | null; icon?: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 border-b py-3 last:border-b-0">
      {icon && (
        <span className="mt-0.5 inline-flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center text-muted-foreground">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 truncate text-sm font-medium text-foreground">{value}</dd>
      </div>
    </div>
  );
}

export function JobDetailPanel({ job, institutionName, onBack, onApply }: JobDetailPanelProps) {
  const requirements = job.requirements as { qualifications?: string[]; skills?: JobSkill[] } | null;
  const qualifications = requirements?.qualifications ?? [];
  const skills = requirements?.skills ?? [];
  const location = [job.city, job.state, job.country].filter(Boolean).join(', ');
  const expRange =
    job.min_experience_years !== null && job.max_experience_years !== null
      ? `${job.min_experience_years}–${job.max_experience_years} years`
      : job.min_experience_years !== null
      ? `${job.min_experience_years}+ years`
      : null;

  let salaryText: string | null = null;
  if (job.display_salary && job.min_monthly_salary !== null) {
    const curr = job.salary_currency ?? 'INR';
    const dur = SALARY_DURATION_LABELS[job.salary_duration] ?? job.salary_duration;
    const fmt = (n: number) => n.toLocaleString('en-IN');
    salaryText = job.max_monthly_salary !== null
      ? `${curr} ${fmt(job.min_monthly_salary)} – ${fmt(job.max_monthly_salary)} ${dur}`
      : `${curr} ${fmt(job.min_monthly_salary)} ${dur}`;
  }

  const positionsLeft = Math.max(0, job.positions_open - job.positions_filled);

  return (
    <div className="space-y-6">
      {/* Back link */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Jobs
      </button>

      {/* Hero */}
      <div className="rounded-xl border border-border/60 bg-gradient-to-br from-primary/5 via-background to-background p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {institutionName && (
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-primary/80">
                {institutionName}
              </p>
            )}
            <h1 className="text-2xl font-bold text-foreground leading-tight">{job.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {ROLE_CATEGORY_LABELS[job.role_category] ?? job.role_category}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {location && (
                <div className="inline-flex items-center gap-2 rounded-lg border bg-background/80 px-3 py-1.5 text-sm font-medium shadow-sm">
                  <span className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center">
                    <MapPin className="h-4 w-4" />
                  </span>
                  {location}
                </div>
              )}
              {job.job_type && (
                <div className="inline-flex items-center gap-2 rounded-lg border bg-background/80 px-3 py-1.5 text-sm font-medium shadow-sm">
                  <span className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center">
                    <Briefcase className="h-4 w-4" />
                  </span>
                  {JOB_TYPE_LABELS[job.job_type] ?? job.job_type}
                </div>
              )}
              {expRange && (
                <div className="inline-flex items-center gap-2 rounded-lg border bg-background/80 px-3 py-1.5 text-sm font-medium shadow-sm">
                  <span className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center">
                    <Clock className="h-4 w-4" />
                  </span>
                  {expRange} experience
                </div>
              )}
              {positionsLeft > 0 && (
                <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 shadow-sm dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                  <span className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center">
                    <Users className="h-4 w-4" />
                  </span>
                  {positionsLeft} position{positionsLeft !== 1 ? 's' : ''} open
                </div>
              )}
            </div>
          </div>

          {/* Apply button */}
          <div className="flex-shrink-0">
            <Button size="lg" onClick={onApply} className="shadow-sm">
              <Pencil className="mr-2 h-4 w-4" />
              Apply Now
            </Button>
          </div>
        </div>
      </div>

      {/* Content + Sidebar */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_280px]">
        {/* Main */}
        <div className="space-y-5">
          {job.description && (
            <SectionCard
              iconBg="bg-blue-100 dark:bg-blue-950"
              icon={<FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
              title="About this Role"
            >
              <RichTextDisplay content={job.description} />
            </SectionCard>
          )}

          {qualifications.length > 0 && (
            <SectionCard
              iconBg="bg-violet-100 dark:bg-violet-950"
              icon={<BookOpen className="h-4 w-4 text-violet-600 dark:text-violet-400" />}
              title="Qualifications"
            >
              <ul className="space-y-2">
                {qualifications.map((q, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-violet-400" />
                    {q}
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          {skills.length > 0 && (
            <SectionCard
              iconBg="bg-amber-100 dark:bg-amber-950"
              icon={<Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
              title="Skills Required"
            >
              <div className="flex flex-wrap gap-2">
                {skills.map((skill, i) => (
                  <span
                    key={i}
                    className={cn(
                      'inline-flex items-center rounded-lg border px-3 py-1.5 text-sm font-medium',
                      skill.type === 'required'
                        ? 'border-primary/20 bg-primary/10 text-primary'
                        : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
                    )}
                  >
                    {skill.name}
                    <Badge
                      variant="outline"
                      className="ml-2 px-1.5 py-0 text-[10px] border-current/20"
                    >
                      {skill.type === 'required' ? 'Required' : 'Nice to have'}
                    </Badge>
                  </span>
                ))}
              </div>
            </SectionCard>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card className="shadow-sm">
            <CardContent className="px-4 py-0">
              <dl>
                <SidebarRow label="Institution" value={institutionName} icon={<Building2 className="h-3.5 w-3.5" />} />
                <SidebarRow label="Job Type" value={job.job_type ? JOB_TYPE_LABELS[job.job_type] : null} icon={<Briefcase className="h-3.5 w-3.5" />} />
                <SidebarRow label="Location" value={location || null} icon={<MapPin className="h-3.5 w-3.5" />} />
                <SidebarRow label="Experience" value={expRange} icon={<Clock className="h-3.5 w-3.5" />} />
                <SidebarRow
                  label="Education"
                  value={job.education_level ? EDUCATION_LEVEL_LABELS[job.education_level] : null}
                  icon={<GraduationCap className="h-3.5 w-3.5" />}
                />
                <SidebarRow label="Compensation" value={salaryText} icon={<DollarSign className="h-3.5 w-3.5" />} />
                <SidebarRow
                  label="Positions Open"
                  value={positionsLeft > 0 ? `${positionsLeft} of ${job.positions_open}` : 'Filling up'}
                  icon={<Users className="h-3.5 w-3.5" />}
                />
                {job.job_code && (
                  <SidebarRow label="Job Code" value={job.job_code} icon={<Info className="h-3.5 w-3.5" />} />
                )}
              </dl>
            </CardContent>
          </Card>

          <Button className="w-full" onClick={onApply}>
            Apply for this Role
          </Button>
        </div>
      </div>
    </div>
  );
}
