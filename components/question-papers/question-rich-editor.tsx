'use client';

import 'katex/dist/katex.min.css';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  Bold, Italic, Underline as UnderlineIcon, Subscript as SubIcon, Superscript as SupIcon,
  Sigma, Table as TableIcon, Rows3, Columns3, Trash2, Grid2x2Plus, Grid2x2X,
  AlignLeft, AlignCenter, AlignRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { MathInline } from './math-node';
import { EquationEditorDialog } from './equation-editor-dialog';

interface Props {
  value: string;
  onChange: (html: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /**
   * Paper-wide default language/font, chosen once in the paper header. Applied as
   * the editor body's base font so every question renders in it live — there is
   * NO per-question font picker. Font marks stored on older papers still render
   * (the FontFamily extension stays loaded) and override this, which keeps the
   * on-screen look in step with the PDF: the renderer reads the same column.
   */
  defaultFontFamily?: string | null;
  /**
   * 'compact' is the MCQ-option flavour: the same authoring contract as a
   * question (bold/italic/underline, sub/superscript, inline equations) minus the
   * table and alignment tools, on a single-line-height box.
   */
  variant?: 'full' | 'compact';
}

/**
 * The empty-document HTML TipTap emits. Normalising all three to '' matters: the
 * completion validator tests for visible text, so an untouched question must
 * stay GENUINELY empty rather than holding a stray '<p></p>'.
 */
const EMPTY_HTML = new Set(['', '<p></p>', '<p><br></p>']);

function normalizeHtml(html: string): string {
  return EMPTY_HTML.has(html) ? '' : html;
}

function TB({
  onClick, active, disabled, icon: Icon, label,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  icon: any;
  label: string;
}) {
  return (
    <Button
      type='button'
      variant='ghost'
      size='sm'
      title={label}
      aria-label={label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // keep the editor selection
      onClick={onClick}
      className={cn('h-7 w-7 p-0', active && 'bg-muted text-foreground')}
    >
      <Icon className='h-3.5 w-3.5' />
    </Button>
  );
}

function Toolbar({
  editor,
  onOpenEquation,
  compact,
}: {
  editor: Editor;
  onOpenEquation: () => void;
  compact?: boolean;
}) {
  const inTable = editor.isActive('table');
  return (
    <div className='flex items-center gap-0.5 flex-wrap border-b bg-muted/30 px-1.5 py-1'>
      <TB icon={Bold} label='Bold' active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()} />
      <TB icon={Italic} label='Italic' active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()} />
      <TB icon={UnderlineIcon} label='Underline' active={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()} />
      <TB icon={SubIcon} label='Subscript' active={editor.isActive('subscript')}
        onClick={() => editor.chain().focus().toggleSubscript().run()} />
      <TB icon={SupIcon} label='Superscript' active={editor.isActive('superscript')}
        onClick={() => editor.chain().focus().toggleSuperscript().run()} />

      <div className='w-px h-5 bg-border mx-1' />

      {/* Equation editor — the Word-style formula palette. */}
      <Button
        type='button' variant='ghost' size='sm'
        title='Insert / edit equation' aria-label='Insert equation'
        onMouseDown={(e) => e.preventDefault()}
        onClick={onOpenEquation}
        className={cn('h-7 px-2 gap-1 text-xs', editor.isActive('mathInline') && 'bg-muted text-foreground')}
      >
        <Sigma className='h-3.5 w-3.5' /> Equation
      </Button>

      {/* An MCQ option is one line of an answer list — alignment and tables would
          only produce output the paper cannot use, so the compact variant stops here. */}
      {!compact && (
        <>
          <div className='w-px h-5 bg-border mx-1' />

          {/* Alignment — position the line (and any equation on it) left / center / right */}
          <TB icon={AlignLeft} label='Align left' active={editor.isActive({ textAlign: 'left' })}
            onClick={() => editor.chain().focus().setTextAlign('left').run()} />
          <TB icon={AlignCenter} label='Align center' active={editor.isActive({ textAlign: 'center' })}
            onClick={() => editor.chain().focus().setTextAlign('center').run()} />
          <TB icon={AlignRight} label='Align right' active={editor.isActive({ textAlign: 'right' })}
            onClick={() => editor.chain().focus().setTextAlign('right').run()} />

          <div className='w-px h-5 bg-border mx-1' />

          {/* Table controls */}
          <TB icon={TableIcon} label='Insert table (2×2)'
            onClick={() => editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run()} />
          {inTable && (
            <>
              <TB icon={Columns3} label='Add column' onClick={() => editor.chain().focus().addColumnAfter().run()} />
              <TB icon={Rows3} label='Add row' onClick={() => editor.chain().focus().addRowAfter().run()} />
              <TB icon={Grid2x2X} label='Delete column' onClick={() => editor.chain().focus().deleteColumn().run()} />
              <TB icon={Grid2x2Plus} label='Delete row' onClick={() => editor.chain().focus().deleteRow().run()} />
              <TB icon={Trash2} label='Delete table' onClick={() => editor.chain().focus().deleteTable().run()} />
            </>
          )}
        </>
      )}
    </div>
  );
}

