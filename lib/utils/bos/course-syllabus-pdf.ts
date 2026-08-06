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
	BosConceptApplicationsData,
	BosAssessmentPatternData,
	BosCapstoneProjectData,
	BosCapstoneRubricData,
	BosLlcConferenceData,
} from '@/types/bos'
// Engineering (Anna University / CET) courses render a separate borderless
// layout — see the branch in renderCourseSyllabusPDF. Kept in its own module so
// the Arts & Science renderer here is never touched by the engineering path.
import { renderEngineeringSyllabusPDF } from './course-syllabus-cet-pdf'

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
	// Rich mode: when set, the line renders as a sequence of word tokens with
	// per-token bold (inline **bold** phrases mid-sentence — something the
	// prefixEnd model cannot express). `glue` tokens attach to the previous
	// token with no gap (punctuation after a marker boundary). When `justify`
	// is also set, the inter-token gaps stretch to fill the cell width —
	// measured and drawn with the same math, so no autoTable-style mismatch.
	// Takes precedence over prefixEnd.
	segments?: Array<{ text: string; bold: boolean; glue?: boolean }>
}

interface BosMixedMeta {
	lines: BosMixedLine[]
	// Draw size for the whole cell (defaults to FONT_SIZE). Must match the
	// cell's styles.fontSize so autoTable's height calc and our custom draw
	// agree on the line height.
	fontSize?: number
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
			const metaFs = meta.fontSize ?? FONT_SIZE
			const fontSizeMM = (metaFs * 25.4) / 72
			const lineHeight = fontSizeMM * 1.15

			doc.setFontSize(metaFs)
			doc.setTextColor(0, 0, 0)
			let yLine = data.cell.y + padding

