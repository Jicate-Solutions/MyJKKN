// ─────────────────────────────────────────────────────────────────────────────
// PORTED VERBATIM from COE: lib/ia/sub-questions.ts
//
// Do NOT adapt this file to MyJKKN house style. COE and MyJKKN are two writers
// against the SAME ia_question_papers.questions JSONB, and these rules are
// enforced on both sides. Any divergence shows up as a rejected save or a
// mis-printed paper (docs/ia-question-paper-entry-spec.md §14).
//
// To resync: copy the COE file over the body below and keep this header.
// Source: D:\JKKN\Development\Appliaction\COE\JKKN_COE\lib\ia\sub-questions.ts
// ─────────────────────────────────────────────────────────────────────────────

// Sub-divisions ("12 a) i. / ii.") inside a single question paper question.
//
// A template part fixes the slot — "Part B: 2 questions x 15 marks". The paper
// author may then split one 15-mark slot into i. (8) + ii. (7). The split is a
// paper-level decision, never a template one, so nothing here touches
// ia_template_parts.
//
// Rules (agreed design):
//   • one level only — a sub-division cannot itself be split
//   • sub marks must sum EXACTLY to the parent question's marks
//   • each sub-division carries its own CO + K-level; the parent's are hidden
//   • the parent keeps an optional stem ("For the circuit shown below:")
//   • objective questions (those with options) cannot be split
//
// Pure helpers only — no node imports — so both the client page and the API
// routes can use them.

/** Figure attached to a question / sub-division (see types/ia-question-paper.ts). */
export interface IaQuestionImageRef {
	url: string
	path?: string | null
	width_pct?: number | null
	px_w?: number | null
	px_h?: number | null
	bytes?: number | null
}

export interface IaSubQuestion {
	id: string
	/** Roman numeral, recomputed on every add/remove ("i", "ii", "iii"). */
	label: string
	question_text: string | null
	marks: number | null
	co_code: string | null
	k_level: string | null
	/** Optional figure, printed centred under this sub-division. */
	image?: IaQuestionImageRef | null
	display_order: number
}

/**
 * Normalize an unknown value into a figure ref (null when absent / unusable).
 * Only http(s) URLs survive — the value is written into an <img src> when the
 * PDF is built, so `javascript:` and oversized `data:` payloads are dropped here.
 */
