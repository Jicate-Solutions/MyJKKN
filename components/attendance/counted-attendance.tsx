// components/attendance/counted-attendance.tsx
//
// ONE rendering of "which days this percentage counted", shared by the three
// surfaces that print an attendance fraction next to an attendance percentage:
//
//   1. the Registrar's exam audit drill-down,
//   2. the learner's own eligibility card,
//   3. the employer-facing Verified Skills Record (own view + share link).
//
// WHY IT EXISTS
// -------------
// Since the on-duty protection change, the percentage credits days the learner
// was marked absent while an approved tournament or on-duty permission covered
// them — the "With Attendance" line on the Principal's letter. The raw marked
// record stays untouched, so the marked count and the counted count are two
// different numbers, and a surface that prints the raw fraction beside the
// credited percentage contradicts itself (52/70 next to 78.6%).
//
// The rule here is: print the numerator the percentage is ACTUALLY built from,
// and say out loud where the difference came from. Never fold an excused day
// silently into "present" — a protected day must stay explainable to an
// examiner, and an employer reading a share link must be able to do the
// arithmetic themselves without a legend:
//
//     55/70 · 78.6%
//     52 attended + 3 on college duty
//
// When nothing is excused (the ordinary case) this renders exactly what the
// surfaces rendered before: "52/70 · 74.3%", one line, no extra wording.
//
// Pure and hook-free on purpose, so the public /proof/[token] page can render
// it on the server.

/** The wording every surface uses for a credited day. Kept here so the three
 *  surfaces cannot drift into three different names for the same thing. */
export const EXCUSED_LABEL = 'on college duty';

/** The full sentence behind the short label, offered as a hover title. */
export const EXCUSED_NOTE =
  'Days the college approved as tournament or on-duty representation. They were not attended; they count because the college sent the learner.';

export interface CountedAttendanceValue {
  /** Days actually marked present in session. */
  attended: number;
  /** Days marked absent that an approved permission excuses. */
  excused: number;
  /** Sessions held. */
  total: number;
  /** The percentage as the platform computes it, already rounded. */
  pct: number | null;
}

function safeCount(n: number | null | undefined): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

/** attended + excused — the numerator the percentage is actually built from. */
export function countedPresent(value: {
  attended: number | null;
  excused: number | null;
}): number {
  return safeCount(value.attended) + safeCount(value.excused);
}

/** The line that explains the gap between attended and counted. Renders
 *  nothing when there is no gap, so ordinary rows stay exactly as they were. */
export function ExcusedNote({
  value,
  className = '',
}: {
  value: CountedAttendanceValue;
  className?: string;
}) {
  const excused = safeCount(value.excused);
  if (excused <= 0) return null;
  return (
    <span
      className={`block text-xs font-normal text-muted-foreground ${className}`.trim()}
      title={EXCUSED_NOTE}
    >
      {safeCount(value.attended)} attended + {excused} {EXCUSED_LABEL}
    </span>
  );
}

/** counted/total (· pct), with the explanation underneath when one is owed. */
export function CountedAttendance({
  value,
  className = '',
}: {
  value: CountedAttendanceValue;
  className?: string;
}) {
  const excused = safeCount(value.excused);
  const pctSuffix = value.pct === null ? '' : ` · ${value.pct}%`;
  return (
    <span className={className || undefined}>
      <span className="block" title={excused > 0 ? EXCUSED_NOTE : undefined}>
        {countedPresent(value)}/{safeCount(value.total)}
        {pctSuffix}
      </span>
      <ExcusedNote value={value} />
    </span>
  );
}
