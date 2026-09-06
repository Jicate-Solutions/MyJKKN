import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

/**
 * Attendance report data layer.
 *
 * Three Postgres RPCs supply three grains; the six reports are derived from them
 * here rather than in each PDF generator, so the preview table, the PDF, the
 * Excel and the print view all render the same numbers from one calculation.
 *
 * The RPCs REQUIRE institution_id and a date range. That is not defensive
 * styling - an unscoped call against this dataset exhausted the database's temp
 * disk during development. Every entry point below takes a scope object that
 * cannot omit them.
 */

export interface AttendanceReportScope {
	institution_id: string;
	date_from: string;
	date_to: string;
	academic_year_id?: string | null;
	degree_id?: string | null;
	department_id?: string | null;
	program_id?: string | null;
	semester_id?: string | null;
	section_id?: string | null;
	course_id?: string | null;
}

/**
 * Fallbacks used when an institution has no attendance_report_settings row.
 * 75 / 65 is the common Tamil Nadu ordinance; a college that differs sets its own.
 */
export const DEFAULT_ATTENDANCE_THRESHOLD = 75;
export const DEFAULT_CONDONATION_FLOOR = 65;

export interface AttendanceReportSettings {
	attendance_threshold: number;
	condonation_floor: number;
	include_od: boolean;
	include_leave: boolean;
	/** false when no row exists and the built-in defaults are in force */
	configured: boolean;
}

export const FALLBACK_SETTINGS: AttendanceReportSettings = {
	attendance_threshold: DEFAULT_ATTENDANCE_THRESHOLD,
	condonation_floor: DEFAULT_CONDONATION_FLOOR,
	include_od: true,
	include_leave: false,
	configured: false
};

export interface StudentCourseRow {
	student_id: string;
	roll_number: string | null;
	register_number: string | null;
	student_name: string | null;
	course_id: string | null;
	course_code: string | null;
	course_name: string | null;
	present_hours: number;
	absent_hours: number;
	od_hours: number;
	leave_hours: number;
	conducted_hours: number;
	percentage: number;
}

/**
 * One row per learner. `days` is the register grid folded server-side into a
 * date -> code map; the per-day grain would exceed PostgREST's max_rows for a
 * full semester and truncate without saying so.
 */
export interface StudentDayRow {
	student_id: string;
	roll_number: string | null;
	student_name: string | null;
	days: Record<string, string> | null;
	present_hours: number;
	absent_hours: number;
	od_hours: number;
	leave_hours: number;
	conducted_hours: number;
}

export interface StudentMonthRow {
	student_id: string;
	roll_number: string | null;
	student_name: string | null;
	month_start: string;
	present_hours: number;
	conducted_hours: number;
	percentage: number;
}

export interface InstitutionHeader {
	name: string;
	logo_url: string | null;
	address: string | null;
	affiliation: string | null;
}

const num = (v: unknown): number => {
	const n = Number(v);
	return Number.isFinite(n) ? n : 0;
};

const pct = (present: number, conducted: number): number =>
	conducted > 0 ? Math.round((present / conducted) * 10000) / 100 : 0;

/**
 * PostgREST caps a response at max_rows (10,000 on this project). The Daily Log
 * Book blows straight through that - 147 learners over ten months is ~29,000
 * rows - and a capped response looks like a complete one: the register renders,
 * prints, and quietly omits learners.
 *
 * So every RPC read is range-paginated until a page comes back short. The
 * ceiling stops a runaway scope from recreating the out-of-memory crash that
 * this whole report engine exists to replace; hitting it throws rather than
 * returning a plausible-looking partial set.
 */
const RPC_PAGE = 5000;
const RPC_MAX_ROWS = 200_000;

async function fetchAllRpc<T>(
	client: { rpc: (fn: string, args: unknown) => any },
	fn: string,
	args: unknown
): Promise<T[]> {
	const out: T[] = [];
	for (let from = 0; ; from += RPC_PAGE) {
		const { data, error } = await client
			.rpc(fn, args)
			.range(from, from + RPC_PAGE - 1);

		if (error) {
			logger.error('academic/attendance-reports', `${fn} failed`, {
				message: error.message,
				code: error.code,
				from
			});
			throw new Error(error.message);
		}

		const page = (data || []) as T[];
		out.push(...page);

		if (page.length < RPC_PAGE) return out;

		if (out.length >= RPC_MAX_ROWS) {
			throw new Error(
				`This report matched over ${RPC_MAX_ROWS.toLocaleString()} rows. Narrow the date range, section or course and run it again — a result this large would not be readable and risks destabilising the database.`
			);
		}
	}
}

