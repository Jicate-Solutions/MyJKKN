'use client';

// app/(routes)/instasolver/r/[token]/_components/scan-report-client.tsx
//
// The one-screen form a QR sticker opens: the item and place at the top, then
// "What's wrong?", "This is dangerous", an optional photo, and a big Send.
//
// Director (30 Sep 2026): make it easy — gallery as well as camera, no
// privacy pop-ups, a 3-character minimum. So the file input has NO `capture`
// attribute (that would force the camera and hide the photo library), and
// whatever is picked is turned into a JPEG in the browser with the existing
// canvas re-encoder before upload. The server still re-checks the bytes and
// strips metadata, failing closed.

import { useCallback, useRef, useState } from 'react';
import { AlertCircle, Camera, Check, Loader2, MapPin, Repeat, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { stripImageMetadata } from '@/lib/services/pde/strip-image-metadata';

const DESCRIPTION_MIN = 3;
const DESCRIPTION_MAX = 500;

interface Props {
  token: string;
  item: { name: string; category: string | null; place: string | null; college: string | null };
  repeat: { count: number; capped: boolean; show: boolean; openTaskId: string | null };
}

interface Receipt {
  joined: boolean;
  routedTo: string | null;
  notice: string | null;
  dueDate: string | null;
  dangerous: boolean;
}

function formatDue(iso: string | null): string {
  if (!iso) return 'soon';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function ScanReportClient({ token, item, repeat }: Props) {
  const [description, setDescription] = useState('');
  const [dangerous, setDangerous] = useState(false);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [submitting, setSubmitting] = useState<'new' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const clearPhoto = useCallback(() => {
    setPhoto(null);
    setPhotoPreview((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const onPickPhoto = useCallback(
    async (file: File | null) => {
      setError(null);
      if (!file) return;
      setConverting(true);
      try {
        const { blob } = await stripImageMetadata(file);
        setPhoto(blob);
        setPhotoPreview((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(blob);
        });
      } catch {
        setError("This photo couldn't be read — try another one.");
        clearPhoto();
      } finally {
        setConverting(false);
      }
    },
    [clearPhoto]
  );

  const trimmed = description.trim();
  const descriptionOk = trimmed.length >= DESCRIPTION_MIN && trimmed.length <= DESCRIPTION_MAX;
  // A dangerous report always gets its own urgent task, never folded in.
  const canJoin = Boolean(repeat.openTaskId) && !dangerous;

  const submit = useCallback(
    async (mode: 'new' | 'join') => {
      setError(null);
      setSubmitting(mode);
      try {
        const body = new FormData();
        body.set('token', token);
        body.set('description', trimmed);
        body.set('dangerous', dangerous ? 'true' : 'false');
        if (mode === 'join' && repeat.openTaskId) body.set('join_task_id', repeat.openTaskId);
        if (photo) body.set('photo', photo, 'photo.jpg');
        const res = await fetch('/api/instasolver/resource-report', { method: 'POST', body });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          setError(
            json?.error ?? 'The report could not be sent. Please try again, or tell the office directly.'
          );
          return;
        }
        setReceipt({
          joined: Boolean(json.joined),
          routedTo: json.routed_to ?? null,
          notice: json.notice ?? null,
          dueDate: json.due_date ?? null,
          dangerous: Boolean(json.dangerous),
        });
      } catch {
        setError('No connection. Please try again when you have signal.');
      } finally {
        setSubmitting(null);
      }
    },
    [token, trimmed, dangerous, photo, repeat.openTaskId]
  );

  if (receipt) {
    return (
      <Card className="mt-4 border-green-600/40">
        <CardContent className="space-y-3 py-6">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
            <Check className="h-6 w-6" />
            <p className="text-lg font-semibold">
              {receipt.joined ? 'Added to the open report' : 'Sent'}
            </p>
          </div>
          {receipt.routedTo ? (
            <p className="text-sm">
              {receipt.joined ? 'The owner, ' : 'Sent to '}
              <span className="font-medium">{receipt.routedTo}</span>
              {receipt.joined ? ', has been told.' : receipt.dueDate ? `. Due ${formatDue(receipt.dueDate)}.` : '.'}
            </p>
          ) : null}
          {receipt.notice ? <p className="text-sm text-muted-foreground">{receipt.notice}</p> : null}
          {receipt.dangerous ? (
            <p className="text-sm font-medium text-red-700 dark:text-red-400">
              Marked dangerous — due today.
            </p>
          ) : null}
          <p className="text-sm text-muted-foreground">Thank you. You can close this page.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardContent className="space-y-1 py-4">
          <p className="text-lg font-semibold leading-tight">{item.name}</p>
          {item.category ? <p className="text-sm text-muted-foreground">{item.category}</p> : null}
          {item.place || item.college ? (
            <p className="flex items-start gap-1.5 text-sm">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span>{[item.place, item.college].filter(Boolean).join(' — ')}</span>
            </p>
          ) : null}
        </CardContent>
      </Card>

      {repeat.show ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <Repeat className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Reported {repeat.count}
            {repeat.capped ? '+' : ''} times in the last 90 days.
            {repeat.openTaskId ? ' One report is still open.' : ''}
          </span>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="scan-description" className="text-base">
          What&apos;s wrong?
        </Label>
        <Textarea
          id="scan-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={DESCRIPTION_MAX}
          rows={4}
          placeholder="e.g. Fan not working, tap leaking, projector won't turn on"
          className="text-base"
        />
      </div>

      <div className="flex items-start gap-3 rounded-md border px-3 py-3">
        <Checkbox
          id="scan-dangerous"
          checked={dangerous}
          onCheckedChange={(v) => setDangerous(v === true)}
          className="mt-0.5 h-5 w-5"
        />
        <div className="space-y-0.5">
          <Label htmlFor="scan-dangerous" className="text-base">
            This is dangerous
          </Label>
          <p className="text-sm text-muted-foreground">Due today, and someone is called straight away.</p>
        </div>
      </div>

      <div className="space-y-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onPickPhoto(e.target.files?.[0] ?? null)}
        />
        {photoPreview ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoPreview} alt="Attached photo" className="h-20 w-20 rounded-md object-cover" />
            <Button type="button" variant="outline" onClick={clearPhoto}>
              <Trash2 className="mr-2 h-4 w-4" /> Remove photo
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="h-12 w-full text-base"
            disabled={converting}
            onClick={() => fileRef.current?.click()}
          >
            {converting ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Camera className="mr-2 h-5 w-5" />
            )}
            Add a photo (optional)
          </Button>
        )}
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {canJoin ? (
        <Button
          type="button"
          className="h-14 w-full text-lg"
          disabled={!descriptionOk || submitting !== null || converting}
          onClick={() => submit('join')}
        >
          {submitting === 'join' ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
          Add to the open report
        </Button>
      ) : null}
      <Button
        type="button"
        variant={canJoin ? 'outline' : 'default'}
        className="h-14 w-full text-lg"
        disabled={!descriptionOk || submitting !== null || converting}
        onClick={() => submit('new')}
      >
        {submitting === 'new' ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
        {canJoin ? 'Send as a new report' : 'Send'}
      </Button>
    </div>
  );
}
