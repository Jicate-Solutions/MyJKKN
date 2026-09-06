import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { drawInstitutionBanner } from './internal-marks-pdf'

/**
 * Question-wise CIA mark sheet — A4 LANDSCAPE.
 *
 * One column per question from the round's question paper, carrying its part,
 * marks and CO / Bloom's tags, then the component total those questions add up
 * to. Portrait would not fit: a paper runs to a dozen-plus questions and the
 * frozen learner columns still have to be readable.
 *
 * Two conventions the sheet must not break:
 *  - A question the learner was never ALLOWED to answer (the unused half of an
 *    OR pair) prints "—", not 0. A zero reads as "attempted and scored nothing".
 *  - An absent learner prints "AB" in the total. Absence is its own fact, kept
 *    distinct from a zero, exactly as the entry grid and COE store it.
 */

// ─── Number to words — digit-by-digit ALL CAPS, per COE integration spec §7.5 ──
const DIGIT_WORDS = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE',
	'SIX', 'SEVEN', 'EIGHT', 'NINE']
function numberToWords(num: number): string {
	const n = Math.floor(Math.abs(num))
	if (n === 0) return 'ZERO'
	return n.toString().padStart(2, '0').split('')
		.map(d => DIGIT_WORDS[parseInt(d, 10)]).join(' ')
}

export interface QuestionWisePDFQuestion {
	id: string
	/** "6a" */
	label: string
	part_label: string
	marks: number
	co_code?: string
	k_level?: string
	is_choice_alternative: boolean
}

export interface QuestionWisePDFLearner {
	serial_number: number
	register_number: string
	student_name: string
	/** question id → mark. A missing key prints "—". */
	question_marks: Record<string, number | undefined>
	is_absent?: boolean
	component_total: number
}

export interface QuestionWiseMarksPDFData {
	institution_name?: string
	institution_subtitle?: string
	institution_accreditation?: string
	institution_address?: string
	logoImage?: string
	rightLogoImage?: string

	program_code: string
	program_name?: string
	course_code: string
	course_name?: string
	exam_session?: string
	assessment_name?: string
	cia_round_name: string
	paper_set_label?: string | null

	component_name: string
	component_max: number

	questions: QuestionWisePDFQuestion[]
	learners: QuestionWisePDFLearner[]
}

// A4 landscape
const PAGE_WIDTH = 297
const PAGE_HEIGHT = 210
const MARGIN = 8

