// ============================================
// SALARY START DATES — "today" and "1st of next month", in India time
// ============================================
// Created: 2026-09-30
// The database refuses a salary change that starts before today in India
// (20270603090000_hr_salary_no_backdating.sql). Today itself is allowed.
// Director's ruling (2026-09-30): a raise entered late starts from the 1st of
// NEXT month; the missed month is not paid back through the system.
// These helpers give every salary form the same two dates. Plain yyyy-mm-dd
// strings, so they compare correctly as text.
// ============================================

/** Today in India (Asia/Kolkata) as yyyy-mm-dd. */
export function todayIST(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** The 1st of next month, counted from today in India, as yyyy-mm-dd. */
export function firstOfNextMonthIST(now: Date = new Date()): string {
  const [y, m] = todayIST(now).split('-').map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  return `${nextY}-${String(nextM).padStart(2, '0')}-01`;
}

/** True when a yyyy-mm-dd date is before today in India. Blank is not "past". */
export function isBeforeTodayIST(date: string, now: Date = new Date()): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date < todayIST(now);
}

/**
 * The start date the Employee Salaries dialog opens on (panel round 1,
 * 2026-10-09). A change already saved for later keeps its own start, today or
 * later, so editing only its amount does not move it to another month. Any
 * other row (started, no start, or none recorded) gives the 1st of next month.
 * The staff form's salaryWritePlan keeps an untouched future start the same way.
 */
export function salaryDialogStart(newestRowStart: string | null, now: Date = new Date()): string {
  if (newestRowStart && /^\d{4}-\d{2}-\d{2}$/.test(newestRowStart) && newestRowStart >= todayIST(now)) {
    return newestRowStart;
  }
  return firstOfNextMonthIST(now);
}
