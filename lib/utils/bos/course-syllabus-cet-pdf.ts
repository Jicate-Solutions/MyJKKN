import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { BosTextbook } from '@/types/bos'
import type { CourseSyllabusPDFData } from './course-syllabus-pdf'

// ─────────────────────────────────────────────────────────────────────────────
// Engineering (Anna University / CET) syllabus renderer.
//
// A borderless, flowing-text layout that mirrors the Anna University R-20xx
// standard syllabus (code + L-T-P-C header, bulleted objectives, unit headings
// with period markers, TOTAL line, outcomes, books, and a numeric CO-PO-PSO
// matrix). Deliberately self-contained — it shares NO code with the Arts &
// Science renderer in course-syllabus-pdf.ts so that path can never regress.
// The only cross-module link is the type import above (erased at compile time,
// so there is no runtime import cycle).
// ─────────────────────────────────────────────────────────────────────────────

const A4_W = 210
const A4_H = 297
const MARGIN = 10
const CONTENT_W = A4_W - MARGIN * 2 // 190 mm
const LEFT = MARGIN
const RIGHT = A4_W - MARGIN
const FONT = 'times'
const FS = 11.5 // body font size (pt)
const LH = 4.9 // body line height (mm) — single spacing tuned to FS
const BOTTOM = A4_H - MARGIN - 8 // y past which we page-break

// ── Unicode → WinAnsi sanitizer ───────────────────────────────────────────────
// jsPDF's built-in Times uses WinAnsi; glyphs outside it measure width 0 and
// break line-wrapping. Same table as the A&S renderer, kept local for isolation.
const CHAR_MAP: Record<string, string> = {
	α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'epsilon',
	θ: 'theta', λ: 'lambda', μ: 'mu', π: 'pi', ρ: 'rho', σ: 'sigma',
	τ: 'tau', φ: 'phi', ω: 'omega', Ω: 'Omega', Δ: 'Delta', Σ: 'Sigma',
	'∑': 'Sigma', '∫': 'integral', '∞': 'infinity',
	'≤': '<=', '≥': '>=', '≠': '!=', '≈': '~=', '√': 'sqrt', '∂': 'd',
	'‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': '--',
}

function sanitize(text: string): string {
	let s = text ?? ''
	for (const [ch, rep] of Object.entries(CHAR_MAP)) s = s.split(ch).join(rep)
	s = s.replace(/[^\x00-\xFF]/g, '')
	return s.replace(/\s+/g, ' ').trim()
}

// ── Book formatter (author, title, publisher, year.) ──────────────────────────
// Imported syllabi routinely carry the publisher AND year inside the title text
// itself ("Calculus: Early transcendentals. John Wiley & Sons. (2021)") while
// ALSO filling publication_year, which printed the year twice — "… (2021),
// 2021.". Append the year only when it isn't already present in the author or
// title, so both data shapes render one clean citation.
function fmtBook(b: BosTextbook): string {
	const author = sanitize(b.author ?? '')
	const title = sanitize(b.title ?? '')
	const year = b.publication_year ? String(b.publication_year).trim() : ''
	const yearAlreadyShown =
		year !== '' && new RegExp(`\\b${year}\\b`).test(`${author} ${title}`)
	const parts = [author, title, yearAlreadyShown ? '' : year].filter(Boolean)
	return `${parts.join(', ')}.`
}

// Convert the A&S correlation letters to Anna University's numeric scale.
// Already-numeric strings pass through; anything else is "no correlation".
function toNum(v?: string | null): string {
	if (v == null) return '-'
	const t = String(v).trim().toUpperCase()
	if (t === 'H') return '3'
	if (t === 'M') return '2'
	if (t === 'L') return '1'
	if (/^[123]$/.test(t)) return t
	return '-'
}

