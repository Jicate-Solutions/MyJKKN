'use client';

// The identity block for an appointed Senior Peer Mentor.
//
// ONE COPY, used by both the event page's volunteers card and the /mentors
// console. Those two rendered a byte-identical "<register number> · cap N" line,
// and appoint-mentor-dialog already carries a note about what that duplication
// cost the last time the copy drifted — so this block starts shared rather than
// getting split later.
//
// Every field except the name is nullable by design: the roster RPC LEFT JOINs
// the academic tables so a mentor whose section or semester is unset still
// appears. A blank segment is therefore normal and is simply dropped, never
// rendered as "null" and never allowed to swallow the row.
import { Mail, Phone } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { FeedbackVolunteer } from '@/lib/services/induction/induction-volunteer-service';

/** Joins the parts that are actually present with a middot. Returns null when
 *  nothing survives, so the caller can drop the whole line instead of rendering
 *  a stray separator. */
function line(...parts: (string | null | undefined | false)[]): string | null {
  const kept = parts.filter((p): p is string => Boolean(p && String(p).trim()));
  return kept.length ? kept.join(' · ') : null;
}

export function MentorIdentity({ mentor }: { mentor: FeedbackVolunteer }) {
  const email = mentor.college_email || mentor.student_email;

  const ids = line(
    mentor.register_number,
    mentor.roll_number && `Roll ${mentor.roll_number}`,
    `cap ${mentor.capacity}`,
  );

  const placement = line(
    mentor.semester_name,
    mentor.section_name && `Section ${mentor.section_name}`,
    mentor.program_name,
  );

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-medium truncate">{mentor.full_name || 'Unnamed'}</span>
        {mentor.year_of_study != null && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
            Year {mentor.year_of_study}
          </Badge>
        )}
      </div>

      {/* Fall back to the em dash only when there is genuinely no identifier at
          all — otherwise an admin can't tell "no data" from "not rendered". */}
      <div className="text-xs text-muted-foreground truncate">{ids ?? '—'}</div>

      {placement && (
        <div className="text-[11px] text-muted-foreground truncate">{placement}</div>
      )}

      {(email || mentor.student_mobile) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          {email && (
            <span className="inline-flex items-center gap-1 min-w-0">
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">{email}</span>
            </span>
          )}
          {mentor.student_mobile && (
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3 w-3 shrink-0" />
              {mentor.student_mobile}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
