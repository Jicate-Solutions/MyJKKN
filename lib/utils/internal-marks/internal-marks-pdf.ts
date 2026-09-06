import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { computeSchemeTotals } from '@/lib/utils/bos/course-scheme-totals'

// â”€â”€â”€ Number to words â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Single source of truth per COE integration spec Â§7.5: digit-by-digit ALL CAPS.
//   0   â†’ "ZERO"
//   13  â†’ "ONE THREE"
//   100 â†’ "ONE ZERO ZERO"
// Replaces the old recursive readable form ("Twenty Eight").
const DIGIT_WORDS = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE',
	'SIX', 'SEVEN', 'EIGHT', 'NINE']
function numberToWords(num: number): string {
	const n = Math.floor(Math.abs(num))
	if (n === 0) return num < 0 ? 'MINUS ZERO' : 'ZERO'
	const numStr = n.toString().padStart(2, '0')
	const words = numStr.split('').map(d => DIGIT_WORDS[parseInt(d, 10)]).join(' ')
	return num < 0 ? 'MINUS ' + words : words
}

export interface LearnerMark {
	serial_number: number
	register_number: string
	student_name: string
	component_marks: Record<string, number>
	total: number
}

export interface ComponentDef {
	code: string
	name: string
	max_marks: number
}

export interface InternalMarksPDFData {
	institution_name: string
	institution_address?: string
	institution_accreditation?: string
	program_code: string
	program_name: string
	semester: number | string
	course_code: string
	course_name: string
	internal_max_mark: number
	exam_session: string
	assessment_name: string
	cia_round_name: string
	components: ComponentDef[]
	learners: LearnerMark[]
	logoImage?: string
	rightLogoImage?: string
}

// A4 portrait dimensions
const A4_WIDTH = 210
const A4_HEIGHT = 297
const MARGIN = 10

// â”€â”€â”€ Shared institution banner (logo + name + accreditation + address) â”€â”€â”€â”€â”€â”€â”€â”€
// Called by every PDF generator so all documents share the same institutional
// header layout regardless of which college/institution is selected.
// Detect image format from a data-URL so institutions can store logos as
// PNG, JPEG, or WebP without the caller needing to know the encoding.
export function detectImageFormat(src: string): string {
	if (/^data:image\/jpe?g/i.test(src)) return 'JPEG'
	if (/^data:image\/webp/i.test(src)) return 'WEBP'
	return 'PNG'
}

export function drawInstitutionBanner(
	doc: jsPDF,
	data: {
		institution_name?: string
		/** Optional line under the name (e.g. CET "( An Autonomous Institution )"). */
		institution_subtitle?: string
		institution_accreditation?: string
		institution_address?: string
		logoImage?: string
		rightLogoImage?: string
	},
	pageWidth: number,
	y: number,
): number {
	const logoSize = 18
	const hasSubtitle = !!data.institution_subtitle
	// Four-line CET-style banners need a slightly taller band than the classic
	// name / accreditation / address layout.
	const bandH = hasSubtitle ? 22 : logoSize

	if (data.logoImage) {
		try { doc.addImage(data.logoImage, detectImageFormat(data.logoImage), MARGIN, y, logoSize, logoSize) } catch {}
	}
	if (data.rightLogoImage) {
		try { doc.addImage(data.rightLogoImage, detectImageFormat(data.rightLogoImage), pageWidth - MARGIN - logoSize, y, logoSize, logoSize) } catch {}
	}

	// Pack centred text inside the logo band. Logos sit only in the side
	// margins, so fixed offsets keep lines from colliding with the marks.
	const hasExtra = !!(data.institution_accreditation || data.institution_address || hasSubtitle)
	const nameY = hasExtra ? y + (hasSubtitle ? 3.5 : 4) : y + 9
	doc.setFont('times', 'bold')
	doc.setFontSize(hasSubtitle ? 11 : 13)
	doc.setTextColor(0, 0, 0)
	doc.text(data.institution_name ?? '', pageWidth / 2, nameY, { align: 'center' })

	if (data.institution_subtitle) {
		doc.setFont('times', 'bold')
		doc.setFontSize(8)
		doc.text(data.institution_subtitle, pageWidth / 2, y + 8, { align: 'center' })
	}

	if (data.institution_accreditation) {
		doc.setFont('times', 'normal')
		doc.setFontSize(8)
		doc.text(
			data.institution_accreditation,
			pageWidth / 2,
			hasSubtitle ? y + 12.5 : y + 9.5,
			{ align: 'center' },
		)
	}

	if (data.institution_address) {
		doc.setFont('times', 'bold')
		doc.setFontSize(9)
		doc.text(
			data.institution_address,
			pageWidth / 2,
			hasSubtitle ? y + 17 : y + 14.5,
			{ align: 'center' },
		)
	}

	// Advance y past the logo / text band for subsequent content
	return y + bandH + (data.institution_address ? 4 : 2)
}

// --- CET printed-stationery letterhead (jsPDF port) --------------------------
// The engineering college's BoS paperwork is printed on its own stationery:
// green college name + "( An Autonomous Institution )", magenta trust /
// approval / NAAC / address lines, engineering mark at the left, and a pink
// double rule. The minutes and the call letter already render it
// (lib/utils/bos/meeting-minutes-html-pdf.ts, lib/pdf/bos-meeting-notice.ts);
// the TA/DA claim form was still printing the plain black banner, so the same
// member received two documents disagreeing about the college's own name.
//
// Text is transcribed verbatim from those renderers -- including the "NATTRAJA"
// double-T and "Kumarapalayam" spellings of the printed sheet, which differ
// from institution-header.ts on purpose. Do not "fix" them here in isolation.
//
// Those renderers are HTML/Puppeteer and server-only, so the strings are
// re-declared rather than imported: pulling meeting-minutes-html-pdf.ts into
// this client-side module would drag Puppeteer into the browser bundle.
const CET_LETTERHEAD = {
	name: 'J.K.K.NATTRAJA COLLEGE OF ENGINEERING & TECHNOLOGY',
	autonomous: '( An Autonomous Institution )',
	trust: '( MANAGED BY J.K.K.RANGAMMAL CHARITABLE TRUST )',
	lines: [
		'(Approved by AICTE - New Delhi & Affiliated to Anna University, Chennai)',
		'Recognized by UGC Under Section 2(f) & Accredited by NAAC',
		'Natarajapuram, Kumarapalayam - 638 183, Namakkal Dt., Tamil Nadu.',
	],
}

