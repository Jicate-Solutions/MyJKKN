// Copied from COE b34e527 (+ uncommitted working tree), 2026-10-05 — source: components/ia/math-node.ts
// Sync list: docs spec "QP entry methods parity" §10. Diff against COE before changing.
// Tiptap v3 inline atom node for a math formula.
//
// Persistence contract (shared with the PDF renderer lib/ia/build-paper-pdf-html.ts):
//   <span data-latex="LATEX_SOURCE" class="qp-math">…</span>
// We store ONLY the LaTeX source in data-latex. On screen a DOM NodeView renders
// it live via KaTeX (HTML output); the PDF re-renders LaTeX → MathML at print time.
// Never persist KaTeX HTML.

import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Fragment, Slice, type Node as PmNode } from '@tiptap/pm/model'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { splitLatexSegments } from '@/lib/utils/question-papers/latex-paste'

export interface MathOptions {
	HTMLAttributes: Record<string, any>
}

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		mathInline: {
			/** Insert a new formula at the caret. */
			insertMath: (latex: string) => ReturnType
			/** Replace the currently selected formula's LaTeX. */
			updateMath: (latex: string) => ReturnType
		}
	}
}

export const MathInline = Node.create<MathOptions>({
	name: 'mathInline',
	group: 'inline',
	inline: true,
	atom: true,
	selectable: true,

	addOptions() {
		return { HTMLAttributes: {} }
	},

	addAttributes() {
		return {
			latex: {
				default: '',
				parseHTML: (el: HTMLElement) => el.getAttribute('data-latex') || '',
				renderHTML: (attrs: any) => ({ 'data-latex': attrs.latex }),
			},
		}
	},

	parseHTML() {
		return [{ tag: 'span[data-latex]' }]
	},

	/**
	 * The plain-text form of a formula: its LaTeX, in $…$. Without this a copied
	 * formula has NO text on the clipboard, so it could not be pasted into the
	 * equation dialog (or anything that is not this editor), and a copied
	 * sentence lost its formulae outside the editor.
	 */
	renderText({ node }) {
		return node.attrs.latex ? '$' + node.attrs.latex + '$' : ''
	},

	renderHTML({ HTMLAttributes, node }) {
		// Static string child keeps the persisted span human-readable; the PDF
		// renderer reads data-latex and ignores the inner content.
		return [
			'span',
			mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { class: 'qp-math' }),
			node.attrs.latex || '',
		]
	},

	addNodeView() {
		return ({ node }) => {
			const dom = document.createElement('span')
			dom.className = 'qp-math'
			dom.title = 'Double-click to edit this equation'
			dom.setAttribute('data-latex', node.attrs.latex || '')
			const render = (latex: string) => {
				try {
					katex.render(latex || '\\;', dom, { throwOnError: false, displayMode: false })
				} catch {
					dom.textContent = latex
				}
			}
			render(node.attrs.latex || '')
			return {
				dom,
				// Re-render if the same node's latex changes in place.
				update: (updatedNode) => {
					if (updatedNode.type.name !== 'mathInline') return false
					dom.setAttribute('data-latex', updatedNode.attrs.latex || '')
					render(updatedNode.attrs.latex || '')
					return true
				},
			}
		}
	},

	/**
	 * Paste LaTeX as formulas. Plain text carrying $…$, $$…$$, \(…\), \[…\] or a
	 * single bare expression (MathType "Copy as LaTeX", Overleaf, ChatGPT…) is
	 * split into text + mathInline nodes (lib/ia/latex-paste.ts) instead of
	 * landing as raw source. Text without LaTeX falls through to the normal paste.
	 */
	addProseMirrorPlugins() {
		const type = this.type
		return [
			new Plugin({
				key: new PluginKey('mathInlineLatexPaste'),
				props: {
					handlePaste: (view, event) => {
						// A copy made in THIS editor carries its own HTML, formulae and
						// formatting intact — leave it to the normal paste. The LaTeX
						// splitter below is for plain text coming from elsewhere.
						const html = event.clipboardData?.getData('text/html') || ''
						if (/data-pm-slice|data-latex=/.test(html)) return false
						const text = event.clipboardData?.getData('text/plain') || ''
						const segments = splitLatexSegments(text)
						if (!segments) return false

						const { schema } = view.state
						const paragraphs: PmNode[][] = [[]]
						for (const seg of segments) {
							if (seg.kind === 'math') {
								paragraphs[paragraphs.length - 1].push(type.create({ latex: seg.value }))
								continue
							}
							// Line breaks in the surrounding prose start new paragraphs.
							const lines = seg.value.split(/\r?\n/)
							lines.forEach((line, i) => {
								if (i > 0) paragraphs.push([])
								if (line) paragraphs[paragraphs.length - 1].push(schema.text(line))
							})
						}

						const slice =
							paragraphs.length === 1
								? new Slice(Fragment.from(paragraphs[0]), 0, 0)
								: new Slice(
										Fragment.from(
											paragraphs.map(inline => schema.nodes.paragraph.create(null, Fragment.from(inline)))
										),
										1,
										1
									)
						view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView())
						event.preventDefault()
						return true
					},
				},
			}),
		]
	},

	addCommands() {
		return {
			insertMath:
				(latex: string) =>
				({ chain }) =>
					chain().insertContent({ type: this.name, attrs: { latex } }).run(),
			updateMath:
				(latex: string) =>
				({ commands }) =>
					commands.updateAttributes(this.name, { latex }),
		}
	},
})

export default MathInline
