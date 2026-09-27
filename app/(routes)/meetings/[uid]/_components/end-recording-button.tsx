'use client';

// app/(routes)/meetings/[uid]/_components/end-recording-button.tsx
//
// End a recording that nothing else can end.
//
// WHY THIS EXISTS. The Stop button lives inside the recorder page and dies with
// it. Close the tab, lose the phone, walk out of the room — and the row stays
// `status = 'recording'` for ever: the meeting page reads "still recording", the
// chunk count stays 0, and `audio_delete_after` is never set, so the 90-day
// sweeper (which only looks at rows that HAVE that date) will never tidy it
// either. Reported from production on 23 Sep, on a real interview recording.
//
// It is safe to press because finishing does not depend on the phone. The
// finish route ignores what the recorder claims and LISTS what actually reached
// storage, then records that — including "nothing arrived", which it says out
// loud rather than leaving a row that looks recorded and is empty.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function EndRecordingButton({ recordingId }: { recordingId: string }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const router = useRouter();

  function end() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/meetings/recordings/${recordingId}/finish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // No body: this page has no chunk count and no clock, and the route
          // asks storage rather than believing either.
          body: '{}',
        });
        const payload = (await res.json().catch(() => null)) as
          | { data?: { chunk_count?: number; error?: string | null } }
          | null;

        if (!res.ok || !payload?.data) {
          toast.error('Could not end this recording. Try again in a moment.');
          return;
        }
        const saved = payload.data.chunk_count ?? 0;
        const problem = payload.data.error ?? null;
        if (problem) {
          toast.warning(problem);
        } else {
          toast.success(`Ended. ${saved} piece${saved === 1 ? '' : 's'} of audio saved.`);
        }
        setDone(true);
        router.refresh();
      } catch {
        toast.error('Could not reach the server. Try again when you have signal.');
      }
    });
  }

  if (done) return null;

  return (
    <div className="space-y-1">
      <Button variant="outline" size="sm" onClick={end} disabled={pending}>
        {pending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Square className="mr-2 h-4 w-4" aria-hidden />
        )}
        End this recording
      </Button>
      <p className="text-xs text-muted-foreground">
        Use this if the recording was left running — the phone was closed, or you walked away.
        Whatever audio reached the server is kept and counted; nothing already saved is lost.
      </p>
    </div>
  );
}
