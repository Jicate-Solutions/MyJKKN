import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ─── Number to words ───
const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
	'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
function numberToWords(n: number): string {
	if (n === 0) return 'Zero'
	if (n < 0) return 'Minus ' + numberToWords(-n)
	if (n < 20) return ones[n]
	if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')
	if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + numberToWords(n % 100) : '')
	return String(n)
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

/**
 * Generates Internal Mark Entry Sheet PDF — Portrait A4, Times New Roman, auto-fit columns
 */
export function generateInternalMarksPDF(data: InternalMarksPDFData): string {
	const doc = new jsPDF('portrait', 'mm', 'a4')
	const pageWidth = A4_WIDTH
	const pageHeight = A4_HEIGHT
	const tableWidth = pageWidth - MARGIN * 2
	let currentY = MARGIN

	// ========== HEADER ==========

	// JKKN Logo (left side)
	if (data.logoImage) {
		try { doc.addImage(data.logoImage, 'PNG', MARGIN, currentY, 16, 16) } catch {}
	}
	// College Seal (right side)
	if (data.rightLogoImage) {
		try { doc.addImage(data.rightLogoImage, 'PNG', pageWidth - MARGIN - 16, currentY, 16, 16) } catch {}
	}

	// Institution name
	doc.setFont('times', 'bold')
	doc.setFontSize(12)
	doc.setTextColor(0, 0, 0)
	doc.text('J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)', pageWidth / 2, currentY + 4, { align: 'center' })

	// Accreditation
	doc.setFont('times', 'normal')
	doc.setFontSize(8)
	doc.text('(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)', pageWidth / 2, currentY + 9, { align: 'center' })

	currentY += 13

	// Address
	doc.setFont('times', 'bold')
	doc.setFontSize(9)
	doc.text('Komarapalayam - 638 183, Namakkal District, Tamil Nadu', pageWidth / 2, currentY, { align: 'center' })
	currentY += 5

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

	// Row 2: Course & Max Mark
	doc.setFont('times', 'normal')
	doc.setFontSize(9)
	const courseText = `Course: ${data.course_code} - ${data.course_name}`
	const courseLines = doc.splitTextToSize(courseText, tableWidth - 50)
	doc.text(courseLines, MARGIN, currentY)
	doc.text(`Max Internal Mark: ${data.internal_max_mark}`, pageWidth - MARGIN, currentY, { align: 'right' })
	currentY += courseLines.length > 1 ? courseLines.length * 4 : 4.5

	currentY += 2

	// ========== MARKS TABLE — auto-fit to A4 width ==========
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

	// Build body
	const bodyRows = data.learners.map(learner => {
		const row: (string | number)[] = [
			learner.serial_number,
			learner.register_number,
			learner.student_name,
		]
		data.components.forEach(c => {
			const mark = learner.component_marks[c.code]
			row.push(mark != null && mark > 0 ? mark : '-')
		})
		row.push(learner.total > 0 ? learner.total : '-')
		row.push(learner.total > 0 ? numberToWords(learner.total) : '-')
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
	const learnersWithMarks = data.learners.filter(l => l.total > 0).length
	doc.text(`Total Learners: ${data.learners.length}    Marks Entered: ${learnersWithMarks}    Pending: ${data.learners.length - learnersWithMarks}`, MARGIN, currentY)
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

// ──────────────────────────────────────────────────────────────────────────
// CONSOLIDATED REPORT — LANDSCAPE A4, one semester per page, wide table
// Layout: S.No | Reg No | Name | course1 (max) | course2 (max) | ...
// ──────────────────────────────────────────────────────────────────────────

import type { ConsolidatedReportData } from '@/types/internal-marks'

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

		// ── HEADER (logos + institution + title) ──
		if (data.logoImage) {
			try {
				doc.addImage(data.logoImage, 'PNG', MARGIN, currentY, 16, 16)
			} catch {}
		}
		if (data.rightLogoImage) {
			try {
				doc.addImage(data.rightLogoImage, 'PNG', pageWidth - MARGIN - 16, currentY, 16, 16)
			} catch {}
		}

		doc.setFont('times', 'bold')
		doc.setFontSize(13)
		doc.setTextColor(0, 0, 0)
		doc.text('J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)', pageWidth / 2, currentY + 4, {
			align: 'center',
		})

		doc.setFont('times', 'normal')
		doc.setFontSize(8)
		doc.text(
			'(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)',
			pageWidth / 2,
			currentY + 9,
			{ align: 'center' }
		)
		currentY += 13

		doc.setFont('times', 'bold')
		doc.setFontSize(9)
		doc.text('Komarapalayam - 638 183, Namakkal District, Tamil Nadu', pageWidth / 2, currentY, {
			align: 'center',
		})
		currentY += 5

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

		// ── PROGRAM + SEMESTER LINE ──
		doc.setFont('times', 'bold')
		doc.setFontSize(9)
		doc.text(`Program: ${data.program_code} - ${data.program_name}`, MARGIN, currentY)
		doc.text(`Semester: ${sem.semester_label}`, pageWidth - MARGIN, currentY, { align: 'right' })
		currentY += 5

		// ── TABLE ──
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

		// ── SIGNATURE SECTION ──
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
