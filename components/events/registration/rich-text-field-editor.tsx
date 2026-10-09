'use client';

// components/events/registration/rich-text-field-editor.tsx
//
// The editor behind a 'rich_text' registration field — builder side only.
// Deliberately tiny: bold, italic, underline and text color, nothing else. The
// shared RichTextEditor also offers lists, links and headings, none of which
// RichTextDisplay renders; offering a control whose result the registrant never
// sees would be a lie in the toolbar.
//
// Emits the editor's JSON document (not HTML) — see RichTextDisplay for why.

import { useEffect, useRef } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import { Bold, Italic, Underline as UnderlineIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RichTextDoc } from '@/types/tournament';

// Readable on the form's white card; '' clears the color back to the default.
const COLORS: { value: string; label: string }[] = [
  { value: '', label: 'Default' },
  { value: '#dc2626', label: 'Red' },
  { value: '#ea580c', label: 'Orange' },
  { value: '#16a34a', label: 'Green' },
  { value: '#2563eb', label: 'Blue' },
  { value: '#7c3aed', label: 'Purple' },
];

function MarkButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      // Keep the text selection: a plain click would blur the editor first and
      // the mark would apply to nothing.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted',
        active && 'bg-muted text-foreground'
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const current = (editor.getAttributes('textStyle').color as string | undefined) ?? '';
  return (
    <div className="flex flex-wrap items-center gap-1 border-b bg-muted/30 px-1.5 py-1">
      <MarkButton
        title="Bold (Ctrl+B)"
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-3.5 w-3.5" />
      </MarkButton>
      <MarkButton
        title="Italic (Ctrl+I)"
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-3.5 w-3.5" />
      </MarkButton>
      <MarkButton
        title="Underline (Ctrl+U)"
        active={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon className="h-3.5 w-3.5" />
      </MarkButton>

      <div className="mx-1 h-5 w-px bg-border" />

      <span className="text-xs text-muted-foreground">Text color</span>
      {COLORS.map((c) => (
        <button
          key={c.label}
          type="button"
          title={c.label}
          aria-label={`Text color: ${c.label}`}
          aria-pressed={current.toLowerCase() === c.value}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() =>
            c.value
              ? editor.chain().focus().setColor(c.value).run()
              : editor.chain().focus().unsetColor().run()
          }
          className={cn(
            'h-5 w-5 rounded-full border',
            current.toLowerCase() === c.value && 'ring-2 ring-ring ring-offset-1'
          )}
          // The default swatch shows the page's own text color.
          style={{ backgroundColor: c.value || 'currentColor' }}
        />
      ))}
      <label
        className="flex h-5 cursor-pointer items-center gap-1 text-xs text-muted-foreground"
        title="Any other color"
      >
        <input
          type="color"
          className="h-5 w-6 cursor-pointer rounded border bg-transparent p-0"
          value={/^#[0-9a-f]{6}$/i.test(current) ? current : '#000000'}
          onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
        />
        Custom
      </label>
    </div>
  );
}

export function RichTextFieldEditor({
  value,
  onChange,
}: {
  /** Seeds the editor ONCE; later changes come from the editor itself. */
  value: RichTextDoc | null;
  onChange: (doc: RichTextDoc | null) => void;
}) {
  // The builder's onChange closes over the whole form's state; always call the
  // latest one, or an edit here would write back a stale copy of every field.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    // Tiptap renders on the server otherwise, causing hydration mismatches in
    // the Next.js App Router. Defer the first render to the client.
    immediatelyRender: false,
    // The toolbar reads editor.isActive() during render.
    shouldRerenderOnTransaction: true,
    extensions: [
      // Everything RichTextDisplay cannot render is switched off, so pasted
      // content collapses to plain paragraphs instead of saving structure the
      // registrant would never see. Bold, italic, underline, line breaks and
      // undo history stay on.
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        strike: false,
        link: false,
      }),
      TextStyle,
      Color,
    ],
    content: value ?? '',
    editorProps: {
      attributes: {
        class: 'min-h-[96px] px-3 py-2 text-sm leading-relaxed focus:outline-none [&_p]:my-1',
      },
    },
    onUpdate: ({ editor: e }) =>
      onChangeRef.current(e.isEmpty ? null : (e.getJSON() as RichTextDoc)),
  });

  return (
    <div className="overflow-hidden rounded-md border bg-background">
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
