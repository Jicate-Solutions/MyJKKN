'use client'
// Copied from COE b34e527 (+ uncommitted working tree), 2026-10-05 — source: components/ia/question-image-field.tsx
// Sync list: docs spec "QP entry methods parity" §10. Diff against COE before changing.
//
// MyJKKN deltas from the COE file (keep when resyncing):
//   1. Storage is still the proxy `/api/question-papers/:id/image` → COE's
//      `question-images` bucket (spec phase 3 moves it to private Drive). A figure
//      therefore carries `path`, and cleanup deletes by path.
//   2. A figure uploaded in COE lives in private Drive behind COE's own session;
//      MyJKKN has no proxy for it yet, so it is described, not previewed — and
//      its reference is handed back untouched on save.
//   3. Toasts are sonner; there is no examiner `assignmentId`.
//   4. The card-wide paste listener ignores a clipboard that also carries plain
//      text (a Word / Excel copy), so pasting text never attaches its bitmap.

// Per-question image attachment (diagram / figure). One image per question or
// sub-division; it prints CENTRED under that question's text.
//
// Bytes are squeezed on the client (see lib/ia/question-image.ts) so Drive
// holds KB-level objects, and the control reports the stored resolution + size +
// the effective print dpi at the chosen width so the author can see when an image
// is too soft to print.
//

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ImagePlus, Loader2, Trash2, RefreshCw, AlertTriangle, ImageOff } from 'lucide-react'
import {
	prepareQuestionImage,
	printDpi,
	formatBytes,
	IMAGE_WIDTHS,
	DEFAULT_IMAGE_WIDTH_PCT,
	MIN_PRINT_DPI,
} from '@/lib/utils/question-papers/question-image'
import type { IaQuestionImage } from '@/types/ia-question-paper'

/** COE's authenticated file proxy — not reachable with a MyJKKN session. */
const COE_PROXY_PATH = /^\/api\/examiner\/question-paper\/file\//

interface Props {
	paperId: string
	value?: IaQuestionImage | null
	onChange: (image: IaQuestionImage | null) => void
	disabled?: boolean
	/** Shown on the empty-state button — "Add image" / "Add image to i." */
	label?: string
}

