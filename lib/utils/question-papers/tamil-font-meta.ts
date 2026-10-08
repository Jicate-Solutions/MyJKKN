// Copied from COE b34e527 (+ uncommitted working tree), 2026-10-05 — source: lib/ia/tamil-font-meta.ts
// Sync list: docs spec "QP entry methods parity" §10. Diff against COE before changing.
/**
 * Shared Tamil font metadata (safe for client + server).
 * Server-only loading lives in tamil-fonts.ts.
 */

export const TAMIL_FONT_FAMILIES = [
	{ id: 'unicode', label: 'Unicode Tamil', cssName: 'Noto Sans Tamil' },
	{ id: 'bamini', label: 'Bamini', cssName: 'Bamini' },
	{ id: 'suntommy', label: 'Suntommy', cssName: 'Suntommy' },
] as const

export type TamilFontId = (typeof TAMIL_FONT_FAMILIES)[number]['id']

/** Canonical CSS family names TipTap may emit (lowercased lookup). */
const ALLOWED_FONT_FAMILY_MAP: Record<string, string> = {
	'noto sans tamil': 'Noto Sans Tamil',
	'unicode tamil': 'Noto Sans Tamil',
	nirmala: 'Noto Sans Tamil',
	'nirmala ui': 'Noto Sans Tamil',
	bamini: 'Bamini',
	baamini: 'Bamini',
	suntommy: 'Suntommy',
	'sun tommy': 'Suntommy',
}

export function canonicalizeFontFamily(raw: string): string | null {
	const key = raw.replace(/['"]/g, '').trim().toLowerCase()
	if (!key) return null
	// TipTap may emit a stack like `"Bamini", sans-serif`
	const primary = key.split(',')[0]?.trim() || key
	return ALLOWED_FONT_FAMILY_MAP[primary] ?? null
}
