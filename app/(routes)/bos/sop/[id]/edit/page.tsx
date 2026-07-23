'use client';

// app/(routes)/bos/sop/[id]/edit/page.tsx
//
// Editor screen. Composes:
//   - Top metadata bar (title, status, language, autosave indicator)
//   - SopRibbon (Word-style toolbar)
//   - SopEditor (Tiptap surface)
//   - Side panels: comments, version history, Tamil keyboard
//
// Persistence model:
//   - Every keystroke updates local state; an autosave timer (debounced 1.5s)
//     PUTs the content with snapshot=false.
//   - "Save & Snapshot" button issues PUT with snapshot=true, bumping
//     current_version and writing into bos_sop_versions.

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Editor } from '@tiptap/react';
import { ArrowLeft, Loader2, Save, History, MessageSquare } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'react-hot-toast';

import { useBosSopDocument, useUpdateBosSopDocument } from '@/hooks/bos/use-bos-sop';
import {
  SOP_STATUSES, SOP_STATUS_LABELS, type SopDocContent, type SopStatus,
} from '@/types/bos-sop';

import { SopEditor } from '../../_components/sop-editor';
import { SopRibbon } from '../../_components/sop-ribbon';
import { SopTamilKeyboard } from '../../_components/sop-tamil-keyboard';
import { SopCommentsPanel } from '../../_components/sop-comments-panel';
import { SopVersionHistory } from '../../_components/sop-version-history';
import type { TamilInputMode } from '@/lib/sop/tamil-input';
import { downloadSopExport } from '@/lib/sop/download';

const AUTOSAVE_DEBOUNCE_MS = 1500;

