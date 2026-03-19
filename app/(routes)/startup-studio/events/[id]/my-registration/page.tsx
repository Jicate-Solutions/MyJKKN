'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  AlertCircle, CheckCircle2, Clock, ExternalLink, Github,
  Key, Loader2, MapPin, Pencil, Rocket, Sparkles,
} from 'lucide-react';
import { useMyRegistration } from '@/hooks/startup-studio/use-sarvam-galatta';
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

export default function MyRegistrationPage() {
  const params = useParams<{ id: string }>();
  const { profile } = useAuth();
  const { data: registration, isPending } = useMyRegistration();
  const [editOpen, setEditOpen] = useState(false);

  if (isPending) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!registration) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <AlertCircle className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
        <h2 className="text-lg font-semibold">No Registration Found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You haven't registered for Sarvam Galatta yet.
        </p>
        <Button asChild className="mt-6">
          <Link href={`/startup-studio/events/${params.id}/register`}>
            Register Now
          </Link>
        </Button>
      </div>
    );
  }

  // Check if deadline has passed (edit lock)
  const isDeadlinePassed = false; // Resolved in service; client can check event deadline too
  // For display: fetch from event, but here we rely on the edit dialog to catch this via the service

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Registration</h1>
          <p className="text-sm text-muted-foreground">
            Sarvam Galatta · {registration.team_name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="gap-1 border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/20"
          >
            <CheckCircle2 className="h-3 w-3" />
            {registration.status === 'registered' ? 'Registered' : registration.status}
          </Badge>
        </div>
      </div>

      {/* Success banner */}
      <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-900 dark:bg-green-950/20">
        <CheckCircle2 className="h-5 w-5 text-green-600" />
        <div className="flex-1">
          <p className="text-sm font-medium text-green-900 dark:text-green-100">
            Registration confirmed!
          </p>
          <p className="text-xs text-green-700 dark:text-green-300">
            Team code: <span className="font-mono font-semibold">{registration.team_code ?? '—'}</span>
            {' · '}Submitted {new Date(registration.submitted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>

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
  );
}
