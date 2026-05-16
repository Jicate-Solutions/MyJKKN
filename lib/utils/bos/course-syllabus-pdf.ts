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

// ── Mixed-style line wrap (bold prefix + regular rest) ─────────────────────────
// Splits `rest` into lines that fit in `maxWidth`. The first line has its
// available width reduced by the bold prefix's measured width; subsequent
// lines use the full width. The returned array stores complete display lines
// (line 0 already has the prefix prepended).
function wrapBoldPrefixRest(
	doc: jsPDF,
	prefix: string,
	rest: string,
	maxWidth: number,
): string[] {
	doc.setFontSize(FONT_SIZE)
	doc.setFont('times', 'bold')
	const prefixW = doc.getTextWidth(prefix)
	doc.setFont('times', 'normal')

	const tokens = rest.split(/(\s+)/).filter(t => t.length > 0)
	const lines: string[] = []
	let cur = ''
	let curMax = Math.max(0, maxWidth - prefixW)

	for (const tok of tokens) {
		const candidate = cur + tok
		if (doc.getTextWidth(candidate) <= curMax || cur.trim().length === 0) {
			cur = candidate
		} else {
			lines.push(cur.replace(/\s+$/, ''))
			cur = /^\s+$/.test(tok) ? '' : tok
			curMax = maxWidth
		}
	}
	if (cur.trim()) lines.push(cur.replace(/\s+$/, ''))
	if (lines.length === 0) lines.push('')

	lines[0] = prefix + lines[0]
	return lines
}

