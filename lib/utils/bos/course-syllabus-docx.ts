// Word (.docx) renderer for the BoS course syllabus.
//
// Layout strategy: Sections 1-6 (Course Part, Code/Hours/Credits, Objectives,
// CLOs, Course Content, Books) are all rendered into ONE master table with a
// unified 5-column grid. This eliminates the visible gap between sections
// that consecutive separate tables would produce, matching the PDF's
// continuous-table appearance. Each section uses `columnSpan` to express its
// own column structure within the shared grid.
//
// The unified grid is `[30, 40, 50, 42, 28]` mm — the union of every section's
// column boundary positions:
//   - Section 1 (Course Part): col 1 + cols 2-5 spanned
//   - Section 2 (Code/Hours/Credits): cols 1, 2, 3, and 4-5 spanned for Credits
//   - Section 3 (Objectives): col 1 + cols 2-5 spanned
//   - Section 4 (CLOs): col 1, cols 2-4 spanned for description, col 5 for K
//   - Sections 5-6: col 1 + cols 2-5 spanned
//
// Sections 7 (Signature [95, 95]) and 8 (PO Mapping [14, dynamic]) cannot fit
// the same grid and remain as separate tables.

import {
	Document,
	Packer,
	Paragraph,
	TextRun,
	Table,
	TableRow,
	TableCell,
	WidthType,
	AlignmentType,
	BorderStyle,
	VerticalAlign,
	ImageRun,
	HeightRule,
	PageOrientation,
	LineRuleType,
	convertMillimetersToTwip,
} from 'docx'
import type {
	BosCourseObjective,
	BosCourseLearnOutcome,
	BosUnit,
	BosTextbook,
	BosWebResource,
	BosPoMapping,
	BosPracticalTopic,
	BosAssessmentStructure,
	BosConceptApplicationsData,
	BosAssessmentPatternData,
	BosCapstoneProjectData,
	BosCapstoneRubricData,
	BosLlcConferenceData,
} from '@/types/bos'

// ── Layout (mirrors PDF dimensions) ───────────────────────────────────────────
const MARGIN_MM = 10
const TABLE_W_DXA = convertMillimetersToTwip(190) // 190 mm content width

// Master table column widths (5 columns, sum = 190 mm).
// Boundaries at 30, 70, 120, 162, 190 mm match every section's natural splits.
const MC0 = convertMillimetersToTwip(30) // Label column
const MC1 = convertMillimetersToTwip(40) // Section 2 "Total Hours"
const MC2 = convertMillimetersToTwip(50) // Section 2 "Contact Hours"
// 36 + 34 (was 42 + 28): the K column matches the PDF's 34mm so a full
// six-code Fink's set ("FK, AP, IN, HD, CA, LHL") holds two lines at 10pt.
const MC3 = convertMillimetersToTwip(36) // Section 4 description tail
const MC4 = convertMillimetersToTwip(34) // Section 4 K-values
const MASTER_COLS = [MC0, MC1, MC2, MC3, MC4]

const FONT = 'Times New Roman'
const FONT_SIZE = 24 // 12pt body, in half-points
const TITLE_SIZE = 26 // 13pt
const SMALL_SIZE = 16 // 8pt
const SUB_SIZE = 20 // 10pt

// jsPDF uses lineHeightFactor 1.15 for autoTable cell text. Matching here:
// 12pt × 1.15 = 13.8pt = 276 twentieths of a point.
const LINE_276 = 276

const BLOOMS_DEFAULT: Record<string, string> = {
	K1: 'Remember',
	K2: 'Understand',
	K3: 'Apply',
	K4: 'Analyze',
	K5: 'Evaluate',
	K6: 'Create',
}

export function extractPOKeys(
	pos?: Record<string, string> | Record<string, Record<string, string>>,
): string[] {
	if (!pos) return []
	const vals = Object.values(pos)
	if (vals.length === 0) return []
	if (typeof vals[0] === 'string') return Object.keys(pos).sort()
	const all = new Set<string>()
	vals.forEach(v => Object.keys(v as Record<string, string>).forEach(k => all.add(k)))
	return Array.from(all).sort()
}

// ── Public interface (mirrors PDF data shape) ─────────────────────────────────
export interface CourseSyllabusDOCXData {
	institution_name?: string
	institution_address?: string
	institution_accreditation?: string
	logoImage?: string
	rightLogoImage?: string

	course_code: string
	course_name: string
	course_part?: string | null
	total_hours?: number | null
	contact_hours?: number | null
	credits?: number | null

	/** PCI/pharmacy "Scope" paragraph, printed above Course Objectives. */
	scope?: string
	/** Hide the Course Designer / BoS Chairman signature block (COP temporary). */
	hideSignature?: boolean
	objectives?: BosCourseObjective[]
	clos?: BosCourseLearnOutcome[]
	k_values?: Record<string, string>
	units?: BosUnit[]
	practical_topics?: BosPracticalTopic[]
	/** Accepted for parity with the PDF data shape; the DOCX experiments section
	 *  does not yet consume it. */
	number_practical_topics?: boolean
	instruction?: string
	textbooks?: BosTextbook[]
	references?: BosTextbook[]
	web_resources?: BosWebResource[]
	pedagogy_methods?: string[]

