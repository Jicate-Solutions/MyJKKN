import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type {
	BosCourseObjective,
	BosCourseLearnOutcome,
	BosUnit,
	BosPracticalTopic,
	BosTextbook,
	BosWebResource,
	BosPoMapping,
	BosAssessmentStructure,
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

// Mixed-style line: one visual line in a cell where the bold prefix runs from
// char 0 to `prefixEnd`, and the rest renders regular. `prefixEnd === text.length`
// means the whole line is bold; `prefixEnd === 0` means the whole line is regular.
// `halign` applies only when the line is fully bold or fully regular (mixed lines
// are inherently left-anchored). `justify === true` spreads tokens to fill the
// cell width — set on all wrapped lines of a paragraph except the last.
interface BosMixedLine {
	text: string
	prefixEnd: number
	halign?: 'left' | 'center' | 'right'
	justify?: boolean
}

interface BosMixedMeta {
	lines: BosMixedLine[]
}

// Draws one line with words distributed evenly across `maxWidth`. Tokens
// before `prefixEnd` are measured/drawn in Times Bold; tokens after are
// regular. If the leftover space per gap is unreasonably large (>3× a natural
// space) we fall back to a normal space — keeps sparse 2-token lines from
// stretching grotesquely.
function drawJustifiedLine(
	doc: jsPDF,
	text: string,
	prefixEnd: number,
	x: number,
	y: number,
	maxWidth: number,
): void {
	const prefixPart = text.slice(0, prefixEnd)
	const restPart = text.slice(prefixEnd)
	const prefixWords = prefixPart.match(/\S+/g) ?? []
	const restWords = restPart.match(/\S+/g) ?? []

	const tokens: Array<{ text: string; bold: boolean; w: number }> = []
	doc.setFont('times', 'bold')
	for (const word of prefixWords) {
		tokens.push({ text: word, bold: true, w: doc.getTextWidth(word) })
	}
	doc.setFont('times', 'normal')
	for (const word of restWords) {
		tokens.push({ text: word, bold: false, w: doc.getTextWidth(word) })
	}

	if (tokens.length === 0) return
	if (tokens.length === 1) {
		doc.setFont('times', tokens[0].bold ? 'bold' : 'normal')
		doc.text(tokens[0].text, x, y, { baseline: 'top' })
		return
	}

	const totalTokenW = tokens.reduce((s, t) => s + t.w, 0)
	const gaps = tokens.length - 1
	let gap = (maxWidth - totalTokenW) / gaps

	doc.setFont('times', 'normal')
	const naturalSpace = doc.getTextWidth(' ')
	// Refuse to justify if the resulting gap would look comical, or be negative.
	if (gap > naturalSpace * 3 || gap < 0) gap = naturalSpace

	let cursorX = x
	for (let i = 0; i < tokens.length; i++) {
		doc.setFont('times', tokens[i].bold ? 'bold' : 'normal')
		doc.text(tokens[i].text, cursorX, y, { baseline: 'top' })
		cursorX += tokens[i].w + gap
	}
}

function table(
	doc: jsPDF,
	startY: number,
	body: AnyCell[][],
	columnStyles: Record<number, AnyCell> = {},
): number {
	// Orphan-prevention: every section's first row is the bold heading
	// (e.g. "Unit | Course content"). If less than ~24mm of page remains,
	// autoTable would draw the bold heading at the bottom of the current
	// page and push the first data row to the next — visually orphaned.
	// Push the entire table to a fresh page when we're that close to the
	// margin so heading + first data row land together.
	// 24mm ≈ heading row (~9mm) + a reasonable first data row (~15mm).
	const PAGE_BOTTOM_THRESHOLD = 24
	if (body.length >= 2 && startY > A4_H - MARGIN - PAGE_BOTTOM_THRESHOLD) {
		doc.addPage()
		startY = MARGIN
	}
	autoTable(doc, {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		body: body as any,
		startY,
		margin: { left: MARGIN, right: MARGIN },
		tableWidth: TABLE_W,
		theme: 'grid',
		// Keep rows intact across page breaks — our custom didDrawCell redraws
		// from cell.y, so a split row would render twice (once at end of page N
		// and again at start of page N+1).
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
		columnStyles,
		willDrawCell: data => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const raw = data.cell.raw as any
			if (raw && raw._bosMixed) {
				// Suppress autoTable's default text draw — we render it ourselves.
				data.cell.text = []
			}
		},
		didDrawCell: data => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const raw = data.cell.raw as any
			if (!raw || !raw._bosMixed) return

			const meta = raw._bosMixed as BosMixedMeta
			const padding = 2
			const xLeft = data.cell.x + padding
			const cellW = data.cell.width
			const fontSizeMM = (FONT_SIZE * 25.4) / 72
			const lineHeight = fontSizeMM * 1.15

			doc.setFontSize(FONT_SIZE)
			doc.setTextColor(0, 0, 0)
			let yLine = data.cell.y + padding

			for (const line of meta.lines) {
				const t = line.text
				if (line.justify && t.length > 0) {
					// Justify mode: spread tokens evenly across the cell width.
					// Works for both mixed-font and single-font lines.
					drawJustifiedLine(doc, t, line.prefixEnd, xLeft, yLine, cellW - padding * 2)
				} else if (line.prefixEnd > 0 && line.prefixEnd < t.length) {
					// Mixed: bold prefix + regular rest (always left-aligned).
					doc.setFont('times', 'bold')
					doc.text(t.slice(0, line.prefixEnd), xLeft, yLine, { baseline: 'top' })
					const w = doc.getTextWidth(t.slice(0, line.prefixEnd))
					doc.setFont('times', 'normal')
					doc.text(t.slice(line.prefixEnd), xLeft + w, yLine, { baseline: 'top' })
				} else {
					// Fully bold (prefixEnd >= length) or fully regular (prefixEnd === 0).
					const fullyBold = line.prefixEnd >= t.length && t.length > 0
					doc.setFont('times', fullyBold ? 'bold' : 'normal')
					const halign = line.halign ?? 'left'
					if (halign === 'center') {
						doc.text(t, data.cell.x + cellW / 2, yLine, { baseline: 'top', align: 'center' })
					} else if (halign === 'right') {
						doc.text(t, data.cell.x + cellW - padding, yLine, { baseline: 'top', align: 'right' })
					} else {
						doc.text(t, xLeft, yLine, { baseline: 'top' })
					}
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
	return lastY(doc)
}

// Auto-shrink font size until `text` fits within `maxWidth` in Times Bold.
// Used for short identifier-style values (e.g. course code) that should
// stay on a single line. Stops at a 6pt floor.
function fitBoldFontSize(doc: jsPDF, text: string, maxWidth: number): number {
	doc.setFont('times', 'bold')
	let size = FONT_SIZE
	doc.setFontSize(size)
	while (doc.getTextWidth(text) > maxWidth && size > 6) {
		size -= 0.5
		doc.setFontSize(size)
	}
	return size
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
// Wraps a bold `prefix` followed by a regular `rest` into display lines that
// each fit within `maxWidth`, returning fully-styled BosMixedLine entries ready
// to hand to the _bosMixed renderer:
//   • A prefix wider than the cell breaks across multiple fully-bold lines
//     (prefixEnd === text.length) — without this a long heading overflows.
//   • The trailing fragment of the prefix shares a line with the start of the
//     rest as a mixed line (bold prefixEnd, regular tail).
//   • Continuation lines of the rest are fully regular (prefixEnd === 0).
// Every line except the paragraph's final line is justified, matching the
// halign:'justify' behaviour autoTable applies to plain cells. Passing rest=''
// yields a cleanly-wrapped fully-bold heading.
function wrapBoldPrefixRest(
	doc: jsPDF,
	prefix: string,
	rest: string,
	maxWidth: number,
): BosMixedLine[] {
	doc.setFontSize(FONT_SIZE)
	const out: BosMixedLine[] = []

	// Step 1 — break the bold prefix into full-width bold lines, keeping the
	// trailing fragment as the bold lead-in that shares a line with the rest.
	doc.setFont('times', 'bold')
	const pTokens = prefix.split(/(\s+)/).filter(t => t.length > 0)
	let lead = ''
	for (const tok of pTokens) {
		const candidate = lead + tok
		if (doc.getTextWidth(candidate) <= maxWidth || lead.trim().length === 0) {
			lead = candidate
		} else {
			const done = lead.replace(/\s+$/, '')
			out.push({ text: done, prefixEnd: done.length, justify: true })
			lead = /^\s+$/.test(tok) ? '' : tok
		}
	}

	// Step 2 — if not even the first rest word fits beside the bold lead-in,
	// flush the lead onto its own bold line so the rest starts at full width.
	doc.setFont('times', 'normal')
	const rTokens = rest.split(/(\s+)/).filter(t => t.length > 0)
	const firstWord = rTokens.find(t => t.trim().length > 0) ?? ''
	doc.setFont('times', 'bold')
	let leadW = doc.getTextWidth(lead)
	doc.setFont('times', 'normal')
	if (lead.trim().length > 0 && firstWord && doc.getTextWidth(firstWord) > maxWidth - leadW) {
		const done = lead.replace(/\s+$/, '')
		out.push({ text: done, prefixEnd: done.length, justify: true })
		lead = ''
		leadW = 0
	}

	// Step 3 — wrap the regular rest. The first emitted line carries the bold
	// lead-in (mixed); subsequent lines are fully regular.
	let cur = ''
	let curMax = Math.max(0, maxWidth - leadW)
	let combined = true
	for (const tok of rTokens) {
		const candidate = cur + tok
		if (doc.getTextWidth(candidate) <= curMax || cur.trim().length === 0) {
			cur = candidate
		} else {
			const text = (combined ? lead : '') + cur.replace(/\s+$/, '')
			out.push({ text, prefixEnd: combined ? lead.length : 0, justify: true })
			combined = false
			cur = /^\s+$/.test(tok) ? '' : tok
			curMax = maxWidth
		}
	}
	// Final line of the paragraph is never justified.
	const lastText = (combined ? lead : '') + cur.replace(/\s+$/, '')
	out.push({ text: lastText, prefixEnd: combined ? lead.length : 0, justify: false })

	return out
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
	/**
	 * Numbered list of practical-paper topics — set instead of `units` for
	 * practical/lab papers. Each topic is a heading (e.g. "MAJOR PRACTICALS")
	 * and may optionally carry its own numbered sub-topics (rendered with
	 * "1.1, 1.2, …" prefixes under the parent heading).
	 */
	practical_topics?: BosPracticalTopic[]
	/** Instructions displayed after all course content (units/topics) */
	instruction?: string
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

	// v1.2 Assessment Structure (Total 100) + Concept Applications + Capstones
	assessment_structure?: BosAssessmentStructure
}

// ── Main generator ────────────────────────────────────────────────────────────

/**
 * Renders a single course syllabus into the given jsPDF document.
 *
 * Use this when you need to compose multiple syllabi (e.g. all courses in a
 * regulation) into one combined PDF. The bos/course-scheme "Download Syllabi"
 * report calls this once per course inside a single shared `doc`.
 *
 * The renderer does NOT call `doc.save()` — the caller is responsible.
 * If `opts.startNewPage` is true, a `doc.addPage()` is issued before drawing
 * the institutional header, which is the right behaviour for every syllabus
 * after the first in a combined report.
 */
export function renderCourseSyllabusPDF(
	doc: jsPDF,
	data: CourseSyllabusPDFData,
	opts?: { startNewPage?: boolean },
): void {
	if (opts?.startNewPage) doc.addPage()
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
	// Auto-shrink the course code font so identifiers like "24UUCSDSE01" stay on
	// a single line inside the LABEL_W column (cellPadding 2 on each side).
	const codeFontSize = fitBoldFontSize(doc, data.course_code, c0 - 4)
	y = table(doc, y, [
		[
			bold('Course\ncode', { halign: 'center' }),
			bold('Total Hours', { halign: 'center' }),
			bold('Contact Hours', { halign: 'center' }),
			bold('Credits', { halign: 'center' }),
		],
		[
			bold(data.course_code, { halign: 'center', fontSize: codeFontSize }),
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
	// Practical-paper variant: when the syllabus is a lab/practical course, the
	// form stores a flat numbered `topics` list instead of unit/chapter trees
	// (see ContentEditor.toggleMode in components/bos/syllabus-form.tsx).
	// Render it as an "S.No | List of Experiments" table. This branch wins over
	// the units block — the two modes are mutually exclusive by construction.
	if (data.practical_topics && data.practical_topics.length > 0) {
		// Bordered table — one row per parent topic, with the bold heading +
		// numbered sub-items stacked inside the content cell via the shared
		// `_bosMixed` line mechanism (same machinery theory-mode unit content
		// uses below). Row borders only appear between *different* parent
		// topics, so each heading and its children read as one visual block.
		const contentColW = TABLE_W - LABEL_W
		const contentMaxTextW = contentColW - 4 // cellPadding (2) on each side

		const rows: AnyCell[][] = [
			[
				bold('S.No', { halign: 'center' }),
				bold('List of Experiments', { halign: 'center' }),
			],
		]

		for (const t of data.practical_topics) {
			// Normalize: strip trailing ":"/whitespace from stored data
			// (legacy rows often have "MAJOR PRACTICALS:" baked in) so we
			// always append exactly one colon below.
			const rawTitle = sanitize(t.title || '').replace(/[:\s]+$/, '')
			const headingText = rawTitle.length > 0 ? `${rawTitle}:` : ''

			const allLines: BosMixedLine[] = []

			// Bold heading line(s). Use splitTextToSize against the bold font
			// width so a long heading wraps inside the cell rather than
			// overflowing horizontally.
			if (headingText) {
				doc.setFont('times', 'bold')
				doc.setFontSize(FONT_SIZE)
				const headingWrapped = doc.splitTextToSize(headingText, contentMaxTextW) as string[]
				headingWrapped.forEach(ln =>
					allLines.push({ text: ln, prefixEnd: ln.length }),
				)
			}

			// Sub-items (plain, leading number from stored data). Wrap with
			// the regular font so width calculations match the rendered glyphs.
			if ((t.subtopics?.length ?? 0) > 0) {
				doc.setFont('times', 'normal')
				doc.setFontSize(FONT_SIZE)
				for (const st of t.subtopics!) {
					const subText = `${st.number}. ${sanitize(st.title || '')}`
					const subWrapped = doc.splitTextToSize(subText, contentMaxTextW) as string[]
					subWrapped.forEach(ln =>
						allLines.push({ text: ln, prefixEnd: 0 }),
					)
				}
			}

			if (allLines.length === 0) allLines.push({ text: '', prefixEnd: 0 })

			rows.push([
				{
					content: String(t.number),
					styles: { fontStyle: 'bold', halign: 'center', valign: 'top' },
				},
				{
					content: allLines.map(l => l.text).join('\n'),
					_bosMixed: { lines: allLines },
					styles: { valign: 'top' },
				},
			])
		}

		y = table(doc, y, rows, {
			0: { cellWidth: LABEL_W },
			1: { cellWidth: contentColW },
		})
	} else if (data.units && data.units.length > 0) {
	// One row per unit, two columns: the unit_id label (e.g. "I", "II") on the
	// left, and all chapters merged into a single content cell on the right.
	// Each chapter renders as one inline paragraph with a bold "Title:" prefix
	// and regular subtopic tail; multiple chapters in the same unit are stacked
	// on consecutive lines within the cell. Mixed bold/regular within one cell
	// is achieved via the shared table() helper's `_bosMixed` hooks.
		const contentColW = TABLE_W - LABEL_W
		const contentMaxTextW = contentColW - 4 // cellPadding (2) on each side

		const rows: AnyCell[][] = [
			[
				bold('Unit', { halign: 'center' }),
				bold('Course content', { halign: 'center' }),
			],
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

			// Build the flat list of mixed-style lines for this unit's content cell.
			const allLines: BosMixedLine[] = []

			if (unitTitle) {
				// Render unit_title as a fully-bold heading, wrapped if it's wider
				// than the cell (rest='' → cleanly-wrapped fully-bold lines).
				allLines.push(...wrapBoldPrefixRest(doc, unitTitle, '', contentMaxTextW))
			}

			for (const ch of chapterEntries) {
				// Strip trailing colon/whitespace from the title — we append our own
				// ": " separator, so a stored "Database Concepts:" would otherwise
				// render as "Database Concepts:: ".
				const cleanTitle = ch.title.replace(/[:\s]+$/, '')
				const subsText = ch.subs.length > 0 ? `${ch.subs.join(', ')}.` : ''

				if (cleanTitle && subsText) {
					// wrapBoldPrefixRest returns fully-styled lines (bold-prefix
					// wrapping, mixed transition line, justified-except-last).
					allLines.push(...wrapBoldPrefixRest(doc, `${cleanTitle}: `, subsText, contentMaxTextW))
				} else if (cleanTitle) {
					allLines.push(...wrapBoldPrefixRest(doc, cleanTitle, '', contentMaxTextW))
				} else if (subsText) {
					doc.setFont('times', 'normal')
					doc.setFontSize(FONT_SIZE)
					const wrapped = doc.splitTextToSize(subsText, contentMaxTextW) as string[]
					wrapped.forEach((l, idx) =>
						allLines.push({
							text: l,
							prefixEnd: 0,
							justify: idx < wrapped.length - 1,
						}),
					)
				}
			}

			if (sectionRefs) {
				doc.setFont('times', 'normal')
				doc.setFontSize(FONT_SIZE)
				const wrapped = doc.splitTextToSize(sectionRefs, contentMaxTextW) as string[]
				wrapped.forEach(l => allLines.push({ text: l, prefixEnd: 0 }))
			}

			if (allLines.length === 0) allLines.push({ text: '', prefixEnd: 0 })

			rows.push([
				{
					content: unit.unit_id,
					styles: { fontStyle: 'bold', halign: 'center', valign: 'top' },
				},
				{
					content: allLines.map(l => l.text).join('\n'),
					_bosMixed: { lines: allLines },
				},
			])
		}

		y = table(doc, y, rows, {
			0: { cellWidth: LABEL_W },
			1: { cellWidth: contentColW },
		})
	}

	// ── SECTION 5.5: Instructions (after units/topics) ──────────────────────────
	if (data.instruction && data.instruction.trim()) {
		const instructionText = sanitize(data.instruction).trim()
		y = table(doc, y, [
			[
				bold(instructionText, { halign: 'left' }),
			],
		], {
			0: { cellWidth: TABLE_W },
		})
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
			{
				content: 'Course Designer\nName:\nDesignation:',
				_bosMixed: {
					lines: [
						{ text: 'Course Designer', prefixEnd: 'Course Designer'.length, halign: 'center' },
						{ text: 'Name:', prefixEnd: 'Name:'.length, halign: 'left' },
						{ text: 'Designation:', prefixEnd: 'Designation:'.length, halign: 'left' },
					],
				},
				styles: { minCellHeight: 30, valign: 'top' },
			},
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

	// ── SECTION 9: Assessment Structure (v1.2) ───────────────────────────────
	const as = data.assessment_structure
	if (as) {
		const comps = as.components ?? []
		const capstones = as.capstones ?? []
		const hasNote = !!(as.concept_applications_note?.trim() || as.exhibition_note?.trim())
		if (comps.length > 0 || capstones.length > 0 || hasNote) {
			// Spacing / page-break before the heading.
			if (y + 40 > A4_H - 15) { doc.addPage(); y = MARGIN } else { y += 10 }
			doc.setFont('times', 'bold')
			doc.setFontSize(12)
			doc.setTextColor(0, 0, 0)
			doc.text('ASSESSMENT STRUCTURE (TOTAL 100):', MARGIN, y)
			y += 6

			// Components table — S.No | Component | Marks, with a TOTAL footer.
			if (comps.length > 0) {
				const snoW = 16, marksW = 22, compW = TABLE_W - snoW - marksW
				const total = comps.reduce((s, c) => s + (Number(c.marks) || 0), 0)
				const rows: object[][] = [
					[bold('S.No', { halign: 'center' }), bold('Component', { halign: 'center' }), bold('Marks', { halign: 'center' })],
					...comps.map((c, i) => [
						cell(String(c.sno ?? i + 1), { halign: 'center' }),
						cell(sanitize(c.component || '')),
						cell(c.marks != null ? String(c.marks) : '–', { halign: 'center' }),
					]),
					[{ ...span('TOTAL', 2, { fontStyle: 'bold', halign: 'right' }) }, bold(String(total), { halign: 'center' })],
				]
				y = table(doc, y, rows, { 0: { cellWidth: snoW }, 1: { cellWidth: compW }, 2: { cellWidth: marksW } })
			}

			// Concept Applications note.
			if (as.concept_applications_note?.trim()) {
				y = table(doc, y, [
					[bold('Concept\nApplications', { valign: 'top' }), cell(sanitize(as.concept_applications_note).trim(), { halign: 'left' })],
				], { 0: { cellWidth: LABEL_W }, 1: { cellWidth: TABLE_W - LABEL_W } })
			}

			// Principal-Agent Public Exhibition note.
			if (as.exhibition_note?.trim()) {
				y = table(doc, y, [
					[bold('Public\nExhibition', { valign: 'top' }), cell(sanitize(as.exhibition_note).trim(), { halign: 'left' })],
				], { 0: { cellWidth: LABEL_W }, 1: { cellWidth: TABLE_W - LABEL_W } })
			}

			// Capstones — title column + Subject/Artifacts/Give-back as bold-label lines.
			if (capstones.length > 0) {
				const titleW = LABEL_W * 1.6
				const bodyW = TABLE_W - titleW
				const bodyMaxText = bodyW - 4
				const capRows: AnyCell[][] = [
					[{ ...span('Capstone Projects (Principal-Agent Public Exhibition)', 2, { fontStyle: 'bold', halign: 'center' }) }],
				]
				for (const cap of capstones) {
					const lines: BosMixedLine[] = []
					const addPart = (label: string, val?: string) => {
						if (val && val.trim()) lines.push(...wrapBoldPrefixRest(doc, `${label}: `, sanitize(val).trim(), bodyMaxText))
					}
					addPart('Subject', cap.subject)
					addPart('Artifacts on display', cap.artifacts)
					addPart('Give-back', cap.give_back)
					if (lines.length === 0) lines.push({ text: '', prefixEnd: 0 })
					capRows.push([
						bold(sanitize(cap.title || ''), { valign: 'top' }),
						{ content: lines.map(l => l.text).join('\n'), _bosMixed: { lines }, styles: { valign: 'top' } },
					])
				}
				y = table(doc, y, capRows, { 0: { cellWidth: titleW }, 1: { cellWidth: bodyW } })
			}
		}
	}

}

/**
 * Original single-course download entry point — creates a new jsPDF doc,
 * renders one syllabus, and saves it to disk. Kept as a thin wrapper around
 * {@link renderCourseSyllabusPDF} so existing call-sites
 * (bos/syllabus row actions, course-syllabus DOCX export) continue to work
 * unchanged.
 */
export function generateCourseSyllabusPDF(data: CourseSyllabusPDFData): string {
	const doc = new jsPDF('portrait', 'mm', 'a4')
	renderCourseSyllabusPDF(doc, data)
	const date = new Date().toISOString().split('T')[0]
	const fileName = `${data.course_code}_syllabus_${date}.pdf`
	doc.save(fileName)
	return fileName
}
