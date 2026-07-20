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
import { useEffect, useState } from 'react';
import {
  Bold, Italic, Underline as UnderlineIcon, Subscript as SubIcon, Superscript as SupIcon,
  Sigma, Table as TableIcon, Rows3, Columns3, Trash2, Grid2x2Plus, Grid2x2X,
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

function Toolbar({ editor, onOpenEquation }: { editor: Editor; onOpenEquation: () => void }) {
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
    </div>
  );
}

export function QuestionRichEditor({
  value, onChange, onBlur, disabled = false, placeholder = 'Enter the question…', className,
}: Props) {
  const [eqOpen, setEqOpen] = useState(false);
  // LaTeX pre-fill when the caret is on an existing formula (edit vs insert).
  const [eqInitial, setEqInitial] = useState('');

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, code: false, blockquote: false }),
      Underline,
      Subscript,
      Superscript,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      MathInline,
    ],
    content: value || '',
    editable: !disabled,
    onUpdate: ({ editor }) => {
      onChange(editor.isEmpty ? '' : editor.getHTML());
    },
    onBlur: () => onBlur?.(),
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm max-w-none focus:outline-none min-h-[60px] px-3 py-2',
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

  // Keep the editor in sync with external value changes (server reload / row swap).
  useEffect(() => {
    if (!editor) return;
    const current = editor.isEmpty ? '' : editor.getHTML();
    // v2 signature: setContent(content, emitUpdate=false) — don't fire onUpdate
    // on external sync, or a server reload would re-mark the row dirty.
    if (value !== current) editor.commands.setContent(value || '', false);
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  const openEquation = () => {
    if (!editor) return;
    // Editing an existing formula? seed the dialog with its LaTeX.
    const latex = editor.isActive('mathInline') ? editor.getAttributes('mathInline').latex ?? '' : '';
    setEqInitial(latex);
    setEqOpen(true);
  };

  const submitEquation = (latex: string) => {
    if (!editor) return;
    if (editor.isActive('mathInline')) editor.chain().focus().updateMath(latex).run();
    else editor.chain().focus().insertMath(latex).run();
  };

  return (
    <div className={cn('rounded-md border bg-background', disabled && 'opacity-60', className)}>
      {editor && !disabled && <Toolbar editor={editor} onOpenEquation={openEquation} />}
      <EditorContent editor={editor} />
      <EquationEditorDialog
        open={eqOpen}
        onOpenChange={setEqOpen}
        initialLatex={eqInitial}
        onSubmit={submitEquation}
      />
    </div>
  );
}
