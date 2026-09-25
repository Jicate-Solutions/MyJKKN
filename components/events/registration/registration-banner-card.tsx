'use client';

// components/events/registration/registration-banner-card.tsx
//
// The banner at the top of the public registration page (2026-09-24). It is
// the EVENT's hero image (events.hero_image_url) — one banner per event, shown
// above every one of its forms — so a general event finally has a place to set
// it (only the marathon settings page could before). The picture is uploaded
// through the same public form-media bucket an 'image_display' field uses.

import { useRef, useState } from 'react';
import { ImageIcon, Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useGeneralEvent, useUpdateGeneralEvent } from '@/hooks/events/use-general-events';
import type { EventRegistrationFormSummary } from '@/types/tournament';

export function RegistrationBannerCard({
  eventId,
  form,
}: {
  eventId: string;
  form: EventRegistrationFormSummary;
}) {
  const { data: event } = useGeneralEvent(eventId);
  const update = useUpdateGeneralEvent();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const current = event?.hero_image_url ?? null;

  async function handleFile(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('form_id', form.id);
      const res = await fetch(`/api/events/${eventId}/form-media`, { method: 'POST', body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) throw new Error(json.error || 'Upload failed');
      await update.mutateAsync({ id: eventId, dto: { hero_image_url: json.url as string } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not upload the banner');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  const busy = uploading || update.isPending;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ImageIcon className="h-4 w-4" />
          Banner — {form.name}
        </CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          A picture shown at the very top of the public registration page, above the event name and
          your questions. One banner per event: it appears on every registration form of this event.
          Wide images work best (about 3:1, up to 5 MB).
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current} alt="Registration banner" className="w-full rounded-lg border object-cover" />
        ) : (
          <div className="flex items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            <ImageIcon className="h-4 w-4" />
            No banner yet — the page shows the event name only.
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => fileInput.current?.click()} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {current ? 'Replace banner' : 'Upload banner'}
          </Button>
          {current ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              className="gap-1.5"
              onClick={() => update.mutate({ id: eventId, dto: { hero_image_url: null } })}
            >
              <Trash2 className="h-4 w-4" /> Remove
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
