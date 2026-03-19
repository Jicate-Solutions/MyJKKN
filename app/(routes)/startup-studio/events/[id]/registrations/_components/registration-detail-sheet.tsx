'use client';

import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Clock, Database, ExternalLink, Github,
  Loader2, MapPin, Rocket, ShieldCheck, ShieldX, Sparkles, User,
} from 'lucide-react';
import { useSetApprovalStatus } from '@/hooks/startup-studio/use-sarvam-galatta';
import type { SarvamGalattaRegistration } from '@/types/sarvam-galatta';

// ── helpers ────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value || '—'}</span>
    </div>
  );
}

function LinkRow({
  label, url, icon,
}: {
  label: string; url: string | null | undefined; icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <span className="shrink-0 text-muted-foreground">{icon}</span>
        <span className="truncate text-muted-foreground">{label}</span>
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

// ── main component ─────────────────────────────────────────────────

interface RegistrationDetailSheetProps {
  registration: SarvamGalattaRegistration | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RegistrationDetailSheet({
  registration, open, onOpenChange,
}: RegistrationDetailSheetProps) {
  const approvalMutation = useSetApprovalStatus();

  if (!registration) return null;

  const approvalStatus = registration.approval_status ?? 'waitlisted';
  const fullName = `${registration.snap_first_name} ${registration.snap_last_name ?? ''}`.trim();

  function handleApproval(status: 'shortlisted' | 'rejected') {
    approvalMutation.mutate(
      { sarvamGalattaId: registration!.id, status },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-lg">{registration.team_name ?? fullName}</SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            {fullName}
            {registration.owner_email && (
              <span className="text-muted-foreground">· {registration.owner_email}</span>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5">

          {/* Approval status + actions */}
          <div className="rounded-xl border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Approval Status</p>
              {approvalStatus === 'shortlisted' ? (
                <Badge variant="outline" className="gap-1 border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/20">
                  <ShieldCheck className="h-3 w-3" /> Shortlisted
                </Badge>
              ) : approvalStatus === 'rejected' ? (
                <Badge variant="outline" className="gap-1 border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/20">
                  <ShieldX className="h-3 w-3" /> Rejected
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/20">
                  <Clock className="h-3 w-3" /> Waitlisted
                </Badge>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                disabled={approvalStatus === 'shortlisted' || approvalMutation.isPending}
                onClick={() => handleApproval('shortlisted')}
              >
                {approvalMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5" />
                )}
                Shortlist
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="flex-1 gap-1.5"
                disabled={approvalStatus === 'rejected' || approvalMutation.isPending}
                onClick={() => handleApproval('rejected')}
              >
                {approvalMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ShieldX className="h-3.5 w-3.5" />
                )}
                Reject
              </Button>
            </div>
          </div>

          {/* Student profile */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Student Profile</p>
            </div>
            <div className="rounded-lg border divide-y">
              <div className="px-3">
                <DetailRow label="Full Name" value={fullName} />
              </div>
              <div className="px-3">
                <DetailRow label="Email" value={registration.owner_email} />
              </div>
              <div className="px-3">
                <DetailRow label="Institution" value={registration.institution_name} />
              </div>
              <div className="px-3">
                <DetailRow label="Department" value={registration.department_name} />
              </div>
              <div className="px-3">
                <DetailRow label="Program" value={registration.program_name} />
              </div>
              <div className="px-3">
                <DetailRow label="Semester" value={registration.semester_name} />
              </div>
            </div>
          </div>

          {/* Registration meta */}
          <div>
            <p className="mb-2 text-sm font-semibold">Registration Info</p>
            <div className="rounded-lg border divide-y">
              <div className="px-3">
                <DetailRow label="Team Code" value={registration.team_code} />
              </div>
              <div className="px-3">
                <DetailRow
                  label="Submitted"
                  value={new Date(registration.submitted_at).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                />
              </div>
              <div className="px-3">
                <DetailRow
                  label="Last Edited"
                  value={new Date(registration.last_edited_at).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                />
              </div>
            </div>
          </div>

          {/* Project links */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Rocket className="h-4 w-4 text-emerald-600" />
              <p className="text-sm font-semibold">Project Links</p>
            </div>
            <div className="space-y-2">
              <LinkRow label="Live Project" url={registration.project_url} icon={<Rocket className="h-3.5 w-3.5 text-emerald-600" />} />
              <LinkRow label="GitHub Repository" url={registration.github_url} icon={<Github className="h-3.5 w-3.5" />} />
              <LinkRow label="Supabase Project" url={registration.supabase_project_url} icon={<Database className="h-3.5 w-3.5 text-emerald-500" />} />
            </div>
          </div>

          {/* API usage pages */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              <p className="text-sm font-semibold">API Usage Pages</p>
            </div>
            <div className="space-y-2">
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
            </div>
          </div>

        </div>
      </SheetContent>
    </Sheet>
  );
}