// ── Public entry ──────────────────────────────────────────────────────────────
export function renderEngineeringSyllabusPDF(
	doc: jsPDF,
	data: CourseSyllabusPDFData,
	opts?: { startNewPage?: boolean },
): void {
	if (opts?.startNewPage) doc.addPage()
	let y = MARGIN

	doc.setTextColor(0, 0, 0)

	// Advance y, page-breaking first if `need` mm won't fit on the current page.
	const ensure = (need: number) => {
		if (y + need > BOTTOM) { doc.addPage(); y = MARGIN }
	}

	// Draw one line with words spread evenly to fill `maxW` (full justification).
	// Short lines (gap would exceed 3× a normal space) fall back to left-aligned
	// so a sparse final phrase isn't stretched grotesquely.
	const drawJustified = (line: string, x: number, maxW: number) => {
		const words = line.split(/\s+/).filter(Boolean)
		if (words.length <= 1) { doc.text(line, x, y, { baseline: 'top' }); return }
		const wordsW = words.reduce((s, w) => s + doc.getTextWidth(w), 0)
		const spaceW = doc.getTextWidth(' ')
		let gap = (maxW - wordsW) / (words.length - 1)
		if (gap > spaceW * 3 || gap < 0) gap = spaceW
		let cx = x
		for (const w of words) {
			doc.text(w, cx, y, { baseline: 'top' })
			cx += doc.getTextWidth(w) + gap
		}
	}

	// Write a wrapped paragraph in the current font; returns nothing (mutates y).
	// `firstIndent`/`hangIndent` shift the first / continuation lines (numbered
	// lists hang under the text). `justify` fills every line but the last.
	const paragraph = (
		text: string,
		x: number,
		maxW: number,
		o: { firstIndent?: number; hangIndent?: number; justify?: boolean } = {},
	) => {
		const { firstIndent = 0, hangIndent = 0, justify = false } = o
		const lines = doc.splitTextToSize(text, maxW) as string[]
		lines.forEach((ln, i) => {
			ensure(LH)
			const lx = x + (i === 0 ? firstIndent : hangIndent)
			const lineMaxW = maxW - (i === 0 ? firstIndent : hangIndent)
			if (justify && i < lines.length - 1) drawJustified(ln, lx, lineMaxW)
			else doc.text(ln, lx, y, { baseline: 'top' })
			y += LH
		})
	}

	// Wrapped paragraph whose leading label ("Activities:", "Book 3:") prints
	// bold and the remainder in body weight. jsPDF has no rich-text runs, so the
	// wrap is done by hand: the FIRST line is short by the label's width, every
	// continuation line gets the full column. `sep` is the whitespace that stood
	// between label and body in the source, preserved so "Activities:Virtual"
	// and "Activities: Virtual" each render as authored.
	const paragraphBoldLabel = (label: string, rest: string, sep: string, x: number, maxW: number) => {
		doc.setFontSize(FS)
		doc.setFont(FONT, 'bold')
		const labelW = doc.getTextWidth(label)
		doc.setFont(FONT, 'normal')
		const indent = labelW + (sep ? doc.getTextWidth(sep) : 0)

		const words = rest.split(/\s+/).filter(Boolean)
		const lines: string[] = []
		let cur = ''
		let avail = maxW - indent
		for (const w of words) {
			const trial = cur ? `${cur} ${w}` : w
			// `!cur` forces at least one word per line, so a word wider than the
			// column overflows rather than looping forever.
			if (!cur || doc.getTextWidth(trial) <= avail) cur = trial
			else { lines.push(cur); cur = w; avail = maxW }
		}
		if (cur || lines.length === 0) lines.push(cur)

		lines.forEach((ln, i) => {
			ensure(LH)
			if (i === 0) {
				doc.setFont(FONT, 'bold')
				doc.text(label, x, y, { baseline: 'top' })
				doc.setFont(FONT, 'normal')
			}
			if (ln) {
				const lx = i === 0 ? x + indent : x
				const lw = i === 0 ? maxW - indent : maxW
				if (i < lines.length - 1) drawJustified(ln, lx, lw)
				else doc.text(ln, lx, y, { baseline: 'top' })
			}
			y += LH
		})
	}

	// One authored free-text line (unit remark / instruction), with a leading
	// label bolded when the line opens with one — "Activities:", "Book 3:",
	// "Weightage:". The 40-char cap keeps a colon deep inside a sentence from
	// bolding half the paragraph.
	const labelledLine = (text: string) => {
		const m = text.match(/^([^:]{1,40}:)(\s*)([\s\S]*)$/)
		if (m) paragraphBoldLabel(m[1], m[3], m[2], LEFT, CONTENT_W)
		else paragraph(text, LEFT, CONTENT_W, { justify: true })
	}

	// ── INSTITUTION BANNER ────────────────────────────────────────────────────
	// Logos flank a centred, multi-line institution block. addImage is wrapped
	// in try/catch so a not-yet-saved logo file degrades to text-only.
	const logoTop = y
	// Preserve the engineering logo's ~118×73 landscape ratio (drawing it square
	// squashed it). Width 27mm → height ≈ 16.7mm.
	const LOGO_W = 27
	const LOGO_H = 16.7
	// Centred, multi-line institution text block. Drawn first so the logo can be
	// vertically centred against its true height afterwards.
	const bx = A4_W / 2
	let by = y + 1
	const bannerLine = (text: string, size: number, bold: boolean, gap: number) => {
		doc.setFont(FONT, bold ? 'bold' : 'normal'); doc.setFontSize(size)
		doc.text(text, bx, by, { baseline: 'top', align: 'center' })
		by += gap
	}
	if (data.institution_name) bannerLine(data.institution_name, 14, true, 5.8)
	// Sub-lines (autonomous / trust / approvals / NAAC). Fully-uppercase lines
	// render bold to match the official letterhead emphasis.
	for (const line of data.banner_lines ?? []) {
		bannerLine(line, 9, line === line.toUpperCase(), 4.2)
	}
	if (data.institution_address) bannerLine(data.institution_address, 9.5, true, 4.3)
	if (data.institution_website) {
		doc.setFont(FONT, 'normal'); doc.setFontSize(9)
		const wtext = `Website: ${data.institution_website}`
		doc.setTextColor(0, 0, 238) // link blue
		doc.text(wtext, bx, by, { baseline: 'top', align: 'center' })
		// Clickable rect over just the URL portion of the centred line.
		const urlW = doc.getTextWidth(data.institution_website)
		const x0 = bx + doc.getTextWidth(wtext) / 2 - urlW
		doc.link(x0, by, urlW, 3.2, { url: data.institution_website })
		doc.setTextColor(0, 0, 0)
		by += 4.3
	}
	// Left logo only (no right mark), vertically centred against the text block.
	if (data.logoImage) {
		const logoY = logoTop + Math.max(0, ((by - logoTop) - LOGO_H) / 2)
		try { doc.addImage(data.logoImage, 'PNG', LEFT, logoY, LOGO_W, LOGO_H) } catch { /* logo optional */ }
	}
	// Keep clear of the logo even when the text block is short.
	y = Math.max(by, logoTop + LOGO_H) + 5

	// ── COURSE HEADER: code | NAME | L T P C / values ─────────────────────────
	doc.setFont(FONT, 'bold'); doc.setFontSize(FS)
	const hY = y
	doc.text(sanitize(data.course_code), LEFT, hY, { baseline: 'top' })
	// Course name centred on the page (matches the Anna University header); the
	// code sits far left and the L-T-P-C block far right.
	const ltpcGap = 8
	const ltpcX0 = RIGHT - ltpcGap * 3 // leftmost of the four columns
	doc.text(sanitize(data.course_name).toUpperCase(), A4_W / 2, hY, { baseline: 'top', align: 'center' })
	// L-T-P-C as four fixed, centred columns so each value sits directly under
	// its letter (matches the Anna University header).
	const ltpcLabels = ['L', 'T', 'P', 'C']
	const ltpcVals = [
		String(data.ltpc?.l ?? ''),
		String(data.ltpc?.t ?? ''),
		String(data.ltpc?.p ?? ''),
		String(data.ltpc?.c ?? data.credits ?? ''),
	]
	ltpcLabels.forEach((lab, i) => {
		const cx = ltpcX0 + i * ltpcGap
		doc.text(lab, cx, hY, { baseline: 'top', align: 'center' })
		if (ltpcVals[i]) doc.text(ltpcVals[i], cx, hY + 5, { baseline: 'top', align: 'center' })
	})
	y = hY + 13

	// ── COURSE OBJECTIVES ─────────────────────────────────────────────────────
	if (data.objectives && data.objectives.length > 0) {
		ensure(8)
		doc.setFont(FONT, 'bold'); doc.setFontSize(FS)
		doc.text('COURSE OBJECTIVES :', LEFT, y, { baseline: 'top' }); y += 6
		doc.setFont(FONT, 'normal')
		for (const o of data.objectives) {
			const lines = doc.splitTextToSize(sanitize(o.description), CONTENT_W - 8) as string[]
			ensure(LH)
			doc.circle(LEFT + 3, y + 1.8, 0.7, 'F') // bullet
			lines.forEach((ln, i) => {
				if (i > 0) ensure(LH)
				doc.text(ln, LEFT + 8, y, { baseline: 'top' })
				y += LH
			})
			y += 1 // gap between objectives
		}
		y += 5
	}

	// ── UNITS ─────────────────────────────────────────────────────────────────
	// Per-unit period markers: first read a trailing "6+6" from each unit_title
	// (the docx import sometimes dropped the tutorial half → "6+", so we mirror
	// the lecture count then). When NO unit carries a marker, fall back to
	// distributing data.total_periods evenly (30+30 over 5 units → 6+6 each), so
	// hours still render once a course total is supplied via the notes.
	const units = data.units ?? []
	const unitCount = units.length
	// The Content tab's per-unit Hours box is free text, so it holds EITHER an
	// Anna-University "theory + tutorial" split ("9 + 3", or "9+" where the docx
	// import dropped the tutorial half) OR a single number ("12") for a course
	// with no tutorial hours. Only the split shape used to be recognised, which
	// silently dropped the marker from every plain-number syllabus.
	// `tu === null` records "no split" so the marker prints as "12", not "12+0".
	const parseHours = (raw: string): { th: number; tu: number | null } | null => {
		const s = raw.trim()
		if (!s) return null
		const split = s.match(/(\d+)\s*\+\s*(\d*)/)
		if (split) {
			const th = parseInt(split[1], 10)
			return { th, tu: split[2] ? parseInt(split[2], 10) : th }
		}
		const plain = s.match(/(\d+)/)
		return plain ? { th: parseInt(plain[1], 10), tu: null } : null
	}
	const parsed = units.map(u => {
		// Prefer the structured `hours` field. index === null means the title
		// needs no stripping (the marker lives in its own field).
		const fromField = parseHours(u.hours ?? '')
		if (fromField) return { ...fromField, index: null as number | null }
		// Legacy: a trailing "6+6" embedded in unit_title. Only the split shape
		// is stripped from titles — a bare trailing number is far more likely to
		// be part of the title itself ("… Chapter 12") than an hour marker.
		const mm = sanitize(u.unit_title || '').match(/\s+(\d+)\s*\+\s*(\d*)\s*$/)
		if (!mm) return null
		const th = parseInt(mm[1], 10)
		return { th, tu: mm[2] ? parseInt(mm[2], 10) : th, index: (mm.index ?? 0) as number | null }
	})
	const anyMarker = parsed.some(Boolean)
	const dist = (!anyMarker && data.total_periods && unitCount > 0)
		? {
			th: Math.round(data.total_periods.theory / unitCount),
			tu: Math.round(data.total_periods.tut / unitCount),
		}
		: null
	let totalTheory = 0
	let totalTut = 0
	let sawHours = false
	// True once any unit carries a theory+tutorial split, which decides whether
	// the summed TOTAL line prints as "30+30" or as a single "45".
	let sawSplit = false
	for (let ui = 0; ui < units.length; ui++) {
		const unit = units[ui]
		const p = parsed[ui]
		const rawTitle = sanitize(unit.unit_title || '')
		let hoursLabel = ''
		if (p) {
			sawHours = true; totalTheory += p.th
			if (p.tu == null) {
				hoursLabel = String(p.th)
			} else {
				sawSplit = true; totalTut += p.tu
				hoursLabel = `${p.th}+${p.tu}`
			}
		} else if (dist) {
			sawHours = true; sawSplit = true; totalTheory += dist.th; totalTut += dist.tu
			hoursLabel = `${dist.th}+${dist.tu}`
		}
		const cleanTitle = (p && p.index != null) ? rawTitle.slice(0, p.index).trim() : rawTitle

		// Heading: "UNIT I   TITLE" left, "6+6" right (first line only).
		doc.setFont(FONT, 'bold'); doc.setFontSize(FS)
		const headingText = `UNIT ${unit.unit_id}    ${cleanTitle}`
		const headLines = doc.splitTextToSize(headingText, CONTENT_W - 18) as string[]
		ensure(LH + 2)
		headLines.forEach((ln, i) => {
			if (i > 0) ensure(LH)
			doc.text(ln, LEFT, y, { baseline: 'top' })
			if (i === 0 && hoursLabel) doc.text(hoursLabel, RIGHT, y, { baseline: 'top', align: 'right' })
			y += LH + 0.5
		})
		y += 1 // gap between the unit heading and its content

		// Content: flatten chapters into "Title- sub, sub." sentences.
		const parts: string[] = []
		for (const ch of unit.chapters ?? []) {
			const title = sanitize(ch.title || '').replace(/[:\s]+$/, '').trim()
			const subs = (ch.subtopics ?? [])
				.map(s => sanitize(s.title || '').replace(/[,;]+$/, '').trim())
				.filter(Boolean)
			if (title && subs.length) parts.push(`${title}- ${subs.join(', ')}.`)
			else if (title) parts.push(`${title}.`)
			else if (subs.length) parts.push(`${subs.join(', ')}.`)
		}
		if (parts.length) {
			doc.setFont(FONT, 'normal'); doc.setFontSize(FS)
			paragraph(parts.join(' '), LEFT, CONTENT_W, { justify: true })
		}

		// Per-unit REMARKS (Content tab) — e.g. "Activities: Determination of Hall
		// coefficient", or a book/section reference. Authored per unit but never
		// printed, so every such line was silently dropped from the document.
		// Rendered directly under the unit content, matching how the reference
		// syllabus prints its "Activities:…" tail — with the label bolded. Newlines
		// are kept as separate paragraphs (sanitize() would otherwise collapse them).
		const remarkLines = (unit.remarks ?? '').split(/\r?\n/).map(sanitize).filter(Boolean)
		if (remarkLines.length > 0) {
			y += 1.5
			doc.setFont(FONT, 'normal'); doc.setFontSize(FS)
			for (const rl of remarkLines) labelledLine(rl)
		}
		y += 5.5 // gap between units
	}

	// TOTAL line (right-aligned). The author's own "Total Hours" box wins — it is
	// the number they typed and see in the form, and it is the ONLY source when
	// the units carry no per-unit markers at all. Falling back: the exact course
	// total when we distributed it (avoids rounding drift from summing per-unit
	// values), then the sum of the per-unit markers.
	const explicitTotal = sanitize(data.content_total_hours ?? '')
	if (sawHours || explicitTotal) {
		ensure(LH + 2)
		const totLabel = explicitTotal
			? explicitTotal
			: (!anyMarker && data.total_periods)
				? `${data.total_periods.theory}+${data.total_periods.tut}`
				: sawSplit
					? `${totalTheory}+${totalTut}`
					: `${totalTheory}`
		doc.setFont(FONT, 'bold'); doc.setFontSize(FS)
		doc.text(`TOTAL: ${totLabel} PERIODS`, RIGHT, y, { baseline: 'top', align: 'right' })
		y += LH + 3
	}

	// ── LIST OF EXPERIMENTS (practical/lab papers) ────────────────────────────
	// Practical papers store a flat numbered topics[] instead of units[] (the
	// course_content dual shape — see types/bos.ts). This renderer used to read
	// only units[], silently dropping every lab paper's body. Rendered in the
	// Anna University lab-syllabus style: bold heading, numbered experiment
	// lines, then a right-aligned TOTAL periods line. Theory prints first, so a
	// combined "Theory + Practical" course reads units → experiments.
	if (data.practical_topics && data.practical_topics.length > 0) {
		// Default ON when the flag is absent, so existing syllabi stay numbered.
		const showNumbers = data.number_practical_topics !== false
		ensure(12)
		doc.setFont(FONT, 'bold'); doc.setFontSize(FS)
		doc.text('LIST OF EXPERIMENTS :', LEFT, y, { baseline: 'top' }); y += 6
		doc.setFont(FONT, 'normal')
		for (const t of data.practical_topics) {
			const title = sanitize(t.title || '').replace(/[:\s]+$/, '')
			const subs = t.subtopics ?? []
			if (!title && subs.length === 0) continue
			if (subs.length > 0) {
				// Heading topic (e.g. "MAJOR PRACTICALS") with numbered children
				// rendered "1.1, 1.2, …" under the bold parent.
				doc.setFont(FONT, 'bold')
				paragraph(`${title}:`, LEFT, CONTENT_W)
				doc.setFont(FONT, 'normal')
				for (const st of subs) {
					const line = showNumbers
						? `${t.number}.${st.number} ${sanitize(st.title || '')}`
						: sanitize(st.title || '')
					paragraph(line, LEFT + 2, CONTENT_W - 8, { hangIndent: 6 })
				}
			} else {
				const line = showNumbers ? `${t.number}. ${title}` : title
				paragraph(line, LEFT, CONTENT_W - 6, { hangIndent: 6 })
			}
			y += 0.5 // breathing room between experiments
		}
		// TOTAL: 60 PERIODS — the author's own "Total Hours" box first (the only
		// source for a lab syllabus whose hours live nowhere else), then the
		// explicit theory+tut split, then the course total/contact hours; omit the
		// line when nothing is known.
		const totalPeriods = data.total_periods
			? data.total_periods.theory + data.total_periods.tut
			: (data.total_hours || data.contact_hours || 0)
		const totalLabel = explicitTotal || (totalPeriods > 0 ? String(totalPeriods) : '')
		if (totalLabel) {
			ensure(LH + 2)
			doc.setFont(FONT, 'bold'); doc.setFontSize(FS)
			doc.text(`TOTAL: ${totalLabel} PERIODS`, RIGHT, y, { baseline: 'top', align: 'right' })
			y += LH
		}
		y += 3
	}

	// ── INSTRUCTIONS (Content tab, below the units) ───────────────────────────
	// Free-text notes authored under the course content — in practice the
	// assessment weightage block ("Weightage: Continuous Assessment: 40%…",
	// "Assessment Methodology: Quiz (10%)…"). The field was collected by the form
	// and passed to the renderer, but never drawn, so it was dropped from every
	// engineering PDF. Each authored line is its own paragraph with its label
	// bolded, so the block reads the way it does in the form.
	if (data.instruction) {
		const instructionLines = data.instruction.split(/\r?\n/).map(sanitize).filter(Boolean)
		if (instructionLines.length > 0) {
			ensure(LH + 4)
			doc.setFont(FONT, 'normal'); doc.setFontSize(FS)
			for (const ln of instructionLines) labelledLine(ln)
			y += 5
		}
	}

	// ── COURSE OUTCOMES ───────────────────────────────────────────────────────
	if (data.clos && data.clos.length > 0) {
		ensure(12)
		doc.setFont(FONT, 'bold'); doc.setFontSize(FS)
		doc.text('COURSE OUTCOMES:', LEFT, y, { baseline: 'top' }); y += 5.5
		doc.setFont(FONT, 'normal')
		doc.text('At the end of the course, the students will be able to:', LEFT, y, { baseline: 'top' }); y += 6
		for (const clo of data.clos) {
			paragraph(`CO${clo.clo_number}: ${sanitize(clo.description)}`, LEFT, CONTENT_W)
		}
		y += 5
	}

	// ── TEXT BOOKS ────────────────────────────────────────────────────────────
	if (data.textbooks && data.textbooks.length > 0) {
		ensure(10)
		doc.setFont(FONT, 'bold'); doc.setFontSize(FS)
		doc.text('TEXT BOOKS:', LEFT, y, { baseline: 'top' }); y += 6
		doc.setFont(FONT, 'normal')
		data.textbooks.forEach((b, i) => {
			paragraph(`${i + 1}. ${fmtBook(b)}`, LEFT, CONTENT_W - 6, { hangIndent: 6 })
		})
		y += 5
	}

	// ── REFERENCES ────────────────────────────────────────────────────────────
	if (data.references && data.references.length > 0) {
		ensure(10)
		doc.setFont(FONT, 'bold'); doc.setFontSize(FS)
		doc.text('REFERENCES :', LEFT, y, { baseline: 'top' }); y += 6
		doc.setFont(FONT, 'normal')
		data.references.forEach((b, i) => {
			paragraph(`${i + 1}. ${fmtBook(b)}`, LEFT, CONTENT_W - 6, { hangIndent: 6 })
		})
		y += 5
	}

	// ── WEB RESOURCES ─────────────────────────────────────────────────────────
	// Authored on the Textbooks tab and printed by the A&S renderer, but never by
	// this one — so a lab syllabus whose source document carries a "Web
	// Resources" list lost it on export. URL first with the title as a trailing
	// description, matching the source document's "https://… - Excel tutorials".
	if (data.web_resources && data.web_resources.length > 0) {
		ensure(10)
		doc.setFont(FONT, 'bold'); doc.setFontSize(FS)
		doc.text('WEB RESOURCES :', LEFT, y, { baseline: 'top' }); y += 6
		doc.setFont(FONT, 'normal')
		data.web_resources.forEach((r, i) => {
			const url = sanitize(r.url || '')
			const title = sanitize(r.title || '')
			const text = url && title && title !== url ? `${url} - ${title}` : (url || title)
			if (text) paragraph(`${i + 1}. ${text}`, LEFT, CONTENT_W - 6, { hangIndent: 6 })
		})
		y += 5
	}

	// ── CO-PO-PSO MAPPING (the only bordered block, per the reference) ────────
	if (data.po_mappings && data.po_mappings.length > 0) {
		ensure(30)
		doc.setFont(FONT, 'bold'); doc.setFontSize(FS)
		doc.text("CO's-PO's & PSO's MAPPING", LEFT, y, { baseline: 'top' }); y += 6

		const poKeys = Array.from({ length: 12 }, (_, i) => `PO${i + 1}`)
		const psoKeys = ['PSO1', 'PSO2', 'PSO3']
		const cols = [...poKeys, ...psoKeys]

		const head = [['CO', ...cols]]
		const body = data.po_mappings.map(m => [
			(m.co_id.replace(/^CO/i, '').trim() || m.co_id),
			...poKeys.map(k => toNum(m.pos?.[k])),
			...psoKeys.map(k => toNum(m.psos?.[k])),
		])
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		autoTable(doc, {
			head: head as any,
			body: body as any,
			startY: y,
			margin: { left: MARGIN, right: MARGIN },
			tableWidth: CONTENT_W,
			theme: 'grid',
			styles: {
				font: FONT, fontSize: 7, cellPadding: 1,
				halign: 'center', valign: 'middle',
				lineColor: [0, 0, 0], lineWidth: 0.2, textColor: [0, 0, 0],
			},
			headStyles: {
				font: FONT, fontStyle: 'bold', fontSize: 7,
				fillColor: [240, 240, 240], textColor: [0, 0, 0],
				lineColor: [0, 0, 0], lineWidth: 0.2, halign: 'center',
			},
			columnStyles: { 0: { fontStyle: 'bold' } },
		})
		y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y
		y += 4
		ensure(LH)
		doc.setFont(FONT, 'normal'); doc.setFontSize(9)
		doc.text("1 - low, 2 - medium, 3 - high, '-' - no correlation", LEFT, y, { baseline: 'top' })
		y += 8
	}

	// ── SIGNATURE (kept, matching the JKKN engineering syllabus document) ──────
	ensure(28)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	autoTable(doc, {
		body: [[
			{ content: 'Course Designer\nName:\nDesignation:', styles: { valign: 'top', minCellHeight: 26 } },
			{ content: 'Verified by BoS Chairman', styles: { valign: 'top', halign: 'center', minCellHeight: 26 } },
		]] as any,
		startY: y,
		margin: { left: MARGIN, right: MARGIN },
		tableWidth: CONTENT_W,
		theme: 'grid',
		styles: { font: FONT, fontSize: FS, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.3, textColor: [0, 0, 0] },
		columnStyles: { 0: { cellWidth: CONTENT_W / 2 }, 1: { cellWidth: CONTENT_W / 2 } },
		didParseCell: cell => {
			// Bold just the first line of each signature cell (the label).
			if (cell.row.index === 0 && cell.cell.raw && typeof (cell.cell.raw as { content?: string }).content === 'string') {
				cell.cell.styles.fontStyle = 'bold'
			}
		},
	})

	// ── FOOTER on every page (date + page number), matching the A&S export ────
	const pageCount = doc.getNumberOfPages()
	const stamp = new Date().toLocaleString('en-IN')
	for (let i = 1; i <= pageCount; i++) {
		doc.setPage(i)
		doc.setFont(FONT, 'normal'); doc.setFontSize(7); doc.setTextColor(128, 128, 128)
		doc.text(stamp, MARGIN, A4_H - 6)
		doc.text(`Page ${i}`, A4_W - MARGIN, A4_H - 6, { align: 'right' })
		doc.setTextColor(0, 0, 0)
	}
}
