'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  AlertCircle, ArrowLeft, Clock, Database,
  ExternalLink, Github, Loader2, MapPin, Pencil,
  Rocket, ShieldCheck, ShieldX, Sparkles, User,
} from 'lucide-react';
import { useMyRegistration } from '@/hooks/startup-studio/use-sarvam-galatta';
import { useEvent } from '@/hooks/startup-studio/use-events';
import { EditRegistrationDialog } from './_components/edit-registration-dialog';

// ── small reusable pieces ──────────────────────────────────────────

function LinkRow({
  label, url, icon,
}: {
  label: string; url: string | null; icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5 text-sm">
        <span className="shrink-0 text-muted-foreground">{icon}</span>
        <span className="truncate font-medium text-muted-foreground">{label}</span>
      </div>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          View <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <span className="shrink-0 text-xs italic text-muted-foreground">Not provided</span>
      )}
    </div>
  );
}

// ── approval banner ────────────────────────────────────────────────

function ApprovalBanner({
  status, teamCode, submittedAt,
}: {
  status: 'waitlisted' | 'shortlisted' | 'rejected';
  teamCode: string | null | undefined;
  submittedAt: string;
}) {
  const meta = (
    <p className="mt-0.5 text-xs opacity-80">
      Code: <span className="font-mono font-semibold">{teamCode ?? '—'}</span>
      {' · '}Submitted {new Date(submittedAt).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })}
    </p>
  );

  if (status === 'shortlisted') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 dark:border-green-900 dark:bg-green-950/20">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
        <div>
          <p className="text-sm font-semibold text-green-900 dark:text-green-100">You've been shortlisted!</p>
          <p className="mt-0.5 text-xs text-green-700 dark:text-green-300">
            Code: <span className="font-mono font-semibold">{teamCode ?? '—'}</span>
            {' · '}Submitted {new Date(submittedAt).toLocaleDateString('en-IN', {
              day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </p>
        </div>
      </div>
    );
  }

  if (status === 'rejected') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950/20">
        <ShieldX className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
        <div>
          <p className="text-sm font-semibold text-red-900 dark:text-red-100">Your registration was not shortlisted.</p>
          <p className="mt-0.5 text-xs text-red-700 dark:text-red-300">
            Contact the organizers if you have questions about this decision.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/20">
      <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
      <div>
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">Waiting for admin approval</p>
        <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
          Code: <span className="font-mono font-semibold">{teamCode ?? '—'}</span>
          {' · '}Submitted {new Date(submittedAt).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
          })}
        </p>
      </div>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────

export default function MyRegistrationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: event } = useEvent(id);
  const { data: registration, isPending } = useMyRegistration();
  const [editOpen, setEditOpen] = useState(false);

  const breadcrumbs = [
    { label: 'Home', href: '/' },
    { label: 'Startup Studio', href: '/startup-studio/events' },
    { label: event?.name ?? 'Event', href: `/startup-studio/events/${id}` },
    { label: 'My Registration' },
  ];

  if (isPending) {
    return (
      <ContentLayout title="My Registration">
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  if (!registration) {
    return (
      <ContentLayout title="My Registration">
        <PageBreadcrumb items={breadcrumbs} />
        <div className="mx-auto px-4 py-16 text-center">
          <AlertCircle className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <h2 className="text-lg font-semibold">No Registration Found</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            You haven't registered for this event yet.
          </p>
          <Button asChild className="mt-6">
            <Link href={`/startup-studio/events/${id}/register`}>Register Now</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const approvalStatus = registration.approval_status ?? 'waitlisted';

  return (
    <ContentLayout title="My Registration">
      <PageBreadcrumb items={breadcrumbs} />

      <div className="mx-auto space-y-5 mt-6 pb-12">

        {/* Top bar */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => router.push(`/startup-studio/events/${id}`)}
          >
            <ArrowLeft className="h-4 w-4" /> Back to Event
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5" /> Edit Registration
          </Button>
        </div>

        {/* Hero summary card */}
        <Card className="overflow-hidden">
          <div className="border-b bg-muted/40 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {event?.name ?? 'Sarvam Galatta'}
                </p>
                <h1 className="mt-1 truncate text-2xl font-bold">{registration.team_name}</h1>
              </div>
              {approvalStatus === 'shortlisted' ? (
                <Badge variant="outline" className="shrink-0 gap-1 border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/20">
                  <ShieldCheck className="h-3 w-3" /> Shortlisted
                </Badge>
              ) : approvalStatus === 'rejected' ? (
                <Badge variant="outline" className="shrink-0 gap-1 border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/20">
                  <ShieldX className="h-3 w-3" /> Not Shortlisted
                </Badge>
              ) : (
                <Badge variant="outline" className="shrink-0 gap-1 border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/20">
                  <Clock className="h-3 w-3" /> Pending Approval
                </Badge>
              )}
            </div>
          </div>
          <CardContent className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Team Code</p>
              <p className="mt-0.5 font-mono font-semibold">{registration.team_code ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Submitted</p>
              <p className="mt-0.5 font-medium">
                {new Date(registration.submitted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last Updated</p>
              <p className="mt-0.5 font-medium">
                {new Date(registration.last_edited_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <p className="mt-0.5 font-medium capitalize">{approvalStatus}</p>
            </div>
          </CardContent>
        </Card>

        {/* Approval banner */}
        <ApprovalBanner
          status={approvalStatus}
          teamCode={registration.team_code}
          submittedAt={registration.submitted_at}
        />

        {/* Two-column grid: profile + project links */}
        <div className="grid gap-5 lg:grid-cols-2">

          {/* Profile snapshot */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <User className="h-4 w-4 text-muted-foreground" />
                Profile at Registration
              </CardTitle>
              <CardDescription className="text-xs">
                Captured from your learner profile when you registered
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: 'Full Name', value: `${registration.snap_first_name} ${registration.snap_last_name ?? ''}`.trim() },
                { label: 'Institution', value: registration.institution_name ?? '—' },
                { label: 'Department', value: registration.department_name ?? '—' },
                { label: 'Program', value: registration.program_name ?? '—' },
                { label: 'Semester', value: registration.semester_name ?? '—' },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start justify-between gap-2 text-sm">
                  <span className="shrink-0 text-muted-foreground">{label}</span>
                  <span className="text-right font-medium">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Project links */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Rocket className="h-4 w-4 text-emerald-600" />
                Project Links
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <LinkRow
                label="Live Project"
                url={registration.project_url}
                icon={<Rocket className="h-3.5 w-3.5 text-emerald-600" />}
              />
              <LinkRow
                label="GitHub Repository"
                url={registration.github_url}
                icon={<Github className="h-3.5 w-3.5" />}
              />
              <LinkRow
                label="Supabase Project"
                url={registration.supabase_project_url}
                icon={<Database className="h-3.5 w-3.5 text-emerald-500" />}
              />
            </CardContent>
          </Card>
        </div>

        {/* API usage pages */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-amber-500" />
              API Usage Pages
            </CardTitle>
            <CardDescription className="text-xs">
              The page in your app where each API is used.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <LinkRow
              label="Gemini usage page"
              url={registration.gemini_page_url}
              icon={<Sparkles className="h-3.5 w-3.5 text-amber-500" />}
            />
            <LinkRow
              label="Maps usage page"
              url={registration.maps_page_url}
              icon={<MapPin className="h-3.5 w-3.5 text-red-500" />}
            />
          </CardContent>
        </Card>

      </div>

      <EditRegistrationDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        registration={registration}
      />
    </ContentLayout>
  );
}
