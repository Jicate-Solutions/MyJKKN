'use client'
// Copied from COE b34e527 (+ uncommitted working tree), 2026-10-05 — source: components/ia/math-field.tsx
// Sync list: docs spec "QP entry methods parity" §10. Diff against COE before changing.

// A visual, click-and-type maths field — the editing surface of the equation
// dialog. The examiner clicks an empty box and types into it, moves with the
// arrow keys, and edits any part of a formula in place, the way Word's equation
// editor works. Under it is MathLive's <math-field> web component.
//
// What crosses this component's boundary is plain LaTeX in the project's own
// convention, so nothing else has to know MathLive exists:
//
//   • an EMPTY BOX is `\square` outside, `\placeholder{}` inside the field;
//   • the value handed out is MathLive's fully expanded LaTeX, so its private
//     macros (\differentialD, \exponentialE …) never reach KaTeX or the PDF.
//
// MathLive touches `window` at import, so it is loaded inside an effect — this
// file is safe to import from a server-rendered tree.
//
// FONTS / CSP. MathLive draws with the KaTeX_* faces. The page already serves
// those from 'self' through katex.min.css, so MathLive is told NOT to fetch its
// own copy (fontsDirectory = null) and nothing new has to be allowed in
// font-src. Its sounds are switched off for the same reason (media-src).

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import 'katex/dist/katex.min.css'
import type { MathfieldElement } from 'mathlive'
import { PLACEHOLDER } from '@/lib/utils/question-papers/math-catalog'
import { cn } from '@/lib/utils'

export interface MathFieldHandle {
	/** Insert LaTeX at the caret, replacing the selection; lands on its first empty box. */
	insert: (latex: string) => void
	focus: () => void
	/** The equation as it stands this instant (project LaTeX) — not a render behind. */
	getLatex: () => string
	/** True while the examiner is typing a raw \command, where Enter completes it. */
	isTypingCommand: () => boolean
	/** Move to the next / previous empty box. */
	nextBox: () => void
	previousBox: () => void
}

interface Props {
	/** LaTeX in the project convention (`\square` = empty box). */
	value: string
	onChange: (latex: string) => void
	className?: string
	/** Shown, greyed, while the field is empty. */
	emptyText?: string
}

const PH_OUT = /\\square(?![a-zA-Z])/g
const PH_IN = /\\placeholder(?:\[[^\]]*\])?\{[^{}]*\}/g

/** Project LaTeX → what the field edits. */
export const toFieldLatex = (latex: string) => (latex || '').replace(PH_OUT, '\\placeholder{}')
/** What the field holds → project LaTeX. */
export const fromFieldLatex = (latex: string) => (latex || '').replace(PH_IN, PLACEHOLDER).trim()

