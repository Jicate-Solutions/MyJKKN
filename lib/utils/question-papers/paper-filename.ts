// ─────────────────────────────────────────────────────────────────────────────
// PORTED VERBATIM from COE: lib/ia/paper-filename.ts
//
// Do NOT adapt this file to MyJKKN house style. COE and MyJKKN are two writers
// against the SAME ia_question_papers.questions JSONB, and these rules are
// enforced on both sides. Any divergence shows up as a rejected save or a
// mis-printed paper (docs/ia-question-paper-entry-spec.md §14).
//
// To resync: copy the COE file over the body below and keep this header.
// Source: D:\JKKN\Development\Appliaction\COE\JKKN_COE\lib\ia\paper-filename.ts
// ─────────────────────────────────────────────────────────────────────────────

// One naming rule for a downloaded question paper, shared by the PDF builder, the
// download button and the bulk ZIP so every copy of a paper arrives with the same
// name:
//
//   QP_<course code>_<course name>_<assessment>[_Set<X>][_2up].pdf
//   e.g. QP_EE3012_ELECTRICAL DRIVES_CIA1.pdf  /  QP_EE3012_ELECTRICAL DRIVES_CIA1_2up.pdf
//
// Underscores separate the SEGMENTS; the course name keeps its own spaces.
// The set label appears only when it isn't the default 'A' (sets B/C would
// otherwise overwrite set A on download), and '2up' only for that layout.
// Pure — no node/browser APIs — so both sides can import it.

/**
 * One name segment: characters no filesystem accepts become spaces and runs of
 * whitespace collapse. Spaces are KEPT — "ELECTRICAL DRIVES" stays readable.
 */
export function sanitizeFilePart(value: string): string {
	return (value || '')
		.replace(/[\/:*?"<>|\u0000-\u001f]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/[.\s]+$/, '')
}

/**
 * Assessment token. A standard round prints as CIA1 / CIA2; a round named
 * something else ("Model Exam") keeps its own name so the file still says what
 * it is.
 */
export function assessmentLabel(paper: any): string {
	const round = Number(paper?.cia_round) || 1
	const named = String(paper?.cia_round_name || '').trim()
	if (!named || /^cia\b/i.test(named)) return `CIA${round}`
	return sanitizeFilePart(named)
}

export interface PaperFilenameOptions {
	/** '2up' adds a suffix so it can't overwrite the single-per-page download. */
	variant?: 'single' | '2up'
	/** Defaults to 'pdf'; pass '' for a bare name. */
	ext?: string
}

export function paperPdfFilename(paper: any, opts: PaperFilenameOptions = {}): string {
	const { variant = 'single', ext = 'pdf' } = opts
	const setLabel = sanitizeFilePart(String(paper?.set_label || '')).replace(/\s+/g, '')

	const parts = [
		'QP',
		sanitizeFilePart(String(paper?.course_code || 'paper')),
		sanitizeFilePart(String(paper?.subject_title || '')),
		assessmentLabel(paper),
		// Only a non-default set needs calling out.
		setLabel && setLabel.toUpperCase() !== 'A' ? `Set${setLabel}` : '',
		variant === '2up' ? '2up' : '',
	].filter(Boolean)

	// Long course titles can blow past filesystem name limits — keep it sane.
	const base = parts.join('_').slice(0, 150).replace(/[._\s]+$/, '')
	return ext ? `${base}.${ext}` : base
}

/**
 * Content-Disposition value for a download. A course title may be Tamil, which is
 * not legal raw in the quoted form — send an ASCII fallback plus the RFC 5987
 * UTF-8 parameter that every current browser prefers.
 */
export function contentDisposition(filename: string): string {
	const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')
	return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}