export function generateQuestionWiseMarksPDF(data: QuestionWiseMarksPDFData): string {
	const doc = new jsPDF('landscape', 'mm', 'a4')
	const tableWidth = PAGE_WIDTH - MARGIN * 2

	// Shared banner so this sheet matches every other JKKN document
	let currentY = drawInstitutionBanner(doc, data, PAGE_WIDTH, MARGIN)

	doc.setFont('times', 'bold')
	doc.setFontSize(11)
	doc.setTextColor(0, 0, 0)
	if (data.exam_session) {
		doc.text(`SEMESTER EXAMINATION - ${data.exam_session}`, PAGE_WIDTH / 2, currentY, { align: 'center' })
		currentY += 5
	}
	doc.text('QUESTION-WISE INTERNAL MARK SHEET', PAGE_WIDTH / 2, currentY, { align: 'center' })
	currentY += 5

	doc.setFont('times', 'normal')
	doc.setFontSize(9)
	const setSuffix = data.paper_set_label ? ` — Set ${data.paper_set_label}` : ''
	const assessment = data.assessment_name ? `${data.assessment_name} — ` : ''
	doc.text(`${assessment}${data.cia_round_name}${setSuffix}`, PAGE_WIDTH / 2, currentY, { align: 'center' })
	currentY += 6

	// ── Course details ──
	doc.setFont('times', 'bold')
	doc.setFontSize(9)
	const programLine = data.program_name
		? `Program: ${data.program_code} - ${data.program_name}`
		: `Program: ${data.program_code}`
	doc.text(programLine, MARGIN, currentY)
	doc.text(`${data.component_name} Max: ${data.component_max}`, PAGE_WIDTH - MARGIN, currentY, { align: 'right' })
	currentY += 4.5

	doc.setFont('times', 'normal')
	const courseLine = data.course_name
		? `Course: ${data.course_code} - ${data.course_name}`
		: `Course: ${data.course_code}`
	doc.text(courseLine, MARGIN, currentY)
	currentY += 6

	// ── Table ──
	const qCount = data.questions.length
	const snoW = 8
	const regW = 26
	const compW = 14
	const wordsMinW = 20

	// Name and words columns surrender their width first when a paper is long
	const fixed = snoW + regW + compW
	let nameW = 42
	let wordsW = 26
	let perQ = (tableWidth - fixed - nameW - wordsW) / Math.max(qCount, 1)
	if (perQ < 9) {
		nameW = 32
		wordsW = wordsMinW
		perQ = (tableWidth - fixed - nameW - wordsW) / Math.max(qCount, 1)
	}
	// Below ~8mm a column stops being readable — shrink the type instead
	const bodyFontSize = perQ < 8 ? 7 : perQ < 10 ? 8 : 9
	perQ = Math.max(perQ, 6)

	const headRow: string[] = ['S.No', 'Reg No', 'Name of the Learner']
	for (const q of data.questions) {
		const lines = [
			`${q.part_label ? `${q.part_label} ` : ''}Q${q.label}${q.is_choice_alternative ? ' (OR)' : ''}`,
			`(${q.marks})`,
		]
		const tags = [q.co_code, q.k_level].filter(Boolean).join('/')
		if (tags) lines.push(tags)
		headRow.push(lines.join('\n'))
	}
	headRow.push(data.component_name, 'Marks in Words')

	const bodyRows = data.learners.map(l => {
		const row: (string | number)[] = [l.serial_number, l.register_number, l.student_name]
		for (const q of data.questions) {
			if (l.is_absent) { row.push('AB'); continue }
			const mark = l.question_marks[q.id]
			row.push(mark == null ? '—' : mark)
		}
		row.push(l.is_absent ? 'AB' : l.component_total)
		row.push(l.is_absent ? 'ABSENT' : numberToWords(l.component_total))
		return row
	})

	const columnStyles: Record<number, Record<string, unknown>> = {
		0: { cellWidth: snoW, halign: 'center' },
		1: { cellWidth: regW, halign: 'center' },
		2: { cellWidth: nameW, halign: 'left' },
	}
	data.questions.forEach((_, i) => {
		columnStyles[3 + i] = { cellWidth: perQ, halign: 'center' }
	})
	columnStyles[3 + qCount] = { cellWidth: compW, halign: 'center', fontStyle: 'bold' }
	columnStyles[4 + qCount] = { cellWidth: wordsW, halign: 'left' }

	autoTable(doc, {
		head: [headRow],
		body: bodyRows,
		startY: currentY,
		margin: { left: MARGIN, right: MARGIN },
		theme: 'grid',
		styles: {
			font: 'times',
			fontSize: bodyFontSize,
			cellPadding: 1.2,
			lineColor: [0, 0, 0],
			lineWidth: 0.25,
			textColor: [0, 0, 0],
			valign: 'middle',
			minCellHeight: 6,
			overflow: 'linebreak',
		},
		headStyles: {
			font: 'times',
			fontStyle: 'bold',
			fillColor: [235, 235, 235],
			textColor: [0, 0, 0],
			halign: 'center',
			valign: 'middle',
			fontSize: Math.max(bodyFontSize - 1, 6),
			minCellHeight: 12,
		},
		columnStyles,
		didDrawPage: (hookData) => {
			const footerY = PAGE_HEIGHT - 5
			doc.setFont('times', 'normal')
			doc.setFontSize(7)
			doc.setTextColor(128, 128, 128)
			doc.text(new Date().toLocaleString('en-IN'), MARGIN, footerY)
			doc.text('— = not attempted / OR alternative not applicable    AB = absent', PAGE_WIDTH / 2, footerY, { align: 'center' })
			doc.text(`Page ${hookData.pageNumber}`, PAGE_WIDTH - MARGIN, footerY, { align: 'right' })
			doc.setTextColor(0, 0, 0)
		},
	})

	// ── Summary + signatures ──
	let finalY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? currentY + 50) + 6
	if (finalY + 26 > PAGE_HEIGHT - 10) {
		doc.addPage()
		finalY = MARGIN + 4
	}

	const absentCount = data.learners.filter(l => l.is_absent).length
	const entered = data.learners.filter(l => !l.is_absent && Object.keys(l.question_marks).length > 0).length
	doc.setFont('times', 'bold')
	doc.setFontSize(9)
	doc.text(
		`Total Learners: ${data.learners.length}    Entered: ${entered}    Absent: ${absentCount}    ` +
		`Pending: ${data.learners.length - entered - absentCount}    Questions: ${qCount}`,
		MARGIN,
		finalY,
	)
	finalY += 14

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
		doc.setDrawColor(0, 0, 0)
		doc.line(MARGIN + (i * sigWidth) + 10, finalY, MARGIN + ((i + 1) * sigWidth) - 10, finalY)
		doc.text(label, centerX, finalY + 5, { align: 'center' })
	})

	const fileName = `${data.course_code}_${data.cia_round_name}_question_wise_marks_${new Date().toISOString().split('T')[0]}.pdf`
	doc.save(fileName)
	return fileName
}
