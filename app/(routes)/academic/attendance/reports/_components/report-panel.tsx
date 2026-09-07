'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
	AlertCircle,
	FileSpreadsheet,
	FileText,
	Loader2,
	Printer,
	RefreshCw
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
	AttendanceReportAggregates,
	buildCourseSummary,
	buildLogBook,
	buildMonthly,
	buildStudentCoursePivot,
	buildStudentTotals,
	eligibilityOf,
	FALLBACK_SETTINGS,
	type AttendanceReportScope,
	type AttendanceReportSettings
} from '@/lib/services/academic/attendance-report-aggregates';
import {
	buildCourseSummaryPdf,
	buildDefaultersPdf,
	buildEligibilityPdf,
	buildLogBookPdf,
	buildMonthlyPdf,
	buildPendingEmptyPdf,
	buildPendingFacultyPdf,
	buildStudentCoursePdf,
	loadLogoDataUrl,
	type ReportLogos,
	type ReportMeta
} from '@/lib/utils/pdf-export/attendance-report-pdf';
import { getInstitutionHeader } from '@/lib/utils/internal-marks/institution-header';
import { AttendanceDashboardService } from '@/lib/services/academic/attendance-dashboard-service';
import {
	buildPendingFacultyReport,
	filterPendingPeriods,
	pendingOptions,
	type PendingOption
} from '@/lib/services/academic/attendance-pending-aggregates';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import type {
	PendingAttendancePeriod,
	PendingAttendanceResponse
} from '@/types/attendance-dashboard';
import { ORIENTATION_LABEL, type AttendanceReportTab } from './report-tabs';
import type { AttendanceReportsSearchParams } from './data-table-schema';

/**
 * Runs one report and renders its four outputs.
 *
 * Preview, PDF, Excel and print all read the same in-memory result, so what is
 * on screen is exactly what downloads - the failure mode of the old page, where
 * the export silently shipped only the visible page, is structurally impossible
 * here.
 */

type Matrix = { head: string[]; body: string[][] };
/** A report may lead with a summary table above its detail table. */
type Section = { caption: string; matrix: Matrix };

interface Props {
	tab: AttendanceReportTab;
	search: AttendanceReportsSearchParams;
	/**
	 * The signed-in user's own staff id, set ONLY when they are a plain faculty
	 * member. It narrows the Pending Attendance report to their own sessions.
	 *
	 * The other reports get that narrowing for free: their RPCs are SECURITY
	 * INVOKER over `student_attendance`, whose RLS already scopes a faculty
	 * caller to the sessions they teach. Pending Attendance reads `timetables`
	 * instead, and timetable visibility is institution-wide — so without this a
	 * lecturer opening the tab would be shown every colleague's backlog.
	 */
	facultyStaffId?: string | null;
}

type RequiredFilter = { key: keyof AttendanceReportsSearchParams; label: string };

/**
 * Institution, year and semester are required for the learner reports because
 * they read the per-learner attendance grain, and an unscoped call there once
 * exhausted the database's temp disk.
 *
 * Pending Attendance requires NOTHING, and runs on sight. It reads TIMETABLES
 * rather than the learner grain, and its whole purpose is to sweep for backlogs
 * - across every college by default, because "which faculty and which subjects
 * are behind?" is not a question anyone wants to ask one semester at a time.
 * The date window does the bounding instead.
 */
const REQUIRED_BY_TAB: Record<string, RequiredFilter[]> = {
	pending: []
};

const REQUIRED_DEFAULT: RequiredFilter[] = [
	{ key: 'institution_id', label: 'Institution' },
	{ key: 'academic_year_id', label: 'Academic Year' },
	{ key: 'semester_id', label: 'Semester' }
];

/**
 * Pending Attendance walks every marked day in the window to subtract what was
 * already done, and `student_attendance.attendance_data` averages ~18 KB of
 * roster JSON per row. Because the default scope is now EVERY college rather
 * than one, the default window is a week: ten colleges x 30 days would pull
 * hundreds of megabytes into the browser before the first table rendered.
 * A wider window is one date-picker away, and the panel says when it will hurt.
 */
const PENDING_DEFAULT_DAYS = 7;
/** Above this the run still proceeds, but the panel says it will be slow. */
const PENDING_SLOW_DAYS = 31;

/**
 * Colleges queried at once when sweeping every institution.
 *
 * One request per college is not an optimisation to undo: `institution_off_days`
 * is per-college, and the pending engine only subtracts declared holidays when
 * it is given a single institution. A single unscoped call would therefore
 * report every college's holidays as unmarked sessions. Running them separately
 * keeps the off-day rule intact and lets each row carry its own college.
 */