// Same institution test the minutes and call letter use, so the three documents
// switch stationery together. Matches counselling_code "CET" / short names as
// well as free-text "engineering|technology".
export function isCetInstitution(name?: string | null): boolean {
	const s = name ?? ''
	return /\bcet\b|jkkncet|engineering|technology/i.test(s)
}

/**
 * Draw the CET letterhead and return the y to continue at.
 *
 * The logo sits at the left margin while the text block stays centred on the
 * FULL page width (mirroring the absolutely-positioned logo in the HTML
 * version) -- that is what keeps the college name and the address each on a
 * single line. The name is auto-shrunk if it would ever reach the logo.
 */
export function drawCetLetterhead(
	doc: jsPDF,
	data: { logoImage?: string; rightLogoImage?: string },
	pageWidth: number,
	y: number,
): number {
	// The engineering mark is loaded into rightLogoImage by the callers; the
	// generic trust logo is the fallback.
	const logo = data.rightLogoImage || data.logoImage
	const logoW = 26
	const logoH = 19
	const centerX = pageWidth / 2

	if (logo) {
		try {
			doc.addImage(logo, detectImageFormat(logo), MARGIN, y + 3.5, logoW, logoH)
		} catch {}
	}

	// College name -- green, bold. Shrink only if it would collide with the logo.
	const nameMaxW = pageWidth - 2 * (MARGIN + logoW + 3)
	doc.setFont('times', 'bold')
	let nameSize = 15
	doc.setFontSize(nameSize)
	while (nameSize > 10 && doc.getTextWidth(CET_LETTERHEAD.name) > nameMaxW) {
		nameSize -= 0.5
		doc.setFontSize(nameSize)
	}
	doc.setTextColor(26, 122, 61)
	doc.text(CET_LETTERHEAD.name, centerX, y + 5, { align: 'center' })

	doc.setFontSize(9.5)
	doc.text(CET_LETTERHEAD.autonomous, centerX, y + 10, { align: 'center' })

	doc.setFont('times', 'normal')
	doc.setFontSize(9)
	doc.setTextColor(194, 24, 91)
	doc.text(CET_LETTERHEAD.trust, centerX, y + 14.5, { align: 'center' })

	doc.setFont('times', 'bold')
	doc.setFontSize(9)
	doc.setTextColor(176, 19, 92)
	CET_LETTERHEAD.lines.forEach((line, i) => {
		doc.text(line, centerX, y + 19 + i * 4, { align: 'center' })
	})

	// Pink double rule closing the letterhead.
	const ruleY = y + 19 + CET_LETTERHEAD.lines.length * 4 - 1
	doc.setDrawColor(224, 64, 127)
	doc.setLineWidth(0.8)
	doc.line(MARGIN, ruleY, pageWidth - MARGIN, ruleY)
	doc.setLineWidth(0.3)
	doc.line(MARGIN, ruleY + 1.4, pageWidth - MARGIN, ruleY + 1.4)

	// Restore the defaults the rest of the document draws with -- jsPDF state is
	// global, and leaving pink/green set here bleeds into the tables below.
	doc.setTextColor(0, 0, 0)
	doc.setDrawColor(0, 0, 0)
	doc.setLineWidth(0.2)

	return ruleY + 5
}

/**
 * Header for the BoS TA/DA claim form: CET's printed stationery for the
 * engineering college, the shared plain banner for every other institution.
 */
export function drawBosClaimHeader(
	doc: jsPDF,
	data: {
		institution_name?: string
		institution_accreditation?: string
		institution_address?: string
		logoImage?: string
		rightLogoImage?: string
	},
	pageWidth: number,
	y: number,
): number {
	return isCetInstitution(data.institution_name)
		? drawCetLetterhead(doc, data, pageWidth, y)
		: drawInstitutionBanner(doc, data, pageWidth, y)
}

/**
 * Generates Internal Mark Entry Sheet PDF â€” Portrait A4, Times New Roman, auto-fit columns
 */
