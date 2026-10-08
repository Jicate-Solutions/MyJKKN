'use client';

/**
 * The screening note on the application detail page — the one writable field
 * on an otherwise read-only page.
 *
 * It edits hr_job_applications.review_notes directly, through the note-only
 * branch of PATCH /api/hr/recruitment/applications/[id] (no `status` in the
 * body). That branch touches nothing else: annotating an applicant is not a
 * screening decision, so status, reviewed_by and reviewed_at stay as they were,
 * and promoted applicants stay annotatable.
 *
 * Permission: the RLS UPDATE policy requires hr.recruitment.edit AND
 * role_has_institution_access, while the page itself is only gated on .view.
 * The editor is therefore wrapped in PermissionGuard so a view-only HR user
 * sees the note exactly as before instead of a Save button that 4xxs — and the
 * guard's `loading` slot shows the same read-only view during the permission
 * fetch, rather than flashing an empty block.
 */

import { useEffect, useState } from 'react';
import { Loader2, Pencil, StickyNote } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useUpdateApplicationNotes } from '@/hooks/hr/use-recruitment';

/** Must match MAX_REVIEW_NOTE_LENGTH in the API route. */
const MAX_LENGTH = 2000;

function NoteText({ note }: { note: string | null | undefined }) {
  if (!note) {
    return <p className="text-xs text-muted-foreground">No screening notes recorded.</p>;
  }
  return (
    <p className="text-sm text-muted-foreground italic border-l-2 border-border pl-3 whitespace-pre-wrap break-words">
      &ldquo;{note}&rdquo;
    </p>
  );
}

function Editor({
  applicationId,
  note,
}: {
  applicationId: string;
  note: string | null | undefined;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(note ?? '');
  const save = useUpdateApplicationNotes();

  // A screening action elsewhere (or another tab) can change the stored note
  // under us. Re-sync only while closed, so an open draft is never clobbered.
  useEffect(() => {
    if (!isEditing) setDraft(note ?? '');
  }, [note, isEditing]);

  if (!isEditing) {
    return (
      <div className="space-y-2">
        <NoteText note={note} />
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            setDraft(note ?? '');
            setIsEditing(true);
          }}
        >
          {note ? <Pencil className="h-3 w-3 mr-1" /> : <StickyNote className="h-3 w-3 mr-1" />}
          {note ? 'Edit note' : 'Add note'}
        </Button>
      </div>
    );
  }

  const trimmed = draft.trim();
  const stored = (note ?? '').trim();
  const isUnchanged = trimmed === stored;
  const isTooLong = trimmed.length > MAX_LENGTH;

  const handleSave = () => {
    if (isUnchanged || isTooLong) return;
    save.mutate(
      // Empty means "clear the note" — the API normalises '' to null.
      { id: applicationId, review_notes: trimmed || null },
      {
        onSuccess: () => {
          toast.success(trimmed ? 'Screening note saved' : 'Screening note cleared');
          setIsEditing(false);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <div className="space-y-2">
      <Textarea
        aria-label="Screening note"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={4}
        autoFocus
        disabled={save.isPending}
        placeholder="What did screening find? Availability, red flags, follow-ups…"
        className="text-sm"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`text-xs ${isTooLong ? 'text-destructive' : 'text-muted-foreground'}`}>
          {trimmed.length} / {MAX_LENGTH}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            disabled={save.isPending}
            onClick={() => {
              setDraft(note ?? '');
              setIsEditing(false);
            }}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs"
            disabled={save.isPending || isUnchanged || isTooLong}
            onClick={handleSave}
          >
            {save.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            {save.isPending ? 'Saving…' : 'Save note'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ScreeningNoteEditor({
  applicationId,
  note,
}: {
  applicationId: string;
  note: string | null | undefined;
}) {
  const readOnly = <NoteText note={note} />;
  return (
    <PermissionGuard
      module="hr.recruitment"
      action="edit"
      fallback={readOnly}
      loading={readOnly}
    >
      <Editor applicationId={applicationId} note={note} />
    </PermissionGuard>
  );
}
