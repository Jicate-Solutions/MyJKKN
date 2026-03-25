'use client';

import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
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
  Minus
} from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  className?: string;
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

function Toolbar({ editor }: { editor: Editor }) {
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
  className
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
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
      })
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
      {editor && <Toolbar editor={editor} />}
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
 * Used for push notifications and plain-text contexts.
 */
export function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
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

  // If content doesn't contain HTML tags, render as plain text
  if (!/<[a-z][\s\S]*>/i.test(content)) {
    return <span className={className}>{content}</span>;
  }

  return (
    <div
      className={cn(
        'prose prose-sm max-w-none',
        'prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5',
        '[&_ul]:list-disc [&_ul]:pl-5',
        '[&_ol]:list-decimal [&_ol]:pl-5',
        '[&_a]:text-blue-600 [&_a]:underline',
        '[&_hr]:my-2 [&_hr]:border-border',
        className
      )}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
