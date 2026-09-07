import type { PendingAttendancePeriod } from '@/types/attendance-dashboard';

/**
 * Faculty-wise and subject-wise shaping for the Pending Attendance report.
 *
 * The hard part - working out which scheduled periods were never marked - is
 * already solved by AttendanceDashboardService.getTodayPendingAttendance(),
 * which walks each timetable's `timetable_data` for every working day in range
 * and subtracts the periods that have a `student_attendance` entry. This module
 * does not recompute any of that; it only re-grains that result from PERIOD to
 * FACULTY and to SUBJECT, which are the two grains the report is asked for.
 *
 * Deriving rather than duplicating matters here: the pending list has absorbed
 * several corrections that are invisible from the outside (Saturday is a normal
 * teaching day, cycle timetables key on "cycle-N" not a weekday, session_wise
 * school timetables have FN/AN instead of periods, institution off-days are
 * removed). A second implementation would silently lose all four.
 */

/** Bucket for a slot whose timetable names no teaching staff at all. */
export const UNASSIGNED_FACULTY_ID = '__unassigned__';
export const UNASSIGNED_FACULTY_NAME = 'Not assigned in timetable';

/** Bucket for a slot with no resolvable course (day-attendance sessions). */
export const UNKNOWN_SUBJECT_ID = '__no_course__';

export interface PendingFacultyRow {
	staff_id: string;
	faculty_name: string;
	department_name: string;
	institution_name: string;
	/** Pending periods attributed to this member. */
	pending: number;
	/** Of those, dated before today. */
	overdue: number;
	/** Of those, dated today. */
	today: number;
	/** Distinct subjects and distinct classes carrying a pending period. */
	subjects: number;
	classes: number;
	/** Earliest pending date, ISO — the head of the backlog. */
	oldest: string | null;
	/** Whole days between `oldest` and today. 0 when nothing is overdue. */
	maxDaysLate: number;
}

export interface PendingSubjectRow {
	course_id: string;
	course_code: string;
	course_name: string;
	institution_name: string;
	pending: number;
	overdue: number;
	today: number;
	/** Distinct faculty and distinct classes with a pending session on it. */
	faculty: number;
	classes: number;
	oldest: string | null;
	maxDaysLate: number;
}

export interface PendingDetailRow {
	staff_id: string;
	faculty_name: string;
	course_id: string;
	institution_name: string;
	date: string;
	day: string;
	session: string;
	course: string;
	classSection: string;
	/** "Not Marked" always - a row exists here only because nothing was marked. */
	status: string;
	/** Why it is still open: how late, and which timetable it sits on. */
	detail: string;
}

/** One entry per distinct value present in the result, for the panel's selects. */
export interface PendingOption {
	id: string;
	label: string;
	/** Pending sessions behind this option, shown in the select. */
	count: number;
}

export interface PendingFacultyReport {
	faculty: PendingFacultyRow[];
	subjects: PendingSubjectRow[];
	details: PendingDetailRow[];
	/** Distinct pending periods, i.e. the row count BEFORE fan-out. */
	periodCount: number;
	/**
	 * True when at least one period names two or more staff. When it is, the
	 * faculty column of `pending` sums to more than `periodCount`, and the report
	 * says so rather than letting a reader add the column up and find it wrong.
	 */
	fannedOut: boolean;
	/** Pending periods whose timetable slot names nobody. */
	unassigned: number;
	/**
	 * True when the run spans more than one college, which is the default. The
	 * renderers add an Institution column only then - on a single-college run it
	 * would repeat the letterhead in every row.
	 */
	showInstitution: boolean;
}

export interface PendingFilter {
	/** staff id, or UNASSIGNED_FACULTY_ID for the unowned bucket */
	staffId?: string | null;
	/** course id, or UNKNOWN_SUBJECT_ID for sessions with no course */
	courseId?: string | null;
}

