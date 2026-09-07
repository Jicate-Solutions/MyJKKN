import jsPDF from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import type {
	CourseSummaryRow,
	InstitutionHeader,
	LogBookPivot,
	MonthlyPivot,
	StudentCoursePivot,
	StudentTotal
} from '@/lib/services/academic/attendance-report-aggregates';
import {
	DEFAULT_ATTENDANCE_THRESHOLD,
	eligibilityOf
} from '@/lib/services/academic/attendance-report-aggregates';
import type {
	PendingFacultyReport
} from '@/lib/services/academic/attendance-pending-aggregates';
import { UNASSIGNED_FACULTY_ID } from '@/lib/services/academic/attendance-pending-aggregates';
import { drawInstitutionBanner } from '@/lib/utils/internal-marks/internal-marks-pdf';
import { getInstitutionHeader } from '@/lib/utils/internal-marks/institution-header';

/**
 * The attendance report PDFs.
 *
 * jsPDF + autotable rather than an HTML pipeline: it matches the existing
 * consolidation-report-pdf prior art, runs client-side with no server cost, and
 * handles the repeating headers and A3 landscape the register formats need.
 *
 * LETTERHEAD IS SHARED WITH THE INTERNAL MARK REPORT, not re-drawn here.
 * `drawInstitutionBanner()` from lib/utils/internal-marks/internal-marks-pdf is
 * the same function /academic/internal-marks/report calls, so the two documents
 * a department head receives in the same week - the mark sheet and the
 * attendance register - carry an identical banner: dual logos in the margins,
 * Times throughout, and the college's own accreditation and address lines. The
 * previous local header used Helvetica, one logo and a different address
 * assembly, which is exactly the drift that made them look like they came from
 * two different institutions.
 *
 * Everything below the banner follows the mark report too: a centred title with
 * a scope line, a two-column key/value block, a ruled table, a count line, and
 * signature RULES (not bare captions) for the in-charge, the HOD and the
 * Principal.
 */

export interface ReportMeta {
	institution: InstitutionHeader | null;
	title: string;
	/** Academic year / programme / semester / section, already resolved to names */
	subtitle?: string[];
	dateFrom: string;
	dateTo: string;
	threshold?: number;
	/**
	 * Extra key/value pairs printed under the title, two to a line, exactly as
	 * the mark report prints "Program: … / Semester: …". Left empty by callers
	 * that have nothing to add.
	 */
	fields?: Array<[string, string]>;
}

/**
 * Left and right letterhead marks, both optional.
 *
 * The mark report puts the trust logo at the left margin and the college's own
 * mark at the right; attendance now does the same. Either may be null - a
 * missing image degrades to a text-only banner and never to a failed export.
 */
export interface ReportLogos {
	left: string | null;
	right: string | null;
}

type Orientation = 'p' | 'l';
type Format = 'a4' | 'a3';

const MARGIN = 10;

function fmtDate(iso: string): string {
	if (!iso) return '';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString('en-GB', {
		day: '2-digit',
		month: 'short',
		year: 'numeric'
	});
}

