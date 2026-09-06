'use client';

import 'katex/dist/katex.min.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import katex from 'katex';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { ALL_MATH_GROUPS, type MathToken } from '@/lib/utils/question-papers/math-catalog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fill when editing an existing formula; empty for a new one. */
  initialLatex?: string;
  /** Called with the final LaTeX when the user clicks Insert. */
  onSubmit: (latex: string) => void;
}

/**
 * One-click ready-made formulas for teachers who don't know LaTeX. The simple
 * templates carry a `{…}` slot so the cursor can land inside it (smart-cursor);
 * the quadratic is complete as-is. Rendered as KaTeX chips so the button shows
 * the actual maths, not code.
 */
const QUICK_FORMULAS: { latex: string; title: string }[] = [
  { latex: '\\frac{a}{b}', title: 'Fraction' },
  { latex: '\\sqrt{x}', title: 'Square root' },
  { latex: 'x^{2}', title: 'Power' },
  { latex: 'x_{n}', title: 'Subscript' },
  { latex: '\\sum_{i=1}^{n}', title: 'Summation' },
  { latex: '\\int_{a}^{b}', title: 'Integral' },
  { latex: 'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}', title: 'Quadratic formula' },
];

/** Render a LaTeX snippet to KaTeX HTML for a palette/quick button (never throws). */
function renderChip(latex: string): string | null {
  try {
    return katex.renderToString(latex, { throwOnError: false, output: 'html' });
  } catch {
    return null;
  }
}

/** Small KaTeX preview for a palette button (structures render as math). */
function TokenButton({ token, onPick }: { token: MathToken; onPick: (t: MathToken) => void }) {
  const html = useMemo(() => (token.renderAsMath ? renderChip(token.display) : null), [token]);
  return (
    <button
      type='button'
      title={`${token.title}  ·  ${token.latex}`}
      onClick={() => onPick(token)}
      className='h-9 min-w-9 px-2 inline-flex items-center justify-center rounded border bg-background hover:bg-muted text-sm'
    >
      {html ? (
        <span dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <span className='text-base leading-none'>{token.display}</span>
      )}
    </button>
  );
}

/** A ready-made-formula chip in the "Common" row. */
function QuickButton({ latex, title, onPick }: { latex: string; title: string; onPick: (l: string) => void }) {
  const html = useMemo(() => renderChip(latex), [latex]);
  return (
    <button
      type='button'
      title={title}
      onClick={() => onPick(latex)}
      className='h-9 px-2.5 inline-flex items-center justify-center rounded-md border bg-background hover:bg-muted hover:border-primary/50 text-sm transition-colors'
    >
      {html ? <span dangerouslySetInnerHTML={{ __html: html }} /> : <span>{title}</span>}
    </button>
  );
}