export function generateInternalMarksPDF(data: InternalMarksPDFData): string {
	const doc = new jsPDF('portrait', 'mm', 'a4')
	const pageWidth = A4_WIDTH
	const pageHeight = A4_HEIGHT
	const tableWidth = pageWidth - MARGIN * 2
	let currentY = MARGIN

	// ========== HEADER ==========
	currentY = drawInstitutionBanner(doc, data, pageWidth, currentY)

	// Exam session
	doc.setFont('times', 'bold')
	doc.setFontSize(11)
	doc.text(`SEMESTER EXAMINATION - ${data.exam_session}`, pageWidth / 2, currentY, { align: 'center' })
	currentY += 5

	// Title
	doc.setFont('times', 'bold')
	doc.setFontSize(11)
	doc.text('INTERNAL MARK ENTRY SHEET', pageWidth / 2, currentY, { align: 'center' })
	currentY += 5

	// Assessment + CIA round
	doc.setFont('times', 'normal')
	doc.setFontSize(9)
	doc.text(`${data.assessment_name} \u2014 ${data.cia_round_name}`, pageWidth / 2, currentY, { align: 'center' })
	currentY += 6

	// ========== COURSE DETAILS ==========
	doc.setFont('times', 'bold')
	doc.setFontSize(9)

	// Row 1: Program & Semester
	doc.text(`Program: ${data.program_code} - ${data.program_name}`, MARGIN, currentY)
	if (data.semester) {
		doc.text(`Semester: ${data.semester}`, pageWidth - MARGIN, currentY, { align: 'right' })
	}
	currentY += 4.5

	// Row 2: Course & Assessment Mark (= sum of component maxes per COE spec Â§7.2)
	doc.setFont('times', 'normal')
	doc.setFontSize(9)
	const courseText = `Course: ${data.course_code} - ${data.course_name}`
	const courseLines = doc.splitTextToSize(courseText, tableWidth - 50)
	doc.text(courseLines, MARGIN, currentY)
	const assessmentMark = data.components.reduce((sum, c) => sum + (c.max_marks || 0), 0)
	doc.text(`Assessment Mark: ${assessmentMark}`, pageWidth - MARGIN, currentY, { align: 'right' })
	currentY += courseLines.length > 1 ? courseLines.length * 4 : 4.5

	currentY += 2

	// ========== MARKS TABLE â€” auto-fit to A4 width ==========
	const compCount = data.components.length

	// Calculate column widths to fit exactly in A4
	const snoW = 8
	const regW = 32
	const totalW = 12
	const wordsMinW = 22
	const nameMinW = 30

	const fixedUsed = snoW + regW + totalW
	const remaining = tableWidth - fixedUsed
	const compTotalW = Math.min(compCount * 16, remaining * 0.35)
	const compW = compCount > 0 ? compTotalW / compCount : 0
	const afterComp = remaining - compTotalW
	const nameW = Math.max(nameMinW, afterComp * 0.6)
	const wordsW = Math.max(wordsMinW, afterComp * 0.4)

	// Build head
	const headRow = ['S.No', 'Reg No', 'Name of the Student']
	data.components.forEach(c => headRow.push(`${c.name}\n(${c.max_marks})`))
	headRow.push('Total', 'Marks in Words')

	// Build body â€” Option B per COE spec Â§7.3: every learner has every component,
	// missing component values render as 0 (not '-'), and "Marks in Words" always renders.
	const bodyRows = data.learners.map(learner => {
		const row: (string | number)[] = [
			learner.serial_number,
			learner.register_number,
			learner.student_name,
		]
		data.components.forEach(c => {
			const mark = learner.component_marks[c.code]
			row.push(mark != null ? mark : 0)
		})
		row.push(learner.total)
		row.push(numberToWords(learner.total))
		return row
	})

	// Column styles
	const columnStyles: Record<number, object> = {
		0: { cellWidth: snoW, halign: 'center' },
		1: { cellWidth: regW, halign: 'center' },
		2: { cellWidth: nameW, halign: 'left' },
	}
	data.components.forEach((_, i) => {
		columnStyles[3 + i] = { cellWidth: compW, halign: 'center' }
	})
	columnStyles[3 + compCount] = { cellWidth: totalW, halign: 'center', fontStyle: 'bold' }
	columnStyles[4 + compCount] = { cellWidth: wordsW, halign: 'left' }

	autoTable(doc, {
		head: [headRow],
		body: bodyRows,
		startY: currentY,
		margin: { left: MARGIN, right: MARGIN },
		tableWidth,
		theme: 'grid',
		styles: {
			font: 'times',
			fontSize: 10,
			cellPadding: 2,
			lineColor: [0, 0, 0],
			lineWidth: 0.3,
			textColor: [0, 0, 0],
			valign: 'middle',
			minCellHeight: 8,
			overflow: 'linebreak',
		},
		headStyles: {
			font: 'times',
			fontStyle: 'bold',
			fillColor: [240, 240, 240],
			textColor: [0, 0, 0],
			halign: 'center',
			fontSize: 10,
			minCellHeight: 10,
		},
		columnStyles,
		didDrawPage: (hookData) => {
			// Footer
			const footerY = pageHeight - 6
			doc.setFont('times', 'normal')
			doc.setFontSize(7)
			doc.setTextColor(128, 128, 128)
			doc.text(`${new Date().toLocaleString('en-IN')}`, MARGIN, footerY)
			doc.text(`Page ${hookData.pageNumber}`, pageWidth - MARGIN, footerY, { align: 'right' })
			doc.setTextColor(0, 0, 0)
		},
	})

	// ========== SUMMARY ==========
	const finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY || currentY + 50
	currentY = finalY + 6

	if (currentY + 30 > pageHeight - 12) {
		doc.addPage()
		currentY = MARGIN
	}

	doc.setFont('times', 'bold')
	doc.setFontSize(9)
	// Option B per COE spec Â§7.4: every learner row counts as entered â†’ Pending: 0 always.
	const totalLearners = data.learners.length
	doc.text(`Total Learners: ${totalLearners}    Marks Entered: ${totalLearners}    Pending: 0`, MARGIN, currentY)
	currentY += 14

	// ========== SIGNATURE SECTION ==========
	const sigWidth = tableWidth / 3
	const sigLabels = [
		'Signature of the Subject In-Charge',
		'Signature of the HOD',
		'Signature of the Principal',
	]

	doc.setFont('times', 'normal')
	doc.setFontSize(9)

	sigLabels.forEach((label, i) => {
		const centerX = MARGIN + (i * sigWidth) + sigWidth / 2
		const lineX1 = MARGIN + (i * sigWidth) + 8
		const lineX2 = MARGIN + ((i + 1) * sigWidth) - 8

		doc.setDrawColor(0, 0, 0)
		doc.line(lineX1, currentY, lineX2, currentY)
		doc.text(label, centerX, currentY + 5, { align: 'center' })
	})

	// ========== SAVE ==========
	const fileName = `${data.course_code}_${data.cia_round_name}_internal_marks_${new Date().toISOString().split('T')[0]}.pdf`
	doc.save(fileName)
	return fileName
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// CONSOLIDATED REPORT â€” LANDSCAPE A4, one semester per page, wide table
// Layout: S.No | Reg No | Name | course1 (max) | course2 (max) | ...
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import type { ConsolidatedReportData } from '@/types/internal-marks'

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SHARED CURRENCY WORDS â€” Indian number system, shared by form display + PDF
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const ONES_W = [
	'', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
	'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
	'Seventeen', 'Eighteen', 'Nineteen',
]
const TENS_W = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function _numToWords(n: number): string {
	if (n === 0) return ''
	if (n < 20) return ONES_W[n]
	if (n < 100) return TENS_W[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES_W[n % 10] : '')
	if (n < 1000) return ONES_W[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + _numToWords(n % 100) : '')
	if (n < 100000) return _numToWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + _numToWords(n % 1000) : '')
	if (n < 10000000) return _numToWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + _numToWords(n % 100000) : '')
	return _numToWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + _numToWords(n % 10000000) : '')
}