function rpcArgs(scope: AttendanceReportScope) {
	return {
		p_institution_id: scope.institution_id,
		p_date_from: scope.date_from,
		p_date_to: scope.date_to,
		p_academic_year_id: scope.academic_year_id || null,
		p_degree_id: scope.degree_id || null,
		p_department_id: scope.department_id || null,
		p_program_id: scope.program_id || null,
		p_semester_id: scope.semester_id || null,
		p_section_id: scope.section_id || null,
		p_course_id: scope.course_id || null
	};
}

export class AttendanceReportAggregates {
	private static supabase = createClientSupabaseClient();

	/** Institution letterhead fields, assembled from the columns that exist. */
	static async getInstitutionHeader(
		institutionId: string
	): Promise<InstitutionHeader | null> {
		const { data, error } = await this.supabase
			.from('institutions')
			.select(
				'name, display_name, logo_url, address_line1, address_line2, address_line3, city, state, pin_code, accredited_by, university_affiliation_name'
			)
			.eq('id', institutionId)
			.maybeSingle();

		if (error || !data) {
			logger.error(
				'academic/attendance-reports',
				'Institution header lookup failed',
				{ institutionId, message: error?.message }
			);
			return null;
		}

		const d = data as Record<string, string | null>;
		const address = [
			d.address_line1,
			d.address_line2,
			d.address_line3,
			[d.city, d.state].filter(Boolean).join(', '),
			d.pin_code
		]
			.map((p) => (p || '').trim())
			.filter(Boolean)
			.join(', ');

		const affiliation = [
			d.accredited_by ? `Accredited by ${d.accredited_by}` : null,
			d.university_affiliation_name
				? `Affiliated to ${d.university_affiliation_name}`
				: null
		]
			.filter(Boolean)
			.join(' · ');

		return {
			name: d.display_name || d.name || '',
			logo_url: d.logo_url || null,
			address: address || null,
			affiliation: affiliation || null
		};
	}

	/**
	 * Institution attendance rules, or the built-in defaults when none are set.
	 *
	 * A missing row is the normal case, not an error - reports must keep working
	 * for an institution nobody has configured yet. `configured: false` lets the
	 * UI say which rules are in force rather than presenting a default as policy.
	 */
	static async getSettings(
		institutionId: string
	): Promise<AttendanceReportSettings> {
		const { data, error } = await this.supabase
			.from('attendance_report_settings')
			.select(
				'attendance_threshold, condonation_floor, include_od, include_leave'
			)
			.eq('institution_id', institutionId)
			.maybeSingle();

		if (error) {
			logger.warn(
				'academic/attendance-reports',
				'Settings lookup failed; using defaults',
				{ institutionId, message: error.message, code: error.code }
			);
			return FALLBACK_SETTINGS;
		}
		if (!data) return FALLBACK_SETTINGS;

		const d = data as Record<string, unknown>;
		return {
			attendance_threshold: num(d.attendance_threshold),
			condonation_floor: num(d.condonation_floor),
			include_od: d.include_od !== false,
			include_leave: d.include_leave === true,
			configured: true
		};
	}

	static async saveSettings(
		institutionId: string,
		values: Omit<AttendanceReportSettings, 'configured'>
	): Promise<void> {
		const { error } = await (this.supabase as any)
			.from('attendance_report_settings')
			.upsert(
				{ institution_id: institutionId, ...values },
				{ onConflict: 'institution_id' }
			);
		if (error) {
			logger.error('academic/attendance-reports', 'Settings save failed', {
				institutionId,
				message: error.message,
				code: error.code
			});
			throw new Error(
				error.code === '42501'
					? 'Only an administrator can change attendance rules for this institution.'
					: error.message
			);
		}
	}

	static async studentCourse(
		scope: AttendanceReportScope
	): Promise<StudentCourseRow[]> {
		const data = await fetchAllRpc<any>(
			this.supabase as any,
			'get_attendance_student_course',
			rpcArgs(scope)
		);
		return data.map((r: any) => ({
			...r,
			present_hours: num(r.present_hours),
			absent_hours: num(r.absent_hours),
			od_hours: num(r.od_hours),
			leave_hours: num(r.leave_hours),
			conducted_hours: num(r.conducted_hours),
			percentage: num(r.percentage)
		}));
	}

	static async studentDay(
		scope: AttendanceReportScope
	): Promise<StudentDayRow[]> {
		const data = await fetchAllRpc<any>(
			this.supabase as any,
			'get_attendance_student_day',
			rpcArgs(scope)
		);
		return data.map((r: any) => ({
			...r,
			days: (r.days || {}) as Record<string, string>,
			present_hours: num(r.present_hours),
			absent_hours: num(r.absent_hours),
			od_hours: num(r.od_hours),
			leave_hours: num(r.leave_hours),
			conducted_hours: num(r.conducted_hours)
		}));
	}

