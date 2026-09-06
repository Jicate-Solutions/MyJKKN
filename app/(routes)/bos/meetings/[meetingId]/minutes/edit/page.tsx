'use client';

// app/(routes)/bos/meetings/[meetingId]/minutes/edit/page.tsx
//
// Full-page, Word-style editor for a BoS meeting's minutes NARRATIVE. Mirrors
// the SOP editor (bos/sop/[id]/edit) and reuses its Tiptap surface + ribbon +
// Tamil keyboard, but is scoped to just the free-form narrative body.
//
// Why a dedicated route (not the Minutes tab):
//   - The narrative is prose and deserves the A4 writing surface; the tab keeps
//     the structured "Suggested Changes" list, which is form-style data.
//
// Persistence model:
//   - Minutes live in bos_meetings.minutes_content (JSONB) as
//       { narrative_html, changes_log }.
//   - This editor owns only narrative_html. It writes HTML (editor.getHTML())
//     because the PDF/DOCX generators read narrative_html directly — we do NOT
//     switch the column to Tiptap JSON.
//   - The PUT /api/bos/meetings/[id] route sets the minutes_content column
//     WHOLESALE, so every save must re-send the existing changes_log or it
//     would be wiped. We merge it from the freshest meeting row via a ref.
//   - Debounced autosave (1.5s), plus an explicit Save button.

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Editor } from '@tiptap/react';
import { ArrowLeft, Loader2, Save, Lock } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

import { useBosMeeting, useUpdateBosMeeting } from '@/hooks/bos/use-bos-meetings';
import { usePermissions } from '@/hooks/use-permissions';
import type {
  BosMinutesChangeLogEntry,
  UpdateBosMeetingDto,
} from '@/types/bos';

import { SopEditor } from '@/app/(routes)/bos/sop/_components/sop-editor';
import { SopRibbon } from '@/app/(routes)/bos/sop/_components/sop-ribbon';
import { SopTamilKeyboard } from '@/app/(routes)/bos/sop/_components/sop-tamil-keyboard';
import type { TamilInputMode } from '@/lib/sop/tamil-input';

const AUTOSAVE_DEBOUNCE_MS = 1500;

