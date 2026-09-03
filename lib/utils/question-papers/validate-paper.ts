// ─────────────────────────────────────────────────────────────────────────────
// PORTED VERBATIM from COE: lib/ia/validate-paper.ts
//
// Do NOT adapt this file to MyJKKN house style. COE and MyJKKN are two writers
// against the SAME ia_question_papers.questions JSONB, and these rules are
// enforced on both sides. Any divergence shows up as a rejected save or a
// mis-printed paper (docs/ia-question-paper-entry-spec.md §14).
//
// To resync: copy the COE file over the body below and keep this header.
// Source: D:\JKKN\Development\Appliaction\COE\JKKN_COE\lib\ia\validate-paper.ts
// ─────────────────────────────────────────────────────────────────────────────

// Completeness rules for a question paper, checked when it LEAVES the author's
// hands — on Submit and on Approve. Save stays unvalidated: an author must be
// able to stop half-way and come back.
//
// Required for every question slot:
//   • question text (a split question: text on each sub-division; the parent stem
//     stays optional)
//   • CO and K-level — unless the template part switched that capture off
//   • every MCQ option filled in
//
// Pure — no node/browser APIs — so the page blocks the click and the API blocks a
// stale tab with the same messages.

import { readSubQuestions, entryLabel } from './sub-questions'

export interface PaperPart {
	part_label?: string | null
	capture_co?: boolean | null
	capture_klevel?: boolean | null
}

/** Visible text of rich content — tags and entities stripped. */
function plainText(value: any): string {
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

/**
 * Every reason this paper cannot be submitted yet, in question order.
 * Empty array = complete.
 */
export function validatePaperComplete(questions: any[], parts?: PaperPart[]): string[] {
	const partByLabel = new Map<string, PaperPart>(
		(parts || []).filter(p => p?.part_label).map(p => [String(p.part_label), p])
	)
	const errors: string[] = []

	const ordered = (Array.isArray(questions) ? questions : [])
		.slice()
		.sort((a: any, b: any) => (a?.display_order ?? 0) - (b?.display_order ?? 0))

	for (const q of ordered) {
		const part = partByLabel.get(String(q?.part_label ?? ''))
		const captureCo = part?.capture_co ?? true
		const captureK = part?.capture_klevel ?? true
		const subs = readSubQuestions(q)

		if (subs.length > 0) {
			// Split question: the stem is optional, each sub-division is not.
			for (const sb of subs) {
				const where = `Q${entryLabel(q, sb)}`
				if (plainText(sb.question_text) === '') errors.push(`${where}: enter the question`)
				if (captureCo && !sb.co_code) errors.push(`${where}: select CO`)
				if (captureK && !sb.k_level) errors.push(`${where}: select K-level`)
			}
		} else {
			const where = `Q${entryLabel(q)}`
			if (plainText(q?.question_text) === '') errors.push(`${where}: enter the question`)
			if (captureCo && !q?.co_code) errors.push(`${where}: select CO`)
			if (captureK && !q?.k_level) errors.push(`${where}: select K-level`)
		}

		const options = Array.isArray(q?.options) ? q.options : []
		for (const o of options) {
			if (optionIsEmpty(o)) errors.push(`Q${entryLabel(q)}: option ${o?.key} is empty`)
		}
	}

	return errors
}

/** Statuses whose transition requires a complete paper. */
export const COMPLETION_REQUIRED_STATUSES = ['submitted', 'approved']

export function requiresCompletion(status?: string | null): boolean {
	return !!status && COMPLETION_REQUIRED_STATUSES.includes(status)
}
