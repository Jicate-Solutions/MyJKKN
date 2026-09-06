'use client';

// components/admission/notes-and-memo-capture.tsx
//
// "Add to timeline" panel for the enquiry Activities tab. Lets the admission
// officer attach a text note + optional voice memo to the learner's activity
// log. POSTs to /api/admission/enquiries/[learnerProfileId]/activities which
// writes a row to admission_lead_activities + (if memo) uploads to the
// activity-memos storage bucket.
//
// Permission-gated: parent verifies admission.enquiries.activities.create
// before rendering. The API double-checks server-side.

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  VoiceMemoRecorder,
  type VoiceMemoRecorderHandle,
} from '@/components/admission/voice-memo-recorder';

interface NotesAndMemoCaptureProps {
  /** learners_profiles.id — used as the URL param on the activities API. */
  learnerProfileId: string;
  /** Institution scope for the storage upload path. Pre-filled from learner row. */
  institutionId: string;
  /** Called after a successful save so the parent can refresh the timeline. */
  onSaved?: () => void;
  /** Optional disable when parent is in some other busy state. */
  disabled?: boolean;
}

export function NotesAndMemoCapture({
  learnerProfileId,
  institutionId,
  onSaved,
  disabled,
}: NotesAndMemoCaptureProps) {
  const [note, setNote] = useState('');
  const [hasMemo, setHasMemo] = useState(false);
  const [saving, setSaving] = useState(false);
  const recorderRef = useRef<VoiceMemoRecorderHandle | null>(null);

  const canSubmit = !disabled && !saving && (note.trim().length > 0 || hasMemo);

  async function handleSave() {
    if (!canSubmit) return;
    setSaving(true);
    try {
      // Step 1: upload memo first (if any) so we have the URL to attach.
      // VoiceMemoRecorder writes to the activity-memos bucket at
      // `${institutionId}/${scopeId}.${ext}`. We use a UUID-y scope id —
      // we don't yet know the row id since it doesn't exist, so we
      // generate one client-side and the API uses it as the activity row id.
      let memoUrl: string | undefined;
      let memoDuration: number | undefined;
      if (hasMemo && recorderRef.current) {
        // Generate a scope id that lets the storage path be deterministic.
        // The API doesn't insist on a specific id — we just need uniqueness.
        const scopeId = crypto.randomUUID();
        const uploaded = await recorderRef.current.uploadMemo(scopeId);
        if (uploaded) {
          memoUrl = uploaded.url;
          memoDuration = uploaded.durationSec;
        }
      }

      // Step 2: POST the activity row
      const res = await fetch(
        `/api/admission/enquiries/${encodeURIComponent(learnerProfileId)}/activities`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            note: note.trim() || undefined,
            voice_memo_url: memoUrl,
            voice_memo_duration_sec: memoDuration,
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'save failed');
      }

      toast.success('Activity added to timeline');
      setNote('');
      // Reset memo state via a re-mount — simplest way to clear the recorder.
      setHasMemo(false);
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save activity');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Add note or voice memo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Type a note for the admission officer team…"
          rows={3}
          disabled={disabled || saving}
        />

        <VoiceMemoRecorder
          ref={recorderRef}
          institutionId={institutionId}
          bucket="activity-memos"
          disabled={disabled || saving}
          onMemoStateChange={setHasMemo}
          onError={(msg) => toast.error(msg)}
        />

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={!canSubmit} className="gap-2">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {saving ? 'Saving…' : 'Add to timeline'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
