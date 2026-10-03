'use client';

// Header banner upload / replace / remove for one survey. Saves immediately
// (through /api/health/surveys/[surveyId]/banner) — independent of the
// "Save survey" button, and without touching the editor's unsaved draft.

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

export function SurveyBannerUpload({
  surveyId,
  initialUrl,
}: {
  surveyId: string;
  initialUrl: string | null;
}) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ['wellness-surveys'] });

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPT.split(',').includes(file.type)) {
      toast.error('Please choose a JPG, PNG, WebP or GIF image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('Image is too large. Maximum 5 MB.');
      return;
    }
    setBusy('upload');
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch(`/api/health/surveys/${surveyId}/banner`, { method: 'POST', body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      setUrl(json.url);
      refresh();
      toast.success('Banner updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    setBusy('remove');
    try {
      const res = await fetch(`/api/health/surveys/${surveyId}/banner`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not remove the banner');
      setUrl(null);
      refresh();
      toast.success('Banner removed');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not remove the banner');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2">
      <Label>Header banner (optional)</Label>
      {url ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          {/* eslint-disable-next-line @next/next/no-img-element -- public storage URL */}
          <img src={url} alt="Survey banner" className="block max-h-56 w-full object-cover" />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={!!busy}
          className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed border-slate-200 px-4 py-8 text-sm text-slate-500 transition-colors hover:border-emerald-300 hover:bg-emerald-50/40"
        >
          <ImagePlus className="h-6 w-6 text-emerald-500" />
          Click to upload a banner image
          <span className="text-xs text-slate-400">
            JPG, PNG, WebP or GIF · max 5 MB · wide images (about 3:1, e.g. 1500×500) look best
          </span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <div className="flex flex-wrap items-center gap-2">
        {url && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!!busy}
            onClick={() => inputRef.current?.click()}
            className="gap-1"
          >
            {busy === 'upload' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImagePlus className="h-3.5 w-3.5" />
            )}
            Replace
          </Button>
        )}
        {url && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!!busy}
            onClick={handleRemove}
            className="gap-1 text-red-600 hover:bg-red-50"
          >
            {busy === 'remove' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            Remove
          </Button>
        )}
        {!url && busy === 'upload' && (
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
          </span>
        )}
        <span className="text-xs text-slate-400">Saved instantly — shown above the survey.</span>
      </div>
    </div>
  );
}