/** "ONE THOUSAND TWO HUNDRED RUPEES ONLY" â€” Indian currency amount to words. */
export function amountToWords(amount: number): string {
	const n = Math.floor(Math.abs(amount))
	const paise = Math.round((Math.abs(amount) - n) * 100)
	if (n === 0 && paise === 0) return 'ZERO RUPEES ONLY'
	let result = n > 0 ? _numToWords(n) + ' Rupees' : ''
	if (paise > 0) result += (result ? ' and ' : '') + _numToWords(paise) + ' Paise'
	return (result + ' Only').toUpperCase()
}

const A4_LAND_WIDTH = 297
const A4_LAND_HEIGHT = 210

export function generateConsolidatedReportPDF(data: ConsolidatedReportData): string {
	const doc = new jsPDF('landscape', 'mm', 'a4')
	const pageWidth = A4_LAND_WIDTH
	const pageHeight = A4_LAND_HEIGHT
	const tableWidth = pageWidth - MARGIN * 2

	// Render each semester on a new page
	data.semesters.forEach((sem, semIdx) => {
		if (semIdx > 0) doc.addPage()

		let currentY = MARGIN

		// â”€â”€ HEADER (logos + institution + title) â”€â”€
		currentY = drawInstitutionBanner(doc, data, pageWidth, currentY)

		doc.setFontSize(11)
		doc.text(`SEMESTER EXAMINATION - ${data.exam_session}`, pageWidth / 2, currentY, {
			align: 'center',
		})
		currentY += 5

		doc.text('CONSOLIDATED INTERNAL MARK REPORT', pageWidth / 2, currentY, { align: 'center' })
		currentY += 5

		doc.setFont('times', 'normal')
		doc.setFontSize(9)
		doc.text(
			`${data.assessment_name} \u2014 ${data.cia_round_name}`,
			pageWidth / 2,
			currentY,
			{ align: 'center' }
		)
		currentY += 6

		// â”€â”€ PROGRAM + SEMESTER LINE â”€â”€
		doc.setFont('times', 'bold')
		doc.setFontSize(9)
		doc.text(`Program: ${data.program_code} - ${data.program_name}`, MARGIN, currentY)
		doc.text(`Semester: ${sem.semester_label}`, pageWidth - MARGIN, currentY, { align: 'right' })
		currentY += 5

		// â”€â”€ TABLE â”€â”€
		const snoW = 10
		const regW = 26
		const nameW = 45
		const fixedUsed = snoW + regW + nameW
		const courseColCount = sem.courses.length
		const remaining = tableWidth - fixedUsed
		const courseW = courseColCount > 0 ? remaining / courseColCount : remaining

		// Build head: S.No, Reg No, Name, course1(max), course2(max)...
		const headRow: string[] = ['S.No', 'Reg No', 'Name of the Student']
		sem.courses.forEach((c) => {
			headRow.push(`${c.course_code}\n(${c.internal_max_mark})`)
		})

		// Build body: one row per student, with a cell per course
		const bodyRows = sem.students.map((student, idx) => {
			const row: (string | number)[] = [
				idx + 1,
				student.register_number,
				student.student_name,
			]
			sem.courses.forEach((c) => {
				const mark = student.marks[c.course_code]
				row.push(mark !== null && mark !== undefined ? mark : '-')
			})
			return row
		})

		// Column styles
		const columnStyles: Record<number, object> = {
			0: { cellWidth: snoW, halign: 'center' },
			1: { cellWidth: regW, halign: 'center' },
			2: { cellWidth: nameW, halign: 'left' },
		}
		for (let i = 0; i < courseColCount; i++) {
			columnStyles[3 + i] = { cellWidth: courseW, halign: 'center' }
		}

		autoTable(doc, {
			head: [headRow],
			body: bodyRows,
			startY: currentY,
			margin: { left: MARGIN, right: MARGIN },
			tableWidth,
			theme: 'grid',
			styles: {
				font: 'times',
				fontSize: 8,
				cellPadding: 1.5,
				lineColor: [0, 0, 0],
				lineWidth: 0.3,
				textColor: [0, 0, 0],
				valign: 'middle',
				minCellHeight: 6,
				overflow: 'linebreak',
			},
			headStyles: {
				font: 'times',
				fontStyle: 'bold',
				fillColor: [240, 240, 240],
				textColor: [0, 0, 0],
				halign: 'center',
				fontSize: 8,
				minCellHeight: 9,
			},
			columnStyles,
			didDrawPage: (hookData) => {
				const footerY = pageHeight - 6
				doc.setFont('times', 'normal')
				doc.setFontSize(7)
				doc.setTextColor(128, 128, 128)
				doc.text(`${new Date().toLocaleString('en-IN')}`, MARGIN, footerY)
				doc.text(
					`Page ${hookData.pageNumber}`,
					pageWidth - MARGIN,
					footerY,
					{ align: 'right' }
				)
				doc.setTextColor(0, 0, 0)
			},
		})

		// â”€â”€ SIGNATURE SECTION â”€â”€
		// Consolidated report uses "Class In-Charge" (different from entry sheet)
		const finalY =
			(doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ||
			currentY + 50
		let sigY = finalY + 14
		if (sigY + 10 > pageHeight - 12) {
			// If not enough room on the current page, put signatures at the bottom
			sigY = pageHeight - 20
		}

		const sigWidth = tableWidth / 3
		const sigLabels = [
			'Signature of the Class In-Charge',
			'Signature of the HOD',
			'Signature of the Principal',
		]

		doc.setFont('times', 'normal')
		doc.setFontSize(9)
		sigLabels.forEach((label, i) => {
			const centerX = MARGIN + i * sigWidth + sigWidth / 2
			const lineX1 = MARGIN + i * sigWidth + 10
			const lineX2 = MARGIN + (i + 1) * sigWidth - 10

			doc.setDrawColor(0, 0, 0)
			doc.line(lineX1, sigY, lineX2, sigY)
			doc.text(label, centerX, sigY + 5, { align: 'center' })
		})
	})

	// ========== SAVE ==========
	const semRange = data.semesters.map((s) => s.semester_label).join('-')
	const fileName = `consolidated_${data.program_code}_sem${semRange}_${data.cia_round_name}_${new Date().toISOString().split('T')[0]}.pdf`
	doc.save(fileName)
	return fileName
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// BOS CLAIM FORM â€” Portrait A4, mirrors the official paper claim form
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface BosClaimPDFData {
	institution_name: string
	institution_address?: string
	institution_accreditation?: string
	logoImage?: string
	rightLogoImage?: string

	bos_subject: string   // "Board of Studies of ___" subject line
	/**
	 * Convening council/committee of the meeting (e.g. 'Academic Council',
	 * 'Curriculum Development Cell'). Drives the "Claim Form for <council> of"
	 * title and the "Position in <council>" row. Falls back to 'BOS'.
	 */
	council_name?: string
	claim_date: string    // formatted e.g. "11/05/2026"

	member_name: string
	designation?: string
	college_address?: string
	position_in_bos?: string
	mobile?: string
	email?: string

	honorarium: number    // renamed from remuneration on 2026-05-21 SOP redesign
	ta_amount: number     // travel only (round-trip km * Rs.5)
	total: number         // honorarium + ta_amount

	bank_name?: string
	branch_name?: string
	account_number?: string
	ifsc_code?: string
	neft_amount?: number
	pan_number?: string
}

export function generateBosClaimPDF(data: BosClaimPDFData): string {
	const doc = new jsPDF('portrait', 'mm', 'a4')
	const pageWidth = A4_WIDTH
	const tableWidth = pageWidth - MARGIN * 2
	let currentY = MARGIN

	// â”€â”€ Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	currentY = drawBosClaimHeader(doc, data, pageWidth, currentY)

	// â”€â”€ Form title line â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	currentY += 2
	doc.setFont('times', 'normal')
	doc.setFontSize(10)
	const councilName = data.council_name?.trim() || 'BOS'
	const subjectLabel = `Claim Form for ${councilName} of `
	const datePart = `Date: ${data.claim_date}`
	doc.text(subjectLabel + data.bos_subject, MARGIN, currentY)
	doc.text(datePart, pageWidth - MARGIN, currentY, { align: 'right' })
	// Removed the fill-in-the-blank underline beneath the subject slot
	// (2026-05-21) — bos_subject is now auto-rendered from board_type +
	// board_name, no manual handwriting required, so the line reads as a
	// visual artefact rather than affordance.
	currentY += 7

	// â”€â”€ Particulars table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	// CET's printed claim form calls the fixed per-meeting component a "Sitting
	// Fee"; the other colleges' forms say "Honorarium". Label only -- the amount,
	// the field it reads from, and the total are unchanged.
	const honorariumLabel = isCetInstitution(data.institution_name)
		? 'Amount: Sitting Fee'
		: 'Amount: Honorarium'

	const particulars: [string, string][] = [
		['Name of the BOS Member', data.member_name],
		['Designation', data.designation ?? ''],
		['Institution / Company', data.college_address ?? ''],
		[`Position in ${councilName}`, data.position_in_bos ?? ''],
		['Mobile No', data.mobile ?? ''],
		['Mail id', data.email ?? ''],
		[honorariumLabel, `Rs.${data.honorarium.toFixed(2)}`],
		['Amount: TA', `Rs.${data.ta_amount.toFixed(2)}`],
		['Amount: Total', `Rs.${data.total.toFixed(2)}`],
		['Total Amount in Words', amountToWords(data.total)],
	]

	const colL = 65
	const colR = tableWidth - colL

	autoTable(doc, {
		body: particulars,
		startY: currentY,
		margin: { left: MARGIN, right: MARGIN },
		tableWidth,
		theme: 'grid',
		styles: {
			font: 'times', fontSize: 10, cellPadding: 2.5,
			lineColor: [0, 0, 0], lineWidth: 0.3,
			textColor: [0, 0, 0], valign: 'middle', minCellHeight: 8, overflow: 'linebreak',
		},
		columnStyles: {
			0: { cellWidth: colL, fontStyle: 'bold' },
			1: { cellWidth: colR },
		},
	})

	currentY = ((doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? currentY + 90) + 5

	// â”€â”€ NEFT details â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	doc.setFont('times', 'bold')
	doc.setFontSize(8.5)
	doc.text(
		'(Provide the following details to enable us to transfer the Claim through NEFT â€” Write in CAPITAL LETTERS)',
		MARGIN, currentY, { maxWidth: tableWidth }
	)
	currentY += 6

	const neftRows: [string, string][] = [
		['Name of the Member', data.member_name],
		['Bank Name', data.bank_name ?? ''],
		['Branch Name', data.branch_name ?? ''],
		['Account Number', data.account_number ?? ''],
		['IFSC Code', data.ifsc_code ?? ''],
		['Amount', `Rs.${(data.neft_amount ?? data.total).toFixed(2)}`],
		['PAN Number', data.pan_number ?? ''],
	]

	autoTable(doc, {
		body: neftRows,
		startY: currentY,
		margin: { left: MARGIN, right: MARGIN },
		tableWidth,
		theme: 'grid',
		styles: {
			font: 'times', fontSize: 10, cellPadding: 2.5,
			lineColor: [0, 0, 0], lineWidth: 0.3,
			textColor: [0, 0, 0], valign: 'middle', minCellHeight: 8,
		},
		columnStyles: {
			0: { cellWidth: colL, fontStyle: 'bold' },
			1: { cellWidth: colR },
		},
	})

	// Signature block (BOS Member / Board Chairman / Principal) removed
	// 2026-07-10 per request — the form ends at the NEFT table; physical
	// signatures are collected on the office copy, not this printout.

	// â”€â”€ Footer timestamp â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	const footerY = A4_HEIGHT - 6
	doc.setFont('times', 'normal')
	doc.setFontSize(7)
	doc.setTextColor(128, 128, 128)
	doc.text(new Date().toLocaleString('en-IN'), MARGIN, footerY)
	doc.setTextColor(0, 0, 0)

	const safe = (s: string) => s.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').slice(0, 40)
	const fileName = `BOS_Claim_${safe(data.member_name)}_${data.claim_date.replace(/\//g, '-')}.pdf`
	doc.save(fileName)
	return fileName
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// COURSE SCHEME REPORT â€” Portrait A4, all semesters in one PDF
// Layout matches official "Scheme of Learning and Evaluation" document:
//   Part | Course Code | Title | Exam(Hrs) | Credits | L | P | Total | CIA | ESE | Total
//   Two-row header groups "Hours" and "Max. Marks"; totals row per semester.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface CourseSchemeReportRow {
	course_part_master: string | null
	course_code: string
	course_name: string
	exam_duration: number | null
	credit: number
	theory_hours: number
	practical_hours: number
	internal_max_mark: number
	external_max_mark: number
	total_max_mark: number
	// Elective group order (COE course_mapping.group_order). Every option is
	// printed, but rows sharing a group_order count ONCE in the semester
	// totals - the learner takes one of them. Null/undefined = ungrouped.
	group_order?: number | null
}

export interface CourseSchemeReportSemester {
	semester_code: string
	semester_label: string
	courses: CourseSchemeReportRow[]
}

export interface CourseSchemeReportData {
	institution_name: string
	institution_address?: string
	institution_accreditation?: string
	logoImage?: string
	rightLogoImage?: string
	program_code: string
	program_name?: string
	regulation_code?: string
	academic_year?: string
	semesters: CourseSchemeReportSemester[]
}

export function generateCourseSchemeReportPDF(data: CourseSchemeReportData): string {
	const doc = new jsPDF('portrait', 'mm', 'a4')
	const pageWidth  = A4_WIDTH
	const pageHeight = A4_HEIGHT
	const tableWidth = pageWidth - MARGIN * 2

	// Column widths â€” fixed cols total 121 mm; title fills the remaining 69 mm
	const partW   = 14
	const codeW   = 24
	const examW   = 11
	const credW   = 11
	const lW      = 8
	const pW      = 8
	const totHrsW = 10
	const ciaW    = 10
	const eseW    = 10
	const totMksW = 11
	const titleW  = tableWidth - partW - codeW - examW - credW - lW - pW - totHrsW - ciaW - eseW - totMksW

	const columnStyles: Record<number, object> = {
		0:  { cellWidth: partW,   halign: 'center' },
		1:  { cellWidth: codeW,   halign: 'center' },
		2:  { cellWidth: titleW,  halign: 'left' },
		3:  { cellWidth: examW,   halign: 'center' },
		4:  { cellWidth: credW,   halign: 'center' },
		5:  { cellWidth: lW,      halign: 'center' },
		6:  { cellWidth: pW,      halign: 'center' },
		7:  { cellWidth: totHrsW, halign: 'center' },
		8:  { cellWidth: ciaW,    halign: 'center' },
		9:  { cellWidth: eseW,    halign: 'center' },
		10: { cellWidth: totMksW, halign: 'center', fontStyle: 'bold' },
	}

	// Draws the full institutional header â€” called once per semester page.
	// Mirrors the reference "Scheme of Learning and Evaluation" document exactly:
	//   Institution letterhead â†’ Title 1 â†’ Academic-year line â†’ CBCS line â†’ Title 2 (repeated)
	function drawPageHeader(): number {
		let y = MARGIN
		y = drawInstitutionBanner(doc, data, pageWidth, y)

		// Title 1 â€” document heading
		doc.setFont('times', 'bold')
		doc.setFontSize(12)
		doc.text('SCHEME OF LEARNING AND EVALUATION', pageWidth / 2, y, { align: 'center' })
		y += 5

		// Academic-year line (bold, conditional â€” matches reference PDF style)
		if (data.academic_year) {
			doc.setFont('times', 'bold')
			doc.setFontSize(8)
			doc.text(
				`(For the students admitted in the academic year ${data.academic_year} onwards)`,
				pageWidth / 2, y, { align: 'center' },
			)
			y += 4
		}

		// CBCS framework line â€” always shown (bold, matches reference PDF)
		doc.setFont('times', 'bold')
		doc.setFontSize(8)
		doc.text('Outcome Based Curriculum Framework with CBCS', pageWidth / 2, y, { align: 'center' })
		y += 6

		// Program + Regulation metadata line
		doc.setFont('times', 'bold')
		doc.setFontSize(9)
		const programLabel = data.program_name
			? `Program: ${data.program_code} â€” ${data.program_name}`
			: `Program: ${data.program_code}`
		doc.text(programLabel, MARGIN, y)
		if (data.regulation_code) {
			doc.text(`Regulation: ${data.regulation_code}`, pageWidth - MARGIN, y, { align: 'right' })
		}
		y += 6

		return y
	}

	// Draws the three-signature row.
	// sigY is the top of the blank signing area; a 14 mm gap is reserved above
	// the line so there is room for an actual signature.
	function drawSignatures(sigY: number) {
		const sigWidth = tableWidth / 3
		const sigLabels = [
			'Signature of the Board Chairman',
			'Signature of the CDC Co-ordinator',
			'Signature of the Principal',
		]
		// Blank space above the line for the physical signature (14 mm)
		const lineY  = sigY + 14
		const labelY = lineY + 5

		doc.setFont('times', 'normal')
		doc.setFontSize(9)
		sigLabels.forEach((label, i) => {
			const centerX = MARGIN + i * sigWidth + sigWidth / 2
			doc.setDrawColor(0, 0, 0)
			doc.line(MARGIN + i * sigWidth + 8, lineY, MARGIN + (i + 1) * sigWidth - 8, lineY)
			doc.text(label, centerX, labelY, { align: 'center' })
		})
	}

	// â”€â”€ ONE PAGE PER SEMESTER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	data.semesters.forEach((sem, semIdx) => {
		if (semIdx > 0) doc.addPage()

		let currentY = drawPageHeader()

		// Semester label â€” centred, boxed
		doc.setFont('times', 'bold')
		doc.setFontSize(10)
		doc.setTextColor(0, 0, 0)
		doc.setDrawColor(0, 0, 0)
		const lblW = 80
		const lblH = 7
		doc.rect((pageWidth - lblW) / 2, currentY - 1, lblW, lblH)
		doc.text(sem.semester_label, pageWidth / 2, currentY + 4, { align: 'center' })
		currentY += lblH + 1

		// Grouped (elective) courses collapse to a single count across credits,
		// hours and marks. Same helper the on-screen semester table uses, so the
		// printed scheme can never disagree with what the editor sees.
		const totals = computeSchemeTotals(sem.courses)

		const bodyRows = sem.courses.map((c) => [
			c.course_part_master ?? '-',
			c.course_code,
			c.course_name,
			c.exam_duration ?? '-',
			c.credit,
			c.theory_hours    || '-',
			c.practical_hours || '-',
			c.theory_hours + c.practical_hours,
			c.internal_max_mark,
			c.external_max_mark,
			c.total_max_mark,
		])

		autoTable(doc, {
			head: [
				[
					{ content: 'Part',                rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
					{ content: 'Course Code',         rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
					{ content: 'Title of the Course', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
					{ content: 'Exam\n(Hrs)',          rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
					{ content: 'Credits',              rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
					{ content: 'Hours',                colSpan: 3, styles: { halign: 'center' } },
					{ content: 'Max. Marks',           colSpan: 3, styles: { halign: 'center' } },
				],
				['L', 'P', 'Total', 'CIA', 'ESE', 'Total'],
			],
			body: bodyRows,
			foot: [[
				{ content: 'TOTAL', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold', fillColor: [230, 230, 230] } },
				{ content: String(totals.credits),                   styles: { halign: 'center', fontStyle: 'bold', fillColor: [230, 230, 230] } },
				{ content: String(totals.theory),                    styles: { halign: 'center', fontStyle: 'bold', fillColor: [230, 230, 230] } },
				{ content: String(totals.practical),                 styles: { halign: 'center', fontStyle: 'bold', fillColor: [230, 230, 230] } },
				{ content: String(totals.hours),                     styles: { halign: 'center', fontStyle: 'bold', fillColor: [230, 230, 230] } },
				{ content: '', styles: { fillColor: [230, 230, 230] } },
				{ content: '', styles: { fillColor: [230, 230, 230] } },
				{ content: String(totals.marks), styles: { halign: 'center', fontStyle: 'bold', fillColor: [230, 230, 230] } },
			]],
			startY: currentY,
			margin: { left: MARGIN, right: MARGIN },
			tableWidth,
			theme: 'grid',
			styles: {
				font: 'times',
				fontSize: 8,
				cellPadding: 1.5,
				lineColor: [0, 0, 0],
				lineWidth: 0.3,
				textColor: [0, 0, 0],
				valign: 'middle',
				minCellHeight: 7,
				overflow: 'linebreak',
			},
			headStyles: {
				font: 'times',
				fontStyle: 'bold',
				fillColor: [240, 240, 240],
				textColor: [0, 0, 0],
				halign: 'center',
				fontSize: 8,
				minCellHeight: 8,
			},
			footStyles: {
				font: 'times',
				fontStyle: 'bold',
				fillColor: [230, 230, 230],
				textColor: [0, 0, 0],
				fontSize: 8,
			},
			columnStyles,
			didDrawPage: (hookData) => {
				const footerY = pageHeight - 6
				doc.setFont('times', 'normal')
				doc.setFontSize(7)
				doc.setTextColor(128, 128, 128)
				doc.text(new Date().toLocaleString('en-IN'), MARGIN, footerY)
				doc.text(`Page ${hookData.pageNumber}`, pageWidth - MARGIN, footerY, { align: 'right' })
				doc.setTextColor(0, 0, 0)
			},
		})

		// Signatures on this semester's last page â€” after the table if room permits,
		// otherwise anchored so the 14 mm blank + line + label (â‰ˆ 22 mm total) fits
		// above the 6 mm footer zone.
		const finalY = ((doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? currentY + 20)
		const sigY = Math.min(finalY + 8, pageHeight - 28)
		drawSignatures(sigY)
	})

	const safeStr = (s: string) => s.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').slice(0, 40)
	const fileName = `Scheme_${safeStr(data.program_code)}_${data.regulation_code ?? ''}_${new Date().toISOString().split('T')[0]}.pdf`
	doc.save(fileName)
	return fileName
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// BOS ATTENDANCE CERTIFICATE â€” Landscape A4, one certificate per page
// Layout mirrors the official paper attendance certificate form.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface BosAttendanceCertificateData {
	institution_name: string
	/** Line under the name — CET uses "( An Autonomous Institution )". */
	institution_subtitle?: string
	institution_address?: string
	institution_accreditation?: string
	logoImage?: string
	rightLogoImage?: string

	member_name: string
	member_designation?: string
	member_department?: string
	member_institution?: string
	member_address?: string

	board_name: string
	board_code?: string
	board_type?: string | null

	meeting_date: string    // pre-formatted, e.g. "12 May 2026"
	ug_pg?: 'UG' | 'PG' | null  // explicit override; otherwise auto-inferred
}

// Infer UG/PG from board metadata.
// Priority: ug_pg override â†’ board_type text â†’ board_code prefix (U* = UG, P* = PG).
export function inferBoardUgPg(
	boardType?: string | null,
	boardCode?: string,
	boardName?: string,
): 'UG' | 'PG' | null {
	const s = `${boardType ?? ''} ${boardCode ?? ''} ${boardName ?? ''}`.toUpperCase()
	if (/\bUG\b|UNDERGRADUATE/.test(s)) return 'UG'
	if (/\bPG\b|POSTGRADUATE|POST[\s-]GRADUATE/.test(s)) return 'PG'
	if (boardCode) {
		const u = boardCode.toUpperCase()
		if (u.startsWith('U')) return 'UG'
		if (u.startsWith('P')) return 'PG'
	}
	return null
}

/**
 * Generates one A5-landscape Attendance Certificate per entry in `certificates`.
 * Each certificate is a separate page in the same PDF file.
 * Pass a single-element array for individual download.
 */
export function generateBosAttendanceCertificatePDF(
	certificates: BosAttendanceCertificateData[],
	filename?: string,
): string {
	// Landscape A5. Body alignment mirrors the COE attendance-certificate
	// renderer (drawCertificateBody) for consistency across institution PDFs.
	const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a5' })
	const pageWidth  = doc.internal.pageSize.getWidth()
	const pageHeight = doc.internal.pageSize.getHeight()

	certificates.forEach((cert, idx) => {
		if (idx > 0) doc.addPage()
		let y = MARGIN

		// Institution banner (shared helper for cross-document consistency)
		y = drawInstitutionBanner(doc, cert, pageWidth, y)
		y += 4

		// Title -- "ATTENDANCE CERTIFICATE" centred, bold, underlined
		doc.setFont('times', 'bold')
		doc.setFontSize(14)
		doc.setTextColor(0, 0, 0)
		doc.text('ATTENDANCE CERTIFICATE', pageWidth / 2, y, { align: 'center' })
		const titleWidth = doc.getTextWidth('ATTENDANCE CERTIFICATE')
		doc.setDrawColor(0, 0, 0)
		doc.setLineWidth(0.3)
		doc.line(pageWidth / 2 - titleWidth / 2, y + 1, pageWidth / 2 + titleWidth / 2, y + 1)
		y += 12

		// ====== Body (mirrors COE drawCertificateBody alignment) ======
		const contentX = MARGIN + 8
		const maxWidth = pageWidth - 2 * MARGIN - 16
		const lineSpacing = 10
		const fontSize = 13
		const underlineOffset = 1.5

		doc.setTextColor(0, 0, 0)
		doc.setFontSize(fontSize)

		const ugPg = cert.ug_pg ?? inferBoardUgPg(cert.board_type, cert.board_code, cert.board_name)
		const ugPgLabel = ugPg ?? 'UG/PG'
		const deptText = cert.board_name.toUpperCase()

		// Helper: draw underline across content width
		const drawUnderline = (yPos: number, xStart?: number, xEnd?: number) => {
			doc.setDrawColor(0, 0, 0)
			doc.setLineWidth(0.3)
			const x1 = xStart ?? contentX
			const x2 = xEnd ?? (contentX + maxWidth)
			doc.line(x1, yPos + underlineOffset, x2, yPos + underlineOffset)
		}

		// Single paragraph with bold elements and proper spacing
		doc.setFontSize(fontSize)

		// Build member details (name, designation, department, institution, address)
		const memberDetails = [
			cert.member_name,
			cert.member_designation,
			cert.member_department,
			cert.member_institution?.replace(/^["']\s*|\s*["']$/g, '').trim(),
			cert.member_address,
		].filter(Boolean).join(', ')

		// Build paragraph as array of parts with formatting info
		const paragraphParts = [
			{ text: 'This is to certify that ', bold: false },
			{ text: memberDetails, bold: true },
			{ text: ' has attended the ', bold: false },
			{ text: ugPgLabel, bold: true },
			{ text: ' Board of Studies meeting in the Department of ', bold: false },
			{ text: deptText, bold: true },
			{ text: ' held in our college on ', bold: false },
			{ text: cert.meeting_date, bold: true },
			{ text: '.', bold: false },
		]

		// Build full text and word-to-bold mapping
		let fullText = ''
		const wordBoldMap: boolean[] = []
		const wordList: string[] = []

		paragraphParts.forEach(part => {
			const words = part.text.split(/(\s+)/) // Split on whitespace but keep it
			words.forEach(word => {
				if (word.trim()) { // Only track non-whitespace
					wordBoldMap.push(part.bold)
					wordList.push(word)
				}
			})
			fullText += part.text
		})

		// Render paragraph with bold and underlines (left-aligned, clean spacing)
		const lineHeightIncrease = 9
		let wordIdx = 0
		let currentY = y

		while (wordIdx < wordList.length) {
			const lineWords: { word: string; bold: boolean }[] = []
			let lineWidth = 0

			// Fit as many words as possible on this line
			while (wordIdx < wordList.length) {
				const word = wordList[wordIdx]
				const bold = wordBoldMap[wordIdx]
				doc.setFont('times', bold ? 'bold' : 'normal')
				const wordWithSpace = doc.getTextWidth(word + ' ')

				if (lineWidth + wordWithSpace > maxWidth && lineWords.length > 0) {
					break // Line full
				}

				lineWords.push({ word, bold })
				lineWidth += wordWithSpace
				wordIdx++
			}

			// Render line with left alignment and continuous underlines for bold sections
			let lineX = contentX

			// First pass: render all words
			const wordPositions: Array<{ word: string; bold: boolean; startX: number; endX: number }> = []
			lineWords.forEach((item) => {
				doc.setFont('times', item.bold ? 'bold' : 'normal')
				const wordStartX = lineX
				const wordWidth = doc.getTextWidth(item.word)
				const wordEndX = wordStartX + wordWidth

				// Render word with space
				doc.text(item.word + ' ', lineX, currentY)

				// Track position for underline pass
				wordPositions.push({ word: item.word, bold: item.bold, startX: wordStartX, endX: wordEndX })

				// Advance position to next word (word + space)
				lineX += doc.getTextWidth(item.word + ' ')
			})

			// Second pass: draw continuous underlines for bold sections
			let underlineStart: number | null = null
			let underlineEnd: number | null = null

			wordPositions.forEach((pos, idx) => {
				if (pos.bold) {
					if (underlineStart === null) {
						underlineStart = pos.startX
					}
					underlineEnd = pos.endX
				} else {
					// End of bold section, draw if exists
					if (underlineStart !== null && underlineEnd !== null) {
						drawUnderline(currentY, underlineStart, underlineEnd)
						underlineStart = null
						underlineEnd = null
					}
				}
			})

			// Draw final underline if bold section ends at line end
			if (underlineStart !== null && underlineEnd !== null) {
				drawUnderline(currentY, underlineStart, underlineEnd)
			}

			currentY += lineHeightIncrease
		}

		y = currentY
		doc.setFont('times', 'normal')

		y += 12

		// Principal signature (right-aligned, matches COE "Signature of the CoE")
		doc.setFont('times', 'bold')
		doc.setFontSize(12)
		doc.text('Principal', pageWidth - MARGIN - 8, y, { align: 'right' })

		// Footer timestamp -- bottom-left, light grey
		doc.setFont('times', 'normal')
		doc.setFontSize(6)
		doc.setTextColor(150, 150, 150)
		doc.text(new Date().toLocaleString('en-IN'), MARGIN, pageHeight - 5)
		doc.setTextColor(0, 0, 0)
	})

	const safe = (s: string) => s.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').slice(0, 40)
	const outName = filename ?? `BOS_Attendance_${safe(certificates[0]?.board_name ?? 'cert')}_${new Date().toISOString().split('T')[0]}.pdf`
	doc.save(outName)
	return outName
}