const todayIso = (): string => {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
		d.getDate()
	).padStart(2, '0')}`;
};

const daysBetween = (fromIso: string, toIso: string): number => {
	const a = new Date(`${fromIso}T00:00:00`).getTime();
	const b = new Date(`${toIso}T00:00:00`).getTime();
	if (Number.isNaN(a) || Number.isNaN(b)) return 0;
	return Math.max(0, Math.round((b - a) / 86_400_000));
};

export const weekdayOf = (iso: string): string => {
	const d = new Date(`${iso}T00:00:00`);
	if (Number.isNaN(d.getTime())) return '';
	return d.toLocaleDateString('en-GB', { weekday: 'short' });
};

const hhmm = (t: string | null | undefined): string =>
	(t || '').trim().slice(0, 5);

const clean = (s: string | null | undefined): string => {
	const v = (s || '').trim();
	return v && !/^unknown/i.test(v) ? v : '';
};

/** "Period 3 (09:30-10:20)", or just the session name when there are no times. */
export const sessionLabel = (p: PendingAttendancePeriod): string => {
	const from = hhmm(p.start_time);
	const to = hhmm(p.end_time);
	const name = p.period_name || 'Session';
	return from && to ? `${name} (${from}–${to})` : name;
};

export const courseLabel = (p: PendingAttendancePeriod): string => {
	const code = clean(p.course_code);
	const name = clean(p.course_name);
	if (code && name) return `${code} — ${name}`;
	return code || name || '—';
};

/**
 * The subject key.
 *
 * `course_id` is empty on a school's FN/AN day-attendance session, which has no
 * course at all. Those collapse into one explicit bucket rather than becoming
 * an unlabelled row per timetable.
 */
export const subjectKeyOf = (p: PendingAttendancePeriod): string =>
	p.course_id || UNKNOWN_SUBJECT_ID;

/**
 * Program / semester / section, with the blanks dropped.
 *
 * A semester-level timetable carries no section - 60 of 195 active timetables
 * on this platform - so joining a fixed three-part string would print a trailing
 * separator and an "Unknown Section" that is not a data problem.
 */
export const classLabel = (p: PendingAttendancePeriod): string => {
	const parts = [p.program_name, p.semester_name, p.section_name]
		.map(clean)
		.filter(Boolean);
	return parts.length ? parts.join(' · ') : '—';
};

/**
 * Faculty and subject option lists for the report's own selects.
 *
 * Built from the RESULT, not from the staff and course masters. A college has
 * hundreds of staff and thousands of courses; only the few dozen with a backlog
 * can possibly be chosen here, and offering the rest would mean most selections
 * return nothing. Each option carries its pending count, so the select doubles
 * as the answer to "who is behind?".
 */
export function pendingOptions(periods: PendingAttendancePeriod[]): {
	faculty: PendingOption[];
	subjects: PendingOption[];
} {
	const faculty = new Map<string, PendingOption>();
	const subjects = new Map<string, PendingOption>();

	for (const p of periods) {
		const staff = (p.assigned_staff || []).filter((s) => s && s.staff_id);
		const targets = staff.length
			? staff.map((s) => ({
					id: s.staff_id,
					label: (s.staff_name || '').trim() || 'Unnamed staff'
				}))
			: [{ id: UNASSIGNED_FACULTY_ID, label: UNASSIGNED_FACULTY_NAME }];
		for (const t of targets) {
			const row = faculty.get(t.id) ?? { ...t, count: 0 };
			row.count += 1;
			faculty.set(t.id, row);
		}

		const key = subjectKeyOf(p);
		const row = subjects.get(key) ?? {
			id: key,
			label: key === UNKNOWN_SUBJECT_ID ? 'No subject (day attendance)' : courseLabel(p),
			count: 0
		};
		row.count += 1;
		subjects.set(key, row);
	}

	const byCount = (a: PendingOption, b: PendingOption) =>
		b.count - a.count || a.label.localeCompare(b.label);

	return {
		faculty: [...faculty.values()].sort(byCount),
		subjects: [...subjects.values()].sort(byCount)
	};
}

/**
 * Narrow the result to one faculty member and/or one subject.
 *
 * Applied to the PERIODS rather than to the built tables so that every section
 * of the report - faculty summary, subject summary and detail - is computed
 * from the same narrowed set. Filtering the tables independently is how a
 * summary comes to disagree with the rows underneath it.
 */
export function filterPendingPeriods(
	periods: PendingAttendancePeriod[],
	filter: PendingFilter
): PendingAttendancePeriod[] {
	const { staffId, courseId } = filter;
	if (!staffId && !courseId) return periods;

	return periods.filter((p) => {
		if (courseId && subjectKeyOf(p) !== courseId) return false;
		if (staffId) {
			const staff = (p.assigned_staff || []).filter((s) => s && s.staff_id);
			if (staffId === UNASSIGNED_FACULTY_ID) return staff.length === 0;
			if (!staff.some((s) => s.staff_id === staffId)) return false;
		}
		return true;
	});
}

/**
 * Fan each pending period out across every member of staff the timetable names,
 * and roll the same periods up by subject.
 *
 * A co-taught period is genuinely pending for BOTH members - neither can point
 * at the other - so it is counted against each. That is why `periodCount` is
 * reported separately from the faculty column: the two are different questions
 * and only one of them adds up. The SUBJECT table has no such fan-out: a period
 * teaches exactly one course, so that column does sum to `periodCount`.
 */
export function buildPendingFacultyReport(
	periods: PendingAttendancePeriod[]
): PendingFacultyReport {
	const today = todayIso();
	const faculty = new Map<
		string,
		PendingFacultyRow & { subjectKeys: Set<string>; classKeys: Set<string> }
	>();
	const subjects = new Map<
		string,
		PendingSubjectRow & { facultyKeys: Set<string>; classKeys: Set<string> }
	>();
	const institutions = new Set<string>();
	const details: PendingDetailRow[] = [];
	let fannedOut = false;
	let unassigned = 0;

	for (const p of periods) {
		const staff = (p.assigned_staff || []).filter((s) => s && s.staff_id);
		if (staff.length > 1) fannedOut = true;
		if (!staff.length) unassigned += 1;
		institutions.add(p.institution_id || '');

		const targets = staff.length
			? staff.map((s) => ({
					id: s.staff_id,
					name: (s.staff_name || '').trim() || 'Unnamed staff'
				}))
			: [{ id: UNASSIGNED_FACULTY_ID, name: UNASSIGNED_FACULTY_NAME }];

		const late =
			p.attendance_date < today ? daysBetween(p.attendance_date, today) : 0;
		const status = late > 0 ? 'Not Marked · Overdue' : 'Not Marked';
		const where = p.timetable_name || 'timetable';
		const detail =
			late > 0
				? `${late} day${late === 1 ? '' : 's'} overdue · ${where}`
				: `Due today · ${where}`;
		const institutionName = clean(p.institution_name);
		const classSection = classLabel(p);
		const subjectKey = subjectKeyOf(p);

		/* ── subject grain: one row per period, no fan-out ── */
		let sub = subjects.get(subjectKey);
		if (!sub) {
			sub = {
				course_id: subjectKey,
				course_code:
					subjectKey === UNKNOWN_SUBJECT_ID ? '—' : clean(p.course_code) || '—',
				course_name:
					subjectKey === UNKNOWN_SUBJECT_ID
						? 'No subject (day attendance)'
						: clean(p.course_name) || '—',
				institution_name: institutionName,
				pending: 0,
				overdue: 0,
				today: 0,
				faculty: 0,
				classes: 0,
				oldest: null,
				maxDaysLate: 0,
				facultyKeys: new Set<string>(),
				classKeys: new Set<string>()
			};
			subjects.set(subjectKey, sub);
		}
		sub.pending += 1;
		if (late > 0) sub.overdue += 1;
		else if (p.attendance_date === today) sub.today += 1;
		for (const t of targets) sub.facultyKeys.add(t.id);
		sub.classKeys.add(classSection);
		if (!sub.oldest || p.attendance_date < sub.oldest) sub.oldest = p.attendance_date;
		sub.maxDaysLate = Math.max(sub.maxDaysLate, late);

		/* ── faculty grain: fanned out across every assigned member ── */
		for (const t of targets) {
			let row = faculty.get(t.id);
			if (!row) {
				row = {
					staff_id: t.id,
					faculty_name: t.name,
					// The department of the CLASS, taken from the first pending
					// session seen. A member teaching into two departments is labelled
					// with whichever appears first — enough to route the follow-up,
					// and the detail rows below carry the class for each session.
					department_name: clean(p.department_name),
					institution_name: institutionName,
					pending: 0,
					overdue: 0,
					today: 0,
					subjects: 0,
					classes: 0,
					oldest: null,
					maxDaysLate: 0,
					subjectKeys: new Set<string>(),
					classKeys: new Set<string>()
				};
				faculty.set(t.id, row);
			}
			row.pending += 1;
			if (late > 0) row.overdue += 1;
			else if (p.attendance_date === today) row.today += 1;
			row.subjectKeys.add(subjectKey);
			row.classKeys.add(classSection);
			if (!row.oldest || p.attendance_date < row.oldest)
				row.oldest = p.attendance_date;
			row.maxDaysLate = Math.max(row.maxDaysLate, late);

			details.push({
				staff_id: t.id,
				faculty_name: t.name,
				course_id: subjectKey,
				institution_name: institutionName,
				date: p.attendance_date,
				day: weekdayOf(p.attendance_date),
				session: sessionLabel(p),
				course: courseLabel(p),
				classSection,
				status,
				detail
			});
		}
	}

	// Worst backlog first: this report exists to be acted on, and whoever has
	// thirty unmarked sessions is who the reader needs on the first page.
	const worstFirst = <T extends { pending: number; maxDaysLate: number }>(
		name: (r: T) => string
	) => (a: T, b: T) =>
		b.pending - a.pending ||
		b.maxDaysLate - a.maxDaysLate ||
		name(a).localeCompare(name(b));

	const facultyOut = [...faculty.values()]
		.map(({ subjectKeys, classKeys, ...row }) => ({
			...row,
			subjects: subjectKeys.size,
			classes: classKeys.size
		}))
		.sort(worstFirst<PendingFacultyRow>((r) => r.faculty_name));

	const subjectsOut = [...subjects.values()]
		.map(({ facultyKeys, classKeys, ...row }) => ({
			...row,
			faculty: facultyKeys.size,
			classes: classKeys.size
		}))
		.sort(worstFirst<PendingSubjectRow>((r) => r.course_code));

	// Detail rows follow the faculty summary's order so the two tables read as
	// one document: whoever is first on page 1 is first in the breakdown.
	const rank = new Map(facultyOut.map((f, i) => [f.staff_id, i]));
	details.sort(
		(a, b) =>
			(rank.get(a.staff_id) ?? 0) - (rank.get(b.staff_id) ?? 0) ||
			a.date.localeCompare(b.date) ||
			a.session.localeCompare(b.session)
	);

	return {
		faculty: facultyOut,
		subjects: subjectsOut,
		details,
		periodCount: periods.length,
		fannedOut,
		unassigned,
		showInstitution: institutions.size > 1
	};
}
