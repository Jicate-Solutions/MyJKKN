'use client';

/**
 * Campus Walk — the routine check screen (client half).
 *
 * The person holding the phone is a lab assistant, an electrician or a
 * caretaker standing next to the item. Two big buttons:
 *   · All OK — needs ONE photo of the item. Closes the job. The photo may be
 *     taken with the camera OR chosen from the phone's gallery (Director,
 *     1 Oct 2026, overruling camera-only), so the input has NO `capture`
 *     attribute. The server still refuses a photo already used to close
 *     another check, so one photo cannot close two checks.
 *   · Found a problem — one line saying what is wrong, photo optional. The job
 *     becomes an ordinary repair for the same person.
 *
 * Photos go through the same pipeline as the fix screen: compress, then a
 * canvas re-encode to JPEG (lib/services/pde/strip-image-metadata.ts), which
 * drops location and camera data. The server re-strips and fails closed.
 */

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Camera, CheckCircle2, Loader2, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { compressImage } from '@/lib/utils/compress-image';
import { stripImageMetadata } from '@/lib/services/pde/strip-image-metadata';

export interface CheckTicket {
  taskId: string;
  itemName: string;
  place: string;
  whatToCheck: string;
  dueLabel: string;
}

type Mode = 'choose' | 'problem';

export function CheckClient({ ticket }: { ticket: CheckTicket }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('choose');
  const [note, setNote] = useState('');
  const [done, setDone] = useState<{ message: string; fixUrl?: string } | null>(null);

  const onPick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPreparing(true);
    setError(null);
    try {
      const compressed = await compressImage(file);
      const staged = new File([compressed], 'check.jpg', { type: 'image/jpeg' });
      const { blob } = await stripImageMetadata(staged);
      const ready = new File([blob], 'check.jpg', { type: 'image/jpeg' });
      setPhoto(ready);
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(ready);
      });
    } catch (err: any) {
      setError(err?.message ?? 'That photo could not be read on this phone. Please take it again.');
    } finally {
      setPreparing(false);
    }
  }, []);

  const send = useCallback(
    async (action: 'all_ok' | 'problem') => {
      if (sending) return;
      if (action === 'all_ok' && !photo) {
        setError('All OK needs one photo of the item. Tap "Take or choose a photo" first.');
        return;
      }
      if (action === 'problem' && note.trim().length < 4) {
        setError('Please say in one line what is wrong.');
        return;
      }
      setSending(true);
      setError(null);
      const body = new FormData();
      body.set('task_id', ticket.taskId);
      body.set('action', action);
      if (photo) body.set('photo', photo);
      if (note.trim()) body.set('note', note.trim());
      try {
        const res = await fetch('/api/campus-walk/check', { method: 'POST', body });
        const json = await res.json().catch(() => ({}) as any);
        if (!res.ok || !json?.ok) {
          setError(json?.error ?? 'That did not go through. Please try again — your photo is still here.');
          return;
        }
        setDone({ message: json.message ?? 'Saved.', fixUrl: json.fix_url });
        router.refresh();
      } catch {
        setError('No connection. Your photo is still here — try again when you have signal.');
      } finally {
        setSending(false);
      }
    },
    [note, photo, router, sending, ticket.taskId]
  );

  if (done) {
    return (
      <Card className="mx-auto mt-6 w-full max-w-2xl">
        <CardContent className="flex items-start gap-3 py-6">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="space-y-2">
            <p className="font-medium">{done.message}</p>
            {done.fixUrl ? (
              <Button className="h-11" onClick={() => router.push(done.fixUrl!)}>
                Open the repair job
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto mt-6 w-full max-w-2xl space-y-4">
      <Card>
        <CardContent className="space-y-2 py-5">
          <p className="text-lg font-semibold">{ticket.itemName}</p>
          {ticket.place ? <p className="text-sm text-muted-foreground">{ticket.place}</p> : null}
          <p className="text-sm">
            <span className="font-medium">What to check: </span>
            {ticket.whatToCheck}
          </p>
          {ticket.dueLabel ? <p className="text-sm text-muted-foreground">{ticket.dueLabel}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 py-5">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void onPick(e)}
          />
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="The photo you added" className="w-full rounded-md border object-cover" />
          ) : null}
          <Button
            variant="outline"
            className="h-12 w-full"
            onClick={() => fileRef.current?.click()}
            disabled={preparing || sending}
          >
            {preparing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
            {photo ? 'Change the photo' : 'Take or choose a photo'}
          </Button>

          {mode === 'problem' ? (
            <div className="space-y-2">
              <Label htmlFor="problem-note">What is wrong? (one line)</Label>
              <Textarea
                id="problem-note"
                value={note}
                maxLength={500}
                rows={2}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. UPS beeps and switches off after 2 minutes"
              />
              <Button
                className="h-14 w-full text-base"
                variant="destructive"
                onClick={() => void send('problem')}
                disabled={sending || preparing}
              >
                {sending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Wrench className="mr-2 h-5 w-5" />}
                Send as a repair job
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setMode('choose')} disabled={sending}>
                Back
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                className="h-14 text-base"
                onClick={() => void send('all_ok')}
                disabled={sending || preparing}
              >
                {sending ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-5 w-5" />
                )}
                All OK
              </Button>
              <Button
                className="h-14 text-base"
                variant="outline"
                onClick={() => {
                  setError(null);
                  setMode('problem');
                }}
                disabled={sending || preparing}
              >
                <AlertTriangle className="mr-2 h-5 w-5" />
                Found a problem
              </Button>
            </div>
          )}

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
