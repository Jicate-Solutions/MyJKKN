'use client';

/**
 * Which departments took part in one initiative, and where each one stands.
 *
 * NEVER A COUNT. "3 departments" is precisely the reading this feature exists
 * to prevent: a named department has been CLAIMED, not credited, and a claim
 * and a confirmation look identical once they are added together. So every
 * department is named, and a waiting name is styled so differently from a
 * confirmed one that the two cannot be skimmed as the same thing — dashed
 * amber outline against a solid green tick.
 */

import { Check, Clock, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  PARTICIPANT_STATUS_LABELS,
  PARTICIPANT_STATUS_SHORT,
  buildDepartmentNameMap,
  useEngagementParticipants,
  useSolutionDepartmentRows,
  type EngagementParticipant,
  type ParticipantConfirmationStatus,
} from './engagement-participants';

/**
 * Status colours use the 700 ramp in light mode, the only weight that clears
 * 4.5:1 on white (design-system/MASTER.md §6), paired with a dark-mode value.
 * The SHAPE differs too — dashed vs solid — so the distinction survives for a
 * reader who cannot separate the two hues.
 */
const STATUS_STYLES: Record<ParticipantConfirmationStatus, string> = {
  confirmed:
    'border-green-600 bg-green-50 text-green-800 dark:border-emerald-500/60 dark:bg-emerald-950/40 dark:text-emerald-300',
  pending:
    'border-dashed border-amber-500 bg-amber-50 text-amber-800 dark:border-amber-500/70 dark:bg-amber-950/30 dark:text-amber-300',
  declined:
    'border-red-500 bg-red-50 text-red-700 line-through dark:border-red-500/60 dark:bg-red-950/30 dark:text-red-400',
};

const STATUS_ICONS: Record<ParticipantConfirmationStatus, typeof Check> = {
  confirmed: Check,
  pending: Clock,
  declined: X,
};

interface EngagementParticipantsListProps {
  engagementId: string;
  /**
   * False when this build has no participants read at all. The panel says that
   * once, at the top; repeating it on every entry would be noise.
   */
  supported: boolean;
}

function participantName(
  participant: EngagementParticipant,
  names: Map<string, string>
): string {
  if (participant.department_name) return participant.department_name;
  const resolved = names.get(participant.department_id);
  if (resolved) return resolved;
  // Never a bare uuid, and never a silent blank: an unresolvable id is a real
  // state (a department outside the solution list, or a list that failed to
  // load) and the reader is told which kind of unknown this is.
  return 'A department this page cannot name';
}

export function EngagementParticipantsList({
  engagementId,
  supported,
}: EngagementParticipantsListProps) {
  const { data: participants, error } = useEngagementParticipants(engagementId, supported);

  const hasRows = !!participants && participants.length > 0;
  const { data: departmentRows = [] } = useSolutionDepartmentRows(hasRows);
  const names = buildDepartmentNameMap(departmentRows);

  if (!supported) return null;

  if (error) {
    return (
      <p className="text-xs text-amber-700 dark:text-amber-400">
        Which departments took part could not be read for this entry, so this line is empty for a
        reason that is not &ldquo;nobody else took part&rdquo;.
      </p>
    );
  }

  if (!participants) return null;

  if (participants.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No department is recorded against this entry yet.
      </p>
    );
  }

  const waiting = participants.filter((p) => p.confirmation_status === 'pending').length;

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Departments that ran it:</span>
        {participants.map((participant) => {
          const status = participant.confirmation_status;
          const Icon = STATUS_ICONS[status] ?? Clock;
          const style = STATUS_STYLES[status] ?? STATUS_STYLES.pending;
          const label = PARTICIPANT_STATUS_LABELS[status] ?? status;

          return (
            <Badge
              key={participant.id ?? participant.department_id}
              variant="outline"
              className={`text-xs font-normal gap-1 ${style}`}
              title={`${participantName(participant, names)} — ${label}`}
            >
              <Icon className="h-3 w-3 shrink-0" />
              <span>{participantName(participant, names)}</span>
              <span className="opacity-80">· {PARTICIPANT_STATUS_SHORT[status] ?? status}</span>
              {participant.is_lead ? <span className="opacity-80">· recorded it</span> : null}
            </Badge>
          );
        })}
      </div>

      {waiting > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {waiting === 1 ? 'One department has' : `${waiting} departments have`} not confirmed yet.
          Until they do, this work does not count towards them.
        </p>
      )}

      {participants
        .filter((p) => p.confirmation_status === 'declined' && p.decline_note)
        .map((p) => (
          <p
            key={`decline-${p.id ?? p.department_id}`}
            className="text-xs text-muted-foreground"
          >
            {participantName(p, names)} said why: {p.decline_note}
          </p>
        ))}
    </div>
  );
}
