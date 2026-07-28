import { Node, mergeAttributes } from '@tiptap/core';
import katex from 'katex';

/**
 * Inline math node backed by KaTeX.
 *
 * The node stores ONE thing — the LaTeX source — as `data-latex`. That is the
 * single source of truth shared across every surface:
 *   - editor:   a DOM NodeView renders the LaTeX live with KaTeX
 *   - stored:   getHTML() emits `<span data-latex="…" class="qp-math">`
 *   - PDF (COE): the same `data-latex` is expanded by KaTeX server-side
 *
 * It is an ATOM (indivisible) inline node: the cursor treats a formula as a
 * single character, so authors can type prose around it naturally.
 */

export interface MathInlineOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mathInline: {
      /** Insert a formula at the cursor. */
      insertMath: (latex: string) => ReturnType;
      /** Replace the currently-selected formula's LaTeX. */
      updateMath: (latex: string) => ReturnType;
    };
  }
}

/** Render LaTeX → HTML string, degrading to a visible error chip on bad input. */
export function renderMathToHtml(latex: string, displayMode = false): string {
  try {
    return katex.renderToString(latex || '', {
      displayMode,
      throwOnError: false,
      output: 'html',
      strict: false,
    });
  } catch {
    return `<span class="qp-math-error">${escapeHtml(latex)}</span>`;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const MathInline = Node.create<MathInlineOptions>({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-latex') ?? '',
        renderHTML: (attrs) => ({ 'data-latex': attrs.latex }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-latex]' }];
  },

  renderHTML({ HTMLAttributes }) {
    // Stored representation: carries the LaTeX so any consumer can re-render it.
    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { class: 'qp-math' }),
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span');
      dom.className = 'qp-math';
      dom.setAttribute('data-latex', node.attrs.latex ?? '');
      dom.innerHTML = renderMathToHtml(node.attrs.latex ?? '', false);
      return { dom };
    };
  },

  addCommands() {
    return {
      insertMath:
        (latex: string) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { latex } }),
      updateMath:
        (latex: string) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { latex }),
    };
  },
});
