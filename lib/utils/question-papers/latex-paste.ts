// Copied from COE b34e527 (+ uncommitted working tree), 2026-10-05 — source: lib/ia/latex-paste.ts
// Sync list: docs spec "QP entry methods parity" §10. Diff against COE before changing.
// LaTeX in pasted text → formula segments.
//
// MathType ("Copy as LaTeX"), Overleaf, ChatGPT and most maths tools put LaTeX
// on the clipboard as plain text wrapped in one of the usual delimiters:
//   $$…$$   \[…\]   \(…\)   $…$
// The question editor turns each delimited run into a mathInline node on paste
// and keeps the surrounding words as text, so "Evaluate $\int_0^6 …$ using the
// Trapezoidal rule" lands as one sentence with a live formula in it. A paste that
// is ONE bare expression (no delimiters, but LaTeX commands such as \frac or
// \begin{bmatrix}) is treated as a single formula too, which is what MathType
// gives when its delimiter option is off.
//
// Pure functions, no editor dependency, so the rules can be unit-tested.

export type LatexSegment = { kind: 'text'; value: string } | { kind: 'math'; value: string }

/** `\frac`, `\int`, `\begin` … — a LaTeX control word. */
const CONTROL_WORD = /\\[A-Za-z]+/

/**
 * Delimited maths, tried in this order so `$$` wins over `$`. A single-dollar run
 * must stay on one line, must not start or end with a space, and must not be
 * followed by a digit, so "$5 and $10" stays prose.
 */
const DELIMITED =
	/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$(?!\s)([^$\n]*?[^$\s\\])\$(?!\d)/g

/** Strip one pair of surrounding delimiters, for the Equation dialog. */
export function stripLatexDelimiters(raw: string): string {
	const s = raw.trim()
	const pairs: Array<[string, string]> = [
		['$$', '$$'],
		['\\[', '\\]'],
		['\\(', '\\)'],
		['$', '$'],
	]
	for (const [open, close] of pairs) {
		if (s.length > open.length + close.length && s.startsWith(open) && s.endsWith(close)) {
			return s.slice(open.length, s.length - close.length).trim()
		}
	}
	return s
}

/** True when the whole string reads as one LaTeX expression with no delimiters. */
export function looksLikeBareLatex(text: string): boolean {
	const s = text.trim()
	if (!s || s.length > 2000 || /\n/.test(s)) return false
	if (/\$|\\\[|\\\(/.test(s)) return false
	return CONTROL_WORD.test(s) || /[\^_]\{/.test(s)
}

/**
 * Split pasted plain text into text and maths segments. Returns null when the
 * text carries no LaTeX at all, so the caller lets the normal paste happen.
 */
export function splitLatexSegments(text: string): LatexSegment[] | null {
	if (!text) return null

	if (looksLikeBareLatex(text)) return [{ kind: 'math', value: text.trim() }]

	const segments: LatexSegment[] = []
	let last = 0
	let found = false
	DELIMITED.lastIndex = 0
	for (let m = DELIMITED.exec(text); m; m = DELIMITED.exec(text)) {
		const latex = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? '').trim()
		if (!latex) continue
		found = true
		if (m.index > last) segments.push({ kind: 'text', value: text.slice(last, m.index) })
		segments.push({ kind: 'math', value: latex })
		last = m.index + m[0].length
	}
	if (!found) return null
	if (last < text.length) segments.push({ kind: 'text', value: text.slice(last) })
	return segments
}
