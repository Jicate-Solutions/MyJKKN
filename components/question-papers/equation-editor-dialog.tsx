'use client'
// Copied from COE b34e527 (+ uncommitted working tree), 2026-10-05 — source: components/ia/equation-editor-dialog.tsx
// Sync list: docs spec "QP entry methods parity" §10. Diff against COE before changing.

// Word-style equation editor.
//
// Laid out like Microsoft Word's Equation Tools, because that is the editor
// every examiner already knows:
//
//   ┌ Symbols ───────────────────────────────────────────────── [set ▾] ───────┐
//   │ ± ∞ = ≠ ~ × ÷ ! ∝ < ≪ > ≫ ≤ ≥ ∓ ≅ ≈ ≡ ∀ ∁ ∂ √ …   (two rows, scrolls)   │
//   └──────────────────────────────────────────────────────────────────────────┘
//   ┌ Structures ──────────────────────────────────────────────────────────────┐
//   │ Fraction  Script  Radical  Integral  …   each opens a gallery of shapes  │
//   └──────────────────────────────────────────────────────────────────────────┘
//   ┌ Type equation here ──────────────────────────────────────────────────────┐
//   │        the equation itself — click a box and type, edit in place         │
//   └──────────────────────────────────────────────────────────────────────────┘
//
// The equation is edited VISUALLY (components/ia/math-field): a structure drops
// in with empty boxes, the examiner clicks a box — or presses Tab — and types
// into it, and any part of a finished formula can be clicked and changed. The
// LaTeX behind it is kept out of the way, under "LaTeX source", for the few who
// want to type or paste it.
//
// What is stored is plain LaTeX (the same contract as before), so the on-screen
// render and the printed paper are unchanged. Every formula is also run through
// KaTeX — the engine that prints the paper — and a warning shows if it would
// not print.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import {
	Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { Popover, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Code2, Eraser } from 'lucide-react'
import { stripLatexDelimiters } from '@/lib/utils/question-papers/latex-paste'
import { cn } from '@/lib/utils'
import { STRUCTURES, SYMBOL_SETS, type MathToken } from '@/lib/utils/question-papers/math-catalog'
import { MathField, type MathFieldHandle } from './math-field'

interface Props {
	open: boolean
	onOpenChange: (open: boolean) => void
	initialLatex?: string // set → edit an existing formula; empty → insert new
	onInsert: (latex: string) => void
}

/** The placeholder, drawn grey so an empty box reads as "fill me", not as a symbol. */
const PH_RE = /\\square(?![a-zA-Z])/g
const paintPlaceholders = (latex: string) => latex.replace(PH_RE, '\\textcolor{#94a3b8}{\\square}')

function render(latex: string, display: boolean): string {
	try {
		return katex.renderToString(paintPlaceholders(latex), { throwOnError: false, displayMode: display })
	} catch {
		return latex
	}
}

/** Would the paper's own renderer accept this? Null when it would; the reason when not. */
function printProblem(latex: string): string | null {
	if (!latex.trim()) return null
	try {
		katex.renderToString(latex, { throwOnError: true, displayMode: true })
		return null
	} catch (e: any) {
		return String(e?.message || 'This formula cannot be printed').replace(/^KaTeX parse error:\s*/, '')
	}
}

/** One palette button: a symbol (small) or a structure tile (large). */
function MathButton({
	token,
	size,
	onPick,
}: {
	token: MathToken
	size: 'symbol' | 'tile'
	onPick: (latex: string) => void
}) {
	const html = useMemo(() => render(token.label ?? token.latex, size === 'tile'), [token.label, token.latex, size])
	return (
		<button
			type="button"
			title={token.title || token.latex}
			// Keep the caret where it is in the equation while the palette is clicked.
			onMouseDown={e => e.preventDefault()}
			onClick={() => onPick(token.latex)}
			className={cn(
				// The glyph colour is set here, not inherited: the tile is always white,
				// so in dark mode an inherited (light) foreground left the symbols faint.
				'flex items-center justify-center rounded border border-slate-300 bg-white text-slate-950 transition-colors hover:border-blue-500 hover:bg-blue-50',
				size === 'symbol' ? 'h-10 min-w-10 px-1 text-[19px]' : 'h-[72px] overflow-hidden px-2 text-[18px] [&_.katex-display]:my-0'
			)}
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	)
}