			for (const line of meta.lines) {
				const t = line.text
				if (line.segments && line.segments.length > 0) {
					// Rich mode: walk the word tokens, optionally stretching the
					// inter-token gaps to justify the line across the cell.
					const toks = line.segments
					const tokW = toks.map(tk => {
						doc.setFont('times', tk.bold ? 'bold' : 'normal')
						return doc.getTextWidth(tk.text)
					})
					doc.setFont('times', 'normal')
					const spaceW = doc.getTextWidth(' ')
					const gaps = toks.filter((tk, i) => i > 0 && !tk.glue).length
					let gapW = spaceW
					if (line.justify && gaps > 0) {
						const wordsW = tokW.reduce((s, w) => s + w, 0)
						const extra = (cellW - padding * 2 - wordsW - spaceW * gaps) / gaps
						// Same guard as drawJustifiedLine: don't stretch sparse
						// lines grotesquely.
						if (extra > 0 && extra <= spaceW * 3) gapW = spaceW + extra
					}
					let xSeg = xLeft
					toks.forEach((tk, i) => {
						if (i > 0 && !tk.glue) xSeg += gapW
						doc.setFont('times', tk.bold ? 'bold' : 'normal')
						doc.text(tk.text, xSeg, yLine, { baseline: 'top' })
						xSeg += tokW[i]
					})
				} else if (line.justify && t.length > 0) {
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
		didDrawPage: () => {
			// autoTable's own pageNumber restarts at 1 for every table — with
			// many tables per document that stamps "Page 1" all over. Use the
			// document's true page number instead.
			const pageNumber = doc.getCurrentPageInfo().pageNumber
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

// ── Inline **bold** wrap (v3.5 paragraph blocks) ─────────────────────────────
// Parses "**bold phrase**" markers (mirroring the source documents' <strong>
// spans) and wraps the words into cell-width lines of bold/regular segments
// for the _bosMixed rich renderer. Lines are left-anchored; the height
// contract is the same as wrapBoldPrefixRest — one BosMixedLine per visual
// line, joined with '\n' as the cell content for autoTable's height calc.
function wrapRichText(doc: jsPDF, text: string, maxWidth: number, fontSize: number = FONT_SIZE): BosMixedLine[] {
	// Tokenize into words carrying their bold state. A token is "glued" when
	// the marker boundary sits mid-word (e.g. "**…Capstone**: a") — the `:`
	// must attach to the previous word with no space, or the output reads
	// "Capstone : a".
	const tokens: Array<{ word: string; bold: boolean; glue: boolean }> = []
	{
		let prevEndsWithSpace = true
		sanitize(text).split('**').forEach((part, i) => {
			const isBold = i % 2 === 1 // odd segments sit inside ** … **
			if (!part) return
			const startsWithSpace = /^\s/.test(part)
			part.split(/\s+/).filter(Boolean).forEach((w, wi) => {
				tokens.push({
					word: w,
					bold: isBold,
					glue: wi === 0 && !startsWithSpace && !prevEndsWithSpace && tokens.length > 0,
				})
			})
			prevEndsWithSpace = /\s$/.test(part)
		})
	}

	doc.setFontSize(fontSize)
	doc.setFont('times', 'normal')
	const spaceW = doc.getTextWidth(' ')
	const wordW = (w: string, bold: boolean) => {
		doc.setFont('times', bold ? 'bold' : 'normal')
		return doc.getTextWidth(w)
	}

	const lines: BosMixedLine[] = []
	let cur: Array<{ text: string; bold: boolean; glue?: boolean }> = []
	let lineW = 0
	const flush = () => {
		if (cur.length > 0) {
			const text = cur.map((tk, i) => (i === 0 || tk.glue ? tk.text : ` ${tk.text}`)).join('')
			lines.push({ text, prefixEnd: 0, segments: cur })
		}
		cur = []
		lineW = 0
	}
	for (const t of tokens) {
		const w = wordW(t.word, t.bold)
		if (t.glue && cur.length > 0) {
			// Attach directly to the previous token — no gap, no line break.
			cur.push({ text: t.word, bold: t.bold, glue: true })
			lineW += w
			continue
		}
		if (cur.length > 0 && lineW + spaceW + w > maxWidth) flush()
		const isLineStart = cur.length === 0
		cur.push({ text: t.word, bold: t.bold })
		lineW += isLineStart ? w : spaceW + w
	}
	flush()
	// Justify every wrapped line except the paragraph's final one, matching
	// the halign:'justify' look of the document's plain cells.
	for (let i = 0; i < lines.length - 1; i++) lines[i].justify = true
	return lines
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
	s = s.replace(/[^\x00-\xFF]/g, '')
	// Collapse tab/newline/space runs and trim. Source rows extracted from
	// PDFs carry stray tabs and trailing newlines; a trailing newline makes
	// jsPDF treat the visible line as non-final and justify-stretch it across
	// the full cell ("To    Gain    knowledge…"), and the phantom empty line
	// inflates the row height.
	return s.replace(/\s+/g, ' ').trim()
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

// ── Arts-&-Science (CAS) paragraph builder for a unit's content ───────────────
// Collapses one unit's chapters into { heading, body } for the flowing-paragraph
// layout. Reconciles the two shapes the importer produces:
//   A) unit_title set + several chapters, each a bare topic (no subtopics)
//   B) unit_title empty + ONE chapter whose title IS the heading + subtopics=topics
// Topics are joined by " - "; a chapter's own sub-items join by ", ". Stray
// trailing separators ("-", ",", ";") baked into imported text are stripped.
function cleanUnitItem(s: string | undefined | null): string {
	return sanitize(s || '').trim().replace(/[\s\-–—,;:]+$/, '').trim()
}

function buildParagraphUnit(unit: BosUnit): { heading: string; body: string } {
	const unitTitle = cleanUnitItem(unit.unit_title)
	const chaps = (unit.chapters ?? [])
		.map(ch => ({
			title: cleanUnitItem(ch.title),
			subs: (ch.subtopics ?? []).map(s => cleanUnitItem(s.title)).filter(Boolean),
		}))
		.filter(c => c.title || c.subs.length > 0)

	// One topic-string per chapter: a bare title, or "title sub, sub" when the
	// chapter carries its own sub-items (sections join with ", ").
	const chapterToTopic = (c: { title: string; subs: string[] }): string =>
		c.subs.length > 0
			? (c.title ? `${c.title} ${c.subs.join(', ')}` : c.subs.join(', '))
			: c.title

	let heading = ''
	let topics: string[] = []

	if (unitTitle) {
		heading = unitTitle
		topics = chaps.map(chapterToTopic).filter(Boolean)
	} else if (chaps.length === 1 && chaps[0].subs.length > 0) {
		// Shape B: the lone chapter title is the unit heading; its subs are the topics.
		heading = chaps[0].title
		topics = chaps[0].subs
	} else {
		// No unit_title and not the single-chapter shape — flatten chapter titles.
		topics = chaps.map(chapterToTopic).filter(Boolean)
	}

	// Join topics, then normalise to exactly one trailing period.
	const body = topics.length > 0 ? `${topics.join(' - ').replace(/[.\s]+$/, '')}.` : ''
	return { heading, body }
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
	/**
	 * Document variant. 'engineering' renders the Anna University / CET-style
	 * wording (Course Outcomes preamble "At the end of the course…", no
	 * "The main objectives of this course are" line). 'default' (or unset)
	 * keeps the Arts & Science wording that the live CAS syllabi already use.
	 */
	variant?: 'default' | 'engineering'

	// Institution header
	institution_name?: string
	institution_address?: string
	institution_accreditation?: string
	logoImage?: string
	rightLogoImage?: string
	/** Extra centred banner lines (engineering CET variant only). */
	banner_lines?: string[]
	/** Website line for the engineering CET banner. */
	institution_website?: string

	// Course master
	course_code: string
	course_name: string
	/** Formatted part label, e.g. "Core Paper – I" */
	course_part?: string | null
	total_hours?: number | null
	contact_hours?: number | null
	credits?: number | null
	/**
	 * Anna University L-T-P-C values for the engineering variant's header row.
	 * Parsed from the syllabus `notes` ("LTPC: 3 1 0 4") because they are not
	 * stored as structured columns. Only consumed by the CET renderer.
	 */
	ltpc?: { l?: string | number; t?: string | number; p?: string | number; c?: string | number }
	/**
	 * Total course periods "theory + tutorial" (e.g. 30 + 30) for the CET
	 * variant's per-unit hour markers and the "TOTAL: N+M PERIODS" line. Used
	 * only when the units don't already carry their own "6+6" markers; the
	 * total is then distributed evenly across the units.
	 */
	total_periods?: { theory: number; tut: number }
	/**
	 * The Content tab's free-text "Total Hours" box (`course_content.total_hours`)
	 * exactly as typed — "30 + 30" for a theory+tutorial split, or a plain "45".
	 * The CET renderer prints it verbatim as "TOTAL: <value> PERIODS", so the
	 * document always shows the author's own total rather than a sum that can
	 * only be derived when every unit carries a period marker.
	 */
	content_total_hours?: string

	// Syllabus content
	/** PCI/pharmacy "Scope" paragraph, printed above Course Objectives. */
	scope?: string
	/** Hide the Course Designer / BoS Chairman signature block (COP temporary). */
	hideSignature?: boolean
	objectives?: BosCourseObjective[]
	clos?: BosCourseLearnOutcome[]
	/** K-code → description map from regulation taxonomy; falls back to Bloom's defaults */
	k_values?: Record<string, string>
	units?: BosUnit[]
	/**
	 * How to render each unit's `chapters`:
	 *   - 'stacked'  (default): unit_title as a bold heading, then each chapter on
	 *     its own line ("Title: subs") — the engineering / Anna-Univ layout.
	 *   - 'paragraph': the Arts-&-Science (CAS) layout — a single flowing paragraph
	 *     "**HEADING:** topic - topic - topic." with topics joined by " - " and a
	 *     chapter's sub-items joined by ", ". Reconciles the two ways units are
	 *     imported (unit_title+chapters vs. empty unit_title+chapter-as-heading).
	 */
	unitLayout?: 'stacked' | 'paragraph'
	/**
	 * Numbered list of practical-paper topics — set instead of `units` for
	 * practical/lab papers. Each topic is a heading (e.g. "MAJOR PRACTICALS")
	 * and may optionally carry its own numbered sub-topics (rendered with
	 * "1.1, 1.2, …" prefixes under the parent heading).
	 */
	practical_topics?: BosPracticalTopic[]
	/**
	 * Whether to print the inline experiment number ("1. …") on practical
	 * headings/sub-topics. Defaults to ON (numbered) when undefined so existing
	 * syllabi are unchanged; `false` drops the prefix (S.No column still numbers).
	 */
	number_practical_topics?: boolean
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

	// v3.5 Fink's Formative + Capstone blocks (five dedicated JSONB columns)
	concept_applications?: BosConceptApplicationsData
	assessment_pattern?: BosAssessmentPatternData
	capstone_project?: BosCapstoneProjectData
	capstone_rubric?: BosCapstoneRubricData
	llc_conference?: BosLlcConferenceData
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
	// Engineering (Anna University / CET) courses render a completely different,
	// borderless flowing layout. Kept in its own function so the Arts & Science
	// (CAS) path below stays exactly as it was — never touched by the variant.
	if (data.variant === 'engineering') {
		renderEngineeringSyllabusPDF(doc, data, opts)
		return
	}

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
			bold((data.course_name ?? '').toUpperCase(), { fontSize: 13, halign: 'center', cellWidth: TABLE_W - LABEL_W }),
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

	// ── SECTION 2.5: Scope (pharmacy/COP) — printed above Course Objectives ────
	// PCI B.Pharm syllabi open with a "Scope" paragraph. Only rendered when the
	// syllabus carries one (pharmacy models); other syllabi skip it entirely.
	if (data.scope && data.scope.trim()) {
		y = table(doc, y, [
			[cell(''), bold('Scope')],
			[cell(''), cell(sanitize(data.scope.trim()))],
		], {
			0: { cellWidth: LABEL_W },
			1: { cellWidth: TABLE_W - LABEL_W },
		})
	}

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
		// 34mm + 10pt keeps a full six-code Fink's set ("FK, AP, IN, HD, CA,
		// LHL") to at most two lines instead of three at the old 28mm/12pt.
		const kW = 34
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
				bold(c.k_values.join(', '), { halign: 'center', fontSize: 10 }),
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
	// Render order is theory-first: for a combined "Theory + Practical" course
	// the units block prints first, then the practical experiments below it.
	// Both bodies are wrapped in deferred closures (each returns early when its
	// data is absent) so a single-mode course still prints exactly one section,
	// while a combined course prints both in reading order. The callers at the
	// end of this section fix the order (renderTheoryUnits → renderPracticalTopics).

	// Practical-paper variant: the form stores a flat numbered `topics` list
	// instead of unit/chapter trees (see ContentEditor in
	// components/bos/syllabus-form.tsx). Rendered as an "S.No | List of
	// Experiments" table. The inline experiment number ("1. …") is printed only
	// when numbering is enabled (default ON; see number_practical_topics).
	const renderPracticalTopics = () => {
	if (data.practical_topics && data.practical_topics.length > 0) {
		// Default ON when the flag is absent, so existing syllabi stay numbered.
		const showExperimentNumbers = data.number_practical_topics !== false
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
					const subText = showExperimentNumbers
						? `${st.number}. ${sanitize(st.title || '')}`
						: sanitize(st.title || '')
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
	}
	}
	// Theory units — the unit/chapter layout (engineering & CAS). Wrapped so it
	// can be invoked before the practical section for combined courses.
	const renderTheoryUnits = () => {
	if (data.units && data.units.length > 0) {
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
			// CAS / Arts-&-Science layout: one flowing paragraph per unit —
			// "**HEADING:** topic - topic - …." — instead of the stacked heading +
			// per-chapter lines below. Reconciles both importer shapes (see
			// buildParagraphUnit).
			if (data.unitLayout === 'paragraph') {
				const { heading, body } = buildParagraphUnit(unit)
				const allLines: BosMixedLine[] = []
				if (heading && body) {
					allLines.push(...wrapBoldPrefixRest(doc, `${heading}: `, body, contentMaxTextW))
				} else if (heading) {
					allLines.push(...wrapBoldPrefixRest(doc, heading, '', contentMaxTextW))
				} else if (body) {
					doc.setFont('times', 'normal')
					doc.setFontSize(FONT_SIZE)
					const wrapped = doc.splitTextToSize(body, contentMaxTextW) as string[]
					wrapped.forEach((l, idx) =>
						allLines.push({ text: l, prefixEnd: 0, justify: idx < wrapped.length - 1 }),
					)
				}
				if (allLines.length === 0) allLines.push({ text: '', prefixEnd: 0 })
				rows.push([
					{ content: unit.unit_id, styles: { fontStyle: 'bold', halign: 'center', valign: 'top' } },
					{ content: allLines.map(l => l.text).join('\n'), _bosMixed: { lines: allLines } },
				])
				continue
			}

			const unitTitle = sanitize(unit.unit_title || '').trim()

			const chapterEntries = unit.chapters
				.map(ch => {
					const title = sanitize(ch.title || '').trim()
					const subs = (ch.subtopics ?? [])
						.map(s => sanitize(s.title || '').trim().replace(/[,;]+$/, ''))
						.filter(Boolean)
					// `sections` carries the chapter's detail text (PCI/Anna body) or a
					// section reference ("1.1, 1.2"). Rendered per-chapter below (not
					// pooled at the unit end) so each heading sits directly above its
					// own detail — matching the source syllabus layout.
					const sections = sanitize(ch.sections || '').trim()
					return { title, subs, sections }
				})
				.filter(c => c.title || c.subs.length > 0 || c.sections)

			// Build the flat list of mixed-style lines for this unit's content cell.
			const allLines: BosMixedLine[] = []

			if (unitTitle) {
				// Render unit_title as a fully-bold heading, wrapped if it's wider
				// than the cell (rest='' → cleanly-wrapped fully-bold lines).
				allLines.push(...wrapBoldPrefixRest(doc, unitTitle, '', contentMaxTextW))
			}

			// Normal-weight wrapped detail lines (used for the per-chapter body).
			const pushDetail = (text: string) => {
				doc.setFont('times', 'normal')
				doc.setFontSize(FONT_SIZE)
				const wrapped = doc.splitTextToSize(text, contentMaxTextW) as string[]
				wrapped.forEach((l, idx) =>
					allLines.push({ text: l, prefixEnd: 0, justify: idx < wrapped.length - 1 }),
				)
			}

			for (const ch of chapterEntries) {
				// Strip trailing colon/whitespace from the title.
				const cleanTitle = ch.title.replace(/[:\s]+$/, '')
				// Detail sits directly BELOW its bold heading (source syllabus layout),
				// drawn from the chapter's sub-topics and/or its `sections` detail —
				// whichever the data carries. Sub-topics join with ", "; a `sections`
				// paragraph follows.
				const detailBits: string[] = []
				if (ch.subs.length > 0) detailBits.push(`${ch.subs.join(', ')}.`)
				if (ch.sections) detailBits.push(ch.sections)
				const detailText = detailBits.join(' ')

				if (cleanTitle) {
					// Bold chapter heading on its own line.
					allLines.push(...wrapBoldPrefixRest(doc, cleanTitle, '', contentMaxTextW))
				}
				if (detailText) pushDetail(detailText)
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
	}

	// Theory first, then practical — combined "Theory + Practical" courses print
	// the units section above the "List of Experiments" section.
	renderTheoryUnits()
	renderPracticalTopics()

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

	// ── SECTION 10: v3.5 Fink's Formative + Capstone blocks ──────────────────
	// Rendered in document order: Concept Applications → Assessment Pattern →
	// Capstone Project → Capstone Rubric → Learners Led Conference. Every block
	// is optional — legacy rows without the v3.5 columns render unchanged.
	const sectionHeading = (text: string) => {
		if (y + 40 > A4_H - 15) { doc.addPage(); y = MARGIN } else { y += 10 }
		doc.setFont('times', 'bold')
		doc.setFontSize(12)
		doc.setTextColor(0, 0, 0)
		doc.text(text, MARGIN, y)
		y += 6
	}

	// Full-width paragraph row. Text carrying inline **bold** markers (the
	// source documents' <strong> phrases) renders via the rich segment path;
	// plain text falls back to a normal left-aligned cell.
	const paragraphRow = (text: string): AnyCell[][] => {
		const t = text.trim()
		if (t.includes('**')) {
			const lines = wrapRichText(doc, t, TABLE_W - 4)
			return [[{ content: lines.map(l => l.text).join('\n'), _bosMixed: { lines }, styles: { valign: 'top' } }]]
		}
		return [[cell(sanitize(t), { halign: 'left' })]]
	}

	// v3.5 capstone gate: the Assessment Pattern, Capstone Rubric, and
	// Learners Led Conference are the summative spec for the Capstone Project —
	// they only make sense when a capstone project exists. Print ASSESSMENT
	// PATTERN, CAPSTONE RUBRIC, and the LLC panel ONLY when capstone_project
	// carries data (options or an intro note); a syllabus with no capstone
	// project skips them all, even if their own JSONB columns happen to hold
	// rows. Shared with the Capstone Project block below so the sections appear
	// or disappear together.
	const cp = data.capstone_project
	const hasCapstoneProject = !!(cp && ((cp.options?.length ?? 0) > 0 || cp.intro_note?.trim()))

	// Concept Applications (Formative Learning Activities)
	const ca = data.concept_applications
	if (ca && ((ca.activities?.length ?? 0) > 0 || ca.intro_note?.trim())) {
		sectionHeading('CONCEPT APPLICATIONS (FORMATIVE LEARNING ACTIVITIES):')
		if (ca.intro_note?.trim()) {
			y = table(doc, y, paragraphRow(ca.intro_note), { 0: { cellWidth: TABLE_W } })
		}
		const acts = ca.activities ?? []
		if (acts.length > 0) {
			const unitW = 22, dimW = 30
			const restW = (TABLE_W - unitW - dimW) / 2
			// 10pt body (matches the v3.5 HTML documents' compact table style).
			// Task/Deliverable cells justify through the rich renderer — NEVER
			// autoTable's 'justify', which re-wraps at draw time and clips rows.
			const caFs = 10
			const richJustified = (text: string): AnyCell => {
				const lines = wrapRichText(doc, text, restW - 4, caFs)
				return {
					content: lines.map(l => l.text).join('\n'),
					_bosMixed: { lines, fontSize: caFs },
					styles: { valign: 'top', fontSize: caFs },
				}
			}
			const rows: AnyCell[][] = [
				[
					bold('Unit', { halign: 'center', fontSize: caFs }),
					bold("Fink's Dim.", { halign: 'center', fontSize: caFs }),
					bold('Task', { halign: 'center', fontSize: caFs }),
					bold('Deliverable & Notes', { halign: 'center', fontSize: caFs }),
				],
				...acts.map((a, i) => [
					bold(sanitize(a.unit || String(a.sno ?? i + 1)), { halign: 'center', valign: 'top', fontSize: caFs }),
					cell(sanitize(a.finks_dimension || ''), { halign: 'center', valign: 'top', fontSize: caFs }),
					richJustified(a.task || ''),
					richJustified(a.deliverable_notes || ''),
				]),
			]
			y = table(doc, y, rows, { 0: { cellWidth: unitW }, 1: { cellWidth: dimW }, 2: { cellWidth: restW }, 3: { cellWidth: restW } })
		}
	}

	// Assessment Pattern (Internal | External split + internal component rows)
	const ap = data.assessment_pattern
	if (hasCapstoneProject && ap && ((ap.components?.length ?? 0) > 0 || ap.internal_marks != null || ap.external_marks != null)) {
		sectionHeading('ASSESSMENT PATTERN:')
		const comps = ap.components ?? []
		const snoW = 16, marksW = 22
		const rows: AnyCell[][] = []
		if (ap.internal_marks != null || ap.external_marks != null) {
			rows.push([{
				...span(
					`Internal = ${ap.internal_marks ?? '-'} Marks   |   External = ${ap.external_marks ?? '-'} Marks`,
					3,
					{ fontStyle: 'bold', halign: 'center', fillColor: [240, 240, 240] },
				),
			}])
		}
		if (comps.length > 0) {
			rows.push([bold('S.No', { halign: 'center' }), bold('Component', { halign: 'center' }), bold('Marks', { halign: 'center' })])
			comps.forEach((c, i) => {
				rows.push([
					cell(String(c.sno ?? i + 1), { halign: 'center' }),
					cell(sanitize(c.component || ''), { halign: 'left' }),
					cell(c.marks != null ? String(c.marks) : '-', { halign: 'center' }),
				])
			})
			const total = comps.reduce((s, c) => s + (Number(c.marks) || 0), 0)
			rows.push([{ ...span('Total Internal', 2, { fontStyle: 'bold', halign: 'right' }) }, bold(String(total), { halign: 'center' })])
		}
		if (rows.length > 0) {
			y = table(doc, y, rows, { 0: { cellWidth: snoW }, 1: { cellWidth: TABLE_W - snoW - marksW }, 2: { cellWidth: marksW } })
		}
		const noteRows: AnyCell[][] = []
		if (ap.activities_note?.trim()) noteRows.push([cell(sanitize(ap.activities_note).trim(), { halign: 'left', fontSize: 10 })])
		if (ap.note?.trim()) noteRows.push([cell(`Note: ${sanitize(ap.note).trim()}`, { halign: 'left', fontSize: 10, fontStyle: 'italic' })])
		if (noteRows.length > 0) {
			y = table(doc, y, noteRows, { 0: { cellWidth: TABLE_W } })
		}
	}

	// Capstone Project — choose ONE of FIVE (option cards). `cp` /
	// `hasCapstoneProject` are computed once above and shared with the
	// Assessment Pattern + Capstone Rubric gates.
	if (hasCapstoneProject) {
		sectionHeading('CAPSTONE PROJECT (CHOOSE ONE OF FIVE):')
		if (cp.intro_note?.trim()) {
			y = table(doc, y, paragraphRow(cp.intro_note), { 0: { cellWidth: TABLE_W } })
		}
		const opts = cp.options ?? []
		if (opts.length > 0) {
			// Full-width card per option (mirrors the source documents): a bold
			// "Option N — Title" header line, then the Primary / Support / LLC
			// paragraphs with bold labels. One row per option so page breaks
			// fall between cards, never inside a label.
			const bodyMaxText = TABLE_W - 4
			const rows: AnyCell[][] = []
			for (const [i, opt] of opts.entries()) {
				const lines: BosMixedLine[] = []
				lines.push(...wrapBoldPrefixRest(
					doc,
					sanitize(`Option ${opt.option_no ?? i + 1} — ${opt.title || ''}`),
					'',
					bodyMaxText,
				))
				const addPart = (label: string, val?: string) => {
					if (val && val.trim()) lines.push(...wrapBoldPrefixRest(doc, `${label}: `, sanitize(val).trim(), bodyMaxText))
				}
				addPart('Primary (AI-proof)', opt.primary)
				addPart('Support', opt.support)
				addPart('LLC', opt.llc)
				rows.push([
					{ content: lines.map(l => l.text).join('\n'), _bosMixed: { lines }, styles: { valign: 'top' } },
				])
			}
			y = table(doc, y, rows, { 0: { cellWidth: TABLE_W } })
		}
	}

	// Capstone Rubric (criterion rows, common to all options)
	const cr = data.capstone_rubric
	if (hasCapstoneProject && cr && (cr.criteria?.length ?? 0) > 0) {
		const criteria = cr.criteria ?? []
		sectionHeading(cr.note?.trim() ? `CAPSTONE RUBRIC (${sanitize(cr.note).trim()}):` : 'CAPSTONE RUBRIC:')
		const marksW = 22
		const total = criteria.reduce((s, c) => s + (Number(c.marks) || 0), 0)
		const rows: AnyCell[][] = [
			[bold('Criterion', { halign: 'center' }), bold('Marks', { halign: 'center' })],
			...criteria.map(c => [
				cell(sanitize(c.criterion || ''), { halign: 'left' }),
				cell(c.marks != null ? String(c.marks) : '-', { halign: 'center' }),
			]),
			[bold('TOTAL', { halign: 'right' }), bold(String(total), { halign: 'center' })],
		]
		y = table(doc, y, rows, { 0: { cellWidth: TABLE_W - marksW }, 1: { cellWidth: marksW } })
	}

	// End-of-Course Learners Led Conference — one self-contained panel like
	// the source documents: a single inline header line (bold "LLC <title>"
	// + regular "— <subtitle>") above the description paragraph.
	const llc = data.llc_conference
	if (hasCapstoneProject && llc && (llc.title?.trim() || llc.subtitle?.trim() || llc.description?.trim())) {
		if (y + 40 > A4_H - 15) { doc.addPage(); y = MARGIN } else { y += 10 }
		const rows: AnyCell[][] = []
		const headerLines = wrapBoldPrefixRest(
			doc,
			`${sanitize(`LLC   ${llc.title?.trim() || 'End-of-Course Learners Led Conference'}`)} `,
			llc.subtitle?.trim() ? sanitize(`— ${llc.subtitle}`) : '',
			TABLE_W - 4,
		)
		rows.push([{ content: headerLines.map(l => l.text).join('\n'), _bosMixed: { lines: headerLines }, styles: { valign: 'top', fillColor: [240, 240, 240] } }])
		if (llc.description?.trim()) rows.push(...paragraphRow(llc.description))
		y = table(doc, y, rows, { 0: { cellWidth: TABLE_W } })
	}

	// ── SECTION 11: Signature row — end of document, after the LLC block ─────
	// (Moved from its pre-mapping position to match the v3.5 documents, where
	// Course Designer / BoS Chairman sign off below the full assessment spec.)
	// Hidden for COP (pharmacy) syllabi on request (temporary).
	if (data.hideSignature) return
	if (y + 40 > A4_H - 15) { doc.addPage(); y = MARGIN } else { y += 8 }
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
