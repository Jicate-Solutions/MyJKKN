'use client';

/**
 * Application detail — the screening-stage counterpart to candidates/[id].
 *
 * An applicant exists in two tables across their life: hr_job_applications from
 * submission through screening, and hr_recruitment_candidates only once someone
 * clicks Promote. Before promotion there is no candidate id, so candidates/[id]
 * cannot render them — this page covers that half. Once promoted, it hands off
 * to the candidate page rather than duplicating the approval workflow.
 *
 * Read-only by design: every screening action (shortlist / reject / promote)
 * lives on the job workspace, which is one click away in the header.
 *
 * Access is RLS-gated on hr.recruitment.view + role_has_institution_access via
 * GET /api/hr/recruitment/applications/[id]; no extra permission key exists.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import {
  ArrowRight, Briefcase, Building2, Clock, ExternalLink, FileText, Mail,
  MapPin, Phone, Send,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApplication } from '@/hooks/hr/use-recruitment';
import { useAlumniSignalBulk } from '@/hooks/hr/use-alumni-signal-bulk';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { AlumniSignalLine } from '../../_components/alumni-signal-line';
import {
  JOB_APPLICATION_STATUS_LABELS,
  type HRJobApplication,
  type JobApplicationStatus,
} from '@/types/hr-recruitment';

/** The list/detail select embeds the job; the base row type doesn't declare it. */
type ApplicationWithJob = HRJobApplication & {
  job?: {
    id: string;
    title: string;
    role_category: string;
    institution_id: string | null;
    hr_organization_id: string | null;
  } | null;
};

const STATUS_COLORS: Record<JobApplicationStatus, string> = {
  pending:     'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-200',
  reviewed:    'bg-blue-100 text-blue-900 dark:bg-blue-900/20 dark:text-blue-200',
  shortlisted: 'bg-green-100 text-green-900 dark:bg-green-900/20 dark:text-green-200',
  rejected:    'bg-red-100 text-red-900 dark:bg-red-900/20 dark:text-red-200',
  promoted:    'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-200',
};

const STATUS_ACCENT: Record<JobApplicationStatus, string> = {
  pending:     'border-l-yellow-400',
  reviewed:    'border-l-blue-500',
  shortlisted: 'border-l-green-500',
  rejected:    'border-l-red-500',
  promoted:    'border-l-emerald-500',
};

const STATUS_DOT: Record<JobApplicationStatus, string> = {
  pending:     'bg-yellow-500',
  reviewed:    'bg-blue-500',
  shortlisted: 'bg-green-500',
  rejected:    'bg-red-500',
  promoted:    'bg-emerald-500',
};

const fmtMonths = (months: number | null | undefined) => {
  if (months === null || months === undefined) return null;
  if (months <= 0) return 'Fresher';
  const yrs = Math.floor(months / 12);
  const rem = months % 12;
  if (yrs === 0) return `${rem} mo`;
  return rem === 0 ? `${yrs} yr` : `${yrs} yr ${rem} mo`;
};

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

/** One label/value row in the sidebar fact list. */
function Fact({
  icon: Icon, label, children,
}: {
  icon: typeof Mail;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
      <span className="text-muted-foreground text-xs shrink-0">{label}</span>
      <span className="ml-auto font-medium text-right min-w-0 break-words">{children}</span>
    </div>
  );
}

