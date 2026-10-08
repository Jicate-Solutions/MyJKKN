// ─────────────────────────────────────────────────────────────────────────────
// PORTED VERBATIM from COE: lib/ia/validate-paper.ts
//
// Do NOT adapt this file to MyJKKN house style. COE and MyJKKN are two writers
// against the SAME ia_question_papers.questions JSONB, and these rules are
// enforced on both sides. Any divergence shows up as a rejected save or a
// mis-printed paper (docs/ia-question-paper-entry-spec.md §14).
//
// To resync: copy the COE file over the body below and keep this header. Last synced 2026-10-05 (COE b34e527).
// Source: D:\JKKN\Development\Appliaction\COE\JKKN_COE\lib\ia\validate-paper.ts
// ─────────────────────────────────────────────────────────────────────────────

// Completeness rules for a question paper, checked when it LEAVES the author's
// hands — on Submit and on Approve. Save stays unvalidated: an author must be
// able to stop half-way and come back.
//
// Required for every question slot:
//   • question text (a split question: text on each sub-division; the parent stem
//     stays optional)
//   • CO and K-level — ALWAYS, on every question
//   • every MCQ option filled in
//   • sub-division marks that add up to the question's marks
//
// Structural rules (opt-in through `checkStructure`, used by the examiner
// portal; the CoE editors call with parts that carry no counts):
//   • no two entries with the same text
//   • every question carries the marks its template part prescribes
//   • every part has the number of question slots its template prescribes
//
// CO and K-level used to be conditional on the template part's capture_co /
// capture_klevel flags. They are now unconditional: a question paper is mapped to
// course outcomes and Bloom levels for attainment reporting, and a single
// unmapped question leaves a hole in it. The template flags no longer gate this,
// and the editors show both selectors on every question so the rule is always
// satisfiable.
//
// Pure — no node/browser APIs — so the page blocks the click and the API blocks a
// stale tab with the same messages. Every problem carries a stable `anchor`, so a
// UI can scroll straight to the offending field.

import { readSubQuestions, entryLabel, subTotal } from './sub-questions'

export interface PaperPart {
	part_label?: string | null
	capture_co?: boolean | null
	capture_klevel?: boolean | null
	num_questions?: number | null
	marks_per_question?: number | null
	has_choice?: boolean | null
}