export function EquationEditorDialog({ open, onOpenChange, initialLatex, onInsert }: Props) {
	const [latex, setLatex] = useState('')
	const [symbolSet, setSymbolSet] = useState(SYMBOL_SETS[0].name)
	const [openGroup, setOpenGroup] = useState<string | null>(null)
	const [showSource, setShowSource] = useState(false)
	const fieldRef = useRef<MathFieldHandle | null>(null)
	// The galleries are rendered INSIDE this element, not in <body>. A dialog
	// locks scrolling for everything outside itself, so a gallery portalled to
	// <body> could not be scrolled with the mouse wheel.
	const [dialogEl, setDialogEl] = useState<HTMLDivElement | null>(null)

	useEffect(() => {
		if (open) {
			setLatex(initialLatex || '')
			setOpenGroup(null)
			setShowSource(false)
		}
	}, [open, initialLatex])

	/** Palette → the equation, at the caret. A structure lands with its first box selected. */
	const insertToken = useCallback((token: string) => {
		fieldRef.current?.insert(token)
		setOpenGroup(null)
	}, [])

	const empties = useMemo(() => (latex.match(PH_RE) || []).length, [latex])
	const problem = useMemo(() => printProblem(latex), [latex])

	const submit = () => {
		// Read the field itself: a keystroke made an instant ago may not have
		// reached `latex` yet, and it must not be left out of what is inserted.
		const current = fieldRef.current?.getLatex() || latex
		if (!current.trim() || printProblem(current)) return
		// MathType / Overleaf copies arrive wrapped in $…$ or […]; store bare LaTeX.
		const v = stripLatexDelimiters(current)
		if (v) onInsert(v)
		onOpenChange(false)
	}
	const activeSet = SYMBOL_SETS.find(s => s.name === symbolSet) || SYMBOL_SETS[0]

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				ref={setDialogEl}
				className="w-[96vw] max-w-[1400px] gap-0 overflow-visible p-0"
				// Esc inside the equation belongs to the equation, not to "close and lose it".
				onEscapeKeyDown={e => {
					if (document.activeElement?.tagName === 'MATH-FIELD') e.preventDefault()
				}}
			>
				{/* The scrolling body. The galleries are siblings of this, so they are
				    not clipped by it. */}
				<div className="max-h-[94vh] overflow-y-auto rounded-[inherit]">
				<DialogHeader className="border-b px-6 pb-3 pt-4 text-left">
					<DialogTitle>Equation</DialogTitle>
					<DialogDescription className="text-slate-700 dark:text-slate-300">
						Pick a structure or a symbol, then click a box and type into it. Tab moves to the next box.
					</DialogDescription>
				</DialogHeader>

				{/* ── The ribbon: Symbols, then Structures ──
				    Stacked, each the full width of the dialog. Side by side the
				    Structures row claimed its natural width and squeezed the symbol
				    grid to one column, hiding the set picker. */}
				<div className="space-y-2 border-b bg-slate-100 px-6 py-3 text-slate-900">
					<div className="rounded-md border border-slate-300 bg-white">
						<div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-2.5 py-1.5">
							<span className="text-xs font-bold uppercase tracking-wide text-slate-800">Symbols</span>
							<Select value={symbolSet} onValueChange={setSymbolSet}>
								<SelectTrigger className="h-8 w-56 border-slate-300 bg-white text-sm font-medium text-slate-900" aria-label="Symbol set">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{SYMBOL_SETS.map(s => (
										<SelectItem key={s.name} value={s.name} className="text-xs">
											{s.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						{/* Three rows on show, the rest a scroll away. */}
						<div className="grid max-h-[148px] grid-cols-[repeat(auto-fill,minmax(42px,1fr))] gap-1 overflow-y-auto p-2 [scrollbar-width:thin]">
							{activeSet.tokens.map((tok, i) => (
								<MathButton key={`${tok.latex}-${i}`} token={tok} size="symbol" onPick={insertToken} />
							))}
						</div>
					</div>

					<div className="rounded-md border border-slate-300 bg-white">
						<div className="border-b border-slate-200 px-2.5 py-1.5">
							<span className="text-xs font-bold uppercase tracking-wide text-slate-800">Structures</span>
						</div>
						{/* auto-fit by the dialog's OWN width, not the screen's: all eleven in
						    one row when there is room, two tidy rows when there is not. */}
						<div className="grid grid-cols-[repeat(auto-fit,minmax(92px,1fr))] gap-0.5 p-1.5">
							{STRUCTURES.map(g => (
								<Popover key={g.key} open={openGroup === g.key} onOpenChange={o => setOpenGroup(o ? g.key : null)}>
									<PopoverTrigger asChild>
										<button
											type="button"
											onMouseDown={e => e.preventDefault()}
											className={cn(
												'flex w-full flex-col items-center rounded-md border border-transparent px-1 pb-1.5 pt-2 text-slate-950 transition-colors hover:border-slate-300 hover:bg-slate-100',
												openGroup === g.key && 'border-blue-400 bg-blue-50'
											)}
										>
											<span
												className="flex h-11 items-center justify-center [&_.katex]:text-[20px]"
												dangerouslySetInnerHTML={{ __html: render(g.icon, false) }}
											/>
											<span className="mt-1 flex items-center gap-0.5 text-center text-[13px] font-medium leading-tight text-slate-900">
												{g.name}
												<ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-600" />
											</span>
										</button>
									</PopoverTrigger>
									<PopoverPrimitive.Portal container={dialogEl}>
									<PopoverPrimitive.Content
										align="start"
										sideOffset={4}
										collisionPadding={12}
										// Opening a gallery must not pull the caret out of the equation.
										onOpenAutoFocus={e => e.preventDefault()}
										onCloseAutoFocus={e => e.preventDefault()}
										className="z-50 w-[min(460px,calc(100vw-2rem))] max-h-[min(var(--radix-popover-content-available-height),560px)] overflow-y-auto overscroll-contain rounded-md border bg-popover p-0 text-popover-foreground shadow-lg outline-none [scrollbar-width:thin]"
									>
										{g.sections.map(sec => (
											<div key={sec.name}>
												<div className="sticky top-0 z-10 border-b border-slate-300 bg-slate-200 px-3 py-1 text-xs font-bold text-slate-900">{sec.name}</div>
												<div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-4">
													{sec.items.map((tok, i) => (
														<MathButton key={`${tok.latex}-${i}`} token={tok} size="tile" onPick={insertToken} />
													))}
												</div>
											</div>
										))}
									</PopoverPrimitive.Content>
									</PopoverPrimitive.Portal>
								</Popover>
							))}
						</div>
					</div>
				</div>

				{/* ── The equation: edited in place ── */}
				<div className="space-y-3 px-6 py-4">
					<div
						className="rounded-md border-2 border-slate-400 bg-white text-slate-950 transition-colors focus-within:border-blue-500"
						// Enter inserts — the keyboard stays on the equation throughout.
						// Ctrl / Alt + Enter is left alone: the field uses it to add a row
						// to a matrix. So is Enter while a raw \command is being typed.
						onKeyDown={e => {
							if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
							if (fieldRef.current?.isTypingCommand()) return
							e.preventDefault()
							submit()
						}}
					>
						<MathField ref={fieldRef} value={latex} onChange={setLatex} />
					</div>

					<div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
						<span className={cn('font-medium', empties > 0 ? 'text-amber-800 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300')}>
							{empties > 0
								? `${empties} empty box${empties === 1 ? '' : 'es'} — click a box and type, or press Tab for the next one`
								: latex.trim()
									? 'Click anywhere in the equation to change it'
									: 'Click in the box above and type, or pick a structure'}
						</span>
						<span className="flex flex-wrap items-center gap-1">
							<Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onMouseDown={e => e.preventDefault()} onClick={() => fieldRef.current?.previousBox()} disabled={empties === 0}>
								<ChevronLeft className="h-3.5 w-3.5" />
								Previous box
							</Button>
							<Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onMouseDown={e => e.preventDefault()} onClick={() => fieldRef.current?.nextBox()} disabled={empties === 0}>
								Next box
								<ChevronRight className="h-3.5 w-3.5" />
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="h-7 px-2 text-xs"
								onClick={() => {
									setLatex('')
									requestAnimationFrame(() => fieldRef.current?.focus())
								}}
								disabled={!latex}
							>
								<Eraser className="mr-1 h-3.5 w-3.5" />
								Clear
							</Button>
							<Button type="button" variant="ghost" size="sm" className={cn('h-7 px-2 text-xs', showSource && 'bg-slate-100')} onClick={() => setShowSource(v => !v)}>
								<Code2 className="mr-1 h-3.5 w-3.5" />
								LaTeX source
							</Button>
						</span>
					</div>

					{problem && (
						<div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800" role="alert">
							<AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
							<span>
								<span className="font-semibold">This equation will not print as shown.</span> {problem}. Change that part, or remove it.
							</span>
						</div>
					)}

					{showSource && (
						<div>
							<Textarea
								rows={3}
								value={latex}
								onChange={e => setLatex(e.target.value)}
								placeholder="Type or paste LaTeX, e.g. x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}"
								className="font-mono text-sm"
								spellCheck={false}
							/>
							<p className="mt-1 text-xs text-slate-700 dark:text-slate-300">
								For those who prefer it. Each <span className="font-mono">\square</span> is an empty box. A paste from MathType or Overleaf works here.
							</p>
						</div>
					)}
				</div>

				<DialogFooter className="border-t px-6 py-3 sm:justify-between">
					<span className="self-center text-[13px] text-slate-700 dark:text-slate-300">
						{empties > 0 ? 'A box left empty prints as a small square.' : 'Enter inserts the equation. In a matrix, Ctrl + Enter adds a row.'}
					</span>
					<span className="flex gap-2">
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button onClick={submit} disabled={!latex.trim() || !!problem} title="Enter">
							{initialLatex ? 'Update equation' : 'Insert equation'}
						</Button>
					</span>
				</DialogFooter>
				</div>
			</DialogContent>
		</Dialog>
	)
}

export default EquationEditorDialog