export function readQuestionImage(raw: any): IaQuestionImageRef | null {
	const url = typeof raw?.url === 'string' ? raw.url.trim() : ''
	if (!url || !/^https?:\/\//i.test(url)) return null
	const num = (v: any) => (v == null || v === '' ? null : Number(v) || null)
	return {
		url,
		path: raw?.path ? String(raw.path) : null,
		width_pct: num(raw?.width_pct),
		px_w: num(raw?.px_w),
		px_h: num(raw?.px_h),
		bytes: num(raw?.bytes),
	}
}

const ROMANS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x']

export const MAX_SUB_QUESTIONS = ROMANS.length

export function romanLabel(index: number): string {
	return ROMANS[index] || String(index + 1)
}

// crypto.randomUUID exists in the browser (secure context) and in node 19+.
export function newId(): string {
	const c: any = (globalThis as any).crypto
	if (c?.randomUUID) return c.randomUUID()
	return `sub-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

/** Normalize an unknown value into a sub-question array (empty when not split). */
export function readSubQuestions(q: any): IaSubQuestion[] {
	const raw = Array.isArray(q?.sub_questions) ? q.sub_questions : []
	return raw
		.slice()
		.sort((a: any, b: any) => (a?.display_order ?? 0) - (b?.display_order ?? 0))
		.map((s: any, i: number) => ({
			id: String(s?.id || newId()),
			label: s?.label || romanLabel(i),
			question_text: s?.question_text ?? null,
			marks: s?.marks == null || s.marks === '' ? null : Number(s.marks),
			co_code: s?.co_code || null,
			k_level: s?.k_level || null,
			image: readQuestionImage(s?.image),
			display_order: i + 1,
		}))
}

export function isSplit(q: any): boolean {
	return readSubQuestions(q).length > 0
}

/** Re-label + re-order after an add / remove so labels stay i, ii, iii… */
export function relabelSubs(subs: IaSubQuestion[]): IaSubQuestion[] {
	return subs.map((s, i) => ({ ...s, label: romanLabel(i), display_order: i + 1 }))
}

export function subTotal(subs: IaSubQuestion[]): number {
	return subs.reduce((sum, s) => sum + (Number(s.marks) || 0), 0)
}

/** A question is splittable only when it is descriptive (no MCQ option slots). */
export function canSplit(q: any): boolean {
	return !(Array.isArray(q?.options) && q.options.length > 0)
}

/** Display prefix for a question: "12 a)" when it has a sub-label, else "12.". */
export function questionPrefix(q: any): string {
	return q?.sub_label ? `${q.question_number} ${q.sub_label})` : `${q?.question_number}.`
}

/** Mark-entry / reporting label: "12a", or "12a i" for a sub-division. */
export function entryLabel(q: any, sub?: IaSubQuestion | null): string {
	const base = `${q?.question_number ?? ''}${q?.sub_label || ''}`
	return sub ? `${base} ${sub.label}` : base
}

/**
 * Validate every split question's marks against its parent budget.
 * Returns one message per offending question; empty array = paper is valid.
 */
export function validateSubMarks(questions: any[]): string[] {
	const errors: string[] = []
	for (const q of questions || []) {
		const subs = readSubQuestions(q)
		if (subs.length === 0) continue
		const parent = Number(q?.marks) || 0
		const total = subTotal(subs)
		const where = `Q${entryLabel(q)}`
		if (subs.some(s => s.marks == null)) {
			errors.push(`${where}: every sub-division needs marks`)
			continue
		}
		if (total !== parent) {
			errors.push(`${where}: sub-divisions total ${total}, must be ${parent}`)
		}
	}
	return errors
}

/**
 * Flatten a paper's questions into the columns question-wise mark entry keys on.
 * A split question contributes one column per sub-division (its own id + marks)
 * instead of the parent; an unsplit question contributes itself.
 *
 * choice_group stays the PARENT's group, so "answer 12a or 12b" still locks both
 * of 12a's sub-divisions when the learner answers 12b.
 *
 * branch_id identifies the OR branch a column belongs to (the parent question).
 * The "only one of an OR pair" rule counts distinct branch_ids inside a group —
 * NOT distinct columns — so 12a-i and 12a-ii can both be answered while 12b
 * stays locked.
 */
export interface FlatEntryQuestion {
	id: string
	label: string
	part_label: string | null
	choice_group: string
	/** The OR branch this column belongs to: the parent question's id. */
	branch_id: string
	marks: number
	is_choice_alternative: boolean
	co_code: string | null
	k_level: string | null
	question_text: string | null
	/** Set on sub-division columns only: the id of the question they were split from. */
	parent_id?: string
}

export function flattenEntryQuestions(questions: any[]): FlatEntryQuestion[] {
	const out: FlatEntryQuestion[] = []
	const sorted = (Array.isArray(questions) ? questions : [])
		.slice()
		.sort((a: any, b: any) => (a?.display_order ?? 0) - (b?.display_order ?? 0))

	for (const q of sorted) {
		const id = String(q?.id ?? '')
		if (!id) continue
		const part = q?.part_label || null
		const group = `${q?.part_label ?? ''}|${q?.question_number ?? ''}`
		const subs = readSubQuestions(q)
		if (subs.length === 0) {
			out.push({
				id,
				label: entryLabel(q),
				part_label: part,
				choice_group: group,
				branch_id: id,
				marks: Number(q?.marks) || 0,
				is_choice_alternative: !!q?.is_choice_alternative,
				co_code: q?.co_code || null,
				k_level: q?.k_level || null,
				question_text: q?.question_text || null,
			})
			continue
		}
		for (const s of subs) {
			out.push({
				id: s.id,
				label: entryLabel(q, s),
				part_label: part,
				choice_group: group,
				branch_id: id,
				marks: Number(s.marks) || 0,
				is_choice_alternative: !!q?.is_choice_alternative,
				co_code: s.co_code,
				k_level: s.k_level,
				question_text: s.question_text || q?.question_text || null,
				parent_id: id,
			})
		}
	}
	return out
}
