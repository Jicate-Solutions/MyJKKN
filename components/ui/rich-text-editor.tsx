'use client';

import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Link as LinkIcon,
  Unlink,
  Undo,
  Redo,
  Minus,
  Heading1,
  Heading2,
  Heading3,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon
} from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  className?: string;
  /**
   * Show the extended (Word/SOP-style) toolbar — headings, paragraph alignment,
   * and sub/superscript — on top of the basic formatting. Opt-in so existing
   * consumers (notifications, parent portal) keep the compact toolbar.
   */
  extended?: boolean;
}

function ToolbarButton({
  onClick,
  isActive,
  disabled,
  icon: Icon,
  tooltip
}: {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  icon: any;
  tooltip: string;
}) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            onClick={onClick}
            disabled={disabled}
            className={cn(
              'h-7 w-7 p-0',
              isActive && 'bg-muted text-foreground'
            )}
          >
            <Icon className='h-3.5 w-3.5' />
          </Button>
        </TooltipTrigger>
        <TooltipContent side='top' className='text-xs'>
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function Toolbar({ editor, extended = false }: { editor: Editor; extended?: boolean }) {
  const setLink = useCallback(() => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('Enter URL', previousUrl || 'https://');

    if (url === null) return;

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: url })
      .run();
  }, [editor]);

  return (
    <div className='flex items-center gap-0.5 flex-wrap border-b bg-muted/30 px-1.5 py-1'>
      {/* Text Formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
        icon={Bold}
        tooltip='Bold (Ctrl+B)'
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        icon={Italic}
        tooltip='Italic (Ctrl+I)'
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive('underline')}
        icon={UnderlineIcon}
        tooltip='Underline (Ctrl+U)'
      />

      {extended && (
        <>
          <div className='w-px h-5 bg-border mx-1' />
          {/* Headings */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            isActive={editor.isActive('heading', { level: 1 })}
            icon={Heading1}
            tooltip='Heading 1'
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            isActive={editor.isActive('heading', { level: 2 })}
            icon={Heading2}
            tooltip='Heading 2'
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            isActive={editor.isActive('heading', { level: 3 })}
            icon={Heading3}
            tooltip='Heading 3'
          />
        </>
      )}

      <div className='w-px h-5 bg-border mx-1' />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive('bulletList')}
        icon={List}
        tooltip='Bullet List'
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive('orderedList')}
        icon={ListOrdered}
        tooltip='Numbered List'
      />

      {extended && (
        <>
          <div className='w-px h-5 bg-border mx-1' />
          {/* Alignment */}
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            isActive={editor.isActive({ textAlign: 'left' })}
            icon={AlignLeft}
            tooltip='Align Left'
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            isActive={editor.isActive({ textAlign: 'center' })}
            icon={AlignCenter}
            tooltip='Align Center'
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            isActive={editor.isActive({ textAlign: 'right' })}
            icon={AlignRight}
            tooltip='Align Right'
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('justify').run()}
            isActive={editor.isActive({ textAlign: 'justify' })}
            icon={AlignJustify}
            tooltip='Justify'
          />
          <div className='w-px h-5 bg-border mx-1' />
          {/* Sub / Superscript */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleSubscript().run()}
            isActive={editor.isActive('subscript')}
            icon={SubscriptIcon}
            tooltip='Subscript'
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleSuperscript().run()}
            isActive={editor.isActive('superscript')}
            icon={SuperscriptIcon}
            tooltip='Superscript'
          />
        </>
      )}

      <div className='w-px h-5 bg-border mx-1' />

      {/* Link */}
      <ToolbarButton
        onClick={setLink}
        isActive={editor.isActive('link')}
        icon={LinkIcon}
        tooltip='Add Link'
      />
      {editor.isActive('link') && (
        <ToolbarButton
          onClick={() => editor.chain().focus().unsetLink().run()}
          icon={Unlink}
          tooltip='Remove Link'
        />
      )}

      <div className='w-px h-5 bg-border mx-1' />

      {/* Horizontal Rule */}
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        icon={Minus}
        tooltip='Horizontal Line'
      />

      {/* Spacer */}
      <div className='flex-1' />

      {/* Undo/Redo */}
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        icon={Undo}
        tooltip='Undo (Ctrl+Z)'
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        icon={Redo}
        tooltip='Redo (Ctrl+Y)'
      />
    </div>
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write your message...',
  maxLength,
  disabled = false,
  className,
  extended = false
}: RichTextEditorProps) {
  const editor = useEditor({
    // Tiptap renders on the server otherwise, causing hydration mismatches in
    // the Next.js App Router. Defer the first render to the client.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // Extended mode enables Word/SOP-style headings; compact mode keeps the
        // original heading-free behaviour.
        heading: extended ? { levels: [1, 2, 3] } : false,
        codeBlock: false,
        code: false,
        blockquote: false
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 underline cursor-pointer'
        }
      }),
      Placeholder.configure({
        placeholder
      }),
      // Extended-only extensions (alignment + sub/superscript).
      ...(extended
        ? [
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            Subscript,
            Superscript
          ]
        : [])
    ],
    content: value || '',
    editable: !disabled,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      // Return empty string for empty editor instead of <p></p>
      const isEmpty = editor.isEmpty;
      onChange(isEmpty ? '' : html);
    },
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm max-w-none focus:outline-none min-h-[120px] px-3 py-2',
          'prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5',
          '[&_ul]:list-disc [&_ul]:pl-5',
          '[&_ol]:list-decimal [&_ol]:pl-5',
          '[&_a]:text-blue-600 [&_a]:underline',
          '[&_hr]:my-2 [&_hr]:border-border'
        )
      }
    }
  });

  // Sync external value changes (e.g., form reset, edit dialog pre-fill)
  useEffect(() => {
    if (editor && value !== undefined) {
      const currentHTML = editor.getHTML();
      const isEmpty = editor.isEmpty;
      const currentValue = isEmpty ? '' : currentHTML;

      if (value !== currentValue) {
        editor.commands.setContent(value || '');
      }
    }
  }, [editor, value]);

  // Get plain text length for character count
  const textLength = editor?.storage?.characterCount?.characters?.() ??
    editor?.getText()?.length ?? 0;

  return (
    <div
      className={cn(
        'rounded-md border bg-background',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      {editor && <Toolbar editor={editor} extended={extended} />}
      <EditorContent editor={editor} />
      {maxLength && (
        <div className='flex justify-end px-3 py-1 border-t bg-muted/20'>
          <span
            className={cn(
              'text-xs text-muted-foreground',
              textLength > maxLength && 'text-destructive font-medium'
            )}
          >
            {textLength}/{maxLength}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Strips HTML tags and returns plain text.
 * Used for push notifications, BoS minutes-PDF/DOCX narrative blocks,
 * and other plain-text contexts.
 *
 * Entity decoding rules:
 *   • &nbsp; → regular ASCII space. Both jsPDF (Times) and docx render
 *     leading spaces faithfully, so indented bullet lines in the BoS
 *     minutes narrative survive intact ("&nbsp; &nbsp; * 100 Marks…"
 *     becomes "    * 100 Marks…" with the leading indent preserved).
 *   • &amp; is decoded LAST — decoding it first would double-decode strings
 *     like "&amp;nbsp;" (intended to *display* as the literal text "&nbsp;")
 *     into an actual space.
 *   • Numeric entities (&#NNNN; / &#xHHHH;) are decoded generically so
 *     editor outputs containing typographic punctuation (smart quotes,
 *     dashes via &#8217;, &#8211;, etc.) come through correctly.
 */
export function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    // Decode &amp; FIRST so double-encoded entities like "&amp;nbsp;"
    // (TipTap escapes ampersands at save time, so user-typed "&nbsp;"
    // round-trips as "&amp;nbsp;") get unwrapped to "&nbsp;" before the
    // targeted decoders below run. Without this, "&nbsp;" survives as
    // literal text in the rendered PDF/DOCX narrative.
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&hellip;/g, '…')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Safely renders HTML content with sanitized output.
 * Used for displaying rich notifications in-app.
 */
export function RichTextDisplay({
  content,
  className
}: {
  content: string;
  className?: string;
}) {
  if (!content) return null;

  // If content doesn't contain HTML tags, render as plain text preserving whitespace
  if (!/<[a-z][\s\S]*>/i.test(content)) {
    return <span className={cn('whitespace-pre-wrap text-sm leading-relaxed', className)}>{content}</span>;
  }

  return (
    <div
      className={cn(
        'max-w-none text-sm leading-relaxed text-foreground',
        // Paragraphs — TipTap wraps each line in <p>
        '[&_p]:mb-3 [&_p:last-child]:mb-0 [&_p]:leading-relaxed',
        '[&_p:empty]:min-h-[1em]', // preserve empty paragraph spacing (blank lines)
        // Headings
        '[&_h1]:mb-3 [&_h1]:mt-4 [&_h1]:text-xl [&_h1]:font-bold',
        '[&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold',
        '[&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-semibold',
        // Lists
        '[&_ul]:mb-3 [&_ul]:mt-1 [&_ul]:list-disc [&_ul]:pl-5',
        '[&_ol]:mb-3 [&_ol]:mt-1 [&_ol]:list-decimal [&_ol]:pl-5',
        '[&_li]:mb-1 [&_li]:leading-relaxed',
        // Inline styles
        '[&_strong]:font-semibold',
        '[&_em]:italic',
        '[&_u]:underline',
        '[&_s]:line-through',
        // Links
        '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2',
        // Horizontal rule
        '[&_hr]:my-4 [&_hr]:border-border',
        // Blockquote
        '[&_blockquote]:my-3 [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground',
        // Code
        '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs',
        '[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:text-xs',
        className
      )}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
