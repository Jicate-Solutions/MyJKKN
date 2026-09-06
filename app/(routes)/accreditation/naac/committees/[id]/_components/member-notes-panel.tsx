// app/(routes)/accreditation/naac/committees/[id]/_components/member-notes-panel.tsx
// ============================================================================
// "Everyone writes their own account, the Chairman/Coordinator compiles."
//
// Before this, accreditation_committee_meetings had ONE minutes_summary column
// and one writer — whoever closed the sitting. Several members could not each
// record what they took away from it. This panel adds the missing half:
//
//   * Every active member gets their OWN box on a sitting. It is empty until
//     they write in it, and it is never pre-filled with somebody else's words.
//   * The Chairman and the Coordinator see every account side by side and can
//     compile them into the SAME minutes_summary column the rest of the loop
//     already reads — so nothing downstream (NAAC 7.3.e rollup, Control Tower,
//     the minuted view) needs to change.
//   * Compiling onto a sitting that already has minutes NEVER replaces silently:
//     'Add below' is the default, and 'Replace' is disabled until the person
//     ticks a box that says what will be lost.
//
// Access truth is RLS (see the migration). What is computed here is only the
// UI mirror of it — built from the same three facts the policy uses (active
// membership, the member's role, committees.chair_user_id) so the two agree.
// Where they might not, the copy says what it does not know instead of
// reporting an empty read as a fact.
//
// A NOTE OUTLIVES ITS AUTHOR (20260809102500). When a member leaves and their
// profile row is deleted, author_user_id becomes NULL and the note stays put.
// So attribution is read from the note's own author_name / author_email
// snapshot FIRST; the live profile is only consulted for rows written before
// that snapshot existed. Resolving the name by joining profiles at read time is
// the failure this fixes — after the departure there is nothing left to join to.
// ============================================================================

'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle, Info, NotebookPen, Save, Users } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useNAACCommitteeMembers } from '@/hooks/accreditation/use-naac-committees';
import {
  useMeetingMemberNotes,
  useNoteAuthorProfiles,
  useSaveMinutesSummary,
  useSaveMyMeetingNote,
} from '@/hooks/accreditation/use-naac-meeting-member-notes';
import {
  compileMemberNotes,
  hasExistingMinutes,
  mergeMinutes,
  type MinutesMergeMode,
} from '@/lib/services/accreditation/meeting-minutes-compiler';
import type { AccreditationCommittee } from '@/lib/services/accreditation/accreditation-committee-service';
import type { CommitteeMeeting } from '@/lib/services/accreditation/committee-meeting-service';
import {
  isFormerMemberNote,
  noteAuthorSnapshotLabel,
  type MeetingMemberNote,
} from '@/lib/services/accreditation/meeting-member-notes-service';
import { toast } from 'sonner';

/** Roles that compile the accounts into the official minutes. */
const COMPILER_ROLES = ['chair', 'coordinator'] as const;