export default function EditSopPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const { data: doc, isLoading, error } = useBosSopDocument(id);
  const update = useUpdateBosSopDocument();

  // Local mirror of editable fields. Initialised once `doc` is fetched.
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<SopStatus>('draft');
  const [content, setContent] = useState<SopDocContent | null>(null);
  const [tamilMode, setTamilMode] = useState<TamilInputMode>('english');
  const [tamilOpen, setTamilOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [autosaveState, setAutosaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  // Editor instance lifted from <SopEditor> via onEditorReady. Used by the
  // Tamil virtual keyboard to insert characters at the cursor.
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);

  const initialised = useRef(false);
  useEffect(() => {
    if (doc && !initialised.current) {
      setTitle(doc.title);
      setStatus(doc.status);
      setContent(doc.content);
      initialised.current = true;
    }
  }, [doc]);

  // ── Autosave ─────────────────────────────────────────────────────────────
  // Debounce content/title/status changes; PUT once activity settles.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSig = useRef<string>('');

  const queueAutosave = useCallback(
    (next: { title?: string; status?: SopStatus; content?: SopDocContent }) => {
      if (!doc) return;
      const sig = JSON.stringify({
        t: next.title ?? title,
        s: next.status ?? status,
        c: next.content ?? content,
      });
      // Skip if nothing changed since the last successful save.
      if (sig === lastSavedSig.current) return;

      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        setAutosaveState('saving');
        try {
          await update.mutateAsync({
            id: doc.id,
            data: {
              title: next.title ?? title,
              status: next.status ?? status,
              content: next.content ?? content ?? undefined,
              snapshot: false,
            },
          });
          lastSavedSig.current = sig;
          setAutosaveState('saved');
          // Settle indicator back to idle after 2s.
          setTimeout(() => setAutosaveState('idle'), 2000);
        } catch (err) {
          setAutosaveState('error');
          toast.error(err instanceof Error ? err.message : 'Autosave failed');
        }
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [doc, title, status, content, update]
  );

  const onContentChange = useCallback(
    (next: SopDocContent) => {
      setContent(next);
      queueAutosave({ content: next });
    },
    [queueAutosave]
  );

  // ── Snapshot ─────────────────────────────────────────────────────────────
  const handleSnapshot = async () => {
    if (!doc) return;
    const note = window.prompt('Snapshot note (optional):', '') ?? undefined;
    try {
      const updated = await update.mutateAsync({
        id: doc.id,
        data: {
          title,
          status,
          content: content ?? undefined,
          snapshot: true,
          snapshot_note: note,
        },
      });
      toast.success(`Saved as v${updated.current_version}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Snapshot failed');
    }
  };

  // ── Export ──────────────────────────────────────────────────────────────
  const handleExport = async (format: 'pdf' | 'docx' | 'html' | 'markdown' | 'txt') => {
    if (!doc) return;
    try {
      await downloadSopExport(doc.id, doc.title, format);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `${format.toUpperCase()} export failed`);
    }
  };

  const initialContent = useMemo<SopDocContent>(
    () => doc?.content ?? { type: 'doc', content: [] },
    // We only want the initial mount value — subsequent edits flow via state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc?.id]
  );

  if (isLoading) {
    return (
      <div className='space-y-3'>
        <Skeleton className='h-10 w-48' />
        <Skeleton className='h-12 w-full' />
        <Skeleton className='h-[600px] w-full' />
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className='py-10 text-center text-sm text-muted-foreground'>
        SOP document not found or you don’t have access.
        <div className='mt-3'>
          <Button onClick={() => router.push('/bos/sop')}>Back to list</Button>
        </div>
      </div>
    );
  }

  return (
    <div className='space-y-3'>
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
        <div className='flex items-center gap-2 flex-1 min-w-0'>
          <Button variant='ghost' size='sm' onClick={() => router.push('/bos/sop')} className='shrink-0'>
            <ArrowLeft className='h-4 w-4' />
          </Button>
          <Input
            value={title}
            onChange={(e) => { setTitle(e.target.value); queueAutosave({ title: e.target.value }); }}
            className='font-semibold text-base h-9 flex-1 min-w-0'
            placeholder='Document title'
          />
          <Select
            value={status}
            onValueChange={(v) => {
              const s = v as SopStatus;
              setStatus(s);
              queueAutosave({ status: s });
            }}
          >
            <SelectTrigger className='w-32 h-9 shrink-0'><SelectValue /></SelectTrigger>
            <SelectContent>
              {SOP_STATUSES.map((s) => <SelectItem key={s} value={s}>{SOP_STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className='flex items-center gap-2 shrink-0'>
          {/* Autosave indicator. Idle hides the chip. */}
          {autosaveState === 'saving' && (
            <Badge variant='secondary' className='gap-1'>
              <Loader2 className='h-3 w-3 animate-spin' /> Saving…
            </Badge>
          )}
          {autosaveState === 'saved' && <Badge variant='secondary'>Saved</Badge>}
          {autosaveState === 'error' && <Badge variant='destructive'>Save failed</Badge>}
          <Button size='sm' variant='outline' onClick={() => setHistoryOpen(true)}>
            <History className='h-4 w-4 mr-1' /> History (v{doc.current_version})
          </Button>
          <Button size='sm' variant='outline' onClick={() => setCommentsOpen(true)}>
            <MessageSquare className='h-4 w-4 mr-1' /> Comments
          </Button>
          <Button size='sm' onClick={handleSnapshot} disabled={update.isPending}>
            <Save className='h-4 w-4 mr-1' /> Save & Snapshot
          </Button>
        </div>
      </div>

      {/* ── Editor ──────────────────────────────────────────────────── */}
      <SopEditor
        initialContent={initialContent}
        tamilMode={tamilMode}
        onChange={onContentChange}
        onEditorReady={setEditorInstance}
        toolbarSlot={(editor) => (
          <SopRibbon
            editor={editor}
            tamilMode={tamilMode}
            onTamilModeChange={setTamilMode}
            onOpenTamilKeyboard={() => setTamilOpen(true)}
            onToggleComments={() => setCommentsOpen(true)}
            onOpenHistory={() => setHistoryOpen(true)}
            onSnapshot={handleSnapshot}
            onExport={handleExport}
          />
        )}
        footerSlot={(editor) =>
          editor ? (
            <div className='flex items-center justify-between px-2 text-xs text-muted-foreground'>
              <span>{editor.storage.characterCount?.characters?.() ?? 0} characters · {editor.storage.characterCount?.words?.() ?? 0} words</span>
              <span>Mode: {tamilMode === 'english' ? 'English' : tamilMode === 'phonetic' ? 'Tamil (Phonetic)' : 'Tamil99'}</span>
            </div>
          ) : null
        }
      />

      {/* ── Side panels / dialogs ───────────────────────────────────── */}
      <SopTamilKeyboard editor={editorInstance} open={tamilOpen} onOpenChange={setTamilOpen} />
      <SopCommentsPanel documentId={doc.id} open={commentsOpen} onOpenChange={setCommentsOpen} />
      <SopVersionHistory documentId={doc.id} open={historyOpen} onOpenChange={setHistoryOpen} />
    </div>
  );
}
