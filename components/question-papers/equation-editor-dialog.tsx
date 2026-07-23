'use client';

import 'katex/dist/katex.min.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import katex from 'katex';
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

/** Small KaTeX preview for a palette button (structures render as math). */
function TokenButton({ token, onPick }: { token: MathToken; onPick: (t: MathToken) => void }) {
  const html = useMemo(() => {
    if (!token.renderAsMath) return null;
    try {
      return katex.renderToString(token.display, { throwOnError: false, output: 'html' });
    } catch {
      return null;
    }
  }, [token]);

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

export function EquationEditorDialog({ open, onOpenChange, initialLatex = '', onSubmit }: Props) {
  const [latex, setLatex] = useState(initialLatex);
  // Which palette category is active (Word-style ribbon group).
  const [activeGroup, setActiveGroup] = useState(ALL_MATH_GROUPS[0].groups[0].key);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset to the incoming formula each time the dialog is (re)opened.
  useEffect(() => {
    if (open) setLatex(initialLatex);
  }, [open, initialLatex]);

  const preview = useMemo(() => {
    try {
      return katex.renderToString(latex || '\\;', {
        displayMode: true,
        throwOnError: false,
        output: 'html',
        strict: false,
      });
    } catch {
      return '<span class="text-destructive text-sm">Invalid formula</span>';
    }
  }, [latex]);

  /** Splice a token's LaTeX at the cursor (or append), keeping focus in the field. */
  const insertToken = (t: MathToken) => {
    const ta = taRef.current;
    const snippet = t.latex;
    if (!ta) {
      setLatex((v) => v + snippet);
      return;
    }
    const start = ta.selectionStart ?? latex.length;
    const end = ta.selectionEnd ?? latex.length;
    const next = latex.slice(0, start) + snippet + latex.slice(end);
    setLatex(next);
    // Restore caret just after the inserted snippet on the next tick.
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + snippet.length;
      ta.setSelectionRange(pos, pos);
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
        </DialogHeader>

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
        <div className='rounded-md border p-2 max-h-48 overflow-y-auto'>
          <div className='flex flex-wrap gap-1'>
            {current.tokens.map((t) => (
              <TokenButton key={t.latex + t.title} token={t} onPick={insertToken} />
            ))}
          </div>
        </div>

        {/* LaTeX source + live preview */}
        <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
          <div className='space-y-1'>
            <label className='text-xs font-medium text-muted-foreground'>LaTeX</label>
            <Textarea
              ref={taRef}
              value={latex}
              onChange={(e) => setLatex(e.target.value)}
              placeholder='e.g.  x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}'
              className='font-mono text-sm min-h-[90px]'
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submit();
              }}
            />
          </div>
          <div className='space-y-1'>
            <label className='text-xs font-medium text-muted-foreground'>Preview</label>
            <div
              className='min-h-[90px] rounded-md border bg-muted/20 flex items-center justify-center px-3 overflow-x-auto'
              dangerouslySetInnerHTML={{ __html: preview }}
            />
          </div>
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