export function EquationEditorDialog({ open, onOpenChange, initialLatex = '', onSubmit }: Props) {
  const [latex, setLatex] = useState(initialLatex);
  // Which palette category is active (Word-style ribbon group).
  const [activeGroup, setActiveGroup] = useState(ALL_MATH_GROUPS[0].groups[0].key);
  // The raw-LaTeX box is opt-in — most teachers never need to see code.
  const [showAdvanced, setShowAdvanced] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset to the incoming formula each time the dialog is (re)opened. If we're
  // editing an existing formula, reveal the code box so its LaTeX is visible.
  useEffect(() => {
    if (open) {
      setLatex(initialLatex);
      setShowAdvanced(!!initialLatex);
    }
  }, [open, initialLatex]);

  // Preview with a friendly, non-scary state machine:
  //   empty      → gentle "it'll appear here" prompt
  //   incomplete → soft "keep going" hint (NOT a red error) while mid-typing
  //   ok         → the rendered equation
  const previewState = useMemo(() => {
    if (!latex.trim()) return { kind: 'empty' as const, html: '' };
    try {
      const html = katex.renderToString(latex, {
        displayMode: true,
        throwOnError: true, // throw so we can detect "not finished yet"
        strict: false,
        output: 'html',
      });
      return { kind: 'ok' as const, html };
    } catch {
      return { kind: 'incomplete' as const, html: '' };
    }
  }, [latex]);

  /**
   * Splice a LaTeX snippet at the cursor. When the code box is visible we keep
   * focus/caret in it; with `selectSlot` we highlight the first `{…}` placeholder
   * so the teacher just types the real value. When the code box is hidden we
   * simply append — palette-only users don't manage a caret.
   */
  const insertSnippet = (snippet: string, selectSlot: boolean) => {
    const ta = taRef.current;
    if (!ta) {
      setLatex((v) => v + snippet);
      return;
    }
    const start = ta.selectionStart ?? latex.length;
    const end = ta.selectionEnd ?? latex.length;
    setLatex(latex.slice(0, start) + snippet + latex.slice(end));
    requestAnimationFrame(() => {
      ta.focus();
      // Select the first non-empty placeholder slot, e.g. the "a" in \frac{a}{b}.
      const slot = selectSlot ? /\{([^{}]+)\}/.exec(snippet) : null;
      if (slot && slot[1]) {
        const s = start + slot.index + 1;
        ta.setSelectionRange(s, s + slot[1].length);
      } else {
        const pos = start + snippet.length;
        ta.setSelectionRange(pos, pos);
      }
    });
  };

  const groups = ALL_MATH_GROUPS.flatMap((s) => s.groups);
  const current = groups.find((g) => g.key === activeGroup) ?? groups[0];

  const submit = () => {
    const trimmed = latex.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-3xl'>
        <DialogHeader>
          <DialogTitle>Equation editor</DialogTitle>
          <p className='text-xs text-muted-foreground'>
            Click a symbol to build your equation — no coding needed. The preview updates as you go.
          </p>
        </DialogHeader>

        {/* Common ready-made formulas — the fastest path for non-LaTeX users. */}
        <div className='flex flex-wrap items-center gap-1'>
          <span className='text-[11px] font-medium text-muted-foreground w-20 shrink-0'>Common</span>
          {QUICK_FORMULAS.map((f) => (
            <QuickButton key={f.title} latex={f.latex} title={f.title} onPick={(l) => insertSnippet(l, true)} />
          ))}
        </div>

        {/* Category ribbon: Structures … then Symbols … */}
        <div className='space-y-2'>
          {ALL_MATH_GROUPS.map((section) => (
            <div key={section.section} className='flex flex-wrap items-center gap-1'>
              <span className='text-[11px] font-medium text-muted-foreground w-20 shrink-0'>
                {section.section}
              </span>
              {section.groups.map((g) => (
                <button
                  key={g.key}
                  type='button'
                  onClick={() => setActiveGroup(g.key)}
                  className={cn(
                    'text-xs px-2 py-1 rounded border',
                    g.key === activeGroup
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-muted'
                  )}
                >
                  {g.label}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Token grid for the active category */}
        <div className='rounded-md border p-2 max-h-40 overflow-y-auto'>
          <div className='flex flex-wrap gap-1'>
            {current.tokens.map((t) => (
              <TokenButton key={t.latex + t.title} token={t} onPick={(tok) => insertSnippet(tok.latex, true)} />
            ))}
          </div>
        </div>

        {/* Big live preview — the primary feedback surface. */}
        <div className='space-y-1'>
          <label className='text-xs font-medium text-muted-foreground'>Preview</label>
          <div className='min-h-[120px] rounded-md border bg-muted/20 flex items-center justify-center px-4 py-3 overflow-x-auto'>
            {previewState.kind === 'ok' ? (
              <span className='text-lg' dangerouslySetInnerHTML={{ __html: previewState.html }} />
            ) : (
              <span className='text-sm text-muted-foreground text-center'>
                {previewState.kind === 'empty'
                  ? 'Your equation will appear here as you build it.'
                  : 'Keep going — this formula isn’t finished yet.'}
              </span>
            )}
          </div>
        </div>

        {/* Advanced: raw LaTeX code, opt-in. */}
        <div className='space-y-1'>
          <button
            type='button'
            onClick={() => setShowAdvanced((v) => !v)}
            className='inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground'
          >
            {showAdvanced ? <ChevronDown className='h-3.5 w-3.5' /> : <ChevronRight className='h-3.5 w-3.5' />}
            Advanced: edit LaTeX code (optional)
          </button>
          {showAdvanced && (
            <Textarea
              ref={taRef}
              value={latex}
              onChange={(e) => setLatex(e.target.value)}
              placeholder='e.g.  x = \frac{a}{b}'
              className='font-mono text-sm min-h-[80px]'
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submit();
              }}
            />
          )}
        </div>

        <DialogFooter>
          <Button variant='outline' size='sm' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size='sm' onClick={submit} disabled={!latex.trim()}>
            Insert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
