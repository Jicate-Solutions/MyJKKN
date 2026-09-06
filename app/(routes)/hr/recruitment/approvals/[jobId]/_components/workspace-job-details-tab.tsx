'use client';

/** Read-only job summary for the approvals workspace (edit lives on the Jobs page). */

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink } from 'lucide-react';
import {
  EDUCATION_LEVEL_LABELS,
  JOB_TYPE_LABELS,
  ROLE_CATEGORY_LABELS,
  type HRRecruitmentJob,
} from '@/types/hr-recruitment';

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const fmtSalary = (job: HRRecruitmentJob) => {
  if (!job.display_salary) return 'Not disclosed';
  const cur = job.salary_currency || 'INR';
  const fmt = (n: number) => n.toLocaleString('en-IN');
  if (job.min_monthly_salary && job.max_monthly_salary) {
    return `${cur} ${fmt(job.min_monthly_salary)} – ${fmt(job.max_monthly_salary)} / month`;
  }
  if (job.min_monthly_salary) return `${cur} ${fmt(job.min_monthly_salary)}+ / month`;
  if (job.max_monthly_salary) return `Up to ${cur} ${fmt(job.max_monthly_salary)} / month`;
  return 'Not specified';
};

export function WorkspaceJobDetailsTab({
  job, isLoading,
}: { job: HRRecruitmentJob | null; isLoading: boolean }) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-4 w-full max-w-md rounded bg-muted/50 animate-pulse" />
          ))}
        </CardContent>
      </Card>
    );
  }
  if (!job) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Job not found.
        </CardContent>
      </Card>
    );
  }

  const skills = job.requirements?.skills ?? [];
  const qualifications = job.requirements?.qualifications ?? [];
  const experience =
    job.min_experience_years != null || job.max_experience_years != null
      ? [
          job.min_experience_years != null ? `${job.min_experience_years}` : '0',
          job.max_experience_years != null ? `– ${job.max_experience_years}` : '+',
        ].join(' ') + ' years'
      : job.requirements?.experience ?? 'Any';

  const facts: { label: string; value: string }[] = [
    { label: 'Role Category', value: ROLE_CATEGORY_LABELS[job.role_category] },
    { label: 'Job Type', value: job.job_type ? JOB_TYPE_LABELS[job.job_type] : '—' },
    { label: 'Education', value: job.education_level ? EDUCATION_LEVEL_LABELS[job.education_level] : '—' },
    { label: 'Experience', value: experience },
    { label: 'Salary', value: fmtSalary(job) },
    { label: 'Positions', value: `${job.positions_filled}/${job.positions_open} filled` },
    { label: 'Location', value: [job.city, job.state, job.country].filter(Boolean).join(', ') || '—' },
    { label: 'Industry', value: job.industry ?? '—' },
    { label: 'Posted', value: fmtDate(job.posted_at) },
    { label: 'Closes', value: fmtDate(job.closes_at) },
  ];

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {/* Description */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between gap-2">
            Description
            <Link
              href={`/hr/recruitment/jobs/${job.id}`}
              className="inline-flex items-center gap-1 text-xs font-normal text-primary hover:underline"
            >
              Open in Jobs
              <ExternalLink className="h-3 w-3" />
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {job.description ? (
            <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
              {job.description}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">No description provided.</p>
          )}

          {qualifications.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
                Qualifications
              </p>
              <ul className="list-disc pl-5 space-y-0.5 text-sm text-foreground/90">
                {qualifications.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            </div>
          )}

          {skills.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
                Skills
              </p>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((s, i) => (
                  <Badge
                    key={`${s.name}-${i}`}
                    variant="outline"
                    className={`text-xs ${
                      s.type === 'required'
                        ? 'border-primary/40 bg-primary/5 text-foreground'
                        : 'border-border text-muted-foreground'
                    }`}
                  >
                    {s.name}
                    {s.type === 'nice_to_have' && <span className="ml-1 opacity-70">(nice to have)</span>}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fact sheet */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">At a Glance</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-2.5">
            {facts.map((f) => (
              <div key={f.label} className="flex items-baseline justify-between gap-3">
                <dt className="text-xs text-muted-foreground shrink-0">{f.label}</dt>
                <dd className="text-sm text-foreground text-right">{f.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
