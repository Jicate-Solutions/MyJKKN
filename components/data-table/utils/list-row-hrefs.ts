/**
 * Where each opted-in list row opens.
 *
 * `rowHref` (see `./row-navigation`) shipped with `/organizations/institutions`
 * in #3738. This module carries the destinations for the other list pages that
 * opted in afterwards, as plain functions rather than closures written inline
 * in fourteen different `*-data-table.tsx` files.
 *
 * Why they live together:
 *   - they are pure, so they can be asserted directly (see
 *     `__tests__/data-table/list-row-hrefs.test.ts`) without mounting a client
 *     component or standing up a router;
 *   - "what does tapping a row on page X open?" is answerable by reading one
 *     file, which is the question the Director asked;
 *   - every builder returns `null` for a row with no usable identifier, so an
 *     incomplete row stays inert instead of navigating somewhere wrong. A row
 *     that looks tappable and goes nowhere is the bug being fixed here, not the
 *     fix.
 *
 * Each destination below is COPIED from the `<Link>` that already exists in
 * that page's `columns.tsx`. That link is the ground truth for the page's URL
 * shape — it is what tapping the name does today — so the row and the name
 * always agree. None of these encode the id, for the same reason: the existing
 * links interpolate it raw, and a row must not navigate anywhere different from
 * the link inside it.
 */

/** An identifier as it arrives from the table row. */
type RowId = string | number | null | undefined;

/**
 * `<base>/<id>`, or null when the row carries no usable id.
 *
 * Whitespace-only ids count as missing: a blank segment would produce the LIST
 * url with a trailing slash, i.e. a row that appears to open and reloads the
 * page you are already on.
 */
function detailHref(base: string, id: RowId): string | null {
  if (id === null || id === undefined) return null;

  const value = String(id).trim();
  if (!value) return null;

  return `${base}/${value}`;
}

/**
 * Attendance reports are grouped rows, and a group with no real report behind
 * it carries a synthesised placeholder id containing `%%drp:id:`. `columns.tsx`
 * already refuses to render a link for those rows; the row must refuse too, or
 * the whole row would navigate to a report that does not exist.
 */
export function attendanceReportRowHref(row: { id?: RowId }): string | null {
  if (typeof row.id === 'string' && row.id.includes('%%drp:id:')) return null;
  return detailHref('/academic/attendance/reports', row.id);
}

export function staffPlanningRowHref(row: { id?: RowId }): string | null {
  return detailHref('/academic/staff-planning', row.id);
}

/**
 * An admission application IS a lead — `/admission/applications/[id]` is a
 * client-side `router.replace` onto `/admission/leads/[id]`, and both the name
 * link and the row menu on the applications list already point straight at the
 * lead. The row goes where they go, skipping the redirect hop.
 */
export function admissionApplicationRowHref(row: { id?: RowId }): string | null {
  return detailHref('/admission/leads', row.id);
}

export function admissionLeadRowHref(row: { id?: RowId }): string | null {
  return detailHref('/admission/leads', row.id);
}

export function applicationRowHref(row: { id?: RowId }): string | null {
  return detailHref('/applications', row.id);
}

/**
 * A billing schedule row is a BILL, and there is no bill detail page:
 * `/billing/schedule/[id]` is a server redirect onto `[id]/edit`. The name link
 * in the row opens the learner's billing page instead, which is the read-only
 * destination, so the row opens that rather than dropping a thumb-tap straight
 * into an edit form.
 *
 * Keyed on `student_id`, not the row's own `id`.
 */
export function billingScheduleRowHref(row: {
  student_id?: RowId;
}): string | null {
  return detailHref('/billing/schedule/students', row.student_id);
}

export function maintenanceLogRowHref(row: { id?: RowId }): string | null {
  return detailHref('/resource-management/maintenance', row.id);
}

export function courseRowHref(row: { id?: RowId }): string | null {
  return detailHref('/organizations/courses', row.id);
}

export function courseMappingRowHref(row: { id?: RowId }): string | null {
  return detailHref('/organizations/courses/mappings', row.id);
}

export function degreeRowHref(row: { id?: RowId }): string | null {
  return detailHref('/organizations/degrees', row.id);
}

export function departmentRowHref(row: { id?: RowId }): string | null {
  return detailHref('/organizations/departments', row.id);
}

export function programRowHref(row: { id?: RowId }): string | null {
  return detailHref('/organizations/programs', row.id);
}

export function sectionRowHref(row: { id?: RowId }): string | null {
  return detailHref('/organizations/sections', row.id);
}

export function semesterRowHref(row: { id?: RowId }): string | null {
  return detailHref('/organizations/semesters', row.id);
}