/** Visible text of rich content — tags and entities stripped. */
export function plainText(value: any): string {
	return String(value ?? '')
		.replace(/<[^>]*>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim()
}

/** An option counts as filled when either its rich or its plain form has text. */
function optionIsEmpty(o: any): boolean {
	return plainText(o?.text_html) === '' && plainText(o?.text) === ''
}

export interface ValidatePaperOptions {
	/**
	 * Demand an answer key on every question. Set when the examiner's appointment
	 * includes the answer key AND they accepted it — never merely because the
	 * assignment type says "Both" (spec §6).
	 */
	requireAnswerKey?: boolean
	/**
	 * Skip the question-content rules. Set for an answer-key-only appointment,
	 * where the questions are someone else's and read-only to this examiner.
	 */
	skipQuestions?: boolean
	/**
	 * Also run the structural rules — duplicates, marks per part, question count
	 * per part. Needs parts that carry `num_questions` / `marks_per_question`.
	 */
	checkStructure?: boolean
}

export type PaperProblemField =
	| 'question_text'
	| 'co_code'
	| 'k_level'
	| 'marks'
	| 'option'
	| 'answer_key'
	| 'duplicate'
	| 'structure'

/**
 * One thing standing between the paper and Submit, pinned to the field it is
 * about. `anchor` is the DOM id the editors give that field, so a summary list
 * can scroll to it: `qp-<question id>[-<sub id>][-opt-<key>]-<field>`, or
 * `qp-part-<label>` for a part-level problem.
 */
export interface PaperProblem {
	anchor: string
	questionId: string | null
	subId: string | null
	optionKey: string | null
	partLabel: string | null
	field: PaperProblemField
	/** "Q12a i" — where the problem is, for a person. */
	where: string
	/** Short enough to sit under the field: "Required", "Select a CO". */
	short: string
	/** The full sentence for a summary list. */
	message: string
	/**
	 * True when the examiner cannot fix it from the editor (a template/data
	 * problem) and should contact the CoE instead.
	 */
	needsCoe?: boolean
}

/** Does this entry — a question or one sub-division — carry its OWN key: text, or at least a figure? */
export function hasOwnAnswerKey(entry: any): boolean {
	return plainText(entry?.answer_key) !== '' || !!entry?.answer_key_image?.url
}

/**
 * Does this question carry a complete answer key? A split question is keyed
 * per sub-division (i / ii …), so it counts only when EVERY sub-division has
 * one. A key written on the question itself (how split questions were keyed
 * before per-sub-division keys existed) still counts, so an older paper does
 * not turn incomplete.
 */
export function hasAnswerKey(q: any): boolean {
	if (hasOwnAnswerKey(q)) return true
	const subs = readSubQuestions(q)
	return subs.length > 0 && subs.every(hasOwnAnswerKey)
}

export function problemAnchor(
	questionId: string,
	field: PaperProblemField,
	sub?: { subId?: string | null; optionKey?: string | null }
): string {
	if (sub?.subId) return `qp-${questionId}-${sub.subId}-${field}`
	if (sub?.optionKey) return `qp-${questionId}-opt-${sub.optionKey}`
	return `qp-${questionId}-${field}`
}

export function partAnchor(partLabel: string): string {
	return `qp-part-${partLabel}`
}

/**
 * Every reason this paper cannot be submitted yet, in question order, pinned to
 * the field each one is about. Empty array = complete.
 */
export function validatePaperDetailed(
	questions: any[],
	parts?: PaperPart[] | null,
	opts: ValidatePaperOptions = {}
): PaperProblem[] {
	const out: PaperProblem[] = []

	const ordered = (Array.isArray(questions) ? questions : [])
		.slice()
		.sort((a: any, b: any) => (a?.display_order ?? 0) - (b?.display_order ?? 0))

	const push = (
		q: any,
		field: PaperProblemField,
		short: string,
		message: string,
		extra: { sub?: any; optionKey?: string | null; needsCoe?: boolean; anchorField?: PaperProblemField } = {}
	) => {
		const qid = String(q?.id ?? '')
		out.push({
			// A duplicate is a problem WITH the text field, so it anchors there.
			anchor: problemAnchor(qid, extra.anchorField ?? field, { subId: extra.sub?.id ?? null, optionKey: extra.optionKey ?? null }),
			questionId: qid,
			subId: extra.sub?.id ?? null,
			optionKey: extra.optionKey ?? null,
			partLabel: q?.part_label ?? null,
			field,
			where: `Q${entryLabel(q, extra.sub ?? null)}`,
			short,
			message,
			needsCoe: extra.needsCoe,
		})
	}

	for (const q of ordered) {
		const where = `Q${entryLabel(q)}`

		// The answer key: one per question, or — for a split question — one per
		// sub-division, each pinned to its own field.
		if (opts.requireAnswerKey && !hasOwnAnswerKey(q)) {
			const keySubs = readSubQuestions(q)
			if (keySubs.length > 0) {
				for (const sb of keySubs) {
					if (!hasOwnAnswerKey(sb)) {
						push(q, 'answer_key', 'Answer key required', `Q${entryLabel(q, sb)}: enter the answer key`, { sub: sb })
					}
				}
			} else {
				push(q, 'answer_key', 'Answer key required', `${where}: enter the answer key`)
			}
		}
		if (opts.skipQuestions) continue

		const subs = readSubQuestions(q)

		if (subs.length > 0) {
			// Split question: the stem is optional, each sub-division is not — and
			// each carries its own CO and K-level, because the sub-divisions of one
			// question routinely test different outcomes at different Bloom levels.
			for (const sb of subs) {
				const sw = `Q${entryLabel(q, sb)}`
				if (plainText(sb.question_text) === '') push(q, 'question_text', 'Required', `${sw}: enter the question`, { sub: sb })
				if (sb.marks == null || Number.isNaN(Number(sb.marks))) push(q, 'marks', 'Marks required', `${sw}: enter the marks`, { sub: sb })
				if (!sb.co_code) push(q, 'co_code', 'Select a CO', `${sw}: select a Course Outcome (CO)`, { sub: sb })
				if (!sb.k_level) push(q, 'k_level', 'Select a K-level', `${sw}: select a K-level`, { sub: sb })
			}
			if (q?.marks != null && subs.every(s => s.marks != null)) {
				const total = subTotal(subs)
				if (Math.abs(total - Number(q.marks)) > 0.001) {
					push(
						q,
						'marks',
						`Total ${total}, must be ${q.marks}`,
						`${where}: sub-division marks total ${total}, must be ${q.marks}`
					)
				}
			}
		} else {
			if (plainText(q?.question_text) === '') push(q, 'question_text', 'Required', `${where}: enter the question`)
			if (!q?.co_code) push(q, 'co_code', 'Select a CO', `${where}: select a Course Outcome (CO)`)
			if (!q?.k_level) push(q, 'k_level', 'Select a K-level', `${where}: select a K-level`)
		}

		const options = Array.isArray(q?.options) ? q.options : []
		for (const o of options) {
			if (optionIsEmpty(o)) push(q, 'option', 'Required', `${where}: option ${o?.key} is empty`, { optionKey: o?.key })
		}
	}

	if (opts.checkStructure && !opts.skipQuestions) {
		// ── Duplicate text ────────────────────────────────────────────────
		// Compared on visible text, case-folded, so "What is X?" and
		// "<b>what is x</b>" count as the same question.
		const seen = new Map<string, string>()
		for (const q of ordered) {
			const subs = readSubQuestions(q)
			const entries = subs.length > 0
				? subs.map(sb => ({ text: plainText(sb.question_text), sub: sb }))
				: [{ text: plainText(q?.question_text), sub: null as any }]
			for (const e of entries) {
				const key = e.text.toLowerCase()
				if (key.length < 3) continue
				const first = seen.get(key)
				const here = `Q${entryLabel(q, e.sub)}`
				if (first) {
					push(q, 'duplicate', `Same text as ${first}`, `${here}: has the same text as ${first}`, { sub: e.sub, anchorField: 'question_text' })
				} else {
					seen.set(key, here)
				}
			}
		}

		// ── Marks and counts against the template ─────────────────────────
		const partList = (parts || []).filter(p => p?.part_label)
		for (const p of partList) {
			const label = String(p.part_label)
			const inPart = ordered.filter((q: any) => q?.part_label === label)
			const perQ = p.marks_per_question
			if (perQ != null) {
				for (const q of inPart) {
					if (q?.marks != null && Math.abs(Number(q.marks) - Number(perQ)) > 0.001) {
						push(
							q,
							'marks',
							`${q.marks} marks, Part ${label} is ${perQ} each`,
							`Q${entryLabel(q)}: carries ${q.marks} marks but every Part ${label} question is ${perQ} marks. Contact the Office of the Controller of Examinations.`,
							{ needsCoe: true }
						)
					}
				}
			}
			const expected = p.num_questions
			if (expected != null && Number(expected) > 0) {
				const mains = inPart.filter((q: any) => !q?.is_choice_alternative).length
				if (mains !== Number(expected)) {
					out.push({
						anchor: partAnchor(label),
						questionId: null,
						subId: null,
						optionKey: null,
						partLabel: label,
						field: 'structure',
						where: `Part ${label}`,
						short: `${mains} of ${expected} question slots`,
						message: `Part ${label}: ${mains} question${mains === 1 ? '' : 's'} found, the template needs ${expected}. Contact the Office of the Controller of Examinations.`,
						needsCoe: true,
					})
				}
			}
		}
	}

	return out
}

/**
 * Every reason this paper cannot be submitted yet, as plain sentences.
 * Empty array = complete. Kept for the existing call sites; new code should
 * prefer validatePaperDetailed.
 */
export function validatePaperComplete(
	questions: any[],
	parts?: PaperPart[] | null,
	opts: ValidatePaperOptions = {}
): string[] {
	return validatePaperDetailed(questions, parts, opts).map(p => p.message)
}

/** Statuses whose transition requires a complete paper. */
export const COMPLETION_REQUIRED_STATUSES = ['submitted', 'approved']

export function requiresCompletion(status?: string | null): boolean {
	return !!status && COMPLETION_REQUIRED_STATUSES.includes(status)
}
