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
  AlertCircle, ArrowLeft, CheckCircle2, Clock, ExternalLink, Github,
  Key, Loader2, Pencil, Rocket, ShieldCheck, ShieldX,
} from 'lucide-react';
import { useMyRegistration } from '@/hooks/startup-studio/use-sarvam-galatta';
import { useEvent } from '@/hooks/startup-studio/use-events';
import { useAuth } from '@/hooks/use-auth';
import { EditRegistrationDialog } from './_components/edit-registration-dialog';

function MaskedKeyDisplay({ hasKey, label }: { hasKey: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">{label}:</span>
      {hasKey ? (
        <Badge variant="outline" className="gap-1 border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/20 dark:text-green-400">
          <CheckCircle2 className="h-3 w-3" /> Provided
        </Badge>
      ) : (
        <Badge variant="outline" className="text-muted-foreground">
          Not provided
        </Badge>
      )}
    </div>
  );
}

function LinkRow({ label, url, icon }: { label: string; url: string | null; icon: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <div className="flex items-center gap-2 text-sm">
        {icon}
        <span className="font-medium text-muted-foreground">{label}</span>
      </div>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-sm text-primary hover:underline"
        >
          View <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <span className="text-xs text-muted-foreground italic">Not provided</span>
      )}
    </div>
  );
}

export default function MyRegistrationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { profile } = useAuth();
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
        <div className="mx-auto max-w-2xl px-4 py-12 text-center">
          <AlertCircle className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <h2 className="text-lg font-semibold">No Registration Found</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            You haven't registered for this event yet.
          </p>
          <Button asChild className="mt-6">
            <Link href={`/startup-studio/events/${id}/register`}>
              Register Now
            </Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="My Registration">
      <PageBreadcrumb items={breadcrumbs} />

      <div className="mx-auto max-w-2xl space-y-6 mt-6 pb-10">

        {/* Back + header row */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => router.push(`/startup-studio/events/${id}`)}
          >
            <ArrowLeft className="h-4 w-4" /> Back to Event
          </Button>
          {registration.approval_status === 'shortlisted' ? (
            <Badge variant="outline" className="gap-1 border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/20">
              <ShieldCheck className="h-3 w-3" /> Shortlisted
            </Badge>
          ) : registration.approval_status === 'rejected' ? (
            <Badge variant="outline" className="gap-1 border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/20">
              <ShieldX className="h-3 w-3" /> Not Shortlisted
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/20">
              <Clock className="h-3 w-3" /> Waiting for Approval
            </Badge>
          )}
        </div>

        {/* Title */}
        <div>
          <h1 className="text-2xl font-bold">My Registration</h1>
          <p className="text-sm text-muted-foreground">
            {event?.name ?? 'Sarvam Galatta'} · {registration.team_name}
          </p>
        </div>

        {/* Approval status banner */}
        {registration.approval_status === 'shortlisted' ? (
          <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-900 dark:bg-green-950/20">
            <ShieldCheck className="h-5 w-5 text-green-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-green-900 dark:text-green-100">
                You've been shortlisted!
              </p>
              <p className="text-xs text-green-700 dark:text-green-300">
                Team code: <span className="font-mono font-semibold">{registration.team_code ?? '—'}</span>
                {' · '}Submitted {new Date(registration.submitted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ) : registration.approval_status === 'rejected' ? (
          <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950/20">
            <ShieldX className="h-5 w-5 text-red-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-900 dark:text-red-100">
                Your registration was not shortlisted.
              </p>
              <p className="text-xs text-red-700 dark:text-red-300">
                Contact the organizers if you have questions about this decision.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/20">
            <Clock className="h-5 w-5 text-amber-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                Registration submitted — waiting for admin approval.
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Team code: <span className="font-mono font-semibold">{registration.team_code ?? '—'}</span>
                {' · '}Submitted {new Date(registration.submitted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        )}

        {/* Profile snapshot */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Your Profile (at registration)</CardTitle>
            <CardDescription className="text-xs">Captured from your learner profile when you registered</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              {[
                { label: 'Full Name', value: `${registration.snap_first_name} ${registration.snap_last_name ?? ''}`.trim() },
                { label: 'Institution', value: registration.institution_name ?? '—' },
                { label: 'Department', value: registration.department_name ?? '—' },
                { label: 'Program', value: registration.program_name ?? '—' },
                { label: 'Semester', value: registration.semester_name ?? '—' },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="font-medium">{value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Project links */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Rocket className="h-4 w-4 text-emerald-600" />
              Project Links
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <LinkRow
              label="Project URL"
              url={registration.project_url}
              icon={<Rocket className="h-4 w-4 text-emerald-600" />}
            />
            <LinkRow
              label="GitHub Repository"
              url={registration.github_url}
              icon={<Github className="h-4 w-4" />}
            />
            <LinkRow
              label="Supabase Project"
              url={registration.supabase_project_url}
              icon={<Key className="h-4 w-4 text-emerald-500" />}
            />
          </CardContent>
        </Card>

        {/* API keys — checkboxes only, never show actual keys */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Key className="h-4 w-4 text-blue-600" />
              API Keys
            </CardTitle>
            <CardDescription className="text-xs">
              Keys are stored securely. Use Edit to update them.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <MaskedKeyDisplay hasKey={!!registration.gemini_api_key} label="Google Gemini API Key" />
            <MaskedKeyDisplay hasKey={!!registration.google_maps_api_key} label="Google Maps API Key" />
          </CardContent>
        </Card>

        <Separator />

        {/* Edit + last edited */}
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Last updated: {new Date(registration.last_edited_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setEditOpen(true)}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit Registration
          </Button>
        </div>

        <EditRegistrationDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          registration={registration}
        />
      </div>
    </ContentLayout>
  );
}
