'use client'
// Copied from COE b34e527 (+ uncommitted working tree), 2026-10-05 — source: components/ia/question-rich-editor.tsx
// Sync list: docs spec "QP entry methods parity" §10. Diff against COE before changing.
//
// MyJKKN deltas from the COE file (keep when resyncing):
//   1. TextAlign stays loaded, with its three buttons — MyJKKN papers already
//      carry `style="text-align:…"` (COE's sanitizer keeps that property), and
//      dropping the extension would strip it on the next save.
//   2. setEditable(…, false) — the default emits an 'update', which reported
//      every question as edited the moment a paper opened ("Unsaved" on a
//      read-only paper). MyJKKN saves explicitly, so a phantom edit is visible.
//   3. shouldRerenderOnTransaction — v3 stopped re-rendering per transaction, so
//      the toolbar's active / in-table states went stale on a caret move.

// Rich question editor: typeable box (bold/italic/underline, sub/superscript,
// inline math via KaTeX, tables) that emits sanitized HTML. The Tamil font is a
// paper-level default (set once in the paper header), not a per-question choice.
// Shares the storage contract with the PDF renderer (math = <span data-latex="…">;
// Tamil = style="font-family:…").

import { memo, useEffect, useRef, useState, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Subscript } from '@tiptap/extension-subscript'
import { Superscript } from '@tiptap/extension-superscript'
import { TableKit } from '@tiptap/extension-table'
import { Placeholder } from '@tiptap/extension-placeholder'
import { TextStyle, FontFamily } from '@tiptap/extension-text-style'
import { TextAlign } from '@tiptap/extension-text-align'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
	Bold, Italic, Underline as UnderlineIcon, Subscript as SubIcon, Superscript as SupIcon,
	Sigma, Table as TableIcon, Rows3, Columns3, Trash2, AlignLeft, AlignCenter, AlignRight,
} from 'lucide-react'
import { MathInline } from './math-node'
import { EquationEditorDialog } from './equation-editor-dialog'

interface Props {
	value: string
	onChange: (html: string) => void
	onBlur?: () => void
	disabled?: boolean
	placeholder?: string
	className?: string
	/**
	 * Paper-wide default language/font, chosen once in the paper header. Applied
	 * as the editor body's base font so every question renders in it live —
	 * there is no per-question font picker. Font marks stored on older papers
	 * still render (the FontFamily extension stays loaded) and keep the
	 * on-screen look in step with the PDF, which reads the same paper default.
	 */
	defaultFontFamily?: string | null
	/**
	 * 'compact' is the MCQ-option flavour: same authoring contract as a question
	 * (bold/italic/underline, sub/superscript, inline equations) minus the table
	 * tools, on a single-line-height box.
	 */
	variant?: 'full' | 'compact'
}

// Empty-document HTML Tiptap emits — normalise to '' so an untouched question stays blank.
const EMPTY_HTML = new Set(['', '<p></p>', '<p><br></p>'])

/**
 * One toolbar button. Defined at module level on purpose: an inner component
 * gets a new identity on every render, which made React unmount and remount
 * every toolbar button of every editor on the page each time anything on the
 * paper changed.
 */
function Btn({
	on, active, disabled: d, title, children,
}: {
	on: () => void; active?: boolean; disabled?: boolean; title: string; children: React.ReactNode
}) {
	return (
		<Button
			type="button"
			variant={active ? 'secondary' : 'ghost'}
			size="icon"
			className="h-7 w-7"
			title={title}
			disabled={d}
			onMouseDown={e => e.preventDefault()}
			onClick={on}
		>
			{children}
		</Button>
	)
}