export const MathField = forwardRef<MathFieldHandle, Props>(function MathField(
	{ value, onChange, className, emptyText = 'Type equation here' },
	ref
) {
	const hostRef = useRef<HTMLDivElement | null>(null)
	const mfRef = useRef<MathfieldElement | null>(null)
	const [ready, setReady] = useState(false)
	/** The last value this field reported, so an echo of it is not written back in. */
	const lastEmitted = useRef<string | null>(null)
	const onChangeRef = useRef(onChange)
	onChangeRef.current = onChange
	const initialValue = useRef(value)

	useEffect(() => {
		let cancelled = false
		let mf: MathfieldElement | null = null
		let onInput: (() => void) | null = null

		void import('mathlive').then(({ MathfieldElement: Mfe }) => {
			if (cancelled || !hostRef.current) return
			// See FONTS / CSP above: reuse the page's KaTeX faces, no sounds.
			Mfe.fontsDirectory = null
			Mfe.soundsDirectory = null

			mf = new Mfe()
			// Upright maths, not \text{}: MathLive tints text-mode runs, which put a
			// grey block behind the prompt that read as selected text.
			mf.setAttribute('placeholder', `\\mathrm{${emptyText.replace(/\s+/g, '~')}}`)
			mf.setAttribute('aria-label', 'Equation')
			mf.className = 'qp-math-field'
			// ATTACH FIRST. MathLive throws "Mathfield not mounted" when its options
			// or value are touched on an element that is not in the document yet.
			hostRef.current.appendChild(mf)

			// The palette above the field is the menu; MathLive's own pop-ups render
			// outside the dialog (which traps focus), so they are turned off.
			mf.mathVirtualKeyboardPolicy = 'manual'
			mf.popoverPolicy = 'off'
			mf.menuItems = []
			mf.smartFence = true
			mf.setValue(toFieldLatex(initialValue.current), { silenceNotifications: true })
			lastEmitted.current = initialValue.current

			onInput = () => {
				if (!mf) return
				const out = fromFieldLatex(mf.getValue('latex-expanded'))
				lastEmitted.current = out
				onChangeRef.current(out)
			}
			mf.addEventListener('input', onInput)

			mfRef.current = mf
			setReady(true)
			// The dialog has just opened: put the caret in the field.
			requestAnimationFrame(() => mf?.focus())
		})

		return () => {
			cancelled = true
			if (mf && onInput) mf.removeEventListener('input', onInput)
			mf?.remove()
			mfRef.current = null
		}
		// Mount once; later value changes are applied by the effect below.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// A value set from outside (Clear, the LaTeX source box) is written into the
	// field; the field's own reports are recognised and left alone.
	useEffect(() => {
		const mf = mfRef.current
		if (!mf || !ready) return
		if (value === lastEmitted.current) return
		mf.setValue(toFieldLatex(value), { silenceNotifications: true })
		lastEmitted.current = value
	}, [value, ready])

	useImperativeHandle(
		ref,
		() => ({
			insert: (latex: string) => {
				const mf = mfRef.current
				if (!mf) return
				mf.insert(toFieldLatex(latex), {
					insertionMode: 'replaceSelection',
					selectionMode: 'placeholder',
					focus: true,
					feedback: false,
				})
				const out = fromFieldLatex(mf.getValue('latex-expanded'))
				lastEmitted.current = out
				onChangeRef.current(out)
			},
			focus: () => mfRef.current?.focus(),
			getLatex: () => (mfRef.current ? fromFieldLatex(mfRef.current.getValue('latex-expanded')) : ''),
			isTypingCommand: () => mfRef.current?.mode === 'latex',
			nextBox: () => {
				mfRef.current?.focus()
				mfRef.current?.executeCommand('moveToNextPlaceholder')
			},
			previousBox: () => {
				mfRef.current?.focus()
				mfRef.current?.executeCommand('moveToPreviousPlaceholder')
			},
		}),
		[]
	)

	return (
		<div className={cn('relative', className)}>
			{/* The field's look. `::part` reaches into the component to hide its own
			    keyboard and menu buttons — the palette replaces both. */}
			<style>{`
				math-field.qp-math-field {
					display: block;
					width: 100%;
					min-height: 120px;
					padding: 18px 20px;
					font-size: 26px;
					border: 0;
					outline: none;
					background: transparent;
					color: #020617;
					--caret-color: #0b6d41;
					--selection-background-color: #bfdbfe;
					--selection-color: #0f172a;
					--contains-highlight-background-color: #f8fafc;
					--placeholder-color: #2563eb;
					--placeholder-opacity: 0.9;
				}
				math-field.qp-math-field::part(virtual-keyboard-toggle),
				math-field.qp-math-field::part(menu-toggle) { display: none; }
				math-field.qp-math-field::part(content) { justify-content: center; }
				/* "Type equation here": a prompt, but one that can be read. */
				math-field.qp-math-field::part(placeholder) { color: #475569; opacity: 1; }
			`}</style>
			<div ref={hostRef} />
			{!ready && (
				<div className="flex min-h-[120px] items-center justify-center text-sm text-muted-foreground">Loading the equation editor…</div>
			)}
		</div>
	)
})

export default MathField
