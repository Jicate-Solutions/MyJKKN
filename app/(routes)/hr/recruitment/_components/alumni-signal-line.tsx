'use client';

/**
 * AlumniSignalLine — T8.5
 *
 * Compact one-line rendering of a JKKN history payload, suitable for
 * list rows (approvals queue, candidates list) where space is tight.
 *
 * Shows up to 4 segments separated by " · ":
 *   1. Course + graduation year (alumni anchor)   → "BE.CSE · 2018"
 *   2. Staff tenure                               → "Staff 4y · Asst Prof"
 *   3. Council role                                → "LC · Tech Sec, 2022"
 *   4. Solutions Hub × N OR Bug Reports × N       → engagement signal
 *
 * Returns null when payload is null — callers don't need to guard.
 */

import type { AlumniSignalPayload } from '@/lib/services/hr/alumni-signal-service';
import { GraduationCap } from 'lucide-react';

interface Props {
  signal: AlumniSignalPayload | null | undefined;
  className?: string;
}

export function AlumniSignalLine({ signal, className }: Props) {
  if (!signal) return null;

  const segments: string[] = [];

  // 1. Academic anchor
  if (signal.graduation_year && signal.graduation_year > 0) {
    const academic = [signal.course_name, String(signal.graduation_year)]
      .filter(Boolean)
      .join(' · ');
    if (academic) segments.push(academic);
  }

  // 2. Staff tenure (T8.5)
  if (signal.staff_tenure) {
    const t = signal.staff_tenure;
    const tenurePart = t.years > 0
      ? `${t.still_active ? 'Staff' : 'Ex-staff'} ${t.years}y`
      : t.still_active
        ? 'Staff'
        : 'Ex-staff';
    const designationPart = t.designation ? ` · ${t.designation}` : '';
    segments.push(`${tenurePart}${designationPart}`);
  }

  // 3. Council role
  if (signal.council_role) {
    segments.push(
      `LC · ${signal.council_role.position_title}, ${signal.council_role.term_name}`
    );
  }

  // 4. Engagement (pick the strongest single signal — keep line short)
  if (signal.sh_contributions && signal.sh_contributions > 0) {
    segments.push(`Solutions Hub × ${signal.sh_contributions}`);
  } else if (signal.lc_committee_count && signal.lc_committee_count > 0) {
    segments.push(`LC committees × ${signal.lc_committee_count}`);
  } else if (signal.bug_reports_filed && signal.bug_reports_filed > 0) {
    segments.push(`Bug reports × ${signal.bug_reports_filed}`);
  } else if (signal.lc_events_attended && signal.lc_events_attended > 0) {
    segments.push(`LC events × ${signal.lc_events_attended}`);
  }

  if (segments.length === 0) return null;

  return (
    <p
      className={[
        'text-xs text-indigo-700 dark:text-indigo-300 mt-0.5 flex items-center gap-1',
        className ?? '',
      ].join(' ')}
      title="JKKN history"
    >
      <GraduationCap className="h-3 w-3 shrink-0" />
      <span className="truncate">{segments.join(' · ')}</span>
    </p>
  );
}