const INSTITUTION_CONCURRENCY = 3;

async function mapLimit<T, R>(
	items: T[],
	limit: number,
	fn: (item: T) => Promise<R>
): Promise<R[]> {
	const out: R[] = [];
	for (let i = 0; i < items.length; i += limit) {
		out.push(...(await Promise.all(items.slice(i, i + limit).map(fn))));
	}
	return out;
}

const ALL = 'all';

/**
 * Wait this long after the last filter change before a report runs itself.
 * Long enough to absorb a Year -> Semester -> Section sequence as one request;
 * short enough that a finished selection never feels ignored.
 */
const AUTO_RUN_DEBOUNCE_MS = 600;

const two = (n: number) => `${n.toFixed(2)}%`;

const dayCount = (from: string, to: string): number =>
	Math.max(
		0,
		Math.round(
			(new Date(`${to}T00:00:00`).getTime() -
				new Date(`${from}T00:00:00`).getTime()) /
				86_400_000
		)
	);

export function ReportPanel({ tab, search, facultyStaffId }: Props) {
	const isPending = tab.value === 'pending';

	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [matrix, setMatrix] = useState<Matrix | null>(null);
	const [summaries, setSummaries] = useState<Section[]>([]);
	const [notes, setNotes] = useState<string[]>([]);
	const [pdf, setPdf] = useState<(() => void) | null>(null);
	const [rowCount, setRowCount] = useState(0);
	const [settings, setSettings] =
		useState<AttendanceReportSettings>(FALLBACK_SETTINGS);

	/* ── Pending Attendance: the report's own faculty / subject narrowing ── */
	const [staffPick, setStaffPick] = useState<string>(ALL);
	const [subjectPick, setSubjectPick] = useState<string>(ALL);
	const [options, setOptions] = useState<{
		faculty: PendingOption[];
		subjects: PendingOption[];
	}>({ faculty: [], subjects: [] });

	/**
	 * Last fetched pending periods, keyed by the scope that produced them.
	 *
	 * Choosing a faculty member or a subject re-derives all three tables from
	 * this instead of re-querying: the narrowing is a property of the report, not
	 * of the query, and re-fetching a week of roster JSON to hide rows already in
	 * memory would make the selects feel broken.
	 */
	const rawRef = useRef<{ key: string; periods: PendingAttendancePeriod[] } | null>(
		null
	);

	/**
	 * Only the pending report sweeps every college, so only it fetches the list.
	 *
	 * Called with the SAME options as the filter bar's Institution dropdown
	 * (hooks default to entityType 'institution'; the hook widens that to every
	 * entity type for a super admin on its own). "All Institutions" in the report
	 * therefore covers exactly the set that dropdown offered — a report that
	 * silently swept colleges the picker never listed would be impossible to
	 * reconcile against.
	 */
	const { institutions, loading: institutionsLoading } =
		useInstitutionsWithAccess({ autoFetch: isPending });

	const required = REQUIRED_BY_TAB[tab.value] ?? REQUIRED_DEFAULT;

	const missing = useMemo(
		() => required.filter((r) => !search[r.key]).map((r) => r.label),
		[search, required]
	);

	const scope: AttendanceReportScope | null = useMemo(() => {
		if (missing.length) return null;
		const from = search.dateRange?.from;
		const to = search.dateRange?.to;
		const iso = (d: Date) => d.toISOString().slice(0, 10);
		const defaultDays = isPending ? PENDING_DEFAULT_DAYS : 365;
		// The explicit From/To fields win over the DataTable's dateRange blob, which
		// wins over the trailing default.
		const explicitFrom = search.date_from || null;
		const explicitTo = search.date_to || null;
		return {
			// Empty means "every college I can see" — legal for the pending report,
			// impossible for the others, which list Institution as required above.
			institution_id: search.institution_id ? String(search.institution_id) : '',
			// Without an explicit range, fall back to a trailing window. The RPCs
			// refuse an unbounded one - an unscoped call once exhausted the
			// database's temp disk.
			date_from:
				explicitFrom ??
				(from ? iso(from) : iso(new Date(Date.now() - defaultDays * 864e5))),
			date_to: explicitTo ?? (to ? iso(to) : iso(new Date())),
			academic_year_id: search.academic_year_id || null,
			degree_id: search.degree_id || null,
			department_id: search.department_id || null,
			program_id: search.program_id || null,
			semester_id: search.semester_id || null,
			section_id: search.section_id || null
		};
	}, [search, missing.length, isPending]);

	/**
	 * Which colleges this run covers.
	 *
	 * An explicit institution filter wins; otherwise it is every college the
	 * caller can see, which `useInstitutionsWithAccess` already scopes by role.
	 */
	const targetInstitutions = useMemo(() => {
		if (!scope) return [];
		if (scope.institution_id) return [scope.institution_id];
		return institutions.map((i) => i.id);
	}, [scope, institutions]);

	/**
	 * Identity of the FETCH, not of the report. The faculty and subject selects
	 * are deliberately absent: they narrow what is already in `rawRef`, and
	 * including them here would throw the cache away on every selection.
	 */
	const fetchKey = useMemo(
		() =>
			scope
				? JSON.stringify([
						scope,
						targetInstitutions,
						search.faculty_id || facultyStaffId || null
					])
				: '',
		[scope, targetInstitutions, search.faculty_id, facultyStaffId]
	);

	// The filter bar can override for a single run; otherwise the institution's
	// configured rule applies, falling back to the built-in default.
	const threshold = search.attendance_threshold || settings.attendance_threshold;
	const floor = settings.condonation_floor;

	/**
	 * Serial number of the newest run. A run whose number is no longer current
	 * discards its own result.
	 *
	 * Auto-running makes this necessary rather than defensive: changing the date
	 * range and then a faculty selection starts two runs, and without the guard
	 * the slower first one lands last and overwrites the report the user is
	 * actually looking at.
	 */
	const runSeq = useRef(0);

	const run = useCallback(async () => {
		if (!scope) return;
		// Sweeping every college needs the college list first. Returning quietly
		// rather than erroring: the auto-run effect fires again the moment the
		// list arrives, so this is a wait, not a failure.
		if (!targetInstitutions.length) return;

		const seq = ++runSeq.current;
		const current = () => runSeq.current === seq;

		setLoading(true);
		setError(null);
		setMatrix(null);
		setSummaries([]);
		setNotes([]);
		setPdf(null);

		try {
			// A cluster-wide run has no single letterhead. Synthesising the trust
			// name is not cosmetic: `getInstitutionHeader(undefined)` falls back to
			// the Arts & Science stationery, so a report spanning ten colleges
			// would print one college's name and accreditation across all of them.
			const allColleges = !scope.institution_id;
			const [institution, loaded] = allColleges
				? [
						{
							name: 'JKKN Educational Institutions',
							logo_url: null,
							address: null,
							affiliation: null
						},
						FALLBACK_SETTINGS
					]
				: await Promise.all([
						AttendanceReportAggregates.getInstitutionHeader(scope.institution_id),
						AttendanceReportAggregates.getSettings(scope.institution_id)
					]);
			setSettings(loaded);
			const activeThreshold =
				search.attendance_threshold || loaded.attendance_threshold;

			// Dual letterhead marks, exactly as the Internal Mark Report loads them:
			// the trust logo at the left margin, the college's own at the right. The
			// institution's stored logo_url wins when it has one; otherwise fall
			// back to the same per-college asset the mark report resolves, so both
			// documents show the same mark for the same college.
			const branding = getInstitutionHeader(institution?.name);
			const [leftLogo, rightLogo] = await Promise.all([
				loadLogoDataUrl(branding.logoImage || '/logo.png'),
				loadLogoDataUrl(institution?.logo_url || branding.rightLogoImage)
			]);
			const logos: ReportLogos = { left: leftLogo, right: rightLogo };

			const meta: ReportMeta = {
				institution,
				title: tab.label,
				subtitle: allColleges
					? [`All Institutions (${targetInstitutions.length})`]
					: undefined,
				dateFrom: scope.date_from,
				dateTo: scope.date_to,
				// The pending report is not measured against a percentage, so
				// printing a threshold on it would only invite the wrong reading.
				threshold: isPending ? undefined : activeThreshold
			};

			let built: {
				matrix: Matrix;
				summaries?: Section[];
				notes?: string[];
				make: () => void;
				rows: number;
			};

			switch (tab.value) {
				case 'student-course': {
					const pivot = buildStudentCoursePivot(
						await AttendanceReportAggregates.studentCourse(scope)
					);
					built = {
						rows: pivot.rows.length,
						matrix: {
							head: [
								'S.No',
								'Roll No',
								'Student Name',
								...pivot.courses.map((c) => c.course_code),
								'Overall %'
							],
							body: pivot.rows.map((r, i) => [
								String(i + 1),
								r.roll_number || '—',
								r.student_name || '—',
								...pivot.courses.map((c) => {
									const cell = r.cells[c.course_id];
									return cell
										? `${cell.present}/${cell.conducted} · ${two(cell.percentage)}`
										: '—';
								}),
								two(r.percentage)
							])
						},
						make: () =>
							buildStudentCoursePdf(pivot, meta, logos).save(
								`student-course-attendance-${scope.date_to}.pdf`
							)
					};
					break;
				}

				case 'log-book': {
					const pivot = buildLogBook(
						await AttendanceReportAggregates.studentDay(scope)
					);
					built = {
						rows: pivot.rows.length,
						matrix: {
							head: [
								'S.No',
								'Roll No',
								'Student Name',
								...pivot.dates.map((d) => d.slice(5)),
								'P',
								'A',
								'OD',
								'Total',
								'%'
							],
							body: pivot.rows.map((r, i) => [
								String(i + 1),
								r.roll_number || '—',
								r.student_name || '—',
								...pivot.dates.map((d) => r.codes[d] || '–'),
								String(r.present),
								String(r.absent),
								String(r.od),
								String(r.conducted),
								two(r.percentage)
							])
						},
						make: () =>
							buildLogBookPdf(pivot, meta, logos).save(
								`attendance-log-book-${scope.date_to}.pdf`
							)
					};
					break;
				}

				case 'monthly': {
					const pivot = buildMonthly(
						await AttendanceReportAggregates.studentMonth(scope)
					);
					built = {
						rows: pivot.rows.length,
						matrix: {
							head: [
								'S.No',
								'Roll No',
								'Student Name',
								...pivot.months.map((m) => m.slice(0, 7)),
								'Cumulative %'
							],
							body: pivot.rows.map((r, i) => [
								String(i + 1),
								r.roll_number || '—',
								r.student_name || '—',
								...pivot.months.map((m) => {
									const c = r.cells[m];
									return c
										? `${c.present}/${c.conducted} · ${two(c.percentage)}`
										: '—';
								}),
								two(r.percentage)
							])
						},
						make: () =>
							buildMonthlyPdf(pivot, meta, logos).save(
								`monthly-attendance-${scope.date_to}.pdf`
							)
					};
					break;
				}

				case 'defaulters': {
					const totals = buildStudentTotals(
						await AttendanceReportAggregates.studentCourse(scope),
						loaded
					);
					const below = totals.filter((t) => t.percentage < activeThreshold);
					built = {
						rows: below.length,
						matrix: {
							head: [
								'S.No',
								'Roll No',
								'Student Name',
								'Total',
								'Present',
								'OD',
								'Absent',
								'%',
								'Shortage',
								'Status'
							],
							body: below.map((t, i) => [
								String(i + 1),
								t.roll_number || '—',
								t.student_name || '—',
								String(t.conducted),
								String(t.present),
								String(t.od),
								String(t.absent),
								two(t.percentage),
								two(Math.max(0, activeThreshold - t.percentage)),
								eligibilityOf(t.percentage, activeThreshold, loaded.condonation_floor)
							])
						},
						make: () =>
							buildDefaultersPdf(totals, meta, logos).save(
								`low-attendance-${scope.date_to}.pdf`
							)
					};
					break;
				}

				case 'course-summary': {
					const courses = buildCourseSummary(
						await AttendanceReportAggregates.studentCourse(scope)
					);
					built = {
						rows: courses.length,
						matrix: {
							head: [
								'S.No',
								'Course Code',
								'Course Name',
								'Students',
								'Present',
								'Absent',
								'OD',
								'Conducted',
								'%'
							],
							body: courses.map((c, i) => [
								String(i + 1),
								c.course_code,
								c.course_name,
								String(c.students),
								String(c.present),
								String(c.absent),
								String(c.od),
								String(c.conducted),
								two(c.percentage)
							])
						},
						make: () =>
							buildCourseSummaryPdf(courses, meta, logos).save(
								`course-attendance-summary-${scope.date_to}.pdf`
							)
					};
					break;
				}

				case 'eligibility': {
					const totals = buildStudentTotals(
						await AttendanceReportAggregates.studentCourse(scope),
						loaded
					);
					built = {
						rows: totals.length,
						matrix: {
							head: [
								'S.No',
								'Roll No',
								'Student Name',
								'Overall %',
								'OD Adjusted %',
								'Condonation',
								'Exam Eligibility'
							],
							body: totals.map((t, i) => {
								const status = eligibilityOf(
									t.odAdjusted,
									activeThreshold,
									loaded.condonation_floor
								);
								return [
									String(i + 1),
									t.roll_number || '—',
									t.student_name || '—',
									two(t.percentage),
									two(t.odAdjusted),
									status === 'Condonation Required' ? 'Required' : 'No',
									status === 'Eligible' ? 'Eligible' : 'Pending'
								];
							})
						},
						make: () =>
							buildEligibilityPdf(totals, meta, logos).save(
								`exam-eligibility-${scope.date_to}.pdf`
							)
					};
					break;
				}

				case 'pending': {
					// Deliberately the SAME call the /academic/attendance/pending page
					// makes. That engine already knows Saturday is a teaching day, that
					// cycle timetables key on "cycle-N", that a school's session_wise
					// timetable has FN/AN instead of periods, and that declared off-days
					// are not pending. A second implementation here would look correct
					// and quietly disagree with the page faculty are chased from.
					//
					// One request PER COLLEGE, not one unscoped request: the engine only
					// subtracts `institution_off_days` when it is handed a single
					// institution, so a cluster-wide call would report every college's
					// declared holidays as unmarked sessions.
					//
					// `limit` is set past any plausible result rather than paged: the
					// service paginates an in-memory array it has already built in full,
					// so asking for one page would cost the same and print a partial
					// report - the exact failure this panel exists to make impossible.
					const cached =
						rawRef.current?.key === fetchKey ? rawRef.current.periods : null;

					const periods =
						cached ??
						(
							await mapLimit<string, PendingAttendanceResponse>(
								targetInstitutions,
								INSTITUTION_CONCURRENCY,
								(institutionId) =>
									AttendanceDashboardService.getTodayPendingAttendance({
										institutionId,
										userInstitutionId: institutionId,
										startDate: scope.date_from,
										endDate: scope.date_to,
										academicYearId: scope.academic_year_id || undefined,
										degreeId: scope.degree_id || undefined,
										departmentId: scope.department_id || undefined,
										programId: scope.program_id || undefined,
										semesterId: scope.semester_id || undefined,
										sectionId: scope.section_id || undefined,
										// An explicit ?faculty_id= narrows to one member for a
										// one-to-one review; otherwise a plain faculty caller is
										// pinned to themselves and everyone else sees the scope.
										staffId: search.faculty_id || facultyStaffId || undefined,
										page: 1,
										limit: 100_000,
										sortBy: 'attendance_date',
										sortDirection: 'asc'
									})
							)
						).flatMap((r) => r.data);

					if (!cached) rawRef.current = { key: fetchKey, periods };

					// Options come from the UNFILTERED result so choosing a subject
					// never empties the faculty list you chose it from.
					const opts = pendingOptions(periods);
					setOptions(opts);

					// A selection that no longer exists in a freshly-fetched window
					// would silently return nothing. Drop it instead.
					const staffId = opts.faculty.some((o) => o.id === staffPick)
						? staffPick
						: null;
					const courseId = opts.subjects.some((o) => o.id === subjectPick)
						? subjectPick
						: null;

					const report = buildPendingFacultyReport(
						filterPendingPeriods(periods, { staffId, courseId })
					);
					const inst = report.showInstitution;

					const facultySection: Section = {
						caption: 'Faculty-wise pending attendance',
						matrix: {
							head: [
								'S.No',
								'Faculty Name',
								...(inst ? ['Institution'] : []),
								'Department',
								'Pending',
								'Overdue',
								'Today',
								'Subjects',
								'Classes',
								'Oldest Pending',
								'Max Days Late'
							],
							body: report.faculty.map((f, i) => [
								String(i + 1),
								f.faculty_name,
								...(inst ? [f.institution_name || '—'] : []),
								f.department_name || '—',
								String(f.pending),
								String(f.overdue),
								String(f.today),
								String(f.subjects),
								String(f.classes),
								f.oldest || '—',
								f.maxDaysLate > 0 ? String(f.maxDaysLate) : '—'
							])
						}
					};

					const subjectSection: Section = {
						caption: 'Subject-wise pending attendance',
						matrix: {
							head: [
								'S.No',
								'Course Code',
								'Course / Subject',
								...(inst ? ['Institution'] : []),
								'Pending',
								'Overdue',
								'Today',
								'Faculty',
								'Classes',
								'Oldest Pending'
							],
							body: report.subjects.map((s, i) => [
								String(i + 1),
								s.course_code,
								s.course_name,
								...(inst ? [s.institution_name || '—'] : []),
								String(s.pending),
								String(s.overdue),
								String(s.today),
								String(s.faculty),
								String(s.classes),
								s.oldest || '—'
							])
						}
					};

					const windowDays = dayCount(scope.date_from, scope.date_to);
					const narrowed = !!staffId || !!courseId;
					const runNotes = [
						`${report.periodCount} pending session${report.periodCount === 1 ? '' : 's'} · ` +
							`${report.faculty.length} faculty · ${report.subjects.length} subject${report.subjects.length === 1 ? '' : 's'} · ` +
							`${scope.date_from} to ${scope.date_to}` +
							(allColleges
								? ` · ${targetInstitutions.length} institutions`
								: '') +
							(narrowed ? ' · narrowed by your selection below' : ''),
						...(report.fannedOut
							? [
									'A co-taught session counts against every member assigned to it, so the faculty table sums to more than the session total. The subject table does not fan out.'
								]
							: []),
						...(report.unassigned > 0
							? [
									report.unassigned === 1
										? '1 pending session names no faculty on the timetable and is grouped under “Not assigned in timetable” — assign staff to that slot so it has an owner.'
										: `${report.unassigned} pending sessions name no faculty on the timetable and are grouped under “Not assigned in timetable” — assign staff to those slots so they have an owner.`
								]
							: []),
						...(windowDays > PENDING_SLOW_DAYS
							? [
									`This window is ${windowDays} days across ${targetInstitutions.length} institution${targetInstitutions.length === 1 ? '' : 's'}. Ranges beyond a month pull a lot of roster data — narrow the dates, or pick one institution, if the run drags.`
								]
							: [])
					];

					built = {
						rows: report.details.length,
						summaries: [facultySection, subjectSection],
						notes: runNotes,
						matrix: {
							head: [
								'S.No',
								'Faculty Name',
								'Course / Subject',
								'Class / Section',
								...(inst ? ['Institution'] : []),
								'Date',
								'Day',
								'Session / Period',
								'Attendance Status',
								'Pending Details'
							],
							body: report.details.map((d, i) => [
								String(i + 1),
								d.faculty_name,
								d.course,
								d.classSection,
								...(inst ? [d.institution_name || '—'] : []),
								d.date,
								d.day,
								d.session,
								d.status,
								d.detail
							])
						},
						make: () =>
							(report.details.length
								? buildPendingFacultyPdf(report, meta, logos)
								: buildPendingEmptyPdf(meta, logos)
							).save(`pending-attendance-${scope.date_to}.pdf`)
					};
					break;
				}

				default:
					throw new Error(`No builder for report "${tab.value}"`);
			}

			if (!current()) return;
			setMatrix(built.matrix);
			setSummaries(built.summaries ?? []);
			setNotes(built.notes ?? []);
			setRowCount(built.rows);
			setPdf(() => built.make);
		} catch (e) {
			if (!current()) return;
			setError(
				e instanceof Error ? e.message : 'Could not build this report.'
			);
		} finally {
			if (current()) setLoading(false);
		}
	}, [
		scope,
		targetInstitutions,
		fetchKey,
		isPending,
		tab.value,
		tab.label,
		search.attendance_threshold,
		search.faculty_id,
		facultyStaffId,
		staffPick,
		subjectPick
	]);

	/**
	 * Pending Attendance runs on sight, and re-runs whenever the scope or the
	 * faculty / subject selection changes.
	 *
	 * `run` is the dependency rather than a hand-written key list: it already
	 * closes over everything that changes the result, so the two cannot fall out
	 * of step. The fetch itself is cached against `fetchKey`, so a selection
	 * change re-derives the tables without going back to the database.
	 *
	 * The learner reports used to stay manual behind a "Run report" button,
	 * because firing the per-learner grain on every dropdown touch was too
	 * heavy. They now auto-run too — see the debounced effect below, which is
	 * what makes that safe: a burst of filter changes becomes one request, and
	 * nothing fires until Institution, Year and Semester are all chosen.
	 */
	/**
	 * Every report runs on its own once the required filters are set.
	 *
	 * Debounced rather than immediate: `run` changes identity on every filter
	 * change, and picking Institution, then Year, then Semester would otherwise
	 * fire three full per-learner reports, two of which get thrown away. The
	 * delay collapses a burst of filter changes into one request. `run` itself
	 * returns immediately while Institution / Year / Semester are missing, so
	 * nothing fires until the scope is actually valid.
	 */
	useEffect(() => {
		const handle = window.setTimeout(() => {
			void run();
		}, AUTO_RUN_DEBOUNCE_MS);
		return () => window.clearTimeout(handle);
	}, [run]);

	/**
	 * A new window or scope means a new set of faculty and subjects. Clearing the
	 * picks keeps the selects from displaying a name that is no longer in their
	 * own list. Setting a value that is already ALL is a no-op in React, so this
	 * costs nothing on the first render.
	 */
	useEffect(() => {
		setStaffPick(ALL);
		setSubjectPick(ALL);
	}, [fetchKey]);

	const exportExcel = useCallback(() => {
		if (!matrix) return;
		const wb = XLSX.utils.book_new();
		// Sheets are ordered as the PDF and the screen order them. A report whose
		// three outputs disagree about what comes first is one that gets quoted
		// from wrongly in a meeting.
		const used = new Set<string>();
		const sheetName = (raw: string) => {
			// Excel rejects []:*?/\ in a sheet name and caps it at 31 characters;
			// a collision silently drops a sheet, which is worse than a truncation.
			let name = raw.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet';
			let n = 2;
			while (used.has(name)) name = `${name.slice(0, 28)} ${n++}`;
			used.add(name);
			return name;
		};

		for (const s of summaries) {
			XLSX.utils.book_append_sheet(
				wb,
				XLSX.utils.aoa_to_sheet([s.matrix.head, ...s.matrix.body]),
				sheetName(s.caption)
			);
		}
		XLSX.utils.book_append_sheet(
			wb,
			XLSX.utils.aoa_to_sheet([matrix.head, ...matrix.body]),
			sheetName(summaries.length ? 'Session details' : tab.label)
		);
		XLSX.writeFile(wb, `${tab.value}-${new Date().toISOString().slice(0, 10)}.xlsx`);
	}, [matrix, summaries, tab.label, tab.value]);

	if (missing.length) {
		return (
			<Alert>
				<AlertCircle className='h-4 w-4' />
				<AlertDescription>
					Choose {missing.join(', ')} in the filters above to run this report.
					These are required — an unscoped attendance query is heavy enough to
					affect the whole database.
				</AlertDescription>
			</Alert>
		);
	}

	return (
		<Card>
			<CardContent className='space-y-4 p-6'>
				<div className='flex flex-wrap items-start justify-between gap-3'>
					<div className='space-y-1'>
						<div className='flex items-center gap-2'>
							<FileText className='h-4 w-4 text-muted-foreground' />
							<h3 className='font-semibold'>{tab.label}</h3>
							<Badge variant='secondary' className='font-normal'>
								{ORIENTATION_LABEL[tab.orientation]}
							</Badge>
						</div>
						<p className='max-w-prose text-sm text-muted-foreground'>
							{tab.description}
						</p>
					</div>

					<div className='flex flex-wrap items-center gap-2'>
						<Button
							onClick={() => {
								// Force a re-fetch: the cache is what makes the selects
								// instant, so "Refresh" has to be able to defeat it.
								rawRef.current = null;
								void run();
							}}
							disabled={loading}
							size='sm'
							variant='outline'
						>
							{loading ? (
								<Loader2 className='mr-2 h-4 w-4 animate-spin' />
							) : (
								<RefreshCw className='mr-2 h-4 w-4' />
							)}
							{loading ? 'Building…' : 'Refresh'}
						</Button>
						<Button
							variant='outline'
							size='sm'
							onClick={() => pdf?.()}
							disabled={!pdf}
						>
							<FileText className='mr-2 h-4 w-4' /> PDF
						</Button>
						<Button
							variant='outline'
							size='sm'
							onClick={exportExcel}
							disabled={!matrix}
						>
							<FileSpreadsheet className='mr-2 h-4 w-4' /> Excel
						</Button>
						<Button
							variant='outline'
							size='sm'
							onClick={() => window.print()}
							disabled={!matrix}
						>
							<Printer className='mr-2 h-4 w-4' /> Print
						</Button>
					</div>
				</div>

				{/* Faculty and Subject narrow the RESULT, so they live with the
				    report rather than in the shared filter bar: the other six reports
				    have no such parameter, and a control that silently does nothing on
				    five tabs out of seven is worse than no control. Options are drawn
				    from what is actually pending, with their counts, so the select
				    itself answers "who is behind?" before anything is chosen. */}
				{isPending && (options.faculty.length > 0 || options.subjects.length > 0) && (
					<div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-2xl'>
						<div className='space-y-1.5'>
							<Label htmlFor='pending-faculty' className='text-xs'>
								Faculty
							</Label>
							<Select value={staffPick} onValueChange={setStaffPick}>
								<SelectTrigger id='pending-faculty'>
									<SelectValue placeholder='All faculty' />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={ALL}>
										All faculty ({options.faculty.length})
									</SelectItem>
									{options.faculty.map((o) => (
										<SelectItem key={o.id} value={o.id}>
											{o.label} — {o.count}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className='space-y-1.5'>
							<Label htmlFor='pending-subject' className='text-xs'>
								Subject
							</Label>
							<Select value={subjectPick} onValueChange={setSubjectPick}>
								<SelectTrigger id='pending-subject'>
									<SelectValue placeholder='All subjects' />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={ALL}>
										All subjects ({options.subjects.length})
									</SelectItem>
									{options.subjects.map((o) => (
										<SelectItem key={o.id} value={o.id}>
											{o.label} — {o.count}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
				)}

				{error && (
					<Alert variant='destructive'>
						<AlertCircle className='h-4 w-4' />
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}

				{isPending && loading && !matrix && (
					<p className='text-sm text-muted-foreground'>
						{institutionsLoading
							? 'Loading institutions…'
							: `Checking ${targetInstitutions.length} institution${targetInstitutions.length === 1 ? '' : 's'} for unmarked sessions…`}
					</p>
				)}

				{matrix && (
					<>
						<p className='text-xs text-muted-foreground'>
							{rowCount} row{rowCount === 1 ? '' : 's'} · the PDF and Excel
							contain every row. Long results are capped on screen only, and
							say so beneath the table.
						</p>
						{/* State which rules produced these numbers. A default presented
						    without comment reads as institution policy when it is not.
						    The pending report is not measured against a percentage, so
						    quoting a threshold beside it would only mislead. */}
						{!isPending && (
							<p className='text-xs text-muted-foreground'>
								Eligible at {threshold}% · condonation from {floor}% ·{' '}
								{settings.include_od
									? 'On Duty counts as attended'
									: 'On Duty not counted'}
								{' · '}
								{settings.configured ? (
									<span>institution rules</span>
								) : (
									<span className='italic'>
										default rules — no attendance policy set for this institution
									</span>
								)}
							</p>
						)}

						{notes.map((note, i) => (
							<p key={`n-${i}`} className='text-xs text-muted-foreground'>
								{note}
							</p>
						))}

						{summaries.map((s) => (
							<div key={s.caption} className='space-y-1'>
								<p className='text-xs font-medium'>{s.caption}</p>
								<PreviewTable matrix={s.matrix} maxHeight='18rem' />
							</div>
						))}

						{summaries.length > 0 && matrix.body.length > 0 && (
							<p className='text-xs font-medium'>Session details</p>
						)}
						<PreviewTable matrix={matrix} maxHeight='28rem' />

						{matrix.body.length === 0 && (
							<p className='text-sm text-muted-foreground'>
								{isPending
									? 'Nothing pending — every session the timetables scheduled in this period has attendance marked against it.'
									: 'No attendance was marked for this scope and period.'}
							</p>
						)}
					</>
				)}
			</CardContent>
		</Card>
	);
}

/**
 * The preview grid, shared by a report's summary and its detail table.
 *
 * Extracted so the two can never render with different rules - the promise on
 * this panel is that the preview IS the export, and that only holds if every
 * table on screen is built the same way.
 */
/**
 * Rows rendered on screen before the preview stops.
 *
 * The exports are never capped — this is a DOM budget, not a data one. A
 * quarter-long Pending run produces several thousand detail rows, and at roughly
 * eight cells each that is tens of thousands of nodes: enough layout work to
 * freeze the tab for seconds while the numbers above it were already correct.
 * The caption below says how many rows exist and that the PDF and Excel carry
 * all of them, so a capped preview can never be mistaken for a short result.
 */
const PREVIEW_ROW_CAP = 200;

function PreviewTable({
	matrix,
	maxHeight
}: {
	matrix: Matrix;
	maxHeight: string;
}) {
	const shown = matrix.body.length > PREVIEW_ROW_CAP
		? matrix.body.slice(0, PREVIEW_ROW_CAP)
		: matrix.body;
	const hidden = matrix.body.length - shown.length;

	return (
		<>
		<div className='overflow-auto rounded-md border' style={{ maxHeight }}>
			<table className='w-full border-collapse text-xs'>
				<thead className='sticky top-0 bg-muted'>
					<tr>
						{matrix.head.map((h, i) => (
							<th
								key={`h-${i}`}
								className='whitespace-nowrap border-b px-2 py-1.5 text-left font-medium'
							>
								{h}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{shown.map((row, ri) => (
						<tr key={`r-${ri}`} className='even:bg-muted/30'>
							{row.map((cell, ci) => (
								<td
									key={`c-${ri}-${ci}`}
									className='whitespace-nowrap border-b px-2 py-1 tabular-nums'
								>
									{cell}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
		{hidden > 0 && (
			<p className='mt-1 text-xs text-muted-foreground'>
				Showing the first {PREVIEW_ROW_CAP.toLocaleString()} of{' '}
				{matrix.body.length.toLocaleString()} rows on screen.{' '}
				<strong>The PDF and Excel contain all {matrix.body.length.toLocaleString()}.</strong>{' '}
				Narrow the dates or filters to preview fewer.
			</p>
		)}
		</>
	);
}