export function MemberNotesPanel({
  meeting,
  committee,
  canManage,
}: {
  meeting: CommitteeMeeting;
  committee: AccreditationCommittee;
  /** Page-level accreditation.naac.committees.meetings.manage (+ active committee). */
  canManage: boolean;
}) {
  const { profile } = useAuth();
  const myUserId = profile?.id ?? null;

  const { data: members, isLoading: membersLoading } = useNAACCommitteeMembers(
    committee.id,
  );
  const {
    data: notes,
    isLoading: notesLoading,
    error: notesError,
  } = useMeetingMemberNotes(meeting.id);

  const myMembership = useMemo(
    () => (members ?? []).find((m) => m.user_id && m.user_id === myUserId),
    [members, myUserId],
  );

  // Mirrors the two SECURITY DEFINER predicates in the migration.
  const isCompiler =
    !!myUserId &&
    (committee.chair_user_id === myUserId ||
      (!!myMembership &&
        (COMPILER_ROLES as readonly string[]).includes(myMembership.role)) ||
      canManage);
  const canAuthor = !!myUserId && (!!myMembership || canManage);

  // A departed author's note has author_user_id === null, which matches nobody:
  // it is never mistaken for the signed-in member's own box, and it stays in the
  // "other accounts" list where the compiler can still read it.
  const myNote: MeetingMemberNote | undefined = myUserId
    ? (notes ?? []).find((n) => !!n.author_user_id && n.author_user_id === myUserId)
    : undefined;
  const othersNotes = (notes ?? []).filter((n) => n.id !== myNote?.id);

  const { data: authorProfiles } = useNoteAuthorProfiles(
    (notes ?? []).map((n) => n.author_user_id),
  );

  // Snapshot first — see the file header. The live profile is a fallback for
  // rows written before the snapshot existed, not the source of truth, and for
  // a departed author there is no profile left to consult at all.
  const labelFor = (n: MeetingMemberNote): string => {
    const snapshot = noteAuthorSnapshotLabel(n);
    if (snapshot) return snapshot;

    const p = n.author_user_id ? authorProfiles?.[n.author_user_id] : undefined;
    const fromProfile = p?.full_name?.trim() || p?.email?.trim() || null;
    if (fromProfile) return fromProfile;

    const m = n.author_user_id
      ? (members ?? []).find((x) => x.user_id === n.author_user_id)
      : undefined;
    return m?.external_name?.trim() || 'Committee member';
  };

  if (notesError) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
        Member accounts could not be loaded:{' '}
        {(notesError as Error).message}. Nothing has been saved or lost — try
        again, and tell the IQAC Coordinator if it keeps failing.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h4 className="flex items-center gap-2 text-sm font-semibold">
        <NotebookPen className="h-4 w-4" />
        Member accounts of this meeting
        <Badge variant="outline">{notesLoading ? '—' : notes?.length ?? 0}</Badge>
      </h4>

      {membersLoading || notesLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <>
          <MyAccountBox
            meetingId={meeting.id}
            myNote={myNote}
            canAuthor={canAuthor}
            signedIn={!!myUserId}
          />

          {isCompiler && (
            <>
              <Separator />
              <OtherAccounts
                notes={othersNotes}
                labelFor={labelFor}
                updatedFor={(n) => n.updated_at}
              />
              <CompileMinutesButton
                meeting={meeting}
                notes={notes ?? []}
                labelFor={labelFor}
                canWriteMinutes={canManage}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// The member's own box. Empty until they write in it — never seeded from
// anybody else's account, and an absent note is an invitation, not an error.
// ----------------------------------------------------------------------------

function MyAccountBox({
  meetingId,
  myNote,
  canAuthor,
  signedIn,
}: {
  meetingId: string;
  myNote: MeetingMemberNote | undefined;
  canAuthor: boolean;
  signedIn: boolean;
}) {
  const save = useSaveMyMeetingNote();
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? myNote?.note_text ?? '';
  const dirty = draft !== null && draft !== (myNote?.note_text ?? '');

  if (!signedIn) {
    return (
      <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        Sign in to write your own account of this meeting.
      </p>
    );
  }

  if (!canAuthor) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          You are not on this committee&apos;s active roster, so you cannot file
          your own account of this meeting. Ask the IQAC Coordinator or the
          committee Chairman to add you as a member first.
        </span>
      </div>
    );
  }

  const submit = async () => {
    try {
      await save.mutateAsync({ meetingId, noteText: value.trim() });
      setDraft(null);
      toast.success('Your account of this meeting was saved');
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Could not save your account',
      );
    }
  };

  return (
    <div className="space-y-2 rounded-md border p-3">
      <Label className="text-xs font-medium">
        Your account of this meeting
      </Label>
      <Textarea
        value={value}
        onChange={(e) => setDraft(e.target.value)}
        rows={5}
        placeholder="What you took away from this meeting — what was decided, what you disagreed with, what you were asked to do. Only you can edit this; the Chairman and Coordinator can read it when they compile the minutes."
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {myNote
            ? `Last saved ${new Date(myNote.updated_at).toLocaleString('en-IN')}`
            : 'Not written yet — this box is yours and starts empty.'}
        </span>
        <Button size="sm" onClick={submit} disabled={save.isPending || !dirty}>
          <Save className="mr-2 h-3.5 w-3.5" />
          {save.isPending ? 'Saving…' : myNote ? 'Update my account' : 'Save my account'}
        </Button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Every other member's account, side by side.
// ----------------------------------------------------------------------------

function OtherAccounts({
  notes,
  labelFor,
  updatedFor,
}: {
  notes: MeetingMemberNote[];
  labelFor: (n: MeetingMemberNote) => string;
  updatedFor: (n: MeetingMemberNote) => string;
}) {
  return (
    <div className="space-y-2">
      <h5 className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        Other members&apos; accounts
      </h5>
      {notes.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          No other member has written their account of this meeting yet.
        </p>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {notes.map((n) => (
            <div key={n.id} className="rounded-md border bg-card p-3">
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
                {labelFor(n)}
                {isFormerMemberNote(n) && (
                  <Badge variant="outline" className="font-normal">
                    Former member
                  </Badge>
                )}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {new Date(updatedFor(n)).toLocaleString('en-IN')}
                {isFormerMemberNote(n) &&
                  ' — this account was kept after they left the platform.'}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed">
                {n.note_text.trim() || '(left blank)'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Compile — the only path from member accounts into minutes_summary.
// ----------------------------------------------------------------------------

function CompileMinutesButton({
  meeting,
  notes,
  labelFor,
  canWriteMinutes,
}: {
  meeting: CommitteeMeeting;
  notes: MeetingMemberNote[];
  labelFor: (n: MeetingMemberNote) => string;
  canWriteMinutes: boolean;
}) {
  const [open, setOpen] = useState(false);
  // compileMemberNotes treats its first field as an opaque key handed back to
  // the resolver, so key by NOTE id rather than author id: a departed author has
  // no user id, and keying by a shared null would collapse two people's accounts
  // onto one name in the official minutes.
  const labelByNoteId = new Map(notes.map((n) => [n.id, labelFor(n)]));
  const compiled = compileMemberNotes(
    notes.map((n) => ({
      author_user_id: n.id,
      note_text: n.note_text,
    })),
    (noteId) => labelByNoteId.get(noteId) ?? 'Committee member',
    meeting.meeting_no,
  );

  if (!canWriteMinutes) {
    return (
      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        You can read every account above, but writing the official minutes needs
        the &ldquo;Record IQAC Meetings &amp; Resolutions&rdquo; permission. Ask
        the IQAC Coordinator to compile, or to have it granted to your role.
      </p>
    );
  }

  return (
    <>
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setOpen(true)}
          disabled={compiled.length === 0}
        >
          <NotebookPen className="mr-2 h-3.5 w-3.5" />
          Compile into minutes
        </Button>
      </div>
      {compiled.length === 0 && (
        <p className="text-right text-[11px] text-muted-foreground">
          Nothing to compile yet — no member has written an account.
        </p>
      )}
      {open && (
        <CompileMinutesDialog
          meeting={meeting}
          compiled={compiled}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function CompileMinutesDialog({
  meeting,
  compiled,
  onClose,
}: {
  meeting: CommitteeMeeting;
  compiled: string;
  onClose: () => void;
}) {
  const existing = meeting.minutes_summary;
  const willDestroy = hasExistingMinutes(existing);
  // Default to the mode that cannot lose anything.
  const [mode, setMode] = useState<MinutesMergeMode>(
    willDestroy ? 'append' : 'replace',
  );
  const [confirmedReplace, setConfirmedReplace] = useState(false);
  const [text, setText] = useState(() =>
    mergeMinutes(existing, compiled, willDestroy ? 'append' : 'replace'),
  );
  const save = useSaveMinutesSummary();

  const switchMode = (next: MinutesMergeMode) => {
    setMode(next);
    setConfirmedReplace(false);
    setText(mergeMinutes(existing, compiled, next));
  };

  const blocked = willDestroy && mode === 'replace' && !confirmedReplace;

  const confirm = async () => {
    if (blocked) return;
    if (!text.trim()) {
      toast.error('Minutes cannot be saved empty');
      return;
    }
    try {
      await save.mutateAsync({
        meetingId: meeting.id,
        committeeId: meeting.committee_id,
        minutesSummary: text.trim(),
      });
      toast.success('Member accounts compiled into the minutes');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the minutes');
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Compile member accounts — meeting #{meeting.meeting_no}
          </DialogTitle>
          <DialogDescription>
            Every member&apos;s own account, assembled and attributed. Edit
            freely before saving; this text becomes the meeting&apos;s minutes.
            The members&apos; own accounts are never changed by this.
          </DialogDescription>
        </DialogHeader>

        {willDestroy && (
          <div className="space-y-3 rounded-md border-2 border-amber-400 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
            <p className="flex items-start gap-2 text-xs font-medium text-amber-900 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              This meeting already has minutes ({existing!.trim().length}{' '}
              characters). Choose what happens to them.
            </p>
            <div className="flex flex-col gap-2">
              <label className="flex cursor-pointer items-start gap-2 text-xs">
                <input
                  type="radio"
                  className="mt-0.5"
                  name={`compile-mode-${meeting.id}`}
                  checked={mode === 'append'}
                  onChange={() => switchMode('append')}
                />
                <span>
                  <span className="font-medium">Add below the existing minutes</span>{' '}
                  — nothing already recorded is lost.
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 text-xs">
                <input
                  type="radio"
                  className="mt-0.5"
                  name={`compile-mode-${meeting.id}`}
                  checked={mode === 'replace'}
                  onChange={() => switchMode('replace')}
                />
                <span>
                  <span className="font-medium">Replace the existing minutes</span>{' '}
                  — the text recorded earlier is discarded.
                </span>
              </label>
            </div>
            {mode === 'replace' && (
              <label className="flex cursor-pointer items-start gap-2 rounded-md bg-red-50 p-2 text-xs text-red-900 dark:bg-red-950/40 dark:text-red-100">
                <Checkbox
                  checked={confirmedReplace}
                  onCheckedChange={(v) => setConfirmedReplace(v === true)}
                />
                <span>
                  I understand the minutes recorded earlier will be discarded
                  and cannot be recovered from this screen.
                </span>
              </label>
            )}
            <details className="text-[11px] text-amber-900 dark:text-amber-100">
              <summary className="cursor-pointer">
                Show the minutes recorded now
              </summary>
              <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-card p-2 font-sans">
                {existing}
              </pre>
            </details>
          </div>
        )}

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={14}
          className="font-mono text-xs"
        />

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button
            onClick={confirm}
            disabled={save.isPending || blocked}
            variant={mode === 'replace' && willDestroy ? 'destructive' : 'default'}
          >
            {save.isPending
              ? 'Saving…'
              : willDestroy && mode === 'replace'
                ? 'Replace minutes'
                : willDestroy
                  ? 'Add to minutes'
                  : 'Save minutes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
