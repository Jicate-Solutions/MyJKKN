// ─────────────────────────────────────────────────────────────────────────────
// PORTED VERBATIM from COE: lib/ia/question-image.ts
//
// Do NOT adapt this file to MyJKKN house style. COE and MyJKKN are two writers
// against the SAME ia_question_papers.questions JSONB, and these rules are
// enforced on both sides. Any divergence shows up as a rejected save or a
// mis-printed paper (docs/ia-question-paper-entry-spec.md §14).
//
// To resync: copy the COE file over the body below and keep this header.
// Source: D:\JKKN\Development\Appliaction\COE\JKKN_COE\lib\ia\question-image.ts
// ─────────────────────────────────────────────────────────────────────────────

// Question-image helpers: client-side downscale/re-encode before upload, plus the
// print-size maths the authoring UI shows.
//
// Goal (agreed): keep every stored object at KB level WITHOUT dropping below the
// resolution a printed question paper needs. A question image prints at
// `width_pct` of the ~190 mm text column, so ~1600 px on the long edge is already
// ≥ 200 dpi at full width — anything beyond that is bytes nobody can see on paper.

/** Longest edge kept after downscaling (≈200 dpi across the full A4 text column). */
export const MAX_EDGE_PX = 1600
/** Re-encode until the file is under this — "KB level", not MB. */
export const TARGET_BYTES = 180 * 1024
/** Printable text-column width of the A4 paper (A4 210mm − 8mm margins − table gutters). */
const COLUMN_WIDTH_MM = 190
/** Below this the image looks soft in print; the UI warns. */
export const MIN_PRINT_DPI = 150

export const IMAGE_WIDTHS = [
	{ value: 40, label: 'Small (40%)' },
	{ value: 60, label: 'Medium (60%)' },
	{ value: 85, label: 'Large (85%)' },
] as const

export const DEFAULT_IMAGE_WIDTH_PCT = 60

export interface PreparedImage {
	blob: Blob
	width: number
	height: number
	bytes: number
	/** True when the original was kept as-is (already small enough). */
	original: boolean
}

/** Effective print resolution of a `width` px image printed at `pct` of the column. */
export function printDpi(width: number, pct: number): number {
	const mm = (COLUMN_WIDTH_MM * (pct || DEFAULT_IMAGE_WIDTH_PCT)) / 100
	if (mm <= 0) return 0
	return Math.round(width / (mm / 25.4))
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function canEncode(type: string): boolean {
	try {
		const c = document.createElement('canvas')
		c.width = c.height = 1
		return c.toDataURL(type).startsWith(`data:${type}`)
	} catch {
		return false
	}
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
	return new Promise(resolve => canvas.toBlob(resolve, type, quality))
}

async function loadImage(file: File): Promise<{ width: number; height: number; draw: CanvasImageSource }> {
	// createImageBitmap is the fast path; <img> covers browsers/types it rejects.
	try {
		const bmp = await createImageBitmap(file)
		return { width: bmp.width, height: bmp.height, draw: bmp }
	} catch {
		const url = URL.createObjectURL(file)
		try {
			const img = await new Promise<HTMLImageElement>((resolve, reject) => {
				const el = new Image()
				el.onload = () => resolve(el)
				el.onerror = () => reject(new Error('Could not read that image'))
				el.src = url
			})
			return { width: img.naturalWidth, height: img.naturalHeight, draw: img }
		} finally {
			// Revoking immediately is safe — the bitmap is already decoded into the element.
			setTimeout(() => URL.revokeObjectURL(url), 0)
		}
	}
}

/**
 * Downscale to MAX_EDGE_PX and re-encode until the blob fits TARGET_BYTES.
 * Quality drops first (visually cheapest), then dimensions — never below 800 px
 * on the long edge, which is the floor for a readable printed diagram.
 */
export async function prepareQuestionImage(file: File): Promise<PreparedImage> {
	const { width: srcW, height: srcH, draw } = await loadImage(file)
	if (!srcW || !srcH) throw new Error('Could not read that image')

	const withinEdge = Math.max(srcW, srcH) <= MAX_EDGE_PX
	// Already small and correctly sized — keep the original bytes (no lossy pass
	// over a crisp line drawing).
	if (withinEdge && file.size <= TARGET_BYTES) {
		return { blob: file, width: srcW, height: srcH, bytes: file.size, original: true }
	}

	// WebP holds line art far better than JPEG at the same size; JPEG is the fallback.
	const type = canEncode('image/webp') ? 'image/webp' : 'image/jpeg'
	const canvas = document.createElement('canvas')
	const ctx = canvas.getContext('2d')
	if (!ctx) return { blob: file, width: srcW, height: srcH, bytes: file.size, original: true }

	let scale = Math.min(1, MAX_EDGE_PX / Math.max(srcW, srcH))
	let best: { blob: Blob; width: number; height: number } | null = null

	for (let pass = 0; pass < 4; pass++) {
		const w = Math.max(1, Math.round(srcW * scale))
		const h = Math.max(1, Math.round(srcH * scale))
		canvas.width = w
		canvas.height = h
		ctx.clearRect(0, 0, w, h)
		// A white ground: JPEG has no alpha, and a transparent diagram would print black.
		if (type === 'image/jpeg') {
			ctx.fillStyle = '#fff'
			ctx.fillRect(0, 0, w, h)
		}
		ctx.imageSmoothingQuality = 'high'
		ctx.drawImage(draw, 0, 0, w, h)

		for (const quality of [0.92, 0.85, 0.75]) {
			const blob = await toBlob(canvas, type, quality)
			if (!blob) continue
			if (!best || blob.size < best.blob.size) best = { blob, width: w, height: h }
			if (blob.size <= TARGET_BYTES) {
				return { blob, width: w, height: h, bytes: blob.size, original: false }
			}
		}

		// Still heavy: shrink, but never past the readable floor.
		const nextLongEdge = Math.max(srcW, srcH) * scale * 0.8
		if (nextLongEdge < 800) break
		scale *= 0.8
	}

	if (best) return { blob: best.blob, width: best.width, height: best.height, bytes: best.blob.size, original: false }
	return { blob: file, width: srcW, height: srcH, bytes: file.size, original: true }
}
