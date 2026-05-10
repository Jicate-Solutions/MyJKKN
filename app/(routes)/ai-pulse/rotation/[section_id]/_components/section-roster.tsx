// app/(routes)/ai-pulse/rotation/[section_id]/_components/section-roster.tsx
// Wave B.3 — main interactive roster for the Class Incharge.
//
// Owns:
//   - data fetch via useCurrentCycleSection
//   - working draft state (per-learner status + excuse reason)
//   - bulk "Mark all present" action
//   - Save mutation via useMarkAttendance
//   - escalation hook for absent learners (best-effort secondary action)

'use client';

import { useEffect, useMemo, useState } from 'react';
import { Save, UserCheck, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  useCurrentCycleSection,
  useMarkAttendance,
  useEscalateAbsence,
  type AttendanceRecordInput,
  type ExcuseReason,
} from '@/lib/services/ai-pulse/rotation-service';
import { TeamRow, type DraftRecord } from './team-row';

interface SectionRosterProps {
  sectionId: string;
  /** True if usePermissions().can('aiPulse:attendance.mark') OR isSuperAdmin. */
  canMark: boolean;
  /** True if user is the assigned class_incharge OR isSuperAdmin. */
  hasSectionAccess: boolean;
  /** Reason text when hasSectionAccess is false. */
  accessDenialReason?: string;
}