function QuestionRichEditorImpl({ value, onChange, onBlur, disabled, placeholder, className, defaultFontFamily, variant = 'full' }: Props) {
	const [eqOpen, setEqOpen] = useState(false)
	const [eqInitial, setEqInitial] = useState('')
	const compact = variant === 'compact'

	// The editor is created once; its handlers read the latest callbacks here.
	const onChangeRef = useRef(onChange)
	onChangeRef.current = onChange
	const onBlurRef = useRef(onBlur)
	onBlurRef.current = onBlur

	const editor = useEditor({
		editable: !disabled,
		immediatelyRender: false,
		shouldRerenderOnTransaction: true,
		extensions: [
			// Underline is NOT listed: StarterKit v3 already bundles it, and adding
			// it again makes Tiptap warn "Duplicate extension names found:
			// ['underline']" on every editor instance — dozens per paper. The
			// toolbar's toggleUnderline is StarterKit's, and behaves identically.
			StarterKit,
			Subscript,
			Superscript,
			TextStyle,
			FontFamily,
			TextAlign.configure({ types: ['paragraph'], alignments: ['left', 'center', 'right'] }),
			TableKit.configure({ table: { resizable: false } }),
			MathInline,
			Placeholder.configure({ placeholder: placeholder || 'Enter the question…' }),
		],
		content: value || '',
		editorProps: {
			attributes: {
				class: cn(
					'prose prose-sm max-w-none focus:outline-none qp-rich-editor-body',
					compact ? 'min-h-[34px] px-2 py-1' : 'min-h-[70px] px-3 py-2'
				),
			},
		},
		onUpdate: ({ editor }) => {
			const html = editor.getHTML()
			onChangeRef.current(EMPTY_HTML.has(html) ? '' : html)
		},
		onBlur: () => onBlurRef.current?.(),
	})

	// Keep the editor in step with external value changes (server reloads, rebuild)
	// WITHOUT re-emitting onUpdate (v3 signature: { emitUpdate: false }).
	useEffect(() => {
		if (!editor) return
		const current = editor.getHTML()
		const incoming = value || ''
		const norm = (h: string) => (EMPTY_HTML.has(h) ? '' : h)
		if (norm(current) !== norm(incoming)) {
			editor.commands.setContent(incoming, { emitUpdate: false })
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [value, editor])

	useEffect(() => {
		if (editor && editor.isEditable === !!disabled) editor.setEditable(!disabled, false)
	}, [disabled, editor])

	// Open the equation dialog — pre-filled when the caret is on an existing formula.
	const openEquation = useCallback(() => {
		if (!editor) return
		const attrs = editor.getAttributes('mathInline')
		setEqInitial(editor.isActive('mathInline') ? attrs.latex || '' : '')
		setEqOpen(true)
	}, [editor])

	/**
	 * Double-click a formula to edit it — the Word gesture. The formula is
	 * selected first, so the dialog's result replaces THAT formula.
	 */
	const onFormulaDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
		if (!editor || disabled) return
		const el = (e.target as HTMLElement | null)?.closest?.('.qp-math') as HTMLElement | null
		if (!el) return
		e.preventDefault()
		try {
			editor.commands.setNodeSelection(editor.view.posAtDOM(el, 0))
		} catch {
			/* fall back to whatever the click itself selected */
		}
		setEqInitial(el.getAttribute('data-latex') || '')
		setEqOpen(true)
	}

	const onEquationInsert = (latex: string) => {
		if (!editor) return
		if (editor.isActive('mathInline')) editor.chain().focus().updateMath(latex).run()
		else editor.chain().focus().insertMath(latex).run()
	}

	if (!editor) return null

	const inTable = editor.isActive('table')

	return (
		<div className={cn('rounded-md border bg-background qp-rich-editor-root', className)}>
			{!disabled && (
				<div className="flex flex-wrap items-center gap-0.5 border-b px-1 py-1">
					<Btn title="Bold" active={editor.isActive('bold')} on={() => editor.chain().focus().toggleBold().run()}>
						<Bold className="h-4 w-4" />
					</Btn>
					<Btn title="Italic" active={editor.isActive('italic')} on={() => editor.chain().focus().toggleItalic().run()}>
						<Italic className="h-4 w-4" />
					</Btn>
					<Btn title="Underline" active={editor.isActive('underline')} on={() => editor.chain().focus().toggleUnderline().run()}>
						<UnderlineIcon className="h-4 w-4" />
					</Btn>
					<Btn title="Subscript" active={editor.isActive('subscript')} on={() => editor.chain().focus().toggleSubscript().run()}>
						<SubIcon className="h-4 w-4" />
					</Btn>
					<Btn title="Superscript" active={editor.isActive('superscript')} on={() => editor.chain().focus().toggleSuperscript().run()}>
						<SupIcon className="h-4 w-4" />
					</Btn>
					<span className="mx-1 h-5 w-px bg-border" />
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-7 gap-1 px-2 text-xs"
						title="Insert / edit equation"
						onMouseDown={e => e.preventDefault()}
						onClick={openEquation}
					>
						<Sigma className="h-4 w-4" /> Equation
					</Button>
					{!compact && (
						<>
							<span className="mx-1 h-5 w-px bg-border" />
							<Btn title="Align left" active={editor.isActive({ textAlign: 'left' })} on={() => editor.chain().focus().setTextAlign('left').run()}>
								<AlignLeft className="h-4 w-4" />
							</Btn>
							<Btn title="Align center" active={editor.isActive({ textAlign: 'center' })} on={() => editor.chain().focus().setTextAlign('center').run()}>
								<AlignCenter className="h-4 w-4" />
							</Btn>
							<Btn title="Align right" active={editor.isActive({ textAlign: 'right' })} on={() => editor.chain().focus().setTextAlign('right').run()}>
								<AlignRight className="h-4 w-4" />
							</Btn>
							<span className="mx-1 h-5 w-px bg-border" />
							<Btn
								title="Insert 2×2 table"
								on={() => editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: false }).run()}
							>
								<TableIcon className="h-4 w-4" />
							</Btn>
							<Btn title="Add row" disabled={!inTable} on={() => editor.chain().focus().addRowAfter().run()}>
								<Rows3 className="h-4 w-4" />
							</Btn>
							<Btn title="Add column" disabled={!inTable} on={() => editor.chain().focus().addColumnAfter().run()}>
								<Columns3 className="h-4 w-4" />
							</Btn>
							<Btn title="Delete row" disabled={!inTable} on={() => editor.chain().focus().deleteRow().run()}>
								<Rows3 className="h-4 w-4 text-destructive" />
							</Btn>
							<Btn title="Delete column" disabled={!inTable} on={() => editor.chain().focus().deleteColumn().run()}>
								<Columns3 className="h-4 w-4 text-destructive" />
							</Btn>
							<Btn title="Delete table" disabled={!inTable} on={() => editor.chain().focus().deleteTable().run()}>
								<Trash2 className="h-4 w-4 text-destructive" />
							</Btn>
						</>
					)}
				</div>
			)}

			{/* Paper default cascades onto the content via --qp-editor-font; font
			    marks saved on older papers (inline spans) still override it. */}
			<div
				style={
					defaultFontFamily
						? ({ ['--qp-editor-font']: `'${defaultFontFamily}'` } as React.CSSProperties)
						: undefined
				}
			>
				<EditorContent editor={editor} className="qp-rich-editor" onDoubleClick={onFormulaDoubleClick} />
			</div>

			<EquationEditorDialog
				open={eqOpen}
				onOpenChange={setEqOpen}
				initialLatex={eqInitial}
				onInsert={onEquationInsert}
			/>
		</div>
	)
}

/**
 * A paper carries dozens of these boxes, and every edit anywhere on it — a
 * keystroke, a CO pick — re-renders the whole paper. Each box therefore
 * re-renders only when what it SHOWS changes; a new identity for onChange /
 * onBlur alone is not a reason (the handlers are read through refs, and every
 * caller's handler is keyed by ids, never by a captured question object).
 */
export const QuestionRichEditor = memo(
	QuestionRichEditorImpl,
	(a, b) =>
		a.value === b.value &&
		a.disabled === b.disabled &&
		a.placeholder === b.placeholder &&
		a.className === b.className &&
		a.defaultFontFamily === b.defaultFontFamily &&
		a.variant === b.variant
)

export default QuestionRichEditor