export function QuestionRichEditor({
  value, onChange, onBlur, disabled = false, placeholder = 'Enter the question…', className,
  defaultFontFamily, variant = 'full',
}: Props) {
  const compact = variant === 'compact';
  const [eqOpen, setEqOpen] = useState(false);
  // LaTeX pre-fill when the caret is on an existing formula (edit vs insert).
  const [eqInitial, setEqInitial] = useState('');
  // Whether the dialog was opened on an existing formula (update) vs a new one (insert).
  const eqEditingRef = useRef(false);
  // The editor selection captured the instant the dialog opened. The Radix modal
  // traps focus and blurs the editor, so we must restore this range before inserting
  // — otherwise the formula lands at a stale position (or nowhere).
  const eqSelectionRef = useRef<{ from: number; to: number } | null>(null);
  // Track the last HTML we emitted so controlled value echoes don't clobber typing.
  const lastEmittedRef = useRef(value);

  const extensions = useMemo(
    () => [
      StarterKit.configure({ heading: false, codeBlock: false, code: false, blockquote: false }),
      Underline,
      Subscript,
      Superscript,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      MathInline,
      // TextStyle carries the font mark FontFamily sets. Neither is exposed as a
      // toolbar control — the font is a PAPER-level choice — but they must stay
      // loaded so inline font marks saved on older papers still render here
      // exactly as the PDF prints them.
      TextStyle,
      FontFamily,
      // Left / center / right alignment for question lines (incl. any inline
      // equation on that line). Emits `style="text-align:…"`, which the COE PDF
      // sanitizer preserves for that one property. Paragraphs only — headings are off.
      TextAlign.configure({ types: ['paragraph'], alignments: ['left', 'center', 'right'] }),
    ],
    []
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: value || '',
    editable: !disabled,
    onUpdate: ({ editor }) => {
      const html = normalizeHtml(editor.getHTML());
      lastEmittedRef.current = html;
      onChange(html);
    },
    onBlur: () => onBlur?.(),
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm max-w-none focus:outline-none',
          compact ? 'min-h-[34px] px-2 py-1' : 'min-h-[70px] px-3 py-2',
          'prose-p:my-1',
          // Tables — visible grid inside the editor
          '[&_table]:border-collapse [&_table]:w-full [&_table]:my-2',
          '[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_td]:align-top',
          '[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:bg-muted/50 [&_th]:font-semibold',
          // Selected formula highlight
          '[&_.qp-math.ProseMirror-selectednode]:outline [&_.qp-math.ProseMirror-selectednode]:outline-2 [&_.qp-math.ProseMirror-selectednode]:outline-primary/60',
          '[&_.qp-math]:cursor-pointer [&_.qp-math]:rounded [&_.qp-math]:px-0.5'
        ),
        'data-placeholder': placeholder,
      },
    },
  });

  // Keep the editor in sync with external value changes (initial seed / row swap).
  useEffect(() => {
    if (!editor) return;
    // Skip echoes of our own onUpdate — parent re-renders must not reset the doc.
    if (value === lastEmittedRef.current) return;
    // NEVER overwrite while the user is typing — background cache updates must not
    // clobber in-progress edits or jump the cursor. Only sync when unfocused.
    if (editor.isFocused) return;
    const current = normalizeHtml(editor.getHTML());
    // v2 signature: setContent(content, emitUpdate=false) — don't fire onUpdate
    // on external sync, or a server reload would re-mark the row dirty.
    // (COE runs TipTap v3, whose signature is setContent(value, { emitUpdate: false });
    // this is the one place the two ports legitimately differ.)
    if (normalizeHtml(value || '') !== current) {
      editor.commands.setContent(value || '', false);
      lastEmittedRef.current = value;
    }
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  const openEquation = () => {
    if (!editor) return;
    // Editing an existing formula? seed the dialog with its LaTeX.
    const editing = editor.isActive('mathInline');
    eqEditingRef.current = editing;
    // Snapshot the caret NOW, while the editor still owns the selection. Once the
    // Radix dialog mounts its focus trap the editor blurs, and although ProseMirror
    // keeps its selection internally, restoring it explicitly makes placement
    // deterministic regardless of where Radix hands focus back on close.
    const { from, to } = editor.state.selection;
    eqSelectionRef.current = { from, to };
    const latex = editing ? editor.getAttributes('mathInline').latex ?? '' : '';
    setEqInitial(latex);
    setEqOpen(true);
  };

  const submitEquation = (latex: string) => {
    if (!editor) return;
    const editing = eqEditingRef.current;
    const sel = eqSelectionRef.current;
    // Defer until AFTER the dialog has closed and released its focus trap. Running
    // the transaction while the modal is still open lets Radix's focus guard revert
    // editor.focus(), which is why "Insert did nothing". requestAnimationFrame fires
    // after React commits the close and Radix tears down its FocusScope.
    requestAnimationFrame(() => {
      let chain = editor.chain().focus();
      // Restore the caret for a fresh insert; for an edit the math node stays selected.
      if (!editing && sel) chain = chain.setTextSelection(sel);
      if (editing) chain.updateMath(latex).run();
      else chain.insertMath(latex).run();
    });
  };

  return (
    <div
      className={cn(
        'rounded-md border bg-background qp-rich-editor-root',
        disabled && 'opacity-60',
        className
      )}
    >
      {editor && !disabled && (
        <Toolbar editor={editor} onOpenEquation={openEquation} compact={compact} />
      )}
      {/* The paper default cascades onto the content through --qp-editor-font;
          inline font marks saved on older papers still override it. */}
      <div
        style={
          defaultFontFamily
            ? ({ ['--qp-editor-font']: `'${defaultFontFamily}'` } as CSSProperties)
            : undefined
        }
      >
        <EditorContent editor={editor} className='qp-rich-editor-body' />
      </div>
      <EquationEditorDialog
        open={eqOpen}
        onOpenChange={setEqOpen}
        initialLatex={eqInitial}
        onSubmit={submitEquation}
      />
    </div>
  );
}
