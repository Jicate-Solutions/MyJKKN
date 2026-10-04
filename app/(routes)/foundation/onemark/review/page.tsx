'use client';

// OneMark — the approver's queue.
//
// Every one-mark item enters the bank as a draft (is_active=false): lifted
// from a past board paper by scripts/onemark/ingest-board-paper.ts, or written
// by the AI drafting job. Nothing reaches a learner until ONE subject Senior
// Learner reads it here and ticks Approve (decision 7) — that flips is_active
// and stamps updated_by with the approver.
//
// Gate: foundation.items.manage (the bank holds answer keys). A denial renders
// an explicit 403, never a silent redirect (CLAUDE.md #27).
//
// ONE subject for the whole page: the request panel and the queue share it.
// It opens on ?subject=<config_key>, else this browser's last choice, else the
// first subject; a change is written back to both.

import { useState, useSyncExternalStore } from 'react';
import { usePermissions } from '@/hooks/use-permissions';
import { PermissionError } from '@/components/errors/permission-error';
import { Skeleton } from '@/components/ui/skeleton';
import { FoundationHeader } from '../../_components/foundation-header';
import { DraftQueue, REVIEW_SUBJECT_STORAGE_KEY, resolveReviewSubject } from './_components/draft-queue';
import { RequestDraftsPanel } from './_components/request-drafts-panel';
import { useOneMarkExams } from './_lib/drafts';

const noSubscription = () => () => {};
const serverSnapshot = () => null;
function readUrlSubject(): string | null {
  try {
    return new URLSearchParams(window.location.search).get('subject');
  } catch {
    return null; // no URL to read
  }
}
function readStoredSubject(): string | null {
  try {
    return window.localStorage.getItem(REVIEW_SUBJECT_STORAGE_KEY);
  } catch {
    return null; // storage blocked: fall back to the first subject
  }
}

export default function OneMarkReviewPage() {
  const { isLoading, canAccess, userProfile } = usePermissions();
  const { data: exams } = useOneMarkExams();
  /** The subject clicked on this visit (a config_key). */
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  /** ?subject= and this browser's last choice, read from the browser without
   *  an effect; the server render sees neither and starts on the first subject. */
  const urlKey = useSyncExternalStore(noSubscription, readUrlSubject, serverSnapshot);
  const storedKey = useSyncExternalStore(noSubscription, readStoredSubject, serverSnapshot);

  const examId = resolveReviewSubject(exams, [pickedKey, urlKey, storedKey]);

  function changeSubject(id: string) {
    const key = exams?.find((e) => e.id === id)?.config_key;
    if (!key) return;
    setPickedKey(key);
    try {
      window.localStorage.setItem(REVIEW_SUBJECT_STORAGE_KEY, key);
    } catch {
      /* storage blocked: the choice still holds for this visit */
    }
    try {
      const params = new URLSearchParams(window.location.search);
      params.set('subject', key);
      window.history.replaceState(null, '', `?${params.toString()}`);
    } catch {
      /* the URL stays as it was */
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 md:px-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (!canAccess('foundation', 'items.manage') || !userProfile?.id) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 md:px-8">
        <PermissionError
          message="Only a subject Senior Learner who manages the question bank can review OneMark drafts."
          requiredPermission="foundation.items.manage"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6 md:px-8">
      <FoundationHeader
        title="OneMark — review drafts"
        subtitle="Read each draft against the paper it came from, fix what the extraction got wrong, set the answer and the JABT level, then tick it into the live bank."
        crumbs={[{ label: 'Foundation', href: '/foundation' }, { label: 'OneMark review' }]}
      />
      <RequestDraftsPanel examId={examId} onSubjectChange={changeSubject} />
      <DraftQueue userId={userProfile.id} examId={examId} onSubjectChange={changeSubject} />
    </div>
  );
}
