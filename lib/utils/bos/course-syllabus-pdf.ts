import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type {
	BosCourseObjective,
	BosCourseLearnOutcome,
	BosUnit,
	BosTextbook,
	BosWebResource,
	BosPoMapping,
} from '@/types/bos'

// ── Layout ────────────────────────────────────────────────────────────────────
const A4_W = 210
const A4_H = 297
const MARGIN = 10
const TABLE_W = A4_W - MARGIN * 2   // 190 mm
const LABEL_W = 30                   // Left label column
const FONT_SIZE = 12                 // Body font size (Times New Roman 12)

// ── Shared style helpers ──────────────────────────────────────────────────────

function lastY(doc: jsPDF): number {
	return (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? MARGIN
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCell = Record<string, any>

function table(
	doc: jsPDF,
	startY: number,
	body: AnyCell[][],
	columnStyles: Record<number, AnyCell> = {},
): number {
	autoTable(doc, {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		body: body as any,
		startY,
		margin: { left: MARGIN, right: MARGIN },
		tableWidth: TABLE_W,
		theme: 'grid',
		styles: {
			font: 'times',
			fontSize: FONT_SIZE,
			cellPadding: 2,
			lineColor: [0, 0, 0] as [number, number, number],
			lineWidth: 0.3,
			textColor: [0, 0, 0] as [number, number, number],
			valign: 'top',
			overflow: 'linebreak',
			halign: 'justify',
		},
		columnStyles,
		didDrawPage: ({ pageNumber }) => {
			doc.setFont('times', 'normal')
			doc.setFontSize(7)
			doc.setTextColor(128, 128, 128)
			doc.text(new Date().toLocaleString('en-IN'), MARGIN, A4_H - 6)
			doc.text(`Page ${pageNumber}`, A4_W - MARGIN, A4_H - 6, { align: 'right' })
			doc.setTextColor(0, 0, 0)
		},
	})
	return lastY(doc)
}

function bold(content: string, extra: AnyCell = {}): AnyCell {
	return { content, styles: { fontStyle: 'bold', ...extra } }
}

function cell(content: string, extra: AnyCell = {}): AnyCell {
	return { content, styles: extra }
}

function span(content: string, colSpan: number, extra: AnyCell = {}): AnyCell {
	return { content, colSpan, styles: extra }
}

// ── Book formatter ────────────────────────────────────────────────────────────
function fmtBook(b: BosTextbook): string {
	const parts = [b.author, b.title, b.publisher, b.publication_year ? String(b.publication_year) : '']
		.filter(Boolean)
		.map(sanitize)
	return `• ${parts.join(', ')}.`
}

// ── Unicode → WinAnsi sanitizer ───────────────────────────────────────────────
// jsPDF's built-in Times font uses WinAnsi (Windows-1252). Characters outside
// that range return width=0, which breaks line-break layout (causes letter spacing).
const CHAR_MAP: Record<string, string> = {
	// Greek lowercase
	α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'epsilon',
	ζ: 'zeta', η: 'eta', θ: 'theta', ι: 'iota', κ: 'kappa',
	λ: 'lambda', μ: 'mu', ν: 'nu', ξ: 'xi', π: 'pi',
	ρ: 'rho', σ: 'sigma', τ: 'tau', υ: 'upsilon', φ: 'phi',
	χ: 'chi', ψ: 'psi', ω: 'omega',
	// Greek uppercase
	Α: 'Alpha', Β: 'Beta', Γ: 'Gamma', Δ: 'Delta', Ε: 'Epsilon',
	Θ: 'Theta', Λ: 'Lambda', Μ: 'Mu', Π: 'Pi', Σ: 'Sigma',
	Φ: 'Phi', Ψ: 'Psi', Ω: 'Omega',
	// Math symbols
	'∑': 'Sigma', '∫': 'integral', '∞': 'infinity',
	'≤': '<=', '≥': '>=', '≠': '!=', '≈': '~=',
	'√': 'sqrt', '∂': 'd',
	// Smart quotes / dashes (common in copy-pasted text)
	'‘': "'", '’': "'", '“': '"', '”': '"',
	'–': '-', '—': '--',
}

function sanitize(text: string): string {
	let s = text
	for (const [ch, rep] of Object.entries(CHAR_MAP)) {
		s = s.split(ch).join(rep)
	}
	// Strip any remaining non-Latin-1 characters
	return s.replace(/[^\x00-\xFF]/g, '')
}

// ── Default Bloom's legend (fallback when taxonomy not supplied) ───────────────
const BLOOMS_DEFAULT: Record<string, string> = {
	K1: 'Remember',
	K2: 'Understand',
	K3: 'Apply',
	K4: 'Analyze',
	K5: 'Evaluate',
	K6: 'Create',
}

// ── PO/PSO key extractor (exported so button components can reuse) ─────────────
/**
 * Extracts ordered PO/PSO keys from a taxonomy pos/psos field.
 * Handles both flat { "PO1": "desc" } and per-programme { "UEN": { "PO1": "desc" } } formats.
 */
export function extractPOKeys(
	pos?: Record<string, string> | Record<string, Record<string, string>>,
): string[] {
	if (!pos) return []
	const vals = Object.values(pos)
	if (vals.length === 0) return []
	if (typeof vals[0] === 'string') {
		// Flat format
		return Object.keys(pos).sort()
	}
	// Per-programme nested format — collect all keys across programmes
	const all = new Set<string>()
	vals.forEach(v => Object.keys(v as Record<string, string>).forEach(k => all.add(k)))
	return Array.from(all).sort()
}

// ── Public interface ──────────────────────────────────────────────────────────

export interface CourseSyllabusPDFData {
	// Institution header
	institution_name?: string
	institution_address?: string
	institution_accreditation?: string
	logoImage?: string
	rightLogoImage?: string

	// Course master
	course_code: string
	course_name: string
	/** Formatted part label, e.g. "Core Paper – I" */
	course_part?: string | null
	total_hours?: number | null
	contact_hours?: number | null
	credits?: number | null

	// Syllabus content
	objectives?: BosCourseObjective[]
	clos?: BosCourseLearnOutcome[]
	/** K-code → description map from regulation taxonomy; falls back to Bloom's defaults */
	k_values?: Record<string, string>
	units?: BosUnit[]
	textbooks?: BosTextbook[]
	references?: BosTextbook[]
	web_resources?: BosWebResource[]
	pedagogy_methods?: string[]

	// CO-PO mapping
	po_mappings?: BosPoMapping[]
	/** Ordered PO keys from taxonomy (e.g. ["PO1","PO2","PO3","PO4","PO5"]) */
	po_keys?: string[]
	/** Ordered PSO keys from taxonomy (e.g. ["PSO1","PSO2","PSO3"]) */
	pso_keys?: string[]
}

// ── Main generator ────────────────────────────────────────────────────────────

export function generateCourseSyllabusPDF(data: CourseSyllabusPDFData): string {
	const doc = new jsPDF('portrait', 'mm', 'a4')
	let y = MARGIN

	// ── INSTITUTION HEADER ────────────────────────────────────────────────────
	if (data.logoImage) {
		try { doc.addImage(data.logoImage, 'PNG', MARGIN, y, 16, 16) } catch {}
	}
	if (data.rightLogoImage) {
		try { doc.addImage(data.rightLogoImage, 'PNG', A4_W - MARGIN - 16, y, 16, 16) } catch {}
	}
	if (data.institution_name) {
		doc.setFont('times', 'bold')
		doc.setFontSize(13)
		doc.setTextColor(0, 0, 0)
		doc.text(data.institution_name, A4_W / 2, y + 5, { align: 'center' })
	}
	if (data.institution_accreditation) {
		doc.setFont('times', 'normal')
		doc.setFontSize(8)
		doc.text(data.institution_accreditation, A4_W / 2, y + 10, { align: 'center' })
	}
	y += 14
	if (data.institution_address) {
		doc.setFont('times', 'bold')
		doc.setFontSize(10)
		doc.text(data.institution_address, A4_W / 2, y, { align: 'center' })
		y += 5
	}
	y += 2

	// ── SECTION 1: Course Part Label + Course Name ────────────────────────────
	const partLabel = data.course_part ?? 'Course'
	y = table(doc, y, [
		[
			bold(partLabel, { halign: 'center', cellWidth: LABEL_W }),
			bold(data.course_name.toUpperCase(), { fontSize: 13, halign: 'center', cellWidth: TABLE_W - LABEL_W }),
		],
	], {
		0: { cellWidth: LABEL_W },
		1: { cellWidth: TABLE_W - LABEL_W },
	})

	// ── SECTION 2: Code / Hours / Credits ─────────────────────────────────────
	const c0 = LABEL_W, c1 = 40, c2 = 50, c3 = TABLE_W - c0 - c1 - c2
	y = table(doc, y, [
		[
			bold('Course\ncode', { halign: 'center' }),
			bold('Total Hours', { halign: 'center' }),
			bold('Contact Hours', { halign: 'center' }),
			bold('Credits', { halign: 'center' }),
		],
		[
			bold(data.course_code, { halign: 'center' }),
			cell(data.total_hours != null ? String(data.total_hours) : '–', { halign: 'center' }),
			cell(data.contact_hours != null ? String(data.contact_hours) : '–', { halign: 'center' }),
			cell(data.credits != null ? String(data.credits) : '–', { halign: 'center' }),
		],
	], { 0: { cellWidth: c0 }, 1: { cellWidth: c1 }, 2: { cellWidth: c2 }, 3: { cellWidth: c3 } })

	// ── SECTION 3: Course Objectives ──────────────────────────────────────────
	if (data.objectives && data.objectives.length > 0) {
		const rows: object[][] = [
			[cell(''), bold('Course Objectives')],
			[cell(''), cell('The main objectives of this course are')],
			...data.objectives.map(o => [
				cell(String(o.number), { halign: 'center' }),
				cell(sanitize(o.description)),
			]),
		]
		y = table(doc, y, rows, {
			0: { cellWidth: LABEL_W },
			1: { cellWidth: TABLE_W - LABEL_W },
		})
	}

	// ── SECTION 4: CLOs ───────────────────────────────────────────────────────
	if (data.clos && data.clos.length > 0) {
		const kW = 28
		const descW = TABLE_W - LABEL_W - kW

		// Prefer taxonomy k_values; fall back to Bloom's defaults
		const kMap = data.k_values && Object.keys(data.k_values).length > 0
			? data.k_values
			: BLOOMS_DEFAULT

		const fullLegend = Object.entries(kMap)
			.filter(([, v]) => v)
			.map(([k, v]) => `${k} – ${v}`)
			.join(';  ')

		const rows: object[][] = [
			[
				bold('CO\nNumbers', { halign: 'center' }),
				{ ...span('Expected Course Learning Outcome:', 2, { fontStyle: 'bold' }) },
			],
			[
				cell(''),
				{ ...span('On the successful completion of the course, student will be able to:', 2) },
			],
			...data.clos.map(c => [
				bold(`CO ${c.clo_number}`, { halign: 'center' }),
				cell(sanitize(c.description)),
				bold(c.k_values.join(', '), { halign: 'center' }),
			]),
			...(fullLegend ? [[{ ...span(fullLegend, 3, { halign: 'center', fontSize: 10, fontStyle: 'bold' }) }]] : []),
		]

		y = table(doc, y, rows, {
			0: { cellWidth: LABEL_W },
			1: { cellWidth: descW },
			2: { cellWidth: kW },
		})
	}

	// ── SECTION 5: Course Content ─────────────────────────────────────────────
	// Format: {unit_title}: {topic1} - {topic2} - {topic3} ...
	//         {section reference(s)}
	if (data.units && data.units.length > 0) {
		const rows: object[][] = [
			[cell(''), bold('Course content', { halign: 'center' })],
		]
		for (const unit of data.units) {
			const chapterTitles = unit.chapters.map(ch => ch.title).filter(Boolean)
			const topicText = unit.unit_title && chapterTitles.length > 0
				? `${sanitize(unit.unit_title)}: ${chapterTitles.map(sanitize).join(' - ')}`
				: sanitize(unit.unit_title || chapterTitles.join(' - '))

			const sectionRefs = [...new Set(unit.chapters.map(ch => ch.sections).filter(Boolean))].map(sanitize).join('\n')
			const fullContent = sectionRefs ? `${topicText}\n${sectionRefs}` : topicText

			rows.push([
				bold(`Unit-${unit.unit_id}`),
				cell(fullContent),
			])
		}
		y = table(doc, y, rows, {
			0: { cellWidth: LABEL_W },
			1: { cellWidth: TABLE_W - LABEL_W },
		})
	}

	// ── SECTION 6: Text Books / References / Web / Pedagogy ──────────────────
	const metaRows: object[][] = []

	if (data.textbooks && data.textbooks.length > 0) {
		metaRows.push([
			bold('Text Books', { valign: 'top' }),
			cell(data.textbooks.map(fmtBook).join('\n'), { halign: 'left' }),
		])
	}
	if (data.references && data.references.length > 0) {
		metaRows.push([
			bold('Reference\nBooks', { valign: 'top' }),
			cell(data.references.map(fmtBook).join('\n'), { halign: 'left' }),
		])
	}
	if (data.web_resources && data.web_resources.length > 0) {
		const lines = data.web_resources.map(r => sanitize(r.url || r.title || '')).join('\n')
		metaRows.push([
			bold('Web\nResources', { valign: 'top' }),
			cell(lines, { halign: 'left' }),
		])
	}
	if (data.pedagogy_methods && data.pedagogy_methods.length > 0) {
		metaRows.push([
			bold('Pedagogy', { valign: 'top' }),
			cell(data.pedagogy_methods.map(sanitize).join(', '), { halign: 'left' }),
		])
	}
	if (metaRows.length > 0) {
		y = table(doc, y, metaRows, {
			0: { cellWidth: LABEL_W },
			1: { cellWidth: TABLE_W - LABEL_W },
		})
	}
	// ── SECTION 7: Signature row (bottom of document) ────────────────────────
	y = table(doc, y, [
		[
			bold('Course Designer\n(Name & Signature)', { halign: 'center', minCellHeight: 30, valign: 'bottom' }),
			bold('Verified by BoS Chairman', { halign: 'center', minCellHeight: 30, valign: 'bottom' }),
		],
	], {
		0: { cellWidth: TABLE_W / 2 },
		1: { cellWidth: TABLE_W / 2 },
	})
	// ── SECTION 8: CO-PO Mapping ─────────────────────────────────────────────
	if (data.po_mappings && data.po_mappings.length > 0) {
		if (y + 50 > A4_H - 15) {
			doc.addPage()
			y = MARGIN
		} else {
			y += 10
		}

		doc.setFont('times', 'bold')
		doc.setFontSize(12)
		doc.setTextColor(0, 0, 0)
		doc.text('MAPPING WITH PROGRAMME OUTCOMES:', MARGIN, y)
		y += 6

		// Prefer taxonomy-supplied keys; fall back to deriving from mapping data
		const psoKeys = data.pso_keys?.length
			? data.pso_keys
			: [...new Set(data.po_mappings.flatMap(m => Object.keys(m.psos ?? {})))].sort()
		const poKeys = data.po_keys?.length
			? data.po_keys
			: [...new Set(data.po_mappings.flatMap(m => Object.keys(m.pos)))].sort()

		const coW = 14
		const totalCols = psoKeys.length + poKeys.length
		const cellW = totalCols > 0 ? (TABLE_W - coW) / totalCols : 20

		// Group header row
		const groupHead: object[] = [
			cell('', { cellWidth: coW }),
			...(psoKeys.length > 0 ? [{ ...span('PSOs', psoKeys.length, { fontStyle: 'bold', halign: 'center', fillColor: [240, 240, 240] }) }] : []),
			...(poKeys.length > 0 ? [{ ...span('POs', poKeys.length, { fontStyle: 'bold', halign: 'center', fillColor: [240, 240, 240] }) }] : []),
		]

		// Sub-header (individual codes)
		const subHead: object[] = [
			bold('CO', { halign: 'center', cellWidth: coW }),
			...psoKeys.map(k => bold(k, { halign: 'center' })),
			...poKeys.map(k => bold(k, { halign: 'center' })),
		]

		// Data rows
		const bodyRows: object[][] = data.po_mappings.map(m => [
			bold(m.co_id.toUpperCase(), { halign: 'center' }),
			...psoKeys.map(k => cell(m.psos?.[k] ?? '–', { halign: 'center' })),
			...poKeys.map(k => cell(m.pos[k] ?? '–', { halign: 'center' })),
		])

		const colStyles: Record<number, object> = { 0: { cellWidth: coW } }
		;[...psoKeys, ...poKeys].forEach((_, i) => { colStyles[i + 1] = { cellWidth: cellW } })

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		autoTable(doc, {
			head: [groupHead, subHead] as any,
			body: bodyRows as any,
			startY: y,
			margin: { left: MARGIN, right: MARGIN },
			tableWidth: TABLE_W,
			theme: 'grid',
			styles: {
				font: 'times',
				fontSize: 10,
				cellPadding: 2,
				lineColor: [0, 0, 0] as [number, number, number],
				lineWidth: 0.3,
				textColor: [0, 0, 0] as [number, number, number],
				valign: 'middle',
				overflow: 'linebreak',
			},
			headStyles: {
				font: 'times',
				fontStyle: 'bold',
				fillColor: [240, 240, 240],
				textColor: [0, 0, 0],
				halign: 'center',
				fontSize: 10,
				lineColor: [0, 0, 0],
				lineWidth: 0.3,
			},
			columnStyles: colStyles,
		})
		y = lastY(doc)
		y += 4

		doc.setFont('times', 'bold')
		doc.setFontSize(10)
		doc.setTextColor(0, 0, 0)
		doc.text('H–High;  M–Medium;  L–Low', MARGIN, y)
	}

	

	// ── SAVE ─────────────────────────────────────────────────────────────────
	const date = new Date().toISOString().split('T')[0]
	const fileName = `${data.course_code}_syllabus_${date}.pdf`
	doc.save(fileName)
	return fileName
}