// ── Book formatter ────────────────────────────────────────────────────────────
// Returns the book reference without any list marker; the caller is responsible
// for prefixing "1.", "2.", … so numbering stays continuous across the list.
function fmtBook(b: BosTextbook): string {
	const parts = [b.author, b.title, b.publisher, b.publication_year ? String(b.publication_year) : '']
		.filter(Boolean)
		.map(sanitize)
	return `${parts.join(', ')}.`
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
	// Each chapter is rendered as a single inline paragraph cell:
	//   **{Chapter Title}:** {sub1}, {sub2}, ….
	// The bold title prefix and regular subtopic tail live in one cell — we
	// pre-wrap lines accounting for the bold prefix width, then redraw the
	// mixed-style text in `didDrawCell` since autoTable supports only one
	// font style per cell. The `Unit-{id}` label rowSpans across all rows
	// produced by the unit (chapters, optional unit_title, section refs).
	if (data.units && data.units.length > 0) {
		const contentColW = TABLE_W - LABEL_W
		const contentMaxTextW = contentColW - 4 // cellPadding (2) on each side

		const rows: AnyCell[][] = [
			[cell(''), bold('Course content', { halign: 'center' })],
		]

		for (const unit of data.units) {
			const unitTitle = sanitize(unit.unit_title || '').trim()

			const chapterEntries = unit.chapters
				.map(ch => {
					const title = sanitize(ch.title || '').trim()
					const subs = (ch.subtopics ?? [])
						.map(s => sanitize(s.title || '').trim().replace(/[,;]+$/, ''))
						.filter(Boolean)
					return { title, subs }
				})
				.filter(c => c.title || c.subs.length > 0)

			const sectionRefs = [...new Set(unit.chapters.map(ch => ch.sections).filter(Boolean))]
				.map(sanitize)
				.join('\n')

			const contentCells: AnyCell[] = []
			if (unitTitle) contentCells.push(bold(unitTitle))

			for (const ch of chapterEntries) {
				const subsText = ch.subs.length > 0 ? `${ch.subs.join(', ')}.` : ''
				// Strip trailing colon/whitespace from the user-entered title — we
				// always append our own ": " separator, so a stored "Database
				// Concepts:" would otherwise render as "Database Concepts:: ".
				const cleanTitle = ch.title.replace(/[:\s]+$/, '')
				if (cleanTitle && subsText) {
					const prefix = `${cleanTitle}: `
					const lines = wrapBoldPrefixRest(doc, prefix, subsText, contentMaxTextW)
					// autoTable measures cell height from `\n`-joined content; we
					// hide its default text in willDrawCell and redraw in didDrawCell.
					contentCells.push({
						content: lines.join('\n'),
						_bosMixed: { prefix, lines },
					})
				} else if (cleanTitle) {
					contentCells.push(bold(cleanTitle))
				} else if (subsText) {
					contentCells.push(cell(subsText))
				}
			}

			if (sectionRefs) contentCells.push(cell(sectionRefs))
			if (contentCells.length === 0) contentCells.push(cell(''))

			contentCells.forEach((contentCell, idx) => {
				if (idx === 0) {
					rows.push([
						{ content: `Unit-${unit.unit_id}`, rowSpan: contentCells.length, styles: { fontStyle: 'bold' } },
						contentCell,
					])
				} else {
					rows.push([contentCell])
				}
			})
		}

		autoTable(doc, {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			body: rows as any,
			startY: y,
			margin: { left: MARGIN, right: MARGIN },
			tableWidth: TABLE_W,
			theme: 'grid',
			// Move an entire row to the next page if it won't fit, instead of
			// splitting a single row across pages. Our custom didDrawCell redraws
			// all lines from cell.y, so a split row would render twice (once at
			// the bottom of page N and again at the top of page N+1).
			rowPageBreak: 'avoid',
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
			columnStyles: {
				0: { cellWidth: LABEL_W },
				1: { cellWidth: contentColW },
			},
			willDrawCell: data => {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const raw = data.cell.raw as any
				if (raw && raw._bosMixed) {
					// Suppress autoTable's regular-font text draw; we render it ourselves.
					data.cell.text = []
				}
			},
			didDrawCell: data => {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const raw = data.cell.raw as any
				if (!raw || !raw._bosMixed) return

				const { prefix, lines } = raw._bosMixed as { prefix: string; lines: string[] }
				const padding = 2
				const xText = data.cell.x + padding

				doc.setFontSize(FONT_SIZE)
				doc.setTextColor(0, 0, 0)

				// Match autoTable's line metrics: jsPDF default lineHeightFactor = 1.15.
				const fontSizeMM = (FONT_SIZE * 25.4) / 72
				const lineHeight = fontSizeMM * 1.15
				let yLine = data.cell.y + padding

				for (let i = 0; i < lines.length; i++) {
					const line = lines[i]
					if (i === 0 && line.startsWith(prefix)) {
						doc.setFont('times', 'bold')
						doc.text(prefix, xText, yLine, { baseline: 'top' })
						const w = doc.getTextWidth(prefix)
						doc.setFont('times', 'normal')
						doc.text(line.slice(prefix.length), xText + w, yLine, { baseline: 'top' })
					} else {
						doc.setFont('times', 'normal')
						doc.text(line, xText, yLine, { baseline: 'top' })
					}
					yLine += lineHeight
				}
			},
			didDrawPage: ({ pageNumber }) => {
				doc.setFont('times', 'normal')
				doc.setFontSize(7)
				doc.setTextColor(128, 128, 128)
				doc.text(new Date().toLocaleString('en-IN'), MARGIN, A4_H - 6)
				doc.text(`Page ${pageNumber}`, A4_W - MARGIN, A4_H - 6, { align: 'right' })
				doc.setTextColor(0, 0, 0)
			},
		})
		y = lastY(doc)
	}

	// ── SECTION 6: Text Books / References / Web / Pedagogy ──────────────────
	const metaRows: object[][] = []

	if (data.textbooks && data.textbooks.length > 0) {
		metaRows.push([
			bold('Text Books', { valign: 'top' }),
			cell(
				data.textbooks.map((b, i) => `${i + 1}. ${fmtBook(b)}`).join('\n'),
				{ halign: 'left' },
			),
		])
	}
	if (data.references && data.references.length > 0) {
		metaRows.push([
			bold('Reference\nBooks', { valign: 'top' }),
			cell(
				data.references.map((b, i) => `${i + 1}. ${fmtBook(b)}`).join('\n'),
				{ halign: 'left' },
			),
		])
	}
	if (data.web_resources && data.web_resources.length > 0) {
		const lines = data.web_resources
			.map((r, i) => `${i + 1}. ${sanitize(r.url || r.title || '')}`)
			.join('\n')
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
			bold('Course Designer\nName:\nDesignation:', { halign: 'left', minCellHeight: 30, valign: 'top' }),
			bold('Verified by BoS Chairman', { halign: 'center', minCellHeight: 30, valign: 'top' }),
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
