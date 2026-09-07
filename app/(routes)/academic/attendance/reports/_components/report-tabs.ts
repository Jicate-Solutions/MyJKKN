/**
 * Report tabs for /academic/attendance/reports.
 *
 * The first tab preserves what this page has always done - the session-records
 * table with its filters, statistics and [id] drill-down. Everything after it is
 * a report from the agreed first delivery.
 *
 * `orientation` is carried here rather than in the PDF layer so the filter bar
 * can warn before a wide report is sent to a portrait printer, and so the six
 * PDF generators stay consistent with the spec without re-deciding per report.
 */

export type ReportOrientation = 'portrait' | 'landscape' | 'a3-landscape';

export interface AttendanceReportTab {
	/** URL value - shows up as ?tab=… so a tab is shareable */
	value: string;
	label: string;
	/** One line under the heading; also the placeholder's summary */
	description: string;
	orientation: ReportOrientation;
	/** Columns the report renders, in order. Drives the placeholder preview. */
	columns: string[];
	/** false until the report itself is built */
	implemented: boolean;
}

export const RECORDS_TAB = 'records';

export const ATTENDANCE_REPORT_TABS: AttendanceReportTab[] = [
	{
		value: RECORDS_TAB,
		label: 'Records',
		description:
			'Marked attendance sessions, newest first. Open a row for the period-by-period breakdown.',
		orientation: 'portrait',
		columns: [],
		implemented: true,
	},
	{
		value: 'student-course',
		label: 'Student-wise Course',
		description:
			'One row per learner with a column per course. Each cell carries present hours, conducted hours and the percentage.',
		orientation: 'landscape',
		columns: [
			'S.No',
			'Roll No',
			'Student Name',
			'…one column per course (P / H / %)',
			'Overall %',
		],
		implemented: true,
	},
	{
		value: 'log-book',
		label: 'Daily Log Book',
		description:
			'The traditional attendance register - one column per calendar day, one row per learner. Sized for A3 landscape.',
		orientation: 'a3-landscape',
		columns: [
			'S.No',
			'Roll No',
			'Student Name',
			'…one column per day (P / A / OD / L / H)',
			'P',
			'A',
			'OD',
			'Total',
			'%',
		],
		implemented: true,
	},
	{
		value: 'monthly',
		label: 'Monthly + Cumulative',
		description:
			'Month-by-month percentage per learner with a running cumulative, for progress reviews and parent meetings.',
		orientation: 'landscape',
		columns: [
			'S.No',
			'Student Name',
			'…one column per month (present / working / %)',
			'Cumulative %',
		],
		implemented: true,
	},
	{
		value: 'defaulters',
		label: 'Low Attendance',
		description:
			'Learners below the institution threshold, with the shortfall in percentage points and the action due.',
		orientation: 'portrait',
		columns: [
			'S.No',
			'Roll No',
			'Student Name',
			'Total Hours',
			'Present',
			'OD',
			'Absent',
			'%',
			'Shortage',
			'Status',
		],
		implemented: true,
	},
	{
		value: 'course-summary',
		label: 'Course-wise Summary',
		description:
			'One row per course with its cohort size, hours conducted and average attendance. Built for HOD and Principal review.',
		orientation: 'landscape',
		// Faculty and "pending entry" are deliberately absent from THIS report:
		// faculty needs the assigned_faculty key, which is missing from ~1,790
		// marked periods, and pending entry needs a timetable join to know what
		// should have been conducted. Both are answered by the Pending Attendance
		// report below, which reads the TIMETABLE's staff assignment rather than
		// the attendance JSON and so does not inherit that gap.
		columns: [
			'S.No',
			'Course Code',
			'Course Name',
			'Students',
			'Present',
			'Absent',
			'OD',
			'Conducted',
			'Attendance %',
		],
		implemented: true,
	},
	{
		value: 'pending',
		label: 'Pending Attendance',
		description:
			'Sessions the timetable scheduled that were never marked — rolled up faculty-wise and subject-wise, then listed session by session. Runs automatically across every institution you can see; narrow it with the filters above, or by faculty and subject on the report itself.',
		orientation: 'landscape',
		// Three tables, not one. The faculty roll-up answers "who is behind", the
		// subject roll-up answers "which subject is behind" — a distinct
		// question when the gap is a lab or an elective nobody owns rather than
		// one person — and the detail carries the evidence for both.
		columns: [
			'Faculty-wise: Faculty / Department / Pending / Overdue / Subjects / Classes / Oldest',
			'Subject-wise: Course Code / Course / Pending / Overdue / Faculty / Classes / Oldest',
			'Details: Date / Day / Session / Course / Class / Status / Pending Details',
		],
		implemented: true,
	},
	{
		value: 'eligibility',
		label: 'Exam Eligibility',
		description:
			'Overall and OD-adjusted percentages against the institution threshold, with the condonation call per learner.',
		orientation: 'portrait',
		columns: [
			'S.No',
			'Roll No',
			'Student Name',
			'Overall %',
			'OD Adjusted %',
			'Condonation',
			'Exam Eligibility',
		],
		implemented: true,
	},
];

export function findReportTab(value: string | null | undefined): AttendanceReportTab {
	return (
		ATTENDANCE_REPORT_TABS.find((t) => t.value === value) ??
		ATTENDANCE_REPORT_TABS[0]
	);
}

export const ORIENTATION_LABEL: Record<ReportOrientation, string> = {
	portrait: 'Portrait',
	landscape: 'Landscape',
	'a3-landscape': 'A3 Landscape',
};