export default function EditMeetingMinutesPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = use(params);
  const router = useRouter();
  const { canAccess, isSuperAdmin } = usePermissions();

  const { data: meeting, isLoading, error } = useBosMeeting(meetingId);
  const update = useUpdateBosMeeting();

  const [tamilMode, setTamilMode] = useState<TamilInputMode>('english');
  const [tamilOpen, setTamilOpen] = useState(false);
  const [autosaveState, setAutosaveState] =
    useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  // Editor instance lifted from <SopEditor>. Held in state so the Tamil virtual
  // keyboard re-renders once the editor mounts. We persist HTML (editor emits
  // JSON via onChange), so on each change we snapshot getHTML() into a ref that
  // outlives the editor — the debounce/unmount flush read that, not the editor
  // (SopEditor nulls the instance on unmount before our cleanup runs).
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);
  // Synchronous mirror of the editor for the change/save closures (state is set
  // async; a ref is always current the instant the editor mounts).
  const editorRef = useRef<Editor | null>(null);
  const backToMeeting = () => router.push(`/bos/meetings/${meetingId}`);

  // ── Edit gate ─────────────────────────────────────────────────────────────
  // Same permission as the detail page, plus the lifecycle lock: once minutes
  // are approved or the meeting is ratified they are formally accepted (and V2
  // syllabi were auto-forked), so editing is disabled — read-only view only.
  const lifecycleLocked =
    meeting?.status === 'minutes_approved' || meeting?.status === 'ratified';
  const canEdit =
    (isSuperAdmin || canAccess('academic.bos-meetings', 'edit')) && !lifecycleLocked;

  // ── changes_log preservation ────────────────────────────────────────────────
  // Keep a ref fresh from the latest meeting row so the autosave closure always
  // merges the CURRENT structured changes list into the wholesale JSONB write.
  const changesLogRef = useRef<BosMinutesChangeLogEntry[]>([]);
  useEffect(() => {
    changesLogRef.current = meeting?.minutes_content?.changes_log ?? [];
  }, [meeting?.minutes_content?.changes_log]);

  // ── Initial content ─────────────────────────────────────────────────────────
  // Seed once from the first resolved meeting. Subsequent narrative edits flow
  // through the editor, not this value (keying on meeting.id avoids blowing away
  // in-flight typing when React Query refetches the row after our own save).
  const initialHtml = useMemo(
    () => meeting?.minutes_content?.narrative_html ?? '',
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meeting?.id],
  );

  // ── Autosave / persist ──────────────────────────────────────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest editor HTML, snapshotted on every change. A plain string, so it
  // survives the editor being torn down on unmount.
  const pendingHtmlRef = useRef<string | null>(null);
  // Tiptap's normalized HTML of the last successfully-saved state. Seeded from
  // the editor once it mounts so the initial (untouched) content never triggers
  // a redundant save. null = not yet seeded.
  const lastSavedHtml = useRef<string | null>(null);
  // Latest meeting id for the unmount-flush closure (which runs with []-deps).
  const meetingIdRef = useRef(meetingId);
  useEffect(() => {
    meetingIdRef.current = meeting?.id ?? meetingId;
  }, [meeting?.id, meetingId]);

  const persist = useCallback(
    async (html: string) => {
      const id = meetingIdRef.current;
      if (!id) return;
      if (html === lastSavedHtml.current) return; // no-op guard
      setAutosaveState('saving');
      try {
        await update.mutateAsync({
          id,
          data: {
            minutes_content: {
              narrative_html: html,
              changes_log: changesLogRef.current,
            },
          } as UpdateBosMeetingDto,
        });
        lastSavedHtml.current = html;
        setAutosaveState('saved');
        setTimeout(() => setAutosaveState('idle'), 2000);
      } catch (err) {
        setAutosaveState('error');
        toast.error(err instanceof Error ? err.message : 'Autosave failed');
      }
    },
    [update],
  );

  // Called on every editor transaction. Snapshot HTML now (editor is alive),
  // then debounce the write.
  const handleContentChange = useCallback(() => {
    const ed = editorRef.current;
    if (!ed) return;
    pendingHtmlRef.current = ed.getHTML();
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (pendingHtmlRef.current != null) void persist(pendingHtmlRef.current);
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [persist]);

  const handleEditorReady = useCallback((ed: Editor | null) => {
    editorRef.current = ed;
    setEditorInstance(ed);
    // Seed the baseline from the editor's own serialization of the initial
    // content so an empty '' vs Tiptap's '<p></p>' mismatch can't cause a
    // spurious first save.
    if (ed && lastSavedHtml.current === null) {
      lastSavedHtml.current = ed.getHTML();
      pendingHtmlRef.current = lastSavedHtml.current;
    }
  }, []);

  const handleManualSave = async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const html = editorRef.current?.getHTML() ?? pendingHtmlRef.current ?? '';
    if (html === lastSavedHtml.current) {
      toast.success('Already up to date');
      return;
    }
    await persist(html);
    if (autosaveStateRef.current !== 'error') toast.success('Minutes saved');
  };

  // Read autosaveState inside handleManualSave without stale closure noise.
  const autosaveStateRef = useRef(autosaveState);
  useEffect(() => {
    autosaveStateRef.current = autosaveState;
  }, [autosaveState]);

  // Flush any pending debounce on unmount so a quick navigate-away doesn't drop
  // the last keystrokes. Uses the string snapshot (the editor is already gone).
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const html = pendingHtmlRef.current;
      if (html != null && html !== lastSavedHtml.current) void persist(html);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const meetingTitle =
    meeting?.meeting_title ??
    (meeting
      ? `Meeting #${meeting.meeting_number}/${meeting.academic_year}`
      : '');

  // ── Loading / error ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className='space-y-3'>
        <Skeleton className='h-10 w-64' />
        <Skeleton className='h-12 w-full' />
        <Skeleton className='h-[600px] w-full' />
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className='py-10 text-center text-sm text-muted-foreground'>
        Meeting not found or you don’t have access.
        <div className='mt-3'>
          <Button onClick={backToMeeting}>Back to meeting</Button>
        </div>
      </div>
    );
  }

  return (
    <div className='space-y-3'>
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
        <div className='flex items-center gap-2 flex-1 min-w-0'>
          <Button variant='ghost' size='sm' onClick={backToMeeting} className='shrink-0'>
            <ArrowLeft className='h-4 w-4' />
          </Button>
          <div className='min-w-0'>
            <p className='font-semibold text-base truncate'>{meetingTitle}</p>
            <p className='text-xs text-muted-foreground'>Meeting Minutes — Narrative</p>
          </div>
        </div>

        <div className='flex items-center gap-2 shrink-0'>
          {lifecycleLocked && (
            <Badge variant='secondary' className='gap-1'>
              <Lock className='h-3 w-3' /> Read-only
            </Badge>
          )}
          {autosaveState === 'saving' && (
            <Badge variant='secondary' className='gap-1'>
              <Loader2 className='h-3 w-3 animate-spin' /> Saving…
            </Badge>
          )}
          {autosaveState === 'saved' && <Badge variant='secondary'>Saved</Badge>}
          {autosaveState === 'error' && <Badge variant='destructive'>Save failed</Badge>}
          {canEdit && (
            <Button size='sm' onClick={handleManualSave} disabled={update.isPending}>
              <Save className='h-4 w-4 mr-1' /> Save
            </Button>
          )}
        </div>
      </div>

      {lifecycleLocked && (
        <p className='rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground'>
          These minutes are {meeting.status === 'ratified' ? 'ratified' : 'approved'} and
          can no longer be edited. Auto-forked syllabi depend on this content.
        </p>
      )}

      {/* ── Editor ──────────────────────────────────────────────────── */}
      <SopEditor
        initialContent={initialHtml}
        readOnly={!canEdit}
        tamilMode={tamilMode}
        placeholder='Write the detailed minutes — proceedings, discussions, decisions…'
        onChange={canEdit ? handleContentChange : undefined}
        onEditorReady={handleEditorReady}
        toolbarSlot={
          canEdit
            ? (editor) => (
                <SopRibbon
                  editor={editor}
                  tamilMode={tamilMode}
                  onTamilModeChange={setTamilMode}
                  onOpenTamilKeyboard={() => setTamilOpen(true)}
                />
              )
            : undefined
        }
        footerSlot={(editor) =>
          editor ? (
            <div className='flex items-center justify-between px-2 text-xs text-muted-foreground'>
              <span>
                {editor.storage.characterCount?.characters?.() ?? 0} characters ·{' '}
                {editor.storage.characterCount?.words?.() ?? 0} words
              </span>
              <span>
                Mode:{' '}
                {tamilMode === 'english'
                  ? 'English'
                  : tamilMode === 'phonetic'
                    ? 'Tamil (Phonetic)'
                    : 'Tamil99'}
              </span>
            </div>
          ) : null
        }
      />

      {/* ── Tamil virtual keyboard ──────────────────────────────────── */}
      <SopTamilKeyboard editor={editorInstance} open={tamilOpen} onOpenChange={setTamilOpen} />
    </div>
  );
}
