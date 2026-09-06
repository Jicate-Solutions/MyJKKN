'use client';

// app/(routes)/bos/sop/_components/sop-ribbon.tsx
//
// Word-style tabbed ribbon for the SOP editor. Six task-grouped tabs:
//   Home      — clipboard, fonts, paragraph, styles
//   Insert    — table, image, link, horizontal rule, code, hard break
//   Layout    — orientation, page size, margins, columns (subset)
//   References — table of contents, footnotes (footnotes is stubbed)
//   Review    — comments toggle, find/replace, language switcher
//   View      — zoom, full-screen, print preview
//
// The toolbar receives the editor instance from <SopEditor toolbarSlot={...}>.
// It does NOT own editor state; it issues commands via editor.chain().

import { useEffect, useReducer, useState } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Bold, Italic, Underline as UIUnderline, Strikethrough,
  Subscript as IUSubscript, Superscript as IUSuperscript,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, ListChecks, Quote, Code, Minus, Link as LinkIcon, Image as ImageIcon,
  Table as TableIcon, Heading1, Heading2, Heading3,
  Undo2, Redo2, Eraser, Highlighter, Palette, Type,
  Search, MessageSquare, Languages, Maximize2, Printer, ChevronDown,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import type { TamilInputMode } from '@/lib/sop/tamil-input';

// ── Editor state subscription ──────────────────────────────────────────────
// Tiptap mutates the same Editor instance on every transaction; we force a
// re-render so active-state highlights stay in sync with the cursor.

function useEditorRerender(editor: Editor | null) {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    if (!editor) return;
    const handler = () => force();
    editor.on('selectionUpdate', handler);
    editor.on('transaction', handler);
    return () => {
      editor.off('selectionUpdate', handler);
      editor.off('transaction', handler);
    };
  }, [editor]);
}

// Reusable toggle button — highlights when the corresponding mark/node is active.
function RibbonButton({
  active, disabled, onClick, title, children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type='button'
      size='sm'
      variant='ghost'
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'h-8 w-8 p-0',
        active && 'bg-accent text-accent-foreground'
      )}
    >
      {children}
    </Button>
  );
}

// Group label + content + vertical separator (used between groups in a tab).
function Group({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <>
      <div className='flex flex-col items-center gap-1 px-2'>
        <div className='flex items-center gap-1'>{children}</div>
        <div className='text-[10px] uppercase tracking-wide text-muted-foreground'>{label}</div>
      </div>
      {!last && <Separator orientation='vertical' className='h-12 mx-1' />}
    </>
  );
}

// ── Public props ───────────────────────────────────────────────────────────

export interface SopRibbonProps {
  editor: Editor | null;
  /** Tamil mode controlled by the parent so it persists across re-renders. */
  tamilMode: TamilInputMode;
  onTamilModeChange: (mode: TamilInputMode) => void;
  /** Open the virtual Tamil keyboard popover. */
  onOpenTamilKeyboard?: () => void;
  /** Open the comments side panel. */
  onToggleComments?: () => void;
  /** Open the version-history dialog. */
  onOpenHistory?: () => void;
  /** Trigger an export of the current document. */
  onExport?: (format: 'pdf' | 'docx' | 'html' | 'markdown' | 'txt') => void;
  /** Snapshot save (Save & Snapshot button — separate from autosave). */
  onSnapshot?: () => void;
}

const FONT_FAMILIES = [
  { label: 'Default', value: '' },
  { label: 'Inter', value: 'Inter, sans-serif' },
  { label: 'Noto Sans Tamil', value: '"Noto Sans Tamil", sans-serif' },
  { label: 'Latha (Tamil)', value: 'Latha, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Courier New', value: '"Courier New", monospace' },
];

const HEADING_LEVELS = [
  { label: 'Body Text', level: 0 },
  { label: 'Heading 1', level: 1 },
  { label: 'Heading 2', level: 2 },
  { label: 'Heading 3', level: 3 },
  { label: 'Heading 4', level: 4 },
];