	static async studentMonth(
		scope: AttendanceReportScope
	): Promise<StudentMonthRow[]> {
		const data = await fetchAllRpc<any>(
			this.supabase as any,
			'get_attendance_student_month',
			rpcArgs(scope)
		);
		return data.map((r: any) => ({
			...r,
			present_hours: num(r.present_hours),
			conducted_hours: num(r.conducted_hours),
			percentage: num(r.percentage)
		}));
	}
}

/* ────────────────────────── derived report shapes ────────────────────────── */

export interface LearnerIdentity {
	student_id: string;
	roll_number: string | null;
	student_name: string | null;
}

export interface CourseColumn {
	course_id: string;
	course_code: string;
	course_name: string;
}

export interface StudentCoursePivot {
	courses: CourseColumn[];
	rows: Array<
		LearnerIdentity & {
			/** keyed by course_id */
			cells: Record<
				string,
				{ present: number; conducted: number; percentage: number }
			>;
			present: number;
			conducted: number;
			percentage: number;
		}
	>;
}

/** Report 1 — one row per learner, one column per course. */
export function buildStudentCoursePivot(
	rows: StudentCourseRow[]
): StudentCoursePivot {
	const courseMap = new Map<string, CourseColumn>();
	const learners = new Map<string, StudentCoursePivot['rows'][number]>();

	for (const r of rows) {
		if (r.course_id && !courseMap.has(r.course_id)) {
			courseMap.set(r.course_id, {
				course_id: r.course_id,
				course_code: r.course_code || '—',
				course_name: r.course_name || '—'
			});
		}
		let learner = learners.get(r.student_id);
		if (!learner) {
			learner = {
				student_id: r.student_id,
				roll_number: r.roll_number,
				student_name: r.student_name,
				cells: {},
				present: 0,
				conducted: 0,
				percentage: 0
			};
			learners.set(r.student_id, learner);
		}
		if (r.course_id) {
			learner.cells[r.course_id] = {
				present: r.present_hours,
				conducted: r.conducted_hours,
				percentage: r.percentage
			};
		}
		learner.present += r.present_hours;
		learner.conducted += r.conducted_hours;
	}

	const courses = [...courseMap.values()].sort((a, b) =>
		a.course_code.localeCompare(b.course_code)
	);
	const out = [...learners.values()];
	for (const l of out) l.percentage = pct(l.present, l.conducted);
	out.sort((a, b) => (a.roll_number || '~').localeCompare(b.roll_number || '~'));

	return { courses, rows: out };
}

export interface StudentTotal extends LearnerIdentity {
	present: number;
	absent: number;
	od: number;
	leave: number;
	conducted: number;
	percentage: number;
	/** Percentage once OD hours are counted as attended. */
	odAdjusted: number;
}

/**
 * Collapse the per-course grain to one row per learner.
 *
 * `odAdjusted` honours the institution's include_od / include_leave rules, so a
 * college that does not count On Duty sees the plain percentage in both columns
 * rather than a more generous number it never agreed to.
 */
export function buildStudentTotals(
	rows: StudentCourseRow[],
	settings: AttendanceReportSettings = FALLBACK_SETTINGS
): StudentTotal[] {
	const map = new Map<string, StudentTotal>();
	for (const r of rows) {
		let t = map.get(r.student_id);
		if (!t) {
			t = {
				student_id: r.student_id,
				roll_number: r.roll_number,
				student_name: r.student_name,
				present: 0,
				absent: 0,
				od: 0,
				leave: 0,
				conducted: 0,
				percentage: 0,
				odAdjusted: 0
			};
			map.set(r.student_id, t);
		}
		t.present += r.present_hours;
		t.absent += r.absent_hours;
		t.od += r.od_hours;
		t.leave += r.leave_hours;
		t.conducted += r.conducted_hours;
	}
	const out = [...map.values()];
	for (const t of out) {
		t.percentage = pct(t.present, t.conducted);
		const credited =
			t.present +
			(settings.include_od ? t.od : 0) +
			(settings.include_leave ? t.leave : 0);
		t.odAdjusted = pct(credited, t.conducted);
	}
	out.sort((a, b) => (a.roll_number || '~').localeCompare(b.roll_number || '~'));
	return out;
}

export type EligibilityStatus =
	| 'Eligible'
	| 'Condonation Required'
	| 'Not Eligible';

