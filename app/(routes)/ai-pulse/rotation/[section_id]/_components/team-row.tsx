// app/(routes)/ai-pulse/rotation/[section_id]/_components/team-row.tsx
// Wave B.3 — render one team's members as a list with per-row attendance
// toggle + excuse-reason dropdown for Absent rows.
//
// Stateless: parent (section-roster) holds the working draft; this component
// renders + emits onChange events.

'use client';

import { Badge } from '@/components/ui/badge';
import { Crown, Mail } from 'lucide-react';
import { AttendanceToggle } from './attendance-toggle';
import { ExcuseReasonSelect } from './excuse-reason-select';
import type {
  AttendanceStatus,
  ExcuseReason,
  SectionTeam,
} from '@/lib/services/ai-pulse/rotation-service';

/** Working state for one learner inside the editable roster. */
export interface DraftRecord {
  status: AttendanceStatus | null;
  excuse_reason?: ExcuseReason;
}

interface TeamRowProps {
  team: SectionTeam;
  /** Map of team_member_id → current draft record. */
  drafts: Record<string, DraftRecord>;
  disabled?: boolean;
  onChange: (
    team_member_id: string,
    next: DraftRecord
  ) => void;
}

export function TeamRow({ team, drafts, disabled, onChange }: TeamRowProps) {
  const memberCount = team.members.length;
  const presentCount = team.members.filter(
    (m) => drafts[m.team_member_id]?.status === 'Present'
  ).length;
  const absentCount = team.members.filter(
    (m) => drafts[m.team_member_id]?.status === 'Absent'
  ).length;
  const lateCount = team.members.filter(
    (m) => drafts[m.team_member_id]?.status === 'Late'
  ).length;

  return (
    <section
      className="rounded-lg border border-border bg-card overflow-hidden"
      aria-label={`Team ${team.team_name}`}
    >
      {/* Team header */}
      <header className="flex items-center justify-between gap-3 px-4 py-3 bg-muted/40 border-b border-border">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">{team.team_name}</h3>
          {team.team_code && (
            <Badge variant="outline" className="font-mono text-xs">
              {team.team_code}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {memberCount} {memberCount === 1 ? 'learner' : 'learners'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {presentCount > 0 && (
            <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">
              {presentCount} present
            </Badge>
          )}
          {lateCount > 0 && (
            <Badge variant="default" className="bg-amber-500 hover:bg-amber-600">
              {lateCount} late
            </Badge>
          )}
          {absentCount > 0 && (
            <Badge variant="destructive">{absentCount} absent</Badge>
          )}
        </div>
      </header>

      {/* Member rows */}
      <ul className="divide-y divide-border">
        {team.members.map((m) => {
          const draft = drafts[m.team_member_id] ?? { status: null };
          const isAbsent = draft.status === 'Absent';
          return (
            <li
              key={m.team_member_id}
              className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {m.is_leader && (
                    <Crown
                      className="h-3.5 w-3.5 text-amber-500"
                      aria-label="Team leader"
                    />
                  )}
                  <span className="text-sm font-medium truncate">
                    {m.full_name}
                  </span>
                  {m.roll_number && (
                    <Badge variant="outline" className="font-mono text-xs">
                      {m.roll_number}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                  <Mail className="h-3 w-3" />
                  <span className="truncate">{m.email}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <AttendanceToggle
                  value={draft.status}
                  disabled={disabled}
                  onChange={(next) =>
                    onChange(m.team_member_id, {
                      // Clear excuse reason when leaving Absent.
                      excuse_reason:
                        next === 'Absent' ? draft.excuse_reason : undefined,
                      status: next,
                    })
                  }
                />
                {isAbsent && (
                  <ExcuseReasonSelect
                    value={draft.excuse_reason}
                    disabled={disabled}
                    onChange={(reason) =>
                      onChange(m.team_member_id, {
                        status: 'Absent',
                        excuse_reason: reason,
                      })
                    }
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