export function SectionRoster({
  sectionId,
  canMark,
  hasSectionAccess,
  accessDenialReason,
}: SectionRosterProps) {
  const { toast } = useToast();
  const { data, isLoading, error } = useCurrentCycleSection(sectionId);
  const markMutation = useMarkAttendance(sectionId);
  const escalateMutation = useEscalateAbsence();

  // Working drafts keyed by team_member_id.
  const [drafts, setDrafts] = useState<Record<string, DraftRecord>>({});

  // Hydrate drafts when fresh data arrives.
  useEffect(() => {
    if (!data) return;
    const seed: Record<string, DraftRecord> = {};
    for (const team of data.teams) {
      for (const m of team.members) {
        // Default unmarked — Class Incharge must make an explicit pick.
        seed[m.team_member_id] = { status: null };
      }
    }
    setDrafts(seed);
  }, [data]);

  const totalLearners = useMemo(
    () => (data?.teams ?? []).reduce((sum, t) => sum + t.members.length, 0),
    [data]
  );

  const stats = useMemo(() => {
    const values = Object.values(drafts);
    const present = values.filter((d) => d.status === 'Present').length;
    const late = values.filter((d) => d.status === 'Late').length;
    const absent = values.filter((d) => d.status === 'Absent').length;
    const unmarked = values.filter((d) => d.status === null).length;
    return { present, late, absent, unmarked };
  }, [drafts]);

  // Saveable when (a) at least one record marked AND (b) every Absent has a
  // reason picked.
  const validation = useMemo(() => {
    const entries = Object.entries(drafts);
    const marked = entries.filter(([, d]) => d.status !== null);
    if (marked.length === 0) {
      return { ok: false, reason: 'Mark at least one learner before saving.' };
    }
    const absentMissingReason = marked.filter(
      ([, d]) => d.status === 'Absent' && !d.excuse_reason
    );
    if (absentMissingReason.length > 0) {
      return {
        ok: false,
        reason: `Pick an excuse reason for ${absentMissingReason.length} absent learner(s).`,
      };
    }
    return { ok: true as const };
  }, [drafts]);

  const handleChange = (team_member_id: string, next: DraftRecord) => {
    setDrafts((prev) => ({ ...prev, [team_member_id]: next }));
  };

  const handleMarkAllPresent = () => {
    if (!data) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const team of data.teams) {
        for (const m of team.members) {
          next[m.team_member_id] = { status: 'Present' };
        }
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!data) return;
    if (!validation.ok) {
      toast({
        title: 'Cannot save yet',
        description: validation.reason,
        variant: 'destructive',
      });
      return;
    }

    // Build records from drafts. Skip unmarked rows — they stay unmarked, not
    // a default of present (per spec safety: explicit > implicit).
    const records: AttendanceRecordInput[] = [];
    const absentForEscalation: Array<{
      team_member_id: string;
      learner_id: string | null;
      reason: ExcuseReason;
    }> = [];

    for (const team of data.teams) {
      for (const m of team.members) {
        const d = drafts[m.team_member_id];
        if (!d || d.status === null) continue;
        const rec: AttendanceRecordInput = {
          team_member_id: m.team_member_id,
          registration_id: m.registration_id,
          status: d.status,
        };
        if (d.status === 'Absent' && d.excuse_reason) {
          rec.excuse_reason = d.excuse_reason;
          absentForEscalation.push({
            team_member_id: m.team_member_id,
            learner_id: m.learner_id,
            reason: d.excuse_reason,
          });
        }
        records.push(rec);
      }
    }

    try {
      await markMutation.mutateAsync({
        cycle_id: data.cycle_id,
        section_id: sectionId,
        records,
      });

      toast({
        title: 'Attendance saved',
        description: `${records.length} learner record(s) recorded for ${data.cycle_name}.`,
      });

      // Best-effort fan-out of escalations — non-blocking.
      for (const a of absentForEscalation) {
        escalateMutation.mutate({
          cycle_id: data.cycle_id,
          section_id: sectionId,
          team_member_id: a.team_member_id,
          learner_id: a.learner_id,
          reason: a.reason,
        });
      }
    } catch (err) {
      toast({
        title: 'Save failed',
        description:
          err instanceof Error
            ? err.message
            : 'Could not save attendance. Try again.',
        variant: 'destructive',
      });
    }
  };

  // --- Render ------------------------------------------------------------

  if (!hasSectionAccess) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Access denied</AlertTitle>
        <AlertDescription>
          {accessDenialReason ??
            'You are not the assigned class incharge for this section.'}
        </AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Failed to load roster</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : 'Unknown error.'}
        </AlertDescription>
      </Alert>
    );
  }

  if (!data) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>No active AI Pulse cycle</AlertTitle>
        <AlertDescription>
          There is no AI Pulse cycle currently in planning, execution, or live
          status. Ask the Champion to open a cycle.
        </AlertDescription>
      </Alert>
    );
  }

  if (data.teams.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>No teams in this section yet</AlertTitle>
        <AlertDescription>
          {data.cycle_name} is open, but no teams have been formed for{' '}
          {data.section_name ?? 'this section'} yet.
        </AlertDescription>
      </Alert>
    );
  }

  const isSaving = markMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Cycle header + stats */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div>
          <h2 className="text-lg font-semibold">{data.cycle_name}</h2>
          <p className="text-sm text-muted-foreground">
            Section: {data.section_name ?? sectionId}
            {data.cycle_week_start_date && (
              <>
                {' '}· Week of{' '}
                {new Date(data.cycle_week_start_date).toLocaleDateString()}
              </>
            )}
            {' '}· {data.teams.length} team(s) · {totalLearners} learner(s)
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">
            {stats.present} present
          </Badge>
          <Badge variant="default" className="bg-amber-500 hover:bg-amber-600">
            {stats.late} late
          </Badge>
          <Badge variant="destructive">{stats.absent} absent</Badge>
          {stats.unmarked > 0 && (
            <Badge variant="outline">{stats.unmarked} unmarked</Badge>
          )}
        </div>
      </div>

      {/* Bulk actions */}
      {canMark && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllPresent}
            disabled={isSaving}
            className="gap-2"
          >
            <UserCheck className="h-4 w-4" />
            Mark all present
          </Button>
          <p className="text-xs text-muted-foreground">
            Tip: pick Absent + reason for any learner missing the live session.
          </p>
        </div>
      )}

      {!canMark && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Read-only view</AlertTitle>
          <AlertDescription>
            You don&apos;t have the <code>aiPulse:attendance.mark</code>{' '}
            permission. Ask an admin to grant it.
          </AlertDescription>
        </Alert>
      )}

      {/* Teams */}
      <div className="space-y-4">
        {data.teams.map((team) => (
          <TeamRow
            key={team.registration_id}
            team={team}
            drafts={drafts}
            disabled={!canMark || isSaving}
            onChange={handleChange}
          />
        ))}
      </div>

      {/* Save bar */}
      {canMark && (
        <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-border bg-background/95 backdrop-blur px-4 py-3 -mx-4 sm:-mx-6">
          <div className="text-xs text-muted-foreground">
            {validation.ok
              ? `Ready to save ${
                  Object.values(drafts).filter((d) => d.status !== null).length
                } record(s).`
              : validation.reason}
          </div>
          <Button
            onClick={handleSave}
            disabled={!validation.ok || isSaving}
            className="gap-2"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isSaving ? 'Saving...' : 'Save attendance'}
          </Button>
        </div>
      )}
    </div>
  );
}
