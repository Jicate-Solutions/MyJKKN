'use client';

import { Pencil } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  JOB_STATUS_LABELS,
  JOB_TYPE_LABELS,
  EMPLOYER_TYPE_LABELS,
  EDUCATION_LEVEL_LABELS,
  SALARY_DURATION_LABELS,
  type HRRecruitmentJob,
  type JobSkill,
} from '@/types/hr-recruitment';
import { cn } from '@/lib/utils';

import { ROLE_CATEGORY_LABELS } from './labels';

interface JobDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: HRRecruitmentJob | null;
  institutionName: string;
  departmentName: string;
  onEdit?: (job: HRRecruitmentJob) => void;
}

const fmtDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : null;

const fmtInr = (n: number | null | undefined, currency = 'INR') => {
  if (n == null) return null;
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(n);
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3 py-2 border-b last:border-b-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="col-span-2 text-sm">{children}</dd>
    </div>
  );
}

function Section({ title }: { title: string }) {
  return (
    <div className="pt-4 pb-1">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
    </div>
  );
}

const PROFICIENCY_INDEX: Record<string, number> = {
  basic: 1,
  intermediate: 2,
  pro: 3,
  expert: 4,
};

function ProficiencyDots({ skill }: { skill: JobSkill }) {
  const filled = PROFICIENCY_INDEX[skill.proficiency] ?? 2;
  const isRequired = skill.type === 'required';
  return (
    <div className="flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs">
      <span>{skill.name}</span>
      <span className="inline-flex gap-0.5 ml-1">
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              i <= filled
                ? isRequired
                  ? 'bg-primary'
                  : 'bg-amber-500'
                : 'bg-muted'
            )}
          />
        ))}
      </span>
    </div>
  );
}

export function JobDetailDialog({
  open,
  onOpenChange,
  job,
  institutionName,
  departmentName,
  onEdit,
}: JobDetailDialogProps) {
  if (!job) return null;

  const requirements = job.requirements as {
    qualifications?: string[];
    skills?: JobSkill[];
  } | null;

  const qualifications = requirements?.qualifications ?? [];
  const skills = requirements?.skills ?? [];
  const requiredSkills = skills.filter((s) => s.type === 'required');
  const niceSkills = skills.filter((s) => s.type === 'nice_to_have');

  const location = [job.city, job.state, job.country].filter(Boolean).join(', ');

  const salaryText = (() => {
    const cur = job.salary_currency ?? 'INR';
    const dur = job.salary_duration ? SALARY_DURATION_LABELS[job.salary_duration] : 'per month';
    if (job.min_monthly_salary == null && job.max_monthly_salary == null) {
      return job.display_salary ? 'Not specified' : 'Not disclosed';
    }
    const range = `${fmtInr(job.min_monthly_salary, cur) ?? '—'} – ${
      fmtInr(job.max_monthly_salary, cur) ?? '—'
    }`;
    return `${range} ${dur}`;
  })();

  const expText = (() => {
    const min = job.min_experience_years;
    const max = job.max_experience_years;
    if (min == null && max == null) return null;
    if (min != null && max != null)
      return `${min === 0 ? 'Fresher' : `${min} yr`} – ${max} yr`;
    if (min != null) return `${min === 0 ? 'Fresher' : `${min}+ yr`}`;
    return `Up to ${max} yr`;
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] max-w-lg flex-col">
        <DialogHeader>
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <DialogTitle className="leading-snug">{job.title}</DialogTitle>
              {job.job_code && (
                <span className="text-xs text-muted-foreground font-mono">
                  {job.job_code}
                </span>
              )}
            </div>
            <Badge variant="secondary" className="flex-shrink-0 mt-0.5">
              {JOB_STATUS_LABELS[job.status] ?? job.status}
            </Badge>
          </div>
          <DialogDescription>
            {ROLE_CATEGORY_LABELS[job.role_category] ?? job.role_category} ·{' '}
            {institutionName || '—'}
          </DialogDescription>
        </DialogHeader>

        <dl className="min-h-0 flex-1 overflow-y-auto pr-1">
          {/* ── Basic Details ── */}
          <Section title="Basic Details" />
          <Row label="Institution">{institutionName || '—'}</Row>
          {departmentName && <Row label="Department">{departmentName}</Row>}
          {job.job_type && (
            <Row label="Job Type">
              {JOB_TYPE_LABELS[job.job_type] ?? job.job_type}
            </Row>
          )}
          {job.employer_type && (
            <Row label="Employer Type">
              {EMPLOYER_TYPE_LABELS[job.employer_type] ?? job.employer_type}
            </Row>
          )}
          {job.industry && <Row label="Industry">{job.industry}</Row>}

          {/* ── Location ── */}
          {location && (
            <>
              <Section title="Location" />
              <Row label="Location">{location}</Row>
              {job.zip_code && <Row label="ZIP">{job.zip_code}</Row>}
            </>
          )}

          {/* ── Specification ── */}
          <Section title="Specification" />
          {job.education_level && (
            <Row label="Education">
              {EDUCATION_LEVEL_LABELS[job.education_level] ?? job.education_level}
            </Row>
          )}
          {expText && <Row label="Experience">{expText}</Row>}
          <Row label="Salary">
            {job.display_salary ? salaryText : 'Not disclosed'}
          </Row>
          {qualifications.length > 0 && (
            <Row label="Qualifications">
              <div className="flex flex-wrap gap-1">
                {qualifications.map((q) => (
                  <Badge key={q} variant="outline" className="text-xs font-normal">
                    {q}
                  </Badge>
                ))}
              </div>
            </Row>
          )}

          {/* ── Positions ── */}
          <Section title="Posting" />
          <Row label="Positions">
            {job.positions_filled} filled / {job.positions_open} open
          </Row>
          <Row label="Public on /careers">
            {job.is_public ? 'Yes' : 'No'}
          </Row>
          <Row label="Posted">
            {fmtDate(job.posted_at) ?? (
              <span className="text-muted-foreground">Not posted yet</span>
            )}
          </Row>
          {job.closes_at && (
            <Row label="Closes">{fmtDate(job.closes_at) ?? '—'}</Row>
          )}

          {/* ── Description ── */}
          {job.description && (
            <>
              <Section title="Description" />
              <div className="py-2 text-sm whitespace-pre-wrap">{job.description}</div>
            </>
          )}

          {/* ── Skills ── */}
          {(requiredSkills.length > 0 || niceSkills.length > 0) && (
            <>
              <Section title="Skills" />
              {requiredSkills.length > 0 && (
                <div className="py-2 space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Required</p>
                  <div className="flex flex-wrap gap-1.5">
                    {requiredSkills.map((s) => (
                      <ProficiencyDots key={s.name} skill={s} />
                    ))}
                  </div>
                </div>
              )}
              {niceSkills.length > 0 && (
                <div className="py-2 space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Nice to Have</p>
                  <div className="flex flex-wrap gap-1.5">
                    {niceSkills.map((s) => (
                      <ProficiencyDots key={s.name} skill={s} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <Row label="Created">{fmtDate(job.created_at) ?? '—'}</Row>
        </dl>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {onEdit && (
            <Button onClick={() => onEdit(job)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