	po_mappings?: BosPoMapping[]
	po_keys?: string[]
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

// ── Style helpers ─────────────────────────────────────────────────────────────

const BORDER_THIN = { style: BorderStyle.SINGLE, size: 4, color: '000000' }

function cellBorders() {
	return { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN }
}

function noBorder() {
	return {
		top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
		bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
		left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
		right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
	}
}

function run(text: string, opts: { bold?: boolean; size?: number } = {}): TextRun {
	return new TextRun({
		// Collapse tab/newline/space runs (mirrors the PDF's sanitize):
		// PDF-extracted source rows carry stray tabs that Word renders as
		// gaping holes. Deliberately NOT trimmed — label runs like
		// "Primary (AI-proof): " rely on their trailing space.
		text: text.replace(/\s+/g, ' '),
		bold: opts.bold ?? false,
		font: FONT,
		size: opts.size ?? FONT_SIZE,
	})
}

// All paragraphs use compact PDF-matching spacing.
const COMPACT_SPACING = { line: LINE_276, lineRule: LineRuleType.AUTO, before: 0, after: 0 }

function p(
	text: string,
	opts: {
		bold?: boolean
		size?: number
		alignment?: (typeof AlignmentType)[keyof typeof AlignmentType]
	} = {},
): Paragraph {
	return new Paragraph({
		alignment: opts.alignment,
		spacing: COMPACT_SPACING,
		children: [run(text, { bold: opts.bold, size: opts.size })],
	})
}

function pRuns(
	runs: TextRun[],
	opts: { alignment?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {},
): Paragraph {
	return new Paragraph({
		alignment: opts.alignment,
		spacing: COMPACT_SPACING,
		children: runs,
	})
}

function tc(
	paragraphs: Paragraph[],
	opts: {
		rowSpan?: number
		columnSpan?: number
		valign?: (typeof VerticalAlign)[keyof typeof VerticalAlign]
		/** Hex fill (no #), e.g. 'F0F0F0' — mirrors the PDF's shaded rows. */
		shading?: string
	} = {},
): TableCell {
	return new TableCell({
		rowSpan: opts.rowSpan,
		columnSpan: opts.columnSpan,
		verticalAlign: opts.valign ?? VerticalAlign.TOP,
		borders: cellBorders(),
		shading: opts.shading ? { fill: opts.shading } : undefined,
		children: paragraphs,
	})
}

function fmtBook(b: BosTextbook): string {
	const parts = [b.author, b.title, b.publisher, b.publication_year ? String(b.publication_year) : '']
		.filter(Boolean)
	return `${parts.join(', ')}.`
}

async function fetchLogo(url?: string): Promise<ArrayBuffer | null> {
	if (!url) return null
	try {
		const res = await fetch(url)
		if (!res.ok) return null
		return await res.arrayBuffer()
	} catch {
		return null
	}
}

// ── Institution header (separate from master table, has logos + text) ─────────
function buildInstitutionHeader(
	data: CourseSyllabusDOCXData,
	leftLogo: ArrayBuffer | null,
	rightLogo: ArrayBuffer | null,
): (Paragraph | Table)[] {
	const logoSize = 60 // 60px ≈ 16mm at 96 DPI, matches PDF logo size

	const makeLogoCell = (img: ArrayBuffer | null, alignment: (typeof AlignmentType)[keyof typeof AlignmentType]) =>
		new TableCell({
			width: { size: convertMillimetersToTwip(20), type: WidthType.DXA },
			borders: noBorder(),
			children: img
				? [
						new Paragraph({
							alignment,
							spacing: COMPACT_SPACING,
							children: [
								new ImageRun({
									type: 'png',
									data: img,
									transformation: { width: logoSize, height: logoSize },
								}),
							],
						}),
					]
				: [new Paragraph({ spacing: COMPACT_SPACING })],
		})

	const centerParagraphs: Paragraph[] = []
	if (data.institution_name)
		centerParagraphs.push(p(data.institution_name, { bold: true, size: TITLE_SIZE, alignment: AlignmentType.CENTER }))
	if (data.institution_accreditation)
		centerParagraphs.push(p(data.institution_accreditation, { size: SMALL_SIZE, alignment: AlignmentType.CENTER }))
	if (data.institution_address)
		centerParagraphs.push(p(data.institution_address, { bold: true, size: SUB_SIZE, alignment: AlignmentType.CENTER }))
	if (centerParagraphs.length === 0) centerParagraphs.push(new Paragraph({ spacing: COMPACT_SPACING }))

	const centerCell = new TableCell({
		width: { size: TABLE_W_DXA - convertMillimetersToTwip(40), type: WidthType.DXA },
		borders: noBorder(),
		verticalAlign: VerticalAlign.CENTER,
		children: centerParagraphs,
	})

	return [
		new Table({
			width: { size: TABLE_W_DXA, type: WidthType.DXA },
			columnWidths: [
				convertMillimetersToTwip(20),
				TABLE_W_DXA - convertMillimetersToTwip(40),
				convertMillimetersToTwip(20),
			],
			rows: [
				new TableRow({
					children: [
						makeLogoCell(leftLogo, AlignmentType.LEFT),
						centerCell,
						makeLogoCell(rightLogo, AlignmentType.RIGHT),
					],
				}),
			],
		}),
		new Paragraph({ spacing: COMPACT_SPACING }),
	]
}

// ── Master-table row builders (Sections 1-6) ──────────────────────────────────
// Each returns TableRow[] that will be concatenated into one master table.

function rowsCoursePart(data: CourseSyllabusDOCXData): TableRow[] {
	const partLabel = data.course_part ?? 'Course'
	return [
		new TableRow({
			children: [
				tc([p(partLabel, { bold: true, alignment: AlignmentType.CENTER })], { valign: VerticalAlign.CENTER }),
				tc(
					[p((data.course_name ?? '').toUpperCase(), { bold: true, size: TITLE_SIZE, alignment: AlignmentType.CENTER })],
					{ columnSpan: 4, valign: VerticalAlign.CENTER },
				),
			],
		}),
	]
}

// Approximate the PDF's auto-shrink behavior for course codes. The cell is
// 30 mm wide; Times Bold 12pt averages ~2.4 mm per character. Codes longer
// than ~10 chars need progressively smaller font to stay on one line.
function fitCodeSize(code: string): number {
	const len = code.length
	if (len <= 10) return FONT_SIZE // 12pt
	if (len <= 12) return 22 // 11pt
	if (len <= 14) return SUB_SIZE // 10pt
	return 18 // 9pt
}

function rowsCodeHoursCredits(data: CourseSyllabusDOCXData): TableRow[] {
	const codeSize = fitCodeSize(data.course_code)
	return [
		new TableRow({
			children: [
				tc([p('Course\ncode', { bold: true, alignment: AlignmentType.CENTER })]),
				tc([p('Total Hours', { bold: true, alignment: AlignmentType.CENTER })]),
				tc([p('Contact Hours', { bold: true, alignment: AlignmentType.CENTER })]),
				tc([p('Credits', { bold: true, alignment: AlignmentType.CENTER })], { columnSpan: 2 }),
			],
		}),
		new TableRow({
			children: [
				tc([p(data.course_code, { bold: true, size: codeSize, alignment: AlignmentType.CENTER })]),
				tc([p(data.total_hours != null ? String(data.total_hours) : '–', { alignment: AlignmentType.CENTER })]),
				tc([p(data.contact_hours != null ? String(data.contact_hours) : '–', { alignment: AlignmentType.CENTER })]),
				tc(
					[p(data.credits != null ? String(data.credits) : '–', { alignment: AlignmentType.CENTER })],
					{ columnSpan: 2 },
				),
			],
		}),
	]
}

function rowsScope(data: CourseSyllabusDOCXData): TableRow[] {
	// PCI/pharmacy "Scope" paragraph, above Course Objectives. Only when present.
	if (!data.scope || !data.scope.trim()) return []
	return [
		new TableRow({
			children: [
				tc([p('Scope', { bold: true })]),
				tc([p(data.scope.trim())], { columnSpan: 4 }),
			],
		}),
	]
}

function rowsObjectives(data: CourseSyllabusDOCXData): TableRow[] {
	if (!data.objectives || data.objectives.length === 0) return []
	return [
		new TableRow({
			children: [
				tc([new Paragraph({ spacing: COMPACT_SPACING })]),
				tc([p('Course Objectives', { bold: true })], { columnSpan: 4 }),
			],
		}),
		new TableRow({
			children: [
				tc([new Paragraph({ spacing: COMPACT_SPACING })]),
				tc([p('The main objectives of this course are')], { columnSpan: 4 }),
			],
		}),
		...data.objectives.map(
			o =>
				new TableRow({
					children: [
						tc([p(String(o.number), { alignment: AlignmentType.CENTER })]),
						tc([p(o.description)], { columnSpan: 4 }),
					],
				}),
		),
	]
}

function rowsCLOs(data: CourseSyllabusDOCXData): TableRow[] {
	if (!data.clos || data.clos.length === 0) return []

	const kMap = data.k_values && Object.keys(data.k_values).length > 0 ? data.k_values : BLOOMS_DEFAULT
	const legend = Object.entries(kMap)
		.filter(([, v]) => v)
		.map(([k, v]) => `${k} – ${v}`)
		.join(';  ')

	const rows: TableRow[] = [
		new TableRow({
			children: [
				tc([p('CO\nNumbers', { bold: true, alignment: AlignmentType.CENTER })]),
				tc([p('Expected Course Learning Outcome:', { bold: true })], { columnSpan: 4 }),
			],
		}),
		new TableRow({
			children: [
				tc([new Paragraph({ spacing: COMPACT_SPACING })]),
				tc([p('On the successful completion of the course, student will be able to:')], { columnSpan: 4 }),
			],
		}),
		...data.clos.map(
			c =>
				new TableRow({
					children: [
						tc([p(`CO ${c.clo_number}`, { bold: true, alignment: AlignmentType.CENTER })]),
						// Description spans 3 columns (40+50+36 = 126mm) = PDF descW
						tc([p(c.description, { alignment: AlignmentType.JUSTIFIED })], { columnSpan: 3 }),
						// 10pt like the PDF — six Fink codes fit two lines in 34mm.
						tc([p(c.k_values.join(', '), { bold: true, size: SUB_SIZE, alignment: AlignmentType.CENTER })]),
					],
				}),
		),
	]

	if (legend) {
		rows.push(
			new TableRow({
				children: [
					tc([p(legend, { bold: true, size: SUB_SIZE, alignment: AlignmentType.CENTER })], { columnSpan: 5 }),
				],
			}),
		)
	}

	return rows
}

function rowsCourseContent(data: CourseSyllabusDOCXData): TableRow[] {
	if (!data.units || data.units.length === 0) return []

	const rows: TableRow[] = [
		new TableRow({
			children: [
				tc([p('Unit', { bold: true, alignment: AlignmentType.CENTER })]),
				tc([p('Course content', { bold: true, alignment: AlignmentType.CENTER })], { columnSpan: 4 }),
			],
		}),
	]

	for (const unit of data.units) {
		const unitTitle = (unit.unit_title ?? '').trim()
		const chapterEntries = unit.chapters
			.map(ch => {
				const title = (ch.title ?? '').trim()
				const subs = (ch.subtopics ?? [])
					.map(s => (s.title ?? '').trim().replace(/[,;]+$/, ''))
					.filter(Boolean)
				return { title, subs }
			})
			.filter(c => c.title || c.subs.length > 0)

		const sectionRefs = [...new Set(unit.chapters.map(ch => ch.sections).filter(Boolean))]
		const paragraphs: Paragraph[] = []

		// Match the PDF: unit title is fully bold AND justified (the PDF
		// justifies every content line except a paragraph's last line).
		if (unitTitle) paragraphs.push(p(unitTitle, { bold: true, alignment: AlignmentType.JUSTIFIED }))

		for (const ch of chapterEntries) {
			const cleanTitle = ch.title.replace(/[:\s]+$/, '')
			const subsText = ch.subs.length > 0 ? `${ch.subs.join(', ')}.` : ''
			if (cleanTitle && subsText) {
				paragraphs.push(
					pRuns(
						[run(`${cleanTitle}: `, { bold: true }), run(subsText, { bold: false })],
						{ alignment: AlignmentType.JUSTIFIED },
					),
				)
			} else if (cleanTitle) {
				// Match the PDF: a title-only chapter is bold AND justified.
				paragraphs.push(p(cleanTitle, { bold: true, alignment: AlignmentType.JUSTIFIED }))
			} else if (subsText) {
				paragraphs.push(p(subsText, { alignment: AlignmentType.JUSTIFIED }))
			}
		}

		for (const ref of sectionRefs) paragraphs.push(p(ref))

		if (paragraphs.length === 0) paragraphs.push(new Paragraph({ spacing: COMPACT_SPACING }))

		// Per-unit period marker (BosUnit.hours) — "9" or an Anna-University
		// "9 + 3" theory+tutorial split. The CET PDF prints it right-aligned on
		// the unit heading; this table has no second content column to spare, so
		// it sits under the unit numeral in the narrow label column. Word's
		// paragraph tab stops are avoided deliberately — `run()` collapses all
		// whitespace, so an embedded tab would not survive.
		const unitCellParagraphs: Paragraph[] = [
			p(unit.unit_id, { bold: true, alignment: AlignmentType.CENTER }),
		]
		const hoursLabel = (unit.hours ?? '').trim()
		if (hoursLabel) {
			unitCellParagraphs.push(
				p(`${hoursLabel} Hrs`, { bold: true, size: SUB_SIZE, alignment: AlignmentType.CENTER }),
			)
		}

		rows.push(
			new TableRow({
				children: [
					tc(unitCellParagraphs, {
						valign: VerticalAlign.TOP,
					}),
					tc(paragraphs, { columnSpan: 4, valign: VerticalAlign.TOP }),
				],
			}),
		)
	}

	return rows
}

function rowsInstructions(data: CourseSyllabusDOCXData): TableRow[] {
	if (!data.instruction || !data.instruction.trim()) return []

	return [
		new TableRow({
			children: [
				tc([new Paragraph({ spacing: COMPACT_SPACING })]),
				tc([p(data.instruction, { bold: true, alignment: AlignmentType.JUSTIFIED })], { columnSpan: 4 }),
			],
		}),
	]
}

function rowsBooksAndPedagogy(data: CourseSyllabusDOCXData): TableRow[] {
	const rows: TableRow[] = []

	if (data.textbooks && data.textbooks.length > 0) {
		rows.push(
			new TableRow({
				children: [
					tc([p('Text Books', { bold: true })]),
					tc(
						data.textbooks.map((b, i) => p(`${i + 1}. ${fmtBook(b)}`)),
						{ columnSpan: 4 },
					),
				],
			}),
		)
	}
	if (data.references && data.references.length > 0) {
		rows.push(
			new TableRow({
				children: [
					tc([p('Reference\nBooks', { bold: true })]),
					tc(
						data.references.map((b, i) => p(`${i + 1}. ${fmtBook(b)}`)),
						{ columnSpan: 4 },
					),
				],
			}),
		)
	}
	if (data.web_resources && data.web_resources.length > 0) {
		rows.push(
			new TableRow({
				children: [
					tc([p('Web\nResources', { bold: true })]),
					tc(
						data.web_resources.map((r, i) => p(`${i + 1}. ${r.url || r.title || ''}`)),
						{ columnSpan: 4 },
					),
				],
			}),
		)
	}
	if (data.pedagogy_methods && data.pedagogy_methods.length > 0) {
		rows.push(
			new TableRow({
				children: [
					tc([p('Pedagogy', { bold: true })]),
					tc([p(data.pedagogy_methods.join(', '))], { columnSpan: 4 }),
				],
			}),
		)
	}

	return rows
}

// ── Signature row (separate table — [95, 95] grid doesn't fit master) ─────────
function buildSignatureTable(): Table {
	const half = TABLE_W_DXA / 2
	return new Table({
		width: { size: TABLE_W_DXA, type: WidthType.DXA },
		columnWidths: [half, half],
		rows: [
			new TableRow({
				height: { value: convertMillimetersToTwip(30), rule: HeightRule.ATLEAST },
				children: [
					tc(
						[
							p('Course Designer', { bold: true, alignment: AlignmentType.CENTER }),
							p('Name:', { bold: true }),
							p('Designation:', { bold: true }),
						],
						{ valign: VerticalAlign.TOP },
					),
					tc([p('Verified by BoS Chairman', { bold: true, alignment: AlignmentType.CENTER })], {
						valign: VerticalAlign.TOP,
					}),
				],
			}),
		],
	})
}

// ── PO Mapping (separate — dynamic column count) ──────────────────────────────
function buildPOMapping(data: CourseSyllabusDOCXData): (Paragraph | Table)[] {
	if (!data.po_mappings || data.po_mappings.length === 0) return []

	const psoKeys = data.pso_keys?.length
		? data.pso_keys
		: [...new Set(data.po_mappings.flatMap(m => Object.keys(m.psos ?? {})))].sort()
	const poKeys = data.po_keys?.length
		? data.po_keys
		: [...new Set(data.po_mappings.flatMap(m => Object.keys(m.pos)))].sort()

	const coW = convertMillimetersToTwip(14)
	const totalCols = psoKeys.length + poKeys.length
	const cellW = totalCols > 0 ? Math.floor((TABLE_W_DXA - coW) / totalCols) : convertMillimetersToTwip(20)

	// PDF renders the whole mapping table at 10pt (SUB_SIZE) for compactness.
	const mapSize = SUB_SIZE

	const groupHeader = new TableRow({
		tableHeader: true,
		children: [
			tc([new Paragraph({ spacing: COMPACT_SPACING })]),
			...(psoKeys.length > 0
				? [
						tc([p('PSOs', { bold: true, size: mapSize, alignment: AlignmentType.CENTER })], {
							columnSpan: psoKeys.length,
						}),
					]
				: []),
			...(poKeys.length > 0
				? [
						tc([p('POs', { bold: true, size: mapSize, alignment: AlignmentType.CENTER })], {
							columnSpan: poKeys.length,
						}),
					]
				: []),
		],
	})

	const subHeader = new TableRow({
		tableHeader: true,
		children: [
			tc([p('CO', { bold: true, size: mapSize, alignment: AlignmentType.CENTER })]),
			...psoKeys.map(k =>
				tc([p(k, { bold: true, size: mapSize, alignment: AlignmentType.CENTER })]),
			),
			...poKeys.map(k =>
				tc([p(k, { bold: true, size: mapSize, alignment: AlignmentType.CENTER })]),
			),
		],
	})

	const bodyRows = data.po_mappings.map(
		m =>
			new TableRow({
				children: [
					tc([p(m.co_id.toUpperCase(), { bold: true, size: mapSize, alignment: AlignmentType.CENTER })]),
					...psoKeys.map(k =>
						tc([p(m.psos?.[k] ?? '–', { size: mapSize, alignment: AlignmentType.CENTER })]),
					),
					...poKeys.map(k =>
						tc([p(m.pos[k] ?? '–', { size: mapSize, alignment: AlignmentType.CENTER })]),
					),
				],
			}),
	)

	const widths = [coW, ...psoKeys.map(() => cellW), ...poKeys.map(() => cellW)]
	return [
		new Paragraph({ spacing: COMPACT_SPACING }),
		p('MAPPING WITH PROGRAMME OUTCOMES:', { bold: true, size: FONT_SIZE }),
		new Table({
			width: { size: TABLE_W_DXA, type: WidthType.DXA },
			columnWidths: widths,
			rows: [groupHeader, subHeader, ...bodyRows],
		}),
		new Paragraph({ spacing: COMPACT_SPACING }),
		p('H–High;  M–Medium;  L–Low', { bold: true, size: SUB_SIZE }),
	]
}

// ── Assessment Structure (v1.2) — separate tables, own column grids ───────────
function buildAssessmentStructure(data: CourseSyllabusDOCXData): (Paragraph | Table)[] {
	const as = data.assessment_structure
	if (!as) return []
	const comps = as.components ?? []
	const capstones = as.capstones ?? []
	const hasNote = !!(as.concept_applications_note?.trim() || as.exhibition_note?.trim())
	if (comps.length === 0 && capstones.length === 0 && !hasNote) return []

	const out: (Paragraph | Table)[] = [
		new Paragraph({ spacing: COMPACT_SPACING }),
		p('ASSESSMENT STRUCTURE (TOTAL 100):', { bold: true, size: FONT_SIZE }),
	]

	// Components table — S.No | Component | Marks, with a TOTAL footer row.
	if (comps.length > 0) {
		const snoW = convertMillimetersToTwip(16)
		const marksW = convertMillimetersToTwip(22)
		const compW = TABLE_W_DXA - snoW - marksW
		const total = comps.reduce((s, c) => s + (Number(c.marks) || 0), 0)
		const rows: TableRow[] = [
			new TableRow({
				children: [
					tc([p('S.No', { bold: true, alignment: AlignmentType.CENTER })]),
					tc([p('Component', { bold: true, alignment: AlignmentType.CENTER })]),
					tc([p('Marks', { bold: true, alignment: AlignmentType.CENTER })]),
				],
			}),
			...comps.map((c, i) =>
				new TableRow({
					children: [
						tc([p(String(c.sno ?? i + 1), { alignment: AlignmentType.CENTER })]),
						tc([p(c.component || '')]),
						tc([p(c.marks != null ? String(c.marks) : '–', { alignment: AlignmentType.CENTER })]),
					],
				}),
			),
			new TableRow({
				children: [
					tc([p('TOTAL', { bold: true, alignment: AlignmentType.RIGHT })], { columnSpan: 2 }),
					tc([p(String(total), { bold: true, alignment: AlignmentType.CENTER })]),
				],
			}),
		]
		out.push(new Table({ width: { size: TABLE_W_DXA, type: WidthType.DXA }, columnWidths: [snoW, compW, marksW], rows }))
	}

	// Concept Applications + Public Exhibition notes — label / value grid.
	const labelW = MC0
	const valueW = TABLE_W_DXA - labelW
	const noteRows: TableRow[] = []
	if (as.concept_applications_note?.trim()) {
		noteRows.push(new TableRow({
			children: [
				tc([p('Concept\nApplications', { bold: true })]),
				tc([p(as.concept_applications_note.trim())]),
			],
		}))
	}
	if (as.exhibition_note?.trim()) {
		noteRows.push(new TableRow({
			children: [
				tc([p('Public\nExhibition', { bold: true })]),
				tc([p(as.exhibition_note.trim())]),
			],
		}))
	}
	if (noteRows.length > 0) {
		out.push(new Table({ width: { size: TABLE_W_DXA, type: WidthType.DXA }, columnWidths: [labelW, valueW], rows: noteRows }))
	}

	// Capstones — title column + Subject/Artifacts/Give-back bold-label paragraphs.
	if (capstones.length > 0) {
		const titleW = convertMillimetersToTwip(48)
		const bodyW = TABLE_W_DXA - titleW
		const rows: TableRow[] = [
			new TableRow({
				children: [
					tc([p('Capstone Projects (Principal-Agent Public Exhibition)', { bold: true, alignment: AlignmentType.CENTER })], { columnSpan: 2 }),
				],
			}),
		]
		for (const cap of capstones) {
			const paras: Paragraph[] = []
			const addPart = (label: string, val?: string) => {
				if (val && val.trim()) paras.push(pRuns([run(`${label}: `, { bold: true }), run(val.trim())], { alignment: AlignmentType.JUSTIFIED }))
			}
			addPart('Subject', cap.subject)
			addPart('Artifacts on display', cap.artifacts)
			addPart('Give-back', cap.give_back)
			if (paras.length === 0) paras.push(new Paragraph({ spacing: COMPACT_SPACING }))
			rows.push(new TableRow({
				children: [
					tc([p(cap.title || '', { bold: true })], { valign: VerticalAlign.TOP }),
					tc(paras, { valign: VerticalAlign.TOP }),
				],
			}))
		}
		out.push(new Table({ width: { size: TABLE_W_DXA, type: WidthType.DXA }, columnWidths: [titleW, bodyW], rows }))
	}

	return out
}

// ── v3.5 Fink's Formative + Capstone blocks — separate tables ─────────────────
// Rendered in document order: Concept Applications → Assessment Pattern →
// Capstone Project → Capstone Rubric → Learners Led Conference. Every block is
// optional — legacy rows without the v3.5 columns render unchanged.
function buildV35Sections(data: CourseSyllabusDOCXData): (Paragraph | Table)[] {
	const out: (Paragraph | Table)[] = []

	const heading = (text: string) => {
		out.push(new Paragraph({ spacing: COMPACT_SPACING }))
		out.push(p(text, { bold: true, size: FONT_SIZE }))
	}

	// Inline **bold** markers (the source documents' <strong> phrases) become
	// bold runs; text without markers renders as one regular run.
	const richP = (text: string, opts: { size?: number } = {}) =>
		pRuns(
			text.trim().split('**')
				.map((part, i) => (part ? run(part, { bold: i % 2 === 1, size: opts.size }) : null))
				.filter((r): r is TextRun => r !== null),
			{ alignment: AlignmentType.JUSTIFIED },
		)

	// Concept Applications (Formative Learning Activities)
	const ca = data.concept_applications
	if (ca && ((ca.activities?.length ?? 0) > 0 || ca.intro_note?.trim())) {
		heading('CONCEPT APPLICATIONS (FORMATIVE LEARNING ACTIVITIES):')
		if (ca.intro_note?.trim()) {
			out.push(new Table({
				width: { size: TABLE_W_DXA, type: WidthType.DXA },
				columnWidths: [TABLE_W_DXA],
				rows: [new TableRow({ children: [tc([richP(ca.intro_note)])] })],
			}))
		}
		const acts = ca.activities ?? []
		if (acts.length > 0) {
			const unitW = convertMillimetersToTwip(22)
			const dimW = convertMillimetersToTwip(30)
			const restW = Math.floor((TABLE_W_DXA - unitW - dimW) / 2)
			// 10pt (SUB_SIZE), left-aligned body — mirrors the PDF's compact
			// Concept Applications table styling.
			const rows: TableRow[] = [
				new TableRow({
					tableHeader: true,
					children: [
						tc([p('Unit', { bold: true, size: SUB_SIZE, alignment: AlignmentType.CENTER })]),
						tc([p("Fink's Dim.", { bold: true, size: SUB_SIZE, alignment: AlignmentType.CENTER })]),
						tc([p('Task', { bold: true, size: SUB_SIZE, alignment: AlignmentType.CENTER })]),
						tc([p('Deliverable & Notes', { bold: true, size: SUB_SIZE, alignment: AlignmentType.CENTER })]),
					],
				}),
				...acts.map((a, i) =>
					new TableRow({
						children: [
							tc([p(a.unit || String(a.sno ?? i + 1), { bold: true, size: SUB_SIZE, alignment: AlignmentType.CENTER })]),
							tc([p(a.finks_dimension || '', { size: SUB_SIZE, alignment: AlignmentType.CENTER })]),
							tc([p(a.task || '', { size: SUB_SIZE, alignment: AlignmentType.JUSTIFIED })]),
							tc([p(a.deliverable_notes || '', { size: SUB_SIZE, alignment: AlignmentType.JUSTIFIED })]),
						],
					}),
				),
			]
			out.push(new Table({ width: { size: TABLE_W_DXA, type: WidthType.DXA }, columnWidths: [unitW, dimW, restW, restW], rows }))
		}
	}

	// Assessment Pattern (Internal | External split + internal component rows)
	const ap = data.assessment_pattern
	if (ap && ((ap.components?.length ?? 0) > 0 || ap.internal_marks != null || ap.external_marks != null)) {
		heading('ASSESSMENT PATTERN:')
		const comps = ap.components ?? []
		const snoW = convertMillimetersToTwip(16)
		const marksW = convertMillimetersToTwip(22)
		const compW = TABLE_W_DXA - snoW - marksW
		const rows: TableRow[] = []
		if (ap.internal_marks != null || ap.external_marks != null) {
			rows.push(new TableRow({
				children: [
					tc(
						[p(`Internal = ${ap.internal_marks ?? '-'} Marks   |   External = ${ap.external_marks ?? '-'} Marks`, { bold: true, alignment: AlignmentType.CENTER })],
						{ columnSpan: 3, shading: 'F0F0F0' },
					),
				],
			}))
		}
		if (comps.length > 0) {
			rows.push(new TableRow({
				children: [
					tc([p('S.No', { bold: true, alignment: AlignmentType.CENTER })]),
					tc([p('Component', { bold: true, alignment: AlignmentType.CENTER })]),
					tc([p('Marks', { bold: true, alignment: AlignmentType.CENTER })]),
				],
			}))
			comps.forEach((c, i) => {
				rows.push(new TableRow({
					children: [
						tc([p(String(c.sno ?? i + 1), { alignment: AlignmentType.CENTER })]),
						tc([p(c.component || '')]),
						tc([p(c.marks != null ? String(c.marks) : '-', { alignment: AlignmentType.CENTER })]),
					],
				}))
			})
			const total = comps.reduce((s, c) => s + (Number(c.marks) || 0), 0)
			rows.push(new TableRow({
				children: [
					tc([p('Total Internal', { bold: true, alignment: AlignmentType.RIGHT })], { columnSpan: 2 }),
					tc([p(String(total), { bold: true, alignment: AlignmentType.CENTER })]),
				],
			}))
		}
		if (rows.length > 0) {
			out.push(new Table({ width: { size: TABLE_W_DXA, type: WidthType.DXA }, columnWidths: [snoW, compW, marksW], rows }))
		}
		const noteRows: TableRow[] = []
		if (ap.activities_note?.trim()) {
			noteRows.push(new TableRow({ children: [tc([p(ap.activities_note.trim(), { size: SUB_SIZE })])] }))
		}
		if (ap.note?.trim()) {
			noteRows.push(new TableRow({ children: [tc([p(`Note: ${ap.note.trim()}`, { size: SUB_SIZE })])] }))
		}
		if (noteRows.length > 0) {
			out.push(new Table({ width: { size: TABLE_W_DXA, type: WidthType.DXA }, columnWidths: [TABLE_W_DXA], rows: noteRows }))
		}
	}

	// Capstone Project — choose ONE of FIVE (option cards)
	const cp = data.capstone_project
	if (cp && ((cp.options?.length ?? 0) > 0 || cp.intro_note?.trim())) {
		heading('CAPSTONE PROJECT (CHOOSE ONE OF FIVE):')
		if (cp.intro_note?.trim()) {
			out.push(new Table({
				width: { size: TABLE_W_DXA, type: WidthType.DXA },
				columnWidths: [TABLE_W_DXA],
				rows: [new TableRow({ children: [tc([richP(cp.intro_note)])] })],
			}))
		}
		const opts = cp.options ?? []
		if (opts.length > 0) {
			// Full-width card per option (mirrors the source documents): bold
			// "Option N — Title" header, then Primary / Support / LLC paragraphs.
			const rows: TableRow[] = opts.map((opt, i) => {
				const paras: Paragraph[] = [
					p(`Option ${opt.option_no ?? i + 1} — ${opt.title || ''}`, { bold: true }),
				]
				const addPart = (label: string, val?: string) => {
					if (val && val.trim()) paras.push(pRuns([run(`${label}: `, { bold: true }), run(val.trim())], { alignment: AlignmentType.JUSTIFIED }))
				}
				addPart('Primary (AI-proof)', opt.primary)
				addPart('Support', opt.support)
				addPart('LLC', opt.llc)
				return new TableRow({ children: [tc(paras, { valign: VerticalAlign.TOP })] })
			})
			out.push(new Table({ width: { size: TABLE_W_DXA, type: WidthType.DXA }, columnWidths: [TABLE_W_DXA], rows }))
		}
	}

	// Capstone Rubric (criterion rows, common to all options)
	const cr = data.capstone_rubric
	if (cr && (cr.criteria?.length ?? 0) > 0) {
		const criteria = cr.criteria ?? []
		heading(cr.note?.trim() ? `CAPSTONE RUBRIC (${cr.note.trim()}):` : 'CAPSTONE RUBRIC:')
		const marksW = convertMillimetersToTwip(22)
		const critW = TABLE_W_DXA - marksW
		const total = criteria.reduce((s, c) => s + (Number(c.marks) || 0), 0)
		const rows: TableRow[] = [
			new TableRow({
				tableHeader: true,
				children: [
					tc([p('Criterion', { bold: true, alignment: AlignmentType.CENTER })]),
					tc([p('Marks', { bold: true, alignment: AlignmentType.CENTER })]),
				],
			}),
			...criteria.map(c =>
				new TableRow({
					children: [
						tc([p(c.criterion || '', { alignment: AlignmentType.JUSTIFIED })]),
						tc([p(c.marks != null ? String(c.marks) : '-', { alignment: AlignmentType.CENTER })]),
					],
				}),
			),
			new TableRow({
				children: [
					tc([p('TOTAL', { bold: true, alignment: AlignmentType.RIGHT })]),
					tc([p(String(total), { bold: true, alignment: AlignmentType.CENTER })]),
				],
			}),
		]
		out.push(new Table({ width: { size: TABLE_W_DXA, type: WidthType.DXA }, columnWidths: [critW, marksW], rows }))
	}

	// End-of-Course Learners Led Conference — one self-contained panel like
	// the source documents: a single inline header line (bold "LLC <title>"
	// + regular "— <subtitle>") above the description paragraph.
	const llc = data.llc_conference
	if (llc && (llc.title?.trim() || llc.subtitle?.trim() || llc.description?.trim())) {
		out.push(new Paragraph({ spacing: COMPACT_SPACING }))
		const rows: TableRow[] = [
			new TableRow({
				children: [tc([pRuns([
					run(`LLC   ${llc.title?.trim() || 'End-of-Course Learners Led Conference'}`, { bold: true }),
					...(llc.subtitle?.trim() ? [run(` — ${llc.subtitle.trim()}`, { size: SUB_SIZE })] : []),
				])], { shading: 'F0F0F0' })],
			}),
		]
		if (llc.description?.trim()) {
			rows.push(new TableRow({ children: [tc([richP(llc.description)])] }))
		}
		out.push(new Table({ width: { size: TABLE_W_DXA, type: WidthType.DXA }, columnWidths: [TABLE_W_DXA], rows }))
	}

	return out
}

// ── Master table assembly ─────────────────────────────────────────────────────
function buildMasterTable(data: CourseSyllabusDOCXData): Table {
	const rows: TableRow[] = [
		...rowsCoursePart(data),
		...rowsCodeHoursCredits(data),
		...rowsScope(data),
		...rowsObjectives(data),
		...rowsCLOs(data),
		...rowsCourseContent(data),
		...rowsInstructions(data),
		...rowsBooksAndPedagogy(data),
	]

	return new Table({
		width: { size: TABLE_W_DXA, type: WidthType.DXA },
		columnWidths: MASTER_COLS,
		rows,
	})
}

// ── Main generator ────────────────────────────────────────────────────────────
export async function generateCourseSyllabusDOCX(data: CourseSyllabusDOCXData): Promise<string> {
	const [leftLogo, rightLogo] = await Promise.all([
		fetchLogo(data.logoImage),
		fetchLogo(data.rightLogoImage),
	])

	const body: (Paragraph | Table)[] = []
	body.push(...buildInstitutionHeader(data, leftLogo, rightLogo))
	body.push(buildMasterTable(data))
	body.push(...buildPOMapping(data))
	body.push(...buildAssessmentStructure(data))
	body.push(...buildV35Sections(data))
	// Signature LAST — matches the v3.5 documents, where Course Designer /
	// BoS Chairman sign off below the full assessment spec (after the LLC
	// block). The empty paragraph keeps it structurally separate from the
	// preceding table (two adjacent tables would merge in Word).
	// Signature hidden for COP (pharmacy) syllabi on request (temporary).
	if (!data.hideSignature) {
		body.push(new Paragraph({ spacing: { line: LINE_276, lineRule: LineRuleType.AUTO, before: 0, after: 0 } }))
		body.push(buildSignatureTable())
	}

	const doc = new Document({
		styles: {
			default: {
				document: {
					run: { font: FONT, size: FONT_SIZE },
					paragraph: { spacing: { line: LINE_276, lineRule: LineRuleType.AUTO, before: 0, after: 0 } },
				},
			},
		},
		sections: [
			{
				properties: {
					page: {
						// Match the PDF's A4 portrait page (210 × 297 mm). Without
						// this, docx defaults to US Letter (216 × 279 mm) and
						// vertical pagination drifts compared to the PDF.
						size: {
							width: convertMillimetersToTwip(210),
							height: convertMillimetersToTwip(297),
							orientation: PageOrientation.PORTRAIT,
						},
						margin: {
							top: convertMillimetersToTwip(MARGIN_MM),
							right: convertMillimetersToTwip(MARGIN_MM),
							bottom: convertMillimetersToTwip(MARGIN_MM),
							left: convertMillimetersToTwip(MARGIN_MM),
						},
					},
				},
				children: body,
			},
		],
	})

	const blob = await Packer.toBlob(doc)
	const date = new Date().toISOString().split('T')[0]
	const fileName = `${data.course_code}_syllabus_${date}.docx`

	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = fileName
	document.body.appendChild(a)
	a.click()
	document.body.removeChild(a)
	URL.revokeObjectURL(url)

	return fileName
}