export function QuestionImageField({
	paperId,
	value,
	onChange,
	disabled,
	label = 'Add image',
}: Props) {
	const inputRef = useRef<HTMLInputElement>(null)
	const [busy, setBusy] = useState(false)
	// The picked image, shown at once from memory while Drive takes its time.
	// It stays until the stored copy has actually loaded, so the swap is invisible.
	const [pending, setPending] = useState<string | null>(null)
	const pendingUrlRef = useRef<string | null>(null)
	const showPending = (blob: Blob) => {
		clearPending()
		const url = URL.createObjectURL(blob)
		pendingUrlRef.current = url
		setPending(url)
	}
	const clearPending = () => {
		if (pendingUrlRef.current) URL.revokeObjectURL(pendingUrlRef.current)
		pendingUrlRef.current = null
		setPending(null)
	}

	const widthPct = value?.width_pct || DEFAULT_IMAGE_WIDTH_PCT
	const dpi = value?.px_w ? printDpi(value.px_w, widthPct) : 0

	const pick = () => inputRef.current?.click()

	const onFile = async (file: File | undefined) => {
		if (!file) return
		const previous = value || null
		try {
			setBusy(true)
			const prepared = await prepareQuestionImage(file)
			showPending(prepared.blob)

			const form = new FormData()
			// Re-encoded blobs lose the filename; give the upload a sane one.
			const ext = (prepared.blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
			form.append('file', prepared.blob, prepared.original ? file.name : `question.${ext}`)

			const res = await fetch(`/api/question-papers/${paperId}/image`, {
				method: 'POST',
				body: form,
			})
			const payload = await res.json().catch(() => ({}))
			if (!res.ok) throw new Error(payload?.error || 'Upload failed')
			const data = payload?.data ?? payload

			onChange({
				url: data.url,
				path: data.path,
				width_pct: widthPct,
				px_w: prepared.width,
				px_h: prepared.height,
				bytes: prepared.bytes,
			})

			// Replacing: drop the object we just orphaned (best-effort).
			if (previous) void removeObject(previous)

			toast.success('Image attached', {
				description: `${prepared.width} × ${prepared.height} · ${formatBytes(prepared.bytes)}${
					prepared.original ? '' : ' (compressed)'
				} · Save the paper to keep it.`,
			})
		} catch (e: any) {
			clearPending()
			toast.error('Image not attached', { description: e?.message || 'Upload failed' })
		} finally {
			setBusy(false)
			if (inputRef.current) inputRef.current.value = ''
		}
	}

	/**
	 * Delete the stored object behind a figure. Only bucket figures (those with a
	 * `path`) are removed from here; a Drive figure uploaded in COE is COE's to
	 * clean up.
	 */
	const removeObject = async (img: IaQuestionImage) => {
		if (!img.path) return
		try {
			await fetch(`/api/question-papers/${paperId}/image?path=${encodeURIComponent(img.path)}`, {
				method: 'DELETE',
			})
		} catch {
			// An orphaned object is harmless — never block the author on cleanup.
		}
	}

	const remove = async () => {
		const previous = value || null
		onChange(null)
		if (previous) void removeObject(previous)
	}

	/**
	 * First image found in a clipboard or drag payload.
	 *
	 * A screenshot is the common case and it never reaches the disk: Print Screen
	 * and the Windows / macOS snipping tools put the bitmap straight on the
	 * clipboard, so without this an author has to save it to a file purely to
	 * hand it back. `getAsFile()` on a pasted bitmap returns a nameless
	 * image/png Blob, which prepareQuestionImage handles like any other file.
	 */
	const imageFrom = (list: DataTransferItemList | FileList | null | undefined): File | null => {
		if (!list) return null
		const items = Array.from(list as any) as any[]
		for (const item of items) {
			if (item instanceof File) {
				if (item.type.startsWith('image/')) return item
				continue
			}
			if (item?.kind === 'file' && String(item.type || '').startsWith('image/')) {
				const file = item.getAsFile()
				if (file) return file
			}
		}
		return null
	}

	/** The drop zone is only "armed" while a drag is over it. */
	const [dragging, setDragging] = useState(false)

	const onPaste = (e: React.ClipboardEvent) => {
		if (disabled || busy) return
		const file = imageFrom(e.clipboardData?.items)
		if (!file) return
		// Only swallow the event once an image is actually found, so pasting text
		// into a neighbouring field keeps working.
		e.preventDefault()
		void onFile(file)
	}

	// ── Ctrl+V anywhere in this question ────────────────────────────────────
	//
	// React's onPaste fires only on the FOCUSED element, so a handler on the drop
	// zone alone means nothing happens until that box has focus — which is why
	// pasting used to work only after clicking Add Image and dismissing the file
	// dialog, since that round trip happened to leave focus on the box.
	//
	// A native listener on the surrounding question fixes it: paste events bubble,
	// so Ctrl+V while typing in the question's text editor reaches this handler
	// with no prior click.
	const rootRef = useRef<HTMLDivElement>(null)
	// The listener is attached once; these keep it reading current values without
	// tearing down and re-attaching on every keystroke.
	const liveRef = useRef({ disabled, busy, onFile })
	liveRef.current = { disabled, busy, onFile }

	useEffect(() => {
		const el = rootRef.current
		if (!el) return
		// Scope to the question card when the caller marks one, else to this field.
		const scope = (el.closest('[data-qp-image-scope]') as HTMLElement | null) || el

		const handler = (e: ClipboardEvent) => {
			const { disabled: off, busy: working, onFile: upload } = liveRef.current
			if (off || working) return

			// A card can hold several image fields — the question's own plus one per
			// sub-division — and all of them see the same bubbling event. The NEAREST
			// scope to whatever was pasted into wins, so a paste inside sub-division
			// (ii) attaches to (ii) and not to every field on the card at once.
			const from = e.target as HTMLElement | null
			const nearest = from?.closest?.('[data-qp-image-scope]') as HTMLElement | null
			if (nearest && nearest !== scope) return

			// Word and Excel put a BITMAP of the copied text on the clipboard next to
			// the text itself. That paste is text — attaching its picture as the
			// question's figure would be a surprise on every paste from Word. A
			// screenshot (and a browser's "Copy image") carries no plain text.
			if (e.clipboardData?.getData('text/plain')?.trim()) return

			const file = imageFrom(e.clipboardData?.items)
			if (!file) return // a text paste is none of our business
			e.preventDefault()
			void upload(file)
		}

		scope.addEventListener('paste', handler)
		return () => scope.removeEventListener('paste', handler)
	}, [])

	const onDrop = (e: React.DragEvent) => {
		if (disabled || busy) return
		const file = imageFrom(e.dataTransfer?.items) || imageFrom(e.dataTransfer?.files)
		if (!file) return
		e.preventDefault()
		setDragging(false)
		void onFile(file)
	}

	// A private Drive figure (uploaded in COE) cannot be loaded with a MyJKKN session.
	const coeOnly = !!value?.url && COE_PROXY_PATH.test(value.url)

	return (
		<div ref={rootRef} className="mt-2">
			<input
				ref={inputRef}
				type="file"
				accept="image/png,image/jpeg,image/webp,image/gif"
				className="hidden"
				onChange={e => onFile(e.target.files?.[0])}
			/>

			{pending && !value?.url ? (
				/* Picked but not yet stored: show it now rather than a spinner. */
				<div className="rounded-md border bg-muted/20 p-2">
					<div className="flex justify-center">
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src={pending}
							alt="Question image"
							className="max-h-44 rounded border bg-white object-contain"
							style={{ width: `${widthPct}%`, height: 'auto' }}
						/>
					</div>
					<p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
						<Loader2 className="h-3.5 w-3.5 animate-spin" />
						Uploading…
					</p>
				</div>
			) : !value?.url ? (
				/* Focusable so a paste lands here: onPaste only fires on the focused
				   element or its ancestors, and a bare div is not focusable. */
				<div
					tabIndex={disabled || busy ? -1 : 0}
					role="button"
					onClick={() => !disabled && !busy && pick()}
					onKeyDown={e => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault()
							if (!disabled && !busy) pick()
						}
					}}
					onPaste={onPaste}
					onDragOver={e => {
						if (disabled || busy) return
						e.preventDefault()
						setDragging(true)
					}}
					onDragLeave={() => setDragging(false)}
					onDrop={onDrop}
					title="Click to browse, drop an image here, or focus this box and press Ctrl+V to paste a screenshot"
					className={cn(
						'flex items-center gap-2 rounded-md border border-dashed px-2.5 py-2 text-xs transition-colors',
						'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
						disabled || busy
							? 'cursor-not-allowed opacity-60'
							: 'cursor-pointer hover:bg-muted/40',
						dragging && 'border-primary bg-primary/5'
					)}
				>
					{busy ? (
						<Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
					) : (
						<ImagePlus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
					)}
					<span className="font-medium">{label}</span>
					<span className="text-muted-foreground">
						{dragging ? 'Drop to attach' : '— click, drop, or paste a screenshot (Ctrl+V)'}
					</span>
				</div>
			) : (
				/* The filled state is a paste/drop target too, so replacing a figure is
				   the same gesture as attaching one — otherwise the only way to swap a
				   screenshot is Remove, then paste, which loses the print width. */
				<div
					tabIndex={disabled || busy ? -1 : 0}
					onPaste={onPaste}
					onDragOver={e => {
						if (disabled || busy) return
						e.preventDefault()
						setDragging(true)
					}}
					onDragLeave={() => setDragging(false)}
					onDrop={onDrop}
					className={cn(
						'rounded-md border bg-muted/20 p-2 transition-colors',
						'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
						dragging && 'border-primary bg-primary/5'
					)}
				>
					{dragging && (
						<p className="mb-2 text-center text-xs font-medium text-primary">
							Drop to replace this image
						</p>
					)}
					{/* Preview mirrors the print: centred, at the chosen column width.
					    While a replacement is uploading, or the stored copy is still on its
					    way from Drive, the in-memory pick is shown and the real image loads
					    behind it; the swap happens only once it is ready. */}
					<div className="relative flex justify-center">
						{coeOnly && !pending ? (
							<p className="flex items-center gap-1.5 rounded border border-dashed px-3 py-4 text-xs text-muted-foreground">
								<ImageOff className="h-3.5 w-3.5 shrink-0" />
								Figure attached in COE — it prints in the PDF; the preview is not available here.
							</p>
						) : (
							// eslint-disable-next-line @next/next/no-img-element
							<img
								src={pending || value.url}
								alt="Question image"
								className="max-h-44 rounded border bg-white object-contain"
								style={{ width: `${widthPct}%`, height: 'auto' }}
							/>
						)}
						{pending && !busy && (
							// eslint-disable-next-line @next/next/no-img-element
							<img src={value.url} alt="" className="hidden" onLoad={clearPending} onError={clearPending} />
						)}
						{busy && (
							<span className="absolute bottom-1 right-1 inline-flex items-center gap-1 rounded bg-white/90 px-1.5 py-0.5 text-[11px] text-muted-foreground shadow">
								<Loader2 className="h-3 w-3 animate-spin" />
								Uploading…
							</span>
						)}
					</div>

					<div className="mt-2 flex flex-wrap items-center gap-2">
						<Label className="text-xs whitespace-nowrap">Print width</Label>
						<Select
							value={String(widthPct)}
							onValueChange={v => onChange({ ...value, width_pct: Number(v) })}
							disabled={disabled}
						>
							<SelectTrigger className="h-7 w-[140px] text-xs">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{IMAGE_WIDTHS.map(w => (
									<SelectItem key={w.value} value={String(w.value)} className="text-xs">
										{w.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						<Button
							type="button"
							size="sm"
							variant="ghost"
							className="h-7 gap-1 px-2 text-xs"
							disabled={disabled || busy}
							title="Choose a file — or click this box and press Ctrl+V to paste a screenshot over it"
							onMouseDown={e => e.preventDefault()}
							onClick={pick}
						>
							{busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
							Replace
						</Button>
						<Button
							type="button"
							size="sm"
							variant="ghost"
							className="h-7 gap-1 px-2 text-xs text-destructive"
							disabled={disabled || busy}
							onClick={remove}
						>
							<Trash2 className="h-3 w-3" /> Remove
						</Button>
					</div>

					<div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
						{value.px_w && value.px_h ? <span>{value.px_w} × {value.px_h} px</span> : null}
						{value.bytes ? <span>· {formatBytes(value.bytes)}</span> : null}
						{dpi ? (
							<span className={dpi < MIN_PRINT_DPI ? 'text-amber-600' : ''}>
								· ≈{dpi} dpi at this width
							</span>
						) : null}
						{dpi && dpi < MIN_PRINT_DPI ? (
							<span className="flex items-center gap-1 text-amber-600">
								<AlertTriangle className="h-3 w-3" /> may print soft — use a larger source image or a smaller width
							</span>
						) : null}
					</div>
				</div>
			)}
		</div>
	)
}

export default QuestionImageField