export default function ApplicationDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';

  const { data, isLoading } = useApplication(id);
  const application = data as ApplicationWithJob | null | undefined;

  const name = application ? `${application.first_name} ${application.last_name}`.trim() : '';

  // Same bulk endpoint the workspace list uses — keyed by lowercased email, so a
  // screening applicant gets the identical JKKN history line without a new API.
  const { data: alumniMap } = useAlumniSignalBulk(application ? [application.email] : undefined);
  const alumniSignal = application
    ? alumniMap?.[application.email.toLowerCase().trim()] ?? null
    : null;

  const { institutions } = useInstitutionsWithAccess();
  const institutionName = useMemo(
    () => institutions.find((i) => i.id === application?.institution_id)?.name,
    [institutions, application?.institution_id],
  );

  if (isLoading) {
    return (
      <ContentLayout title="Loading…">
        <div className="mt-6 space-y-3 max-w-3xl">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border rounded-md p-4 space-y-2">
              <div className="h-5 w-56 rounded bg-muted/60 animate-pulse" />
              <div className="h-4 w-80 rounded bg-muted/40 animate-pulse" />
            </div>
          ))}
        </div>
      </ContentLayout>
    );
  }

  if (!application) {
    return (
      <ContentLayout title="Not Found">
        <p className="text-sm text-muted-foreground mt-6">
          Application not found, or you don&rsquo;t have access to it.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href="/hr/recruitment/approvals">Back to Approvals</Link>
        </Button>
      </ContentLayout>
    );
  }

  const experience = fmtMonths(application.experience_months);
  const currentDuration = fmtMonths(application.current_job_duration_months);
  const workspaceHref = `/hr/recruitment/approvals/${application.job_id}`;

  return (
    <ContentLayout title="Application Detail">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr/recruitment">Recruitment</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink asChild><Link href={workspaceHref}>Approvals</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>{name}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 grid gap-4 items-start lg:grid-cols-[320px_minmax(0,1fr)]">

        {/* ============ SIDEBAR — identity + facts ============ */}
        <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
          <Card className={`border-l-4 ${STATUS_ACCENT[application.status]}`}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-base font-semibold">
                  {initials(name)}
                </div>
                <div className="min-w-0">
                  <h1 className="text-base font-semibold leading-tight break-words">{name}</h1>
                  {application.job?.title && (
                    <p className="text-xs text-muted-foreground break-words">{application.job.title}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium ${STATUS_COLORS[application.status]}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[application.status]}`} />
                  {JOB_APPLICATION_STATUS_LABELS[application.status]}
                </span>
              </div>

              <div className="border-t border-border" />

              <dl className="space-y-2 text-sm">
                <Fact icon={Mail} label="Email">
                  <span className="break-all">{application.email}</span>
                </Fact>
                {application.phone && (
                  <Fact icon={Phone} label="Phone">{application.phone}</Fact>
                )}
                {experience && (
                  <Fact icon={Clock} label="Experience">{experience}</Fact>
                )}
                <Fact icon={Send} label="Applied">{fmtDate(application.submitted_at)}</Fact>
                {application.institution_id && (
                  <Fact icon={Building2} label="Institution">{institutionName ?? '—'}</Fact>
                )}
              </dl>

              {application.resume_url && (
                <a
                  href={application.resume_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium text-primary hover:bg-muted/50 transition-colors"
                >
                  <FileText className="h-3 w-3" />
                  {application.resume_filename || 'View Resume'}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}

              {/* Renders nothing when there's no JKKN history — self-guarding,
                  so it must not sit inside a titled container. */}
              <AlumniSignalLine signal={alumniSignal} />
            </CardContent>
          </Card>

          <Button asChild variant="outline" className="w-full">
            <Link href={workspaceHref}>
              <Briefcase className="h-4 w-4 mr-1" />
              Open Job Workspace
            </Link>
          </Button>
        </aside>

        {/* ============ MAIN COLUMN ============ */}
        <div className="space-y-4 min-w-0">

          {/* Promoted applicants own a candidacy — send the user there for the
              approval chain, packages and onboarding rather than duplicating it. */}
          {application.promoted_candidate_id && (
            <Card className="border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-900/10">
              <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">This applicant is in the approval pipeline</p>
                  <p className="text-xs text-muted-foreground">
                    The approval chain, salary packages and onboarding live on the candidate record.
                  </p>
                </div>
                <Button asChild size="sm">
                  <Link href={`/hr/recruitment/candidates/${application.promoted_candidate_id}`}>
                    View Candidate
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Professional background */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Professional Background</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 sm:grid-cols-2 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Qualification</dt>
                  <dd className="font-medium break-words">{application.qualification || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Total Experience</dt>
                  <dd className="font-medium">{experience ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Current Role</dt>
                  <dd className="font-medium break-words">{application.current_job_title || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Current Employer</dt>
                  <dd className="font-medium break-words">{application.current_company || '—'}</dd>
                </div>
                {currentDuration && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Time in Current Role</dt>
                    <dd className="font-medium">{currentDuration}</dd>
                  </div>
                )}
              </dl>

              {application.worked_cities?.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1.5">
                    <MapPin className="h-3 w-3" />
                    Cities Worked In
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {application.worked_cities.map((city) => (
                      <Badge key={city} variant="outline" className="text-[10px]">{city}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Screening outcome */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Screening</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="text-xs text-muted-foreground">
                  Status:{' '}
                  <span className="font-medium text-foreground">
                    {JOB_APPLICATION_STATUS_LABELS[application.status]}
                  </span>
                </span>
                {application.reviewed_at && (
                  <span className="text-xs text-muted-foreground">
                    Reviewed:{' '}
                    <span className="font-medium text-foreground">{fmtDate(application.reviewed_at)}</span>
                  </span>
                )}
              </div>
              {application.review_notes ? (
                <p className="text-sm text-muted-foreground italic border-l-2 border-border pl-3">
                  &ldquo;{application.review_notes}&rdquo;
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">No screening notes recorded.</p>
              )}
              <p className="text-xs text-muted-foreground pt-1">
                Screening actions (shortlist, reject, promote) are on the{' '}
                <Link href={workspaceHref} className="text-primary hover:underline">
                  job workspace
                </Link>
                .
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </ContentLayout>
  );
}