function fmtDayShort(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function fmtMonth(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

/**
 * Fetch the institution logo and turn it into a data URL.
 *
 * Returns null on any failure - a missing or CORS-blocked logo must degrade to a
 * text-only letterhead, never to a broken report. Callers await this once and
 * pass the result in, so a slow image cannot stall each page.
 */
export async function loadLogoDataUrl(
	url: string | null | undefined
): Promise<string | null> {
	if (!url) return null;
	try {
		const res = await fetch(url, { mode: 'cors' });
		if (!res.ok) return null;
		const blob = await res.blob();
		if (!blob.type.startsWith('image/')) return null;
		return await new Promise<string | null>((resolve) => {
			const reader = new FileReader();
			reader.onloadend = () => resolve(String(reader.result || '') || null);
			reader.onerror = () => resolve(null);
			reader.readAsDataURL(blob);
		});
	} catch {
		return null;
	}
}

/**
 * Institution letterhead in the Internal Mark Report's own layout. Returns the
 * Y coordinate the table should start at.
 *
 * The banner itself is drawn by the mark report's `drawInstitutionBanner()`, so
 * the two documents cannot drift apart. Its accreditation and address lines are
 * resolved by `getInstitutionHeader()` - the same per-college resolver the mark
 * report uses - with the institution's OWN record preferred whenever it carries
 * those fields, so a college that has filled its profile in gets its real
 * details rather than a name-matched default.
 */
function drawHeader(
	doc: jsPDF,
	meta: ReportMeta,
	logos: ReportLogos
): number {
	const pageWidth = doc.internal.pageSize.getWidth();
	const centre = pageWidth / 2;

	const branding = getInstitutionHeader(meta.institution?.name);
	let y = drawInstitutionBanner(
		doc,
		{
			institution_name: (
				meta.institution?.name || branding.institution_name
			).toUpperCase(),
			// Prefer what the institution record actually holds; fall back to the
			// resolver so an unpopulated profile still prints a real letterhead.
			institution_accreditation:
				meta.institution?.affiliation || branding.institution_accreditation,
			institution_address:
				meta.institution?.address || branding.institution_address,
			logoImage: logos.left || undefined,
			rightLogoImage: logos.right || undefined
		},
		pageWidth,
		MARGIN
	);

	doc.setFont('times', 'bold');
	doc.setFontSize(11);
	doc.text(meta.title.toUpperCase(), centre, y, { align: 'center' });
	y += 5;

	const sub = (meta.subtitle || []).filter(Boolean);
	if (sub.length) {
		doc.setFont('times', 'normal');
		doc.setFontSize(9);
		doc.text(sub.join('  |  '), centre, y, { align: 'center' });
		y += 5;
	}

	// Key/value block: two to a line, left-aligned and right-aligned, matching
	// the mark report's "Program: … / Semester: …" rows.
	const fields: Array<[string, string]> = [
		['Period', `${fmtDate(meta.dateFrom)} to ${fmtDate(meta.dateTo)}`],
		...(meta.threshold !== undefined
			? ([['Minimum Attendance', `${meta.threshold}%`]] as Array<[string, string]>)
			: []),
		...(meta.fields || [])
	];

	doc.setFont('times', 'normal');
	doc.setFontSize(9);
	for (let i = 0; i < fields.length; i += 2) {
		const [lk, lv] = fields[i];
		doc.text(`${lk}: ${lv}`, MARGIN, y);
		const right = fields[i + 1];
		if (right) {
			doc.text(`${right[0]}: ${right[1]}`, pageWidth - MARGIN, y, {
				align: 'right'
			});
		}
		y += 4.5;
	}

	y += 0.5;
	doc.setDrawColor(0);
	doc.setLineWidth(0.4);
	doc.line(MARGIN, y, pageWidth - MARGIN, y);

	return y + 3;
}

function drawFooter(doc: jsPDF, note?: string) {
	const pages = doc.getNumberOfPages();
	const pageWidth = doc.internal.pageSize.getWidth();
	const pageHeight = doc.internal.pageSize.getHeight();
	for (let i = 1; i <= pages; i++) {
		doc.setPage(i);
		doc.setFont('times', 'normal');
		doc.setFontSize(7);
		doc.setTextColor(90);
		// Timestamp, not just a date - the mark report stamps the minute because
		// two runs of the same report an hour apart are different documents.
		doc.text(
			`Generated ${new Date().toLocaleString('en-IN')}`,
			MARGIN,
			pageHeight - 5
		);
		if (note) {
			doc.text(note, pageWidth / 2, pageHeight - 5, { align: 'center' });
		}
		doc.text(`Page ${i} of ${pages}`, pageWidth - MARGIN, pageHeight - 5, {
			align: 'right'
		});
		doc.setTextColor(0);
	}
}

function newDoc(orientation: Orientation, format: Format = 'a4'): jsPDF {
	return new jsPDF({ orientation, unit: 'mm', format });
}

function baseTableOptions(startY: number) {
	return {
		startY,
		margin: { left: MARGIN, right: MARGIN },
		theme: 'grid' as const,
		styles: {
			// Times, matching the mark report. These registers are archived beside
			// the mark sheets, so a sans-serif attendance page reads as a different
			// system's output.
			font: 'times',
			fontSize: 7,
			cellPadding: 1.2,
			lineColor: [0, 0, 0] as [number, number, number],
			lineWidth: 0.1,
			textColor: [0, 0, 0] as [number, number, number],
			overflow: 'linebreak' as const
		},
		headStyles: {
			font: 'times',
			fillColor: [240, 240, 240] as [number, number, number],
			textColor: [0, 0, 0] as [number, number, number],
			fontStyle: 'bold' as const,
			halign: 'center' as const
		}
	};
}

const DEFAULT_SIGNATORIES = [
	'Signature of the Class In-charge',
	'Signature of the HOD',
	'Signature of the Principal'
];

/**
 * Signature block in the mark report's shape: a ruled line per signatory with
 * the caption beneath it.
 *
 * The block is drawn wherever it fits; if the table ended too near the foot of
 * the page it moves to a fresh one rather than colliding with the footer. The
 * old version printed three bare captions with nothing to sign on.
 */
const signatureRow = (doc: jsPDF, y: number, captions = DEFAULT_SIGNATORIES) => {
	const pageWidth = doc.internal.pageSize.getWidth();
	const pageHeight = doc.internal.pageSize.getHeight();
	const usable = pageWidth - MARGIN * 2;
	const width = usable / captions.length;

	let lineY = y + 18;
	if (lineY + 8 > pageHeight - 10) {
		doc.addPage();
		lineY = MARGIN + 20;
	}

	doc.setFont('times', 'normal');
	doc.setFontSize(9);
	doc.setDrawColor(0, 0, 0);
	doc.setLineWidth(0.2);

	captions.forEach((caption, i) => {
		const centreX = MARGIN + i * width + width / 2;
		doc.line(MARGIN + i * width + 8, lineY, MARGIN + (i + 1) * width - 8, lineY);
		doc.text(caption, centreX, lineY + 5, { align: 'center' });
	});
};

/** The "Total / Entered / Pending" line the mark report prints under its table. */
const countLine = (doc: jsPDF, y: number, text: string): number => {
	doc.setFont('times', 'bold');
	doc.setFontSize(9);
	doc.text(text, MARGIN, y);
	return y;
};

/* ─────────────────── 1. Student-wise Course Attendance ─────────────────── */

/**
 * Course columns are paginated rather than shrunk: as many as fit the page, then
 * a continuation page repeating S.No / Roll No / Name as the anchor. A class with
 * twelve courses stays readable instead of collapsing to 5pt type.
 */
const COURSES_PER_PAGE = 6;

export function buildStudentCoursePdf(
	pivot: StudentCoursePivot,
	meta: ReportMeta,
	logos: ReportLogos
): jsPDF {
	const doc = newDoc('l');
	const chunks: typeof pivot.courses[] = [];
	for (let i = 0; i < pivot.courses.length; i += COURSES_PER_PAGE) {
		chunks.push(pivot.courses.slice(i, i + COURSES_PER_PAGE));
	}
	if (chunks.length === 0) chunks.push([]);

	chunks.forEach((courses, idx) => {
		if (idx > 0) doc.addPage();
		const startY = drawHeader(doc, meta, logos);

		const head = [
			[
				'S.No',
				'Roll No',
				'Student Name',
				...courses.map((c) => `${c.course_code}\n${c.course_name}`),
				'Overall %'
			]
		];
		const body = pivot.rows.map((r, i) => [
			String(i + 1),
			r.roll_number || '—',
			r.student_name || '—',
			...courses.map((c) => {
				const cell = r.cells[c.course_id];
				if (!cell) return '—';
				return `${cell.present}/${cell.conducted}\n${cell.percentage.toFixed(2)}%`;
			}),
			`${r.percentage.toFixed(2)}%`
		]);

		autoTable(doc, {
			...baseTableOptions(startY),
			head,
			body,
			columnStyles: {
				0: { cellWidth: 10, halign: 'center' },
				1: { cellWidth: 24 },
				2: { cellWidth: 44 }
			},
			didDrawPage: () => undefined
		});

		if (chunks.length > 1) {
			doc.setFont('times', 'italic');
			doc.setFontSize(7);
			doc.text(
				`Courses ${idx * COURSES_PER_PAGE + 1}–${idx * COURSES_PER_PAGE + courses.length} of ${pivot.courses.length}`,
				MARGIN,
				startY - 4.5
			);
		}
	});

	drawFooter(doc, 'Cell shows Present / Conducted hours and percentage');
	return doc;
}

/* ────────────────────────── 2. Daily Log Book ────────────────────────── */

const DAYS_PER_PAGE = 31;

export function buildLogBookPdf(
	pivot: LogBookPivot,
	meta: ReportMeta,
	logos: ReportLogos
): jsPDF {
	const doc = newDoc('l', 'a3');
	const chunks: string[][] = [];
	for (let i = 0; i < pivot.dates.length; i += DAYS_PER_PAGE) {
		chunks.push(pivot.dates.slice(i, i + DAYS_PER_PAGE));
	}
	if (chunks.length === 0) chunks.push([]);

	chunks.forEach((dates, idx) => {
		if (idx > 0) doc.addPage();
		const startY = drawHeader(doc, meta, logos);

		const head = [
			[
				'S.No',
				'Roll No',
				'Student Name',
				...dates.map(fmtDayShort),
				'P',
				'A',
				'OD',
				'Total',
				'%'
			]
		];
		const body = pivot.rows.map((r, i) => [
			String(i + 1),
			r.roll_number || '—',
			r.student_name || '—',
			...dates.map((d) => r.codes[d] || '–'),
			String(r.present),
			String(r.absent),
			String(r.od),
			String(r.conducted),
			`${r.percentage.toFixed(2)}%`
		]);

		autoTable(doc, {
			...baseTableOptions(startY),
			head,
			body,
			styles: { ...baseTableOptions(startY).styles, fontSize: 6, halign: 'center' },
			columnStyles: {
				0: { cellWidth: 8 },
				1: { cellWidth: 20 },
				2: { cellWidth: 38, halign: 'left' }
			}
		});
	});

	drawFooter(doc, 'P Present · A Absent · OD On Duty · L Leave · H Holiday · – No class');
	return doc;
}

/* ─────────────────── 3. Monthly + Cumulative Attendance ─────────────────── */

export function buildMonthlyPdf(
	pivot: MonthlyPivot,
	meta: ReportMeta,
	logos: ReportLogos
): jsPDF {
	const doc = newDoc('l');
	const startY = drawHeader(doc, meta, logos);

	const head = [
		[
			'S.No',
			'Roll No',
			'Student Name',
			...pivot.months.map(fmtMonth),
			'Cumulative %'
		]
	];
	const body = pivot.rows.map((r, i) => [
		String(i + 1),
		r.roll_number || '—',
		r.student_name || '—',
		...pivot.months.map((m) => {
			const c = r.cells[m];
			if (!c) return '—';
			return `${c.present}/${c.conducted}\n${c.percentage.toFixed(2)}%`;
		}),
		`${r.percentage.toFixed(2)}%`
	]);

	autoTable(doc, {
		...baseTableOptions(startY),
		head,
		body,
		columnStyles: {
			0: { cellWidth: 10, halign: 'center' },
			1: { cellWidth: 24 },
			2: { cellWidth: 44 }
		}
	});

	drawFooter(doc, 'Cell shows Present / Working hours and percentage');
	return doc;
}

/* ──────────────────── 4. Low Attendance / Defaulters ──────────────────── */

export function buildDefaultersPdf(
	totals: StudentTotal[],
	meta: ReportMeta,
	logos: ReportLogos
): jsPDF {
	const threshold = meta.threshold ?? DEFAULT_ATTENDANCE_THRESHOLD;
	const doc = newDoc('p');
	const startY = drawHeader(doc, meta, logos);

	const below = totals.filter((t) => t.percentage < threshold);

	autoTable(doc, {
		...baseTableOptions(startY),
		head: [
			[
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
			]
		],
		body: below.map((t, i) => [
			String(i + 1),
			t.roll_number || '—',
			t.student_name || '—',
			String(t.conducted),
			String(t.present),
			String(t.od),
			String(t.absent),
			`${t.percentage.toFixed(2)}%`,
			`${Math.max(0, threshold - t.percentage).toFixed(2)}%`,
			eligibilityOf(t.percentage, threshold)
		]),
		columnStyles: {
			0: { cellWidth: 9, halign: 'center' },
			2: { cellWidth: 38 }
		}
	});

	const endY =
		(doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
			?.finalY ?? startY;
	doc.setFont('times', 'normal');
	doc.setFontSize(8);
	doc.text(
		`${below.length} of ${totals.length} learners below ${threshold}%`,
		MARGIN,
		endY + 6
	);
	signatureRow(doc, endY + 6);

	drawFooter(doc, `Threshold ${threshold}%`);
	return doc;
}

/* ───────────────────── 5. Course-wise Attendance Summary ───────────────── */

export function buildCourseSummaryPdf(
	courses: CourseSummaryRow[],
	meta: ReportMeta,
	logos: ReportLogos
): jsPDF {
	const doc = newDoc('l');
	const startY = drawHeader(doc, meta, logos);

	autoTable(doc, {
		...baseTableOptions(startY),
		head: [
			[
				'S.No',
				'Course Code',
				'Course Name',
				'Students',
				'Present',
				'Absent',
				'OD',
				'Conducted',
				'Attendance %'
			]
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
			`${c.percentage.toFixed(2)}%`
		]),
		columnStyles: {
			0: { cellWidth: 10, halign: 'center' },
			1: { cellWidth: 26 },
			2: { cellWidth: 80 }
		}
	});

	const endY =
		(doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
			?.finalY ?? startY;
	signatureRow(doc, endY);
	drawFooter(doc);
	return doc;
}

/* ───────────────────── 6. Exam Eligibility Attendance ──────────────────── */

export function buildEligibilityPdf(
	totals: StudentTotal[],
	meta: ReportMeta,
	logos: ReportLogos
): jsPDF {
	const threshold = meta.threshold ?? DEFAULT_ATTENDANCE_THRESHOLD;
	const doc = newDoc('p');
	const startY = drawHeader(doc, meta, logos);

	autoTable(doc, {
		...baseTableOptions(startY),
		head: [
			[
				'S.No',
				'Roll No',
				'Student Name',
				'Overall %',
				'OD Adjusted %',
				'Condonation',
				'Exam Eligibility'
			]
		],
		body: totals.map((t, i) => {
			const status = eligibilityOf(t.odAdjusted, threshold);
			return [
				String(i + 1),
				t.roll_number || '—',
				t.student_name || '—',
				`${t.percentage.toFixed(2)}%`,
				`${t.odAdjusted.toFixed(2)}%`,
				status === 'Condonation Required' ? 'Required' : 'No',
				status === 'Eligible' ? 'Eligible' : 'Pending'
			];
		}),
		columnStyles: {
			0: { cellWidth: 10, halign: 'center' },
			2: { cellWidth: 46 }
		}
	});

	const endY =
		(doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
			?.finalY ?? startY;
	signatureRow(doc, endY);
	drawFooter(
		doc,
		`Threshold ${threshold}% · OD Adjusted counts On Duty hours as attended`
	);
	return doc;
}

/* ───────── 7. Pending Attendance — Faculty-wise and Subject-wise ───────── */

/**
 * Three tables in one document, in the order the reader needs them.
 *
 * Page 1 answers "who has a backlog" - one row per member of staff. Page 2
 * answers "which subjects are behind" - one row per course, which is the view a
 * HOD needs when the gap is a lab or an elective nobody owns rather than one
 * person. Everything after answers "which sessions", banded under the faculty
 * name, so the follow-up conversation and the evidence for it are never in two
 * separate files.
 *
 * Landscape: the widest table carries course and class names that a portrait
 * page would wrap to three lines each.
 */
export function buildPendingFacultyPdf(
	report: PendingFacultyReport,
	meta: ReportMeta,
	logos: ReportLogos
): jsPDF {
	const doc = newDoc('l');
	const inst = report.showInstitution;

	/**
	 * Draw the letterhead plus a section caption, and return where the table
	 * starts.
	 *
	 * Unlike the register reports, this one paginates through autotable rather
	 * than through fixed column chunks, so it is the report most likely to run
	 * to many pages - a college-wide backlog easily does. Redrawing the
	 * letterhead on every page (and reserving `margin.top` for it) is what keeps
	 * page 4 of a printout identifiable after it has been separated from page 1,
	 * which is how these get circulated.
	 */
	const section = (caption: string): number => {
		const y = drawHeader(doc, meta, logos);
		doc.setFont('times', 'bold');
		doc.setFontSize(9.5);
		doc.text(caption, MARGIN, y + 1);
		return y + 3;
	};

	/**
	 * Column widths are declared as pairs so the optional Institution column
	 * cannot drift out of step with its header. A single-college run drops it
	 * entirely rather than printing the letterhead again in every row.
	 */
	const table = (
		caption: string,
		cols: Array<{ head: string; width: number; center?: boolean; bold?: boolean }>,
		body: RowInput[],
		emphasiseCol?: number
	): number => {
		const startY = section(caption);
		const columnStyles: Record<number, object> = {};
		cols.forEach((c, i) => {
			columnStyles[i] = {
				cellWidth: c.width,
				...(c.center ? { halign: 'center' as const } : {}),
				...(c.bold ? { fontStyle: 'bold' as const } : {})
			};
		});

		autoTable(doc, {
			...baseTableOptions(startY),
			margin: { left: MARGIN, right: MARGIN, top: startY },
			didDrawPage: (data) => {
				if (data.pageNumber > 1) section(`${caption} (contd.)`);
			},
			head: [cols.map((c) => c.head)],
			body,
			columnStyles,
			// The overdue count is the actionable half of this report. Bold rather
			// than colour: these registers are photocopied and filed in black and
			// white, where a red cell is indistinguishable from every other one.
			didParseCell: (hook) => {
				if (
					emphasiseCol !== undefined &&
					hook.section === 'body' &&
					hook.column.index === emphasiseCol &&
					Number(hook.cell.raw) > 0
				) {
					hook.cell.styles.fontStyle = 'bold';
				}
			}
		});

		return (
			(doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
				?.finalY ?? startY
		);
	};

	/* ── 1. Faculty-wise ── */
	const facultyCols = [
		{ head: 'S.No', width: 10, center: true },
		{ head: 'Faculty Name', width: inst ? 46 : 55 },
		...(inst ? [{ head: 'Institution', width: 40 }] : []),
		{ head: 'Department', width: inst ? 36 : 45 },
		{ head: 'Pending', width: 16, center: true, bold: true },
		{ head: 'Overdue', width: 16, center: true },
		{ head: 'Today', width: 14, center: true },
		{ head: 'Subjects', width: 17, center: true },
		{ head: 'Classes', width: 16, center: true },
		{ head: 'Oldest Pending', width: 26, center: true },
		{ head: 'Max Days Late', width: 22, center: true }
	];

	let endY = table(
		'FACULTY-WISE PENDING ATTENDANCE',
		facultyCols,
		report.faculty.map((f, i) => [
			String(i + 1),
			f.faculty_name,
			...(inst ? [f.institution_name || '—'] : []),
			f.department_name || '—',
			String(f.pending),
			String(f.overdue),
			String(f.today),
			String(f.subjects),
			String(f.classes),
			f.oldest ? fmtDate(f.oldest) : '—',
			f.maxDaysLate > 0 ? String(f.maxDaysLate) : '—'
		]),
		inst ? 5 : 4
	);

	countLine(
		doc,
		endY + 6,
		`${report.periodCount} pending session${report.periodCount === 1 ? '' : 's'} · ` +
			`${report.faculty.length} faculty member${report.faculty.length === 1 ? '' : 's'} · ` +
			`${report.subjects.length} subject${report.subjects.length === 1 ? '' : 's'}` +
			(report.unassigned > 0
				? ` · ${report.unassigned} session${report.unassigned === 1 ? '' : 's'} with no faculty on the timetable`
				: '')
	);

	if (report.fannedOut) {
		doc.setFont('times', 'italic');
		doc.setFontSize(7.5);
		doc.text(
			'A co-taught session is counted against every member assigned to it, so the Pending column above sums to more than the session total. The subject table below does not fan out.',
			MARGIN,
			endY + 10.5
		);
	}

	/* ── 2. Subject-wise ── */
	if (report.subjects.length) {
		doc.addPage();
		endY = table(
			'SUBJECT-WISE PENDING ATTENDANCE',
			[
				{ head: 'S.No', width: 10, center: true },
				{ head: 'Course Code', width: 28 },
				{ head: 'Course / Subject', width: inst ? 62 : 80 },
				...(inst ? [{ head: 'Institution', width: 40 }] : []),
				{ head: 'Pending', width: 16, center: true, bold: true },
				{ head: 'Overdue', width: 16, center: true },
				{ head: 'Today', width: 14, center: true },
				{ head: 'Faculty', width: 16, center: true },
				{ head: 'Classes', width: 16, center: true },
				{ head: 'Oldest Pending', width: 26, center: true }
			],
			report.subjects.map((s, i) => [
				String(i + 1),
				s.course_code,
				s.course_name,
				...(inst ? [s.institution_name || '—'] : []),
				String(s.pending),
				String(s.overdue),
				String(s.today),
				String(s.faculty),
				String(s.classes),
				s.oldest ? fmtDate(s.oldest) : '—'
			]),
			inst ? 4 : 3
		);
	}

	/* ── 3. Session detail, banded by faculty ── */
	if (report.details.length) {
		doc.addPage();
		const startY = section('PENDING SESSION DETAILS');

		const detailCols = [
			{ head: 'S.No', width: 10, center: true },
			{ head: 'Date', width: 22, center: true },
			{ head: 'Day', width: 12, center: true },
			{ head: 'Session / Period', width: 32 },
			{ head: 'Course / Subject', width: inst ? 50 : 60 },
			{ head: 'Class / Section', width: inst ? 44 : 52 },
			...(inst ? [{ head: 'Institution', width: 34 }] : []),
			{ head: 'Attendance Status', width: 25, center: true },
			{ head: 'Pending Details', width: inst ? 44 : 50 }
		];

		// A full-width band opens each member's block, so a reader flipping
		// through pages always knows whose sessions they are looking at even when
		// a block spans a page break.
		const body: RowInput[] = [];
		let current: string | null = null;
		let n = 0;

		for (const d of report.details) {
			if (d.staff_id !== current) {
				current = d.staff_id;
				n = 0;
				const summary = report.faculty.find((f) => f.staff_id === d.staff_id);
				body.push([
					{
						content:
							d.faculty_name +
							(summary
								? `   —   ${summary.pending} pending` +
									(summary.overdue ? `, ${summary.overdue} overdue` : '') +
									(summary.department_name ? `   ·   ${summary.department_name}` : '')
								: '') +
							(d.staff_id === UNASSIGNED_FACULTY_ID
								? '   ·   assign staff to these timetable slots so the sessions have an owner'
								: ''),
						colSpan: detailCols.length,
						styles: {
							fontStyle: 'bold',
							fillColor: [235, 235, 235],
							halign: 'left'
						}
					}
				]);
			}
			n += 1;
			body.push([
				String(n),
				fmtDate(d.date),
				d.day,
				d.session,
				d.course,
				d.classSection,
				...(inst ? [d.institution_name || '—'] : []),
				d.status,
				d.detail
			]);
		}

		const columnStyles: Record<number, object> = {};
		detailCols.forEach((c, i) => {
			columnStyles[i] = {
				cellWidth: c.width,
				...(c.center ? { halign: 'center' as const } : {})
			};
		});

		autoTable(doc, {
			...baseTableOptions(startY),
			margin: { left: MARGIN, right: MARGIN, top: startY },
			didDrawPage: (data) => {
				if (data.pageNumber > 1) section('PENDING SESSION DETAILS (contd.)');
			},
			head: [detailCols.map((c) => c.head)],
			body,
			columnStyles
		});

		endY =
			(doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
				?.finalY ?? startY;
	}

	signatureRow(doc, endY, [
		'Signature of the HOD',
		'Signature of the Principal'
	]);

	drawFooter(
		doc,
		'Pending = a session the timetable schedules that still has no attendance marked'
	);
	return doc;
}

/**
 * Empty-result page.
 *
 * Nothing pending is a real, reportable outcome - a HOD asked to evidence that
 * their department is clear needs a document that says so, on letterhead, with
 * the same period and scope printed on it. Returning no PDF at all would leave
 * them screenshotting a toast.
 */
export function buildPendingEmptyPdf(
	meta: ReportMeta,
	logos: ReportLogos
): jsPDF {
	const doc = newDoc('l');
	const startY = drawHeader(doc, meta, logos);
	const pageWidth = doc.internal.pageSize.getWidth();

	doc.setFont('times', 'bold');
	doc.setFontSize(11);
	doc.text(
		'No pending attendance for this scope and period.',
		pageWidth / 2,
		startY + 14,
		{ align: 'center' }
	);
	doc.setFont('times', 'normal');
	doc.setFontSize(9);
	doc.text(
		'Every session the timetables schedule in this window has attendance marked against it.',
		pageWidth / 2,
		startY + 20,
		{ align: 'center' }
	);

	signatureRow(doc, startY + 20, [
		'Signature of the HOD',
		'Signature of the Principal'
	]);
	drawFooter(doc);
	return doc;
}
