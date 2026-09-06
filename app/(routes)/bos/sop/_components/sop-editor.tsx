'use client';

// app/(routes)/bos/sop/_components/sop-editor.tsx
//
// Tiptap editor shell wired with the full set of Word-style extensions:
// headings, paragraph alignment, lists/tasks, tables, images, links, color,
// font family, highlighting, sub/super-script, character count, typography
// auto-correct, blockquotes, code blocks, horizontal rule.
//
// Tamil typing modes are implemented as a keyboard event interceptor on the
// editable surface — see handleKeyDown(). Switching modes is just state.

import { Editor, EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import CharacterCount from '@tiptap/extension-character-count';
import Typography from '@tiptap/extension-typography';
import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react';

import type { SopDocContent } from '@/types/bos-sop';
import { FontSize } from '@/lib/sop/font-size';
import {
  tamil99Lookup,
  transliteratePhonetic,
  type TamilInputMode,
} from '@/lib/sop/tamil-input';

// ── Public props ───────────────────────────────────────────────────────────

export interface SopEditorProps {
  /** Initial document. Accepts Tiptap JSON (the SOP shape) OR an HTML string —
   * Tiptap's `content` option parses either. The HTML form lets non-SOP callers
   * (e.g. the BoS meeting-minutes editor, which persists `narrative_html`)
   * reuse this surface without first converting their HTML to JSON. */
  initialContent: SopDocContent | string;
  readOnly?: boolean;
  tamilMode?: TamilInputMode;
  /** Empty-doc placeholder. Defaults to the SOP prompt. */
  placeholder?: string;
  onChange?: (doc: SopDocContent) => void;
  /** Fires once the Tiptap editor is mounted, and again with null on unmount.
   * Lets the parent route share the editor instance with side panels (Tamil
   * keyboard, comments anchored to selection, etc.). */
  onEditorReady?: (editor: Editor | null) => void;
  /** Renders above the editor; receives the editor instance for command wiring. */
  toolbarSlot?: (editor: Editor | null) => React.ReactNode;
  /** Renders below the editor; receives the editor instance. */
  footerSlot?: (editor: Editor | null) => React.ReactNode;
}

export function SopEditor(props: SopEditorProps) {
  const {
    initialContent,
    readOnly = false,
    tamilMode = 'english',
    placeholder = 'Start typing your SOP…',
    onChange,
    toolbarSlot,
    footerSlot,
  } = props;

  const extensions = useMemo(
    () => [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
      Placeholder.configure({ placeholder }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
      FontFamily,
      // Local extension — Tiptap ships no font-size package; without it the
      // ribbon's size dropdown writes an attribute the schema would drop.
      FontSize,
      Highlight.configure({ multicolor: true }),
      Image,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      Subscript,
      Superscript,
      CharacterCount,
      Typography,
    ],
    [placeholder]
  );

  const editor = useEditor({
    extensions,
    content: initialContent,
    editable: !readOnly,
    immediatelyRender: false, // Next.js SSR safety
    onUpdate: ({ editor: ed }) => {
      onChange?.(ed.getJSON() as SopDocContent);
    },
  });

  // Keep `editable` in sync with prop changes (read-only ↔ edit toggle).
  useEffect(() => {
    if (editor) editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  // Surface the editor instance to the parent. The cleanup pass (null on
  // unmount) lets the parent clear references so callers don't hold onto a
  // destroyed editor.
  useEffect(() => {
    props.onEditorReady?.(editor);
    return () => {
      props.onEditorReady?.(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // Phonetic transliteration accumulates Roman letters and commits on
  // word-boundary keystrokes so partial matches don't fire prematurely.
  const phoneticBuffer = useRef('');

  // Reset the buffer whenever the mode changes so a stray buffer from a
  // previous mode can't leak into the next session.
  useEffect(() => {
    phoneticBuffer.current = '';
  }, [tamilMode]);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (readOnly || !editor) return;
    const key = e.key;

    if (tamilMode === 'tamil99') {
      if (key.length === 1) {
        const replacement = tamil99Lookup(key, e.shiftKey);
        if (replacement) {
          e.preventDefault();
          editor.chain().focus().insertContent(replacement).run();
        }
      }
      return;
    }

    if (tamilMode === 'phonetic') {
      if (key.length === 1 && /[A-Za-z]/.test(key)) {
        phoneticBuffer.current += key;
        return;
      }
      if (phoneticBuffer.current) {
        e.preventDefault();
        const tamil = transliteratePhonetic(phoneticBuffer.current);
        phoneticBuffer.current = '';
        const trailing = key.length === 1 ? key : '';
        editor.chain().focus().insertContent(tamil + trailing).run();
        if (key === 'Enter') {
          editor.chain().focus().splitBlock().run();
        }
      }
    }
    // English mode → fall through to the browser / Tiptap default.
  };

  return (
    <div className='flex flex-col gap-2'>
      {toolbarSlot?.(editor)}
      <div className='rounded-md border bg-white shadow-sm dark:bg-zinc-900 dark:border-zinc-800'>
        <div
          onKeyDownCapture={handleKeyDown}
          className='
            mx-auto max-w-[210mm] min-h-[800px] px-12 py-10
            prose prose-zinc max-w-none
            prose-headings:font-semibold
            prose-table:border prose-th:border prose-td:border
            prose-th:bg-zinc-50 prose-th:p-2 prose-td:p-2
            dark:prose-invert
            focus-within:outline-none
            [&_.ProseMirror]:outline-none
            [&_.ProseMirror]:min-h-[700px]
            [&_.ProseMirror_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]
            [&_.ProseMirror_p.is-editor-empty:first-child]:before:text-zinc-400
            [&_.ProseMirror_p.is-editor-empty:first-child]:before:float-left
            [&_.ProseMirror_p.is-editor-empty:first-child]:before:pointer-events-none
            [&_.ProseMirror_p.is-editor-empty:first-child]:before:h-0
          '
        >
          <EditorContent editor={editor} />
        </div>
      </div>
      {footerSlot?.(editor)}
    </div>
  );
}
