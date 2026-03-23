'use client';

import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Activity, Award, Building2, CheckCircle2, ExternalLink,
  Flag, Github, Laptop, Loader2, MapPin, Medal,
  Rocket, Trophy, User, Users, Video, XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRegistration } from '@/hooks/startup-studio/use-event-registrations';
import type { VerifiedLeaderboardEntry } from '@/types/startup-studio';

// ── helpers ──────────────────────────────────────────────────────

function SectionTitle({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-muted-foreground">{icon}</span>
      <p className="text-sm font-semibold">{label}</p>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value?: string | number | null; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={cn('text-right font-medium', mono && 'font-mono')}>
        {value != null && value !== '' ? value : '—'}
      </span>
    </div>
  );
}

function LinkRow({ label, url, icon }: { label: string; url?: string | null; icon: React.ReactNode }) {
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

const TIER_STYLES: Record<number, { label: string; className: string }> = {
  0: { label: 'Tier 0 — No App',        className: 'text-muted-foreground border-muted' },
  1: { label: 'Tier 1 — Live App',      className: 'text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-950/30' },
  2: { label: 'Tier 2 — 5+ Users',      className: 'text-purple-600 border-purple-300 bg-purple-50 dark:bg-purple-950/30' },
  3: { label: 'Tier 3 — 10+ Active',    className: 'text-orange-600 border-orange-300 bg-orange-50 dark:bg-orange-950/30' },
  4: { label: 'Tier 4 — 25+ Active',    className: 'text-green-700 border-green-300 bg-green-50 dark:bg-green-950/30' },
};

// ── main component ────────────────────────────────────────────────

interface LeaderboardDetailSheetProps {
  entry: VerifiedLeaderboardEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LeaderboardDetailSheet({ entry, open, onOpenChange }: LeaderboardDetailSheetProps) {
  // Fetch full registration (members + submission + venue) only when sheet is open
  const { data: registration, isLoading: regLoading } = useRegistration(
    open ? entry?.team_id : undefined
  );

  if (!entry) return null;

  const tier = entry.verified_tier ?? 0;
  const tierStyle = TIER_STYLES[tier] ?? TIER_STYLES[0];
  const submission = registration?.submission;
  const members = registration?.team_members ?? [];
  const acceptedMembers = members.filter((m) => m.status === 'accepted' || m.is_leader);

  // Venue from first allocation
  const venueAlloc = registration?.venue_allocations?.[0];
  const venue = venueAlloc?.venue_assignment;
  const venueName =
    venue?.resource?.name ??
    venue?.manual_name ??
    entry.venue_name ??
    null;

  const isDisqualified = entry.verification_status === 'disqualified';
  const isFlagged = entry.verification_status === 'flagged';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2 flex-wrap">
            {entry.team_name}
            {isDisqualified && (
              <Badge variant="destructive" className="text-xs">Disqualified</Badge>
            )}
            {isFlagged && (
              <Badge variant="outline" className="text-xs border-amber-400 text-amber-600">Flagged</Badge>
            )}
          </SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-2 text-sm">
            {entry.app_name && (
              <span className="font-medium text-foreground">{entry.app_name}</span>
            )}
            {entry.app_name && entry.institution_name && (
              <span className="text-muted-foreground">·</span>
            )}
            {entry.institution_name && (
              <span className="flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {entry.institution_name}
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5">

          {/* ── Rankings & Score ─────────────────────────────── */}
          <div className="rounded-xl border p-4 space-y-3">
            <SectionTitle icon={<Trophy className="h-4 w-4 text-yellow-500" />} label="Rankings & Score" />

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/40 px-3 py-2.5 text-center">
                <p className="text-xs text-muted-foreground mb-1">Overall Rank</p>
                <p className="text-2xl font-bold">{entry.overall_rank}</p>
              </div>
              <div className="rounded-lg bg-muted/40 px-3 py-2.5 text-center">
                <p className="text-xs text-muted-foreground mb-1">College Rank</p>
                <p className="text-2xl font-bold">{entry.college_rank}</p>
              </div>
            </div>

            <Separator />

            <div className="rounded-lg border divide-y">
              <div className="px-3">
                <DetailRow label="Tier Points" value={entry.tier_points ?? 0} mono />
              </div>
              <div className="px-3">
                <DetailRow label="Revenue Bonus" value={`+${entry.revenue_bonus ?? 0}`} mono />
              </div>
              <div className="px-3 bg-muted/20">
                <div className="flex items-center justify-between py-1.5 text-sm">
                  <span className="shrink-0 font-semibold">Total Score</span>
                  <span className="font-bold text-lg font-mono">{entry.total_score}</span>
                </div>
              </div>
            </div>

            <Badge
              variant="outline"
              className={cn('text-xs w-full justify-center py-1.5', tierStyle.className)}
            >
              <Award className="h-3.5 w-3.5 mr-1.5" />
              {tierStyle.label}
            </Badge>
          </div>

          {/* ── Verification Metrics ──────────────────────────── */}
          <div>
            <SectionTitle icon={<Activity className="h-4 w-4 text-blue-500" />} label="Verification Metrics" />
            <div className="rounded-lg border divide-y">
              <div className="px-3">
                <DetailRow label="Total Users" value={entry.verified_users ?? 0} mono />
              </div>
              <div className="px-3">
                <DetailRow label="Active Users" value={entry.verified_active_users ?? 0} mono />
              </div>
              <div className="px-3">
                <DetailRow
                  label="MRR"
                  value={entry.verified_revenue ? `₹${entry.verified_revenue}` : '—'}
                  mono
                />
              </div>
              <div className="px-3">
                <DetailRow
                  label="Category"
                  value={entry.category ?? null}
                />
              </div>
              <div className="px-3">
                <DetailRow
                  label="Presented"
                  value={entry.presented ? 'Yes' : 'No'}
                />
              </div>
              {venueName && (
                <div className="px-3">
                  <DetailRow label="Venue" value={venueName} />
                </div>
              )}
              {entry.verified_at && (
                <div className="px-3">
                  <DetailRow
                    label="Verified At"
                    value={new Date(entry.verified_at).toLocaleDateString('en-IN', {
                      day: '2-digit', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  />
                </div>
              )}
            </div>
          </div>

          {/* ── Project Links ─────────────────────────────────── */}
          <div>
            <SectionTitle icon={<Rocket className="h-4 w-4 text-emerald-600" />} label="Project Links" />
            <div className="space-y-2">
              <LinkRow
                label="Live App"
                url={entry.live_app_url ?? submission?.live_app_url}
                icon={<Rocket className="h-3.5 w-3.5 text-emerald-600" />}
              />
              <LinkRow
                label="GitHub Repository"
                url={submission?.github_url}
                icon={<Github className="h-3.5 w-3.5" />}
              />
              {submission?.demo_video_url && (
                <LinkRow
                  label="Demo Video"
                  url={submission.demo_video_url}
                  icon={<Video className="h-3.5 w-3.5 text-purple-500" />}
                />
              )}
              {submission?.lovable_url && (
                <LinkRow
                  label="Lovable Project"
                  url={submission.lovable_url}
                  icon={<ExternalLink className="h-3.5 w-3.5 text-pink-500" />}
                />
              )}
            </div>
          </div>

          {/* ── Submission Details ────────────────────────────── */}
          {(submission?.description || submission?.problem_statement || submission?.solution_summary) && (
            <div>
              <SectionTitle icon={<Flag className="h-4 w-4 text-indigo-500" />} label="Submission Details" />
              <div className="space-y-3 rounded-lg border p-3 text-sm">
                {submission.problem_statement && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Problem Statement</p>
                    <p className="text-sm leading-relaxed">{submission.problem_statement}</p>
                  </div>
                )}
                {submission.solution_summary && (
                  <>
                    {submission.problem_statement && <Separator />}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Solution Summary</p>
                      <p className="text-sm leading-relaxed">{submission.solution_summary}</p>
                    </div>
                  </>
                )}
                {submission.description && !submission.problem_statement && !submission.solution_summary && (
                  <p className="text-sm leading-relaxed">{submission.description}</p>
                )}
              </div>
            </div>
          )}

          {/* ── Team Members ─────────────────────────────────── */}
          <div>
            <SectionTitle icon={<Users className="h-4 w-4 text-violet-500" />} label="Team Members" />

            {regLoading ? (
              <div className="flex items-center justify-center gap-2 rounded-lg border py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading members…
              </div>
            ) : acceptedMembers.length > 0 ? (
              <div className="rounded-lg border divide-y">
                {acceptedMembers.map((member) => (
                  <div key={member.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {member.full_name || member.email}
                        </p>
                        {member.full_name && (
                          <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {member.is_leader && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5 text-amber-600 bg-amber-50 dark:bg-amber-950/30">
                          <Medal className="h-2.5 w-2.5" /> Lead
                        </Badge>
                      )}
                      {member.has_laptop && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5 text-blue-600">
                          <Laptop className="h-2.5 w-2.5" /> Laptop
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-3 text-center rounded-lg border">
                No member details available.
              </p>
            )}
          </div>

        </div>
      </SheetContent>
    </Sheet>
  );
}