export function eligibilityOf(
	percentage: number,
	threshold = DEFAULT_ATTENDANCE_THRESHOLD,
	condonationFloor = DEFAULT_CONDONATION_FLOOR
): EligibilityStatus {
	if (percentage >= threshold) return 'Eligible';
	if (percentage >= condonationFloor) return 'Condonation Required';
	return 'Not Eligible';
}

export interface CourseSummaryRow extends CourseColumn {
	students: number;
	present: number;
	absent: number;
	od: number;
	conducted: number;
	percentage: number;
}

/** Report 5 — one row per course. */
export function buildCourseSummary(
	rows: StudentCourseRow[]
): CourseSummaryRow[] {
	const map = new Map<string, CourseSummaryRow & { seen: Set<string> }>();
	for (const r of rows) {
		if (!r.course_id) continue;
		let c = map.get(r.course_id);
		if (!c) {
			c = {
				course_id: r.course_id,
				course_code: r.course_code || '—',
				course_name: r.course_name || '—',
				students: 0,
				present: 0,
				absent: 0,
				od: 0,
				conducted: 0,
				percentage: 0,
				seen: new Set<string>()
			};
			map.set(r.course_id, c);
		}
		c.seen.add(r.student_id);
		c.present += r.present_hours;
		c.absent += r.absent_hours;
		c.od += r.od_hours;
		c.conducted += r.conducted_hours;
	}
	return [...map.values()]
		.map(({ seen, ...c }) => ({
			...c,
			students: seen.size,
			percentage: pct(c.present, c.conducted)
		}))
		.sort((a, b) => a.course_code.localeCompare(b.course_code));
}

export interface LogBookPivot {
	dates: string[];
	rows: Array<
		LearnerIdentity & {
			codes: Record<string, string>;
			present: number;
			absent: number;
			od: number;
			conducted: number;
			percentage: number;
		}
	>;
}

/**
 * Report 2 — the register grid, one column per calendar day.
 *
 * The date columns are the union across learners, not any single learner's keys:
 * a learner who joined mid-term has no entry for the earlier dates, and taking
 * one learner's key set would silently drop those columns for everyone.
 */
export function buildLogBook(rows: StudentDayRow[]): LogBookPivot {
	const dateSet = new Set<string>();

	const out = rows.map((r) => {
		const codes = r.days || {};
		for (const d of Object.keys(codes)) dateSet.add(d);
		return {
			student_id: r.student_id,
			roll_number: r.roll_number,
			student_name: r.student_name,
			codes,
			present: r.present_hours,
			absent: r.absent_hours,
			od: r.od_hours,
			conducted: r.conducted_hours,
			percentage: pct(r.present_hours, r.conducted_hours)
		};
	});

	out.sort((a, b) => (a.roll_number || '~').localeCompare(b.roll_number || '~'));

	return { dates: [...dateSet].sort(), rows: out };
}

export interface MonthlyPivot {
	months: string[];
	rows: Array<
		LearnerIdentity & {
			cells: Record<
				string,
				{ present: number; conducted: number; percentage: number }
			>;
			/** Running totals in month order, keyed by month_start. */
			cumulative: Record<string, number>;
			present: number;
			conducted: number;
			percentage: number;
		}
	>;
}

/** Report 3 — month columns plus the running cumulative. */
export function buildMonthly(rows: StudentMonthRow[]): MonthlyPivot {
	const monthSet = new Set<string>();
	const learners = new Map<string, MonthlyPivot['rows'][number]>();

	for (const r of rows) {
		monthSet.add(r.month_start);
		let l = learners.get(r.student_id);
		if (!l) {
			l = {
				student_id: r.student_id,
				roll_number: r.roll_number,
				student_name: r.student_name,
				cells: {},
				cumulative: {},
				present: 0,
				conducted: 0,
				percentage: 0
			};
			learners.set(r.student_id, l);
		}
		l.cells[r.month_start] = {
			present: r.present_hours,
			conducted: r.conducted_hours,
			percentage: r.percentage
		};
	}

	const months = [...monthSet].sort();
	const out = [...learners.values()];
	for (const l of out) {
		let runPresent = 0;
		let runConducted = 0;
		for (const m of months) {
			const cell = l.cells[m];
			if (cell) {
				runPresent += cell.present;
				runConducted += cell.conducted;
			}
			// Carry the previous cumulative through a month with no classes rather
			// than dropping to zero — a gap month is not a 0% month.
			l.cumulative[m] = pct(runPresent, runConducted);
		}
		l.present = runPresent;
		l.conducted = runConducted;
		l.percentage = pct(runPresent, runConducted);
	}
	out.sort((a, b) => (a.roll_number || '~').localeCompare(b.roll_number || '~'));

	return { months, rows: out };
}