const FONT_SIZES = [
  '8', '9', '10', '11', '12', '14', '16', '18', '20', '24', '28', '32', '36', '48',
];

// Radix <SelectItem> forbids an empty-string value, so "no explicit font /
// size" needs a sentinel. Picking it clears the mark instead of writing it.
const INHERIT = '__inherit__';

// Browsers normalise `style.fontFamily` (quotes, spacing) differently from the
// literal we store, so dropdown matching compares a normalised form.
const normalizeFont = (value: unknown) =>
  String(value ?? '').replace(/["']/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

const TEXT_COLORS = ['#000000', '#374151', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0284c7', '#2563eb', '#7c3aed', '#db2777'];
const HIGHLIGHT_COLORS = ['#fff59d', '#fde68a', '#fca5a5', '#a7f3d0', '#bae6fd', '#c4b5fd', '#f9a8d4'];

export function SopRibbon(props: SopRibbonProps) {
  const { editor, tamilMode, onTamilModeChange } = props;
  const [findOpen, setFindOpen] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');

  useEditorRerender(editor);

  if (!editor) {
    return <div className='border rounded-md bg-muted/30 h-32 animate-pulse' />;
  }

  const chain = () => editor.chain().focus();

  // Font dropdowns mirror the textStyle mark at the cursor/selection, so they
  // read like Word's — move the caret into 20pt Georgia text and the controls
  // follow. useEditorRerender() above re-renders on every selection change.
  const textStyle = editor.getAttributes('textStyle');
  const activeFontFamily =
    FONT_FAMILIES.find(
      (f) => f.value && normalizeFont(f.value) === normalizeFont(textStyle.fontFamily)
    )?.value ?? INHERIT;
  const rawFontSize = String(textStyle.fontSize ?? '').replace(/pt$/i, '');
  const activeFontSize = FONT_SIZES.includes(rawFontSize) ? rawFontSize : INHERIT;

  // ── Helper: file-pick + insert image ─────────────────────────────────────
  const insertImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const src = String(reader.result);
        chain().setImage({ src }).run();
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const insertLink = () => {
    const url = window.prompt('Enter URL', editor.getAttributes('link').href ?? 'https://');
    if (url === null) return;
    if (url === '') {
      chain().unsetLink().run();
    } else {
      chain().extendMarkRange('link').setLink({ href: url }).run();
    }
  };

  const insertTable = () => {
    chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  const setHeading = (level: number) => {
    if (level === 0) chain().setParagraph().run();
    else chain().toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 }).run();
  };

  // Find & replace using ProseMirror text-search.
  const handleReplaceAll = () => {
    if (!findText) return;
    const doc = editor.getJSON();
    const replaceInTree = (node: unknown): unknown => {
      if (typeof node !== 'object' || node === null) return node;
      const n = node as Record<string, unknown>;
      if (n.type === 'text' && typeof n.text === 'string') {
        return { ...n, text: (n.text as string).split(findText).join(replaceText) };
      }
      if (Array.isArray(n.content)) {
        return { ...n, content: (n.content as unknown[]).map(replaceInTree) };
      }
      return n;
    };
    editor.commands.setContent(replaceInTree(doc) as never);
  };

  return (
    <div className='border rounded-md bg-background sticky top-0 z-10 shadow-sm'>
      <Tabs defaultValue='home' className='w-full'>
        <TabsList className='h-auto rounded-none border-b w-full max-w-full justify-start gap-0 bg-muted/40 px-2 py-0 overflow-x-auto [&>button]:shrink-0'>
          <TabsTrigger value='home'       className='rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none'>Home</TabsTrigger>
          <TabsTrigger value='insert'     className='rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none'>Insert</TabsTrigger>
          <TabsTrigger value='layout'     className='rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none'>Layout</TabsTrigger>
          <TabsTrigger value='references' className='rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none'>References</TabsTrigger>
          <TabsTrigger value='review'     className='rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none'>Review</TabsTrigger>
          <TabsTrigger value='view'       className='rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none'>View</TabsTrigger>
        </TabsList>

        {/* ── HOME ─────────────────────────────────────────────────────── */}
        <TabsContent value='home' className='mt-0 px-2 py-2'>
          <div className='flex items-stretch gap-1 overflow-x-auto'>
            <Group label='Undo'>
              <RibbonButton onClick={() => chain().undo().run()} title='Undo (Ctrl+Z)' disabled={!editor.can().undo()}><Undo2 className='h-4 w-4' /></RibbonButton>
              <RibbonButton onClick={() => chain().redo().run()} title='Redo (Ctrl+Y)' disabled={!editor.can().redo()}><Redo2 className='h-4 w-4' /></RibbonButton>
            </Group>

            <Group label='Style'>
              <Select value={String(editor.isActive('heading') ? editor.getAttributes('heading').level : 0)} onValueChange={(v) => setHeading(parseInt(v, 10))}>
                <SelectTrigger className='h-8 w-32 text-xs'>
                  <SelectValue placeholder='Body Text' />
                </SelectTrigger>
                <SelectContent>
                  {HEADING_LEVELS.map((h) => (
                    <SelectItem key={h.level} value={String(h.level)}>{h.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Group>

            <Group label='Font'>
              <Select
                value={activeFontFamily}
                onValueChange={(v) =>
                  v === INHERIT
                    ? chain().unsetFontFamily().run()
                    : chain().setFontFamily(v).run()
                }
              >
                <SelectTrigger className='h-8 w-36 text-xs'>
                  <SelectValue placeholder='Font' />
                </SelectTrigger>
                <SelectContent>
                  {FONT_FAMILIES.map((f) => (
                    <SelectItem key={f.value || INHERIT} value={f.value || INHERIT}>
                      <span style={{ fontFamily: f.value || undefined }}>{f.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={activeFontSize}
                onValueChange={(v) =>
                  v === INHERIT
                    ? chain().unsetFontSize().run()
                    : chain().setFontSize(`${v}pt`).run()
                }
              >
                <SelectTrigger className='h-8 w-[4.5rem] text-xs'>
                  <SelectValue placeholder='Size' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={INHERIT}>Auto</SelectItem>
                  {FONT_SIZES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Group>

            <Group label='Format'>
              <RibbonButton active={editor.isActive('bold')} onClick={() => chain().toggleBold().run()} title='Bold (Ctrl+B)'><Bold className='h-4 w-4' /></RibbonButton>
              <RibbonButton active={editor.isActive('italic')} onClick={() => chain().toggleItalic().run()} title='Italic (Ctrl+I)'><Italic className='h-4 w-4' /></RibbonButton>
              <RibbonButton active={editor.isActive('underline')} onClick={() => chain().toggleUnderline().run()} title='Underline (Ctrl+U)'><UIUnderline className='h-4 w-4' /></RibbonButton>
              <RibbonButton active={editor.isActive('strike')} onClick={() => chain().toggleStrike().run()} title='Strikethrough'><Strikethrough className='h-4 w-4' /></RibbonButton>
              <RibbonButton active={editor.isActive('subscript')} onClick={() => chain().toggleSubscript().run()} title='Subscript'><IUSubscript className='h-4 w-4' /></RibbonButton>
              <RibbonButton active={editor.isActive('superscript')} onClick={() => chain().toggleSuperscript().run()} title='Superscript'><IUSuperscript className='h-4 w-4' /></RibbonButton>
              <Popover>
                <PopoverTrigger asChild>
                  <Button type='button' size='sm' variant='ghost' className='h-8 w-8 p-0' title='Text color'><Palette className='h-4 w-4' /></Button>
                </PopoverTrigger>
                <PopoverContent className='w-auto p-2'>
                  <div className='grid grid-cols-5 gap-1'>
                    {TEXT_COLORS.map((c) => (
                      <button
                        key={c}
                        title={c}
                        onClick={() => chain().setColor(c).run()}
                        className='h-6 w-6 rounded border'
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button type='button' size='sm' variant='ghost' className='h-8 w-8 p-0' title='Highlight'><Highlighter className='h-4 w-4' /></Button>
                </PopoverTrigger>
                <PopoverContent className='w-auto p-2'>
                  <div className='grid grid-cols-4 gap-1'>
                    {HIGHLIGHT_COLORS.map((c) => (
                      <button
                        key={c}
                        title={c}
                        onClick={() => chain().toggleHighlight({ color: c }).run()}
                        className='h-6 w-6 rounded border'
                        style={{ background: c }}
                      />
                    ))}
                    <button title='Remove highlight' onClick={() => chain().unsetHighlight().run()} className='col-span-4 mt-1 text-xs underline'>Remove</button>
                  </div>
                </PopoverContent>
              </Popover>
              <RibbonButton onClick={() => chain().unsetAllMarks().clearNodes().run()} title='Clear formatting'><Eraser className='h-4 w-4' /></RibbonButton>
            </Group>

            <Group label='Paragraph'>
              <RibbonButton active={editor.isActive({ textAlign: 'left' })} onClick={() => chain().setTextAlign('left').run()} title='Align left'><AlignLeft className='h-4 w-4' /></RibbonButton>
              <RibbonButton active={editor.isActive({ textAlign: 'center' })} onClick={() => chain().setTextAlign('center').run()} title='Center'><AlignCenter className='h-4 w-4' /></RibbonButton>
              <RibbonButton active={editor.isActive({ textAlign: 'right' })} onClick={() => chain().setTextAlign('right').run()} title='Align right'><AlignRight className='h-4 w-4' /></RibbonButton>
              <RibbonButton active={editor.isActive({ textAlign: 'justify' })} onClick={() => chain().setTextAlign('justify').run()} title='Justify'><AlignJustify className='h-4 w-4' /></RibbonButton>
              <RibbonButton active={editor.isActive('bulletList')} onClick={() => chain().toggleBulletList().run()} title='Bulleted list'><List className='h-4 w-4' /></RibbonButton>
              <RibbonButton active={editor.isActive('orderedList')} onClick={() => chain().toggleOrderedList().run()} title='Numbered list'><ListOrdered className='h-4 w-4' /></RibbonButton>
              <RibbonButton active={editor.isActive('taskList')} onClick={() => chain().toggleTaskList().run()} title='Task list'><ListChecks className='h-4 w-4' /></RibbonButton>
              <RibbonButton active={editor.isActive('blockquote')} onClick={() => chain().toggleBlockquote().run()} title='Block quote'><Quote className='h-4 w-4' /></RibbonButton>
            </Group>

            <Group label='Headings' last>
              <RibbonButton active={editor.isActive('heading', { level: 1 })} onClick={() => chain().toggleHeading({ level: 1 }).run()} title='Heading 1'><Heading1 className='h-4 w-4' /></RibbonButton>
              <RibbonButton active={editor.isActive('heading', { level: 2 })} onClick={() => chain().toggleHeading({ level: 2 }).run()} title='Heading 2'><Heading2 className='h-4 w-4' /></RibbonButton>
              <RibbonButton active={editor.isActive('heading', { level: 3 })} onClick={() => chain().toggleHeading({ level: 3 }).run()} title='Heading 3'><Heading3 className='h-4 w-4' /></RibbonButton>
            </Group>
          </div>
        </TabsContent>

        {/* ── INSERT ───────────────────────────────────────────────────── */}
        <TabsContent value='insert' className='mt-0 px-2 py-2'>
          <div className='flex items-stretch gap-1 overflow-x-auto'>
            <Group label='Tables'>
              <Button type='button' size='sm' variant='ghost' className='h-8 gap-1' onClick={insertTable} title='Insert table'>
                <TableIcon className='h-4 w-4' /> Table
              </Button>
              <Button type='button' size='sm' variant='ghost' className='h-8' onClick={() => chain().addColumnAfter().run()} disabled={!editor.can().addColumnAfter()}>+Col</Button>
              <Button type='button' size='sm' variant='ghost' className='h-8' onClick={() => chain().addRowAfter().run()} disabled={!editor.can().addRowAfter()}>+Row</Button>
              <Button type='button' size='sm' variant='ghost' className='h-8' onClick={() => chain().deleteColumn().run()} disabled={!editor.can().deleteColumn()}>−Col</Button>
              <Button type='button' size='sm' variant='ghost' className='h-8' onClick={() => chain().deleteRow().run()} disabled={!editor.can().deleteRow()}>−Row</Button>
              <Button type='button' size='sm' variant='ghost' className='h-8' onClick={() => chain().mergeOrSplit().run()} disabled={!editor.can().mergeOrSplit()}>Merge</Button>
              <Button type='button' size='sm' variant='ghost' className='h-8' onClick={() => chain().deleteTable().run()} disabled={!editor.can().deleteTable()}>Delete</Button>
            </Group>

            <Group label='Media'>
              <Button type='button' size='sm' variant='ghost' className='h-8 gap-1' onClick={insertImage} title='Insert image'><ImageIcon className='h-4 w-4' /> Image</Button>
              <Button type='button' size='sm' variant='ghost' className='h-8 gap-1' onClick={insertLink} title='Insert link'><LinkIcon className='h-4 w-4' /> Link</Button>
            </Group>

            <Group label='Blocks' last>
              <Button type='button' size='sm' variant='ghost' className='h-8 gap-1' onClick={() => chain().setHorizontalRule().run()} title='Horizontal rule'><Minus className='h-4 w-4' /> Rule</Button>
              <Button type='button' size='sm' variant='ghost' className='h-8 gap-1' onClick={() => chain().toggleCodeBlock().run()} title='Code block'><Code className='h-4 w-4' /> Code</Button>
              <Button type='button' size='sm' variant='ghost' className='h-8 gap-1' onClick={() => chain().setHardBreak().run()} title='Line break'>↵ Break</Button>
              <Button type='button' size='sm' variant='ghost' className='h-8 gap-1' onClick={() => chain().insertContent({ type: 'text', text: new Date().toLocaleString() }).run()} title='Insert date/time'>🕒 Date</Button>
            </Group>
          </div>
        </TabsContent>

        {/* ── LAYOUT ───────────────────────────────────────────────────── */}
        <TabsContent value='layout' className='mt-0 px-2 py-2'>
          <div className='flex items-stretch gap-1 overflow-x-auto text-xs text-muted-foreground'>
            <Group label='Page'>
              <span>Layout settings live on the document’s <em>page_settings</em> JSON. Use the Document Settings dialog (top-right) to change page size, orientation, margins, headers, footers, and watermarks.</span>
            </Group>
          </div>
        </TabsContent>

        {/* ── REFERENCES ──────────────────────────────────────────────── */}
        <TabsContent value='references' className='mt-0 px-2 py-2'>
          <div className='flex items-stretch gap-1 overflow-x-auto'>
            <Group label='ToC' last>
              <Button
                type='button'
                size='sm'
                variant='ghost'
                className='h-8'
                onClick={() => {
                  // Build a Markdown-style ToC from the headings already in the doc.
                  const headings: Array<{ level: number; text: string }> = [];
                  editor.state.doc.descendants((node) => {
                    if (node.type.name === 'heading') {
                      headings.push({ level: node.attrs.level as number, text: node.textContent });
                    }
                    return true;
                  });
                  if (headings.length === 0) {
                    window.alert('Add at least one heading to generate a Table of Contents.');
                    return;
                  }
                  chain().insertContent('<h2>Table of Contents</h2>').run();
                  headings.forEach((h) => {
                    chain().insertContent(`<p>${'  '.repeat(Math.max(0, h.level - 1))}• ${h.text}</p>`).run();
                  });
                }}
              >
                Generate Table of Contents
              </Button>
              <span className='text-xs text-muted-foreground self-center ml-2'>Footnotes / citations / bibliography arrive in Phase 2.</span>
            </Group>
          </div>
        </TabsContent>

        {/* ── REVIEW ──────────────────────────────────────────────────── */}
        <TabsContent value='review' className='mt-0 px-2 py-2'>
          <div className='flex items-stretch gap-1 overflow-x-auto'>
            <Group label='Find'>
              <Popover open={findOpen} onOpenChange={setFindOpen}>
                <PopoverTrigger asChild>
                  <Button type='button' size='sm' variant='ghost' className='h-8 gap-1'><Search className='h-4 w-4' /> Find / Replace</Button>
                </PopoverTrigger>
                <PopoverContent className='w-72'>
                  <div className='space-y-2'>
                    <Input placeholder='Find' value={findText} onChange={(e) => setFindText(e.target.value)} />
                    <Input placeholder='Replace with' value={replaceText} onChange={(e) => setReplaceText(e.target.value)} />
                    <Button type='button' size='sm' className='w-full' onClick={handleReplaceAll}>Replace all</Button>
                  </div>
                </PopoverContent>
              </Popover>
            </Group>

            {/* Comments is SOP-specific (backed by bos_sop_comments). Only
                render when the host wires onToggleComments — the minutes editor
                reuses this ribbon but has no comments backing, so it omits it. */}
            {props.onToggleComments && (
              <Group label='Comments'>
                <Button type='button' size='sm' variant='ghost' className='h-8 gap-1' onClick={() => props.onToggleComments?.()}><MessageSquare className='h-4 w-4' /> Comments</Button>
              </Group>
            )}

            <Group label='Language' last>
              <Select value={tamilMode} onValueChange={(v) => onTamilModeChange(v as TamilInputMode)}>
                <SelectTrigger className='h-8 w-44 text-xs'>
                  <Languages className='h-4 w-4 mr-1 inline-block' />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='english'>English (default)</SelectItem>
                  <SelectItem value='phonetic'>Tamil (Phonetic)</SelectItem>
                  <SelectItem value='tamil99'>Tamil99 keyboard</SelectItem>
                </SelectContent>
              </Select>
              <Button type='button' size='sm' variant='ghost' className='h-8' onClick={() => props.onOpenTamilKeyboard?.()} title='On-screen Tamil keyboard'>
                <Type className='h-4 w-4 mr-1' /> Tamil Keys
              </Button>
            </Group>
          </div>
        </TabsContent>

        {/* ── VIEW ────────────────────────────────────────────────────── */}
        <TabsContent value='view' className='mt-0 px-2 py-2'>
          <div className='flex items-stretch gap-1 overflow-x-auto'>
            <Group label='View'>
              <Button type='button' size='sm' variant='ghost' className='h-8 gap-1' onClick={() => document.documentElement.requestFullscreen?.()}><Maximize2 className='h-4 w-4' /> Full screen</Button>
              <Button type='button' size='sm' variant='ghost' className='h-8 gap-1' onClick={() => window.print()}><Printer className='h-4 w-4' /> Print preview</Button>
            </Group>

            {/* Version history + Snapshot are SOP-specific (bos_sop_versions).
                Hidden when the host wires neither callback. */}
            {(props.onOpenHistory || props.onSnapshot) && (
              <Group label='History'>
                {props.onOpenHistory && (
                  <Button type='button' size='sm' variant='ghost' className='h-8' onClick={() => props.onOpenHistory?.()}>Version history</Button>
                )}
                {props.onSnapshot && (
                  <Button type='button' size='sm' variant='ghost' className='h-8' onClick={() => props.onSnapshot?.()}>Save & Snapshot</Button>
                )}
              </Group>
            )}

            {/* Multi-format export is backed by SOP-only export routes. */}
            {props.onExport && (
              <Group label='Export' last>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type='button' size='sm' variant='ghost' className='h-8 gap-1'>Export <ChevronDown className='h-3 w-3' /></Button>
                  </PopoverTrigger>
                  <PopoverContent className='w-44 p-1'>
                    {(['pdf', 'docx', 'html', 'markdown', 'txt'] as const).map((f) => (
                      <Button key={f} type='button' size='sm' variant='ghost' className='w-full justify-start' onClick={() => props.onExport?.(f)}>
                        {f.toUpperCase()}
                      </Button>
                    ))}
                  </PopoverContent>
                </Popover>
              </Group>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
