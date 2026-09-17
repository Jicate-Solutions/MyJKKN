/**
 * Status for the list badge, DERIVED — never the stored `is_active` alone.
 *
 * 2026-08-31: a timetable whose end_date had passed still read "Active". The
 * nightly `fn_deactivate_ended_timetables` cron is not at fault — it runs at
 * 00:15 IST and has succeeded every day — but the boolean it maintains is only
 * ever a snapshot, and this cell printed the snapshot:
 *
 *   - templates are DELIBERATELY skipped by that job (`is_template = false` in
 *     its WHERE), so an expired template keeps `is_active = true` forever and
 *     is precisely the row that was reported;
 *   - between midnight IST and the job there is a real, if brief, stale window;
 *   - nothing at all deactivates a timetable whose start_date is still ahead.
 *
 * Deriving instead of writing keeps the fix read-only: the job stays the single
 * writer of `is_active`, and no screen can disagree with the dates on the row.
 *
 * Dates are compared as plain ISO strings in IST — NOT `new Date(...)`, which
 * parses a bare 'YYYY-MM-DD' as UTC midnight and renders a day early at any
 * negative offset.
 */
export function timetableStatus({
  isActive,
  isTemplate,
  startDate,
  endDate
}: {
  isActive: boolean;
  isTemplate: boolean;
  startDate: string | null;
  endDate: string | null;
}): { label: string; className: string } {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

  // A template is a shape to copy, not a schedule that runs — but only an
  // INACTIVE one. BUG-006045 (2026-09-15): "Save as Template" used to flag the
  // live row in place, so an active, in-window schedule being marked every day
  // read "Template" here and looked like it wasn't running. An active row
  // reports its date-derived status whatever its template flag says.
  if (isTemplate && !isActive) {
    return {
      label: 'Template',
      className: 'bg-purple-50 text-purple-700 border-purple-200'
    };
  }
  if (!isActive) {
    return {
      label: 'Inactive',
      className: 'bg-gray-50 text-gray-700 border-gray-200'
    };
  }
  if (endDate && endDate.slice(0, 10) < today) {
    return {
      label: 'Expired',
      className: 'bg-amber-50 text-amber-700 border-amber-200'
    };
  }
  if (startDate && startDate.slice(0, 10) > today) {
    return {
      label: 'Scheduled',
      className: 'bg-blue-50 text-blue-700 border-blue-200'
    };
  }
  return {
    label: 'Active',
    className: 'bg-green-50 text-green-700 border-green-200'
  };
}
