'use client';

// Per-question image attachment (diagram / figure). One image per question and
// per sub-division; it prints CENTRED under that question's text at `width_pct`
// of the ~190 mm A4 text column.
//
// Bytes are squeezed on the CLIENT (lib/utils/question-papers/question-image.ts)
// so the bucket holds KB-level objects, and the control reports stored resolution
// + size + the effective print dpi at the chosen width — so an author can see when
// an image is too soft to print BEFORE the paper goes out.
//
// Mirrors COE components/ia/question-image-field.tsx; the differences are the
// toast library (sonner here) and the proxy endpoint.

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ImagePlus, Loader2, Trash2, RefreshCw, AlertTriangle } from 'lucide-react';
import {
  prepareQuestionImage,
  printDpi,
  formatBytes,
  IMAGE_WIDTHS,
  DEFAULT_IMAGE_WIDTH_PCT,
  MIN_PRINT_DPI,
} from '@/lib/utils/question-papers/question-image';
import type { IaQuestionImage } from '@/types/ia-question-paper';

interface Props {
  paperId: string;
  value?: IaQuestionImage | null;
  onChange: (image: IaQuestionImage | null) => void;
  disabled?: boolean;
  /** Shown on the empty-state button — "Add image" / "Add image to i." */
  label?: string;
}

export function QuestionImageField({
  paperId, value, onChange, disabled, label = 'Add image',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const widthPct = value?.width_pct || DEFAULT_IMAGE_WIDTH_PCT;
  const dpi = value?.px_w ? printDpi(value.px_w, widthPct) : 0;

  const pick = () => inputRef.current?.click();

  /** Best-effort object cleanup. An orphan is harmless — never block the author. */
  const removeObject = async (path: string) => {
    try {
      await fetch(
        `/api/question-papers/${paperId}/image?path=${encodeURIComponent(path)}`,
        { method: 'DELETE' }
      );
    } catch {
      // Swallowed on purpose: cleanup failure must not surface as an authoring error.
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const previousPath = value?.path || null;
    try {
      setBusy(true);
      const prepared = await prepareQuestionImage(file);

      const form = new FormData();
      // A re-encoded blob has no filename; give the upload a sane one so the
      // extension still matches its mime type.
      const ext = (prepared.blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
      form.append('file', prepared.blob, prepared.original ? file.name : `question.${ext}`);

      const res = await fetch(`/api/question-papers/${paperId}/image`, {
        method: 'POST',
        body: form,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || 'Upload failed');
      const data = payload?.data ?? payload;

      onChange({
        url: data.url,
        path: data.path,
        width_pct: widthPct,
        px_w: prepared.width,
        px_h: prepared.height,
        bytes: prepared.bytes,
      });

      // Replacing: drop the object we just orphaned.
      if (previousPath) void removeObject(previousPath);

      toast.success('Image attached', {
        description:
          `${prepared.width} × ${prepared.height} · ${formatBytes(prepared.bytes)}` +
          `${prepared.original ? '' : ' (compressed)'} · Save the paper to keep it.`,
      });
    } catch (e) {
      toast.error('Image not attached', {
        description: e instanceof Error ? e.message : 'Upload failed',
      });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async () => {
    const path = value?.path || null;
    onChange(null);
    if (path) void removeObject(path);
  };

  return (
    <div className='mt-2'>
      <input
        ref={inputRef}
        type='file'
        accept='image/png,image/jpeg,image/webp,image/gif'
        className='hidden'
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      {!value?.url ? (
        <Button
          type='button'
          size='sm'
          variant='outline'
          className='h-7 gap-1 px-2 text-xs'
          disabled={disabled || busy}
          onClick={pick}
          title='Attach an image — prints centred under this question'
        >
          {busy ? <Loader2 className='h-3 w-3 animate-spin' /> : <ImagePlus className='h-3 w-3' />}
          {label}
        </Button>
      ) : (
        <div className='rounded-md border bg-muted/20 p-2'>
          {/* The preview mirrors the print: centred, at the chosen column width. */}
          <div className='flex justify-center'>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value.url}
              alt='Question figure'
              className='max-h-44 rounded border bg-white object-contain'
              style={{ width: `${widthPct}%`, height: 'auto' }}
            />
          </div>

          <div className='mt-2 flex flex-wrap items-center gap-2'>
            <Label className='text-xs whitespace-nowrap'>Print width</Label>
            <Select
              value={String(widthPct)}
              onValueChange={(v) => onChange({ ...value, width_pct: Number(v) })}
              disabled={disabled}
            >
              <SelectTrigger className='h-7 w-[140px] text-xs'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IMAGE_WIDTHS.map((w) => (
                  <SelectItem key={w.value} value={String(w.value)} className='text-xs'>
                    {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              type='button'
              size='sm'
              variant='ghost'
              className='h-7 gap-1 px-2 text-xs'
              disabled={disabled || busy}
              onClick={pick}
            >
              {busy ? <Loader2 className='h-3 w-3 animate-spin' /> : <RefreshCw className='h-3 w-3' />}
              Replace
            </Button>
            <Button
              type='button'
              size='sm'
              variant='ghost'
              className='h-7 gap-1 px-2 text-xs text-destructive'
              disabled={disabled || busy}
              onClick={remove}
            >
              <Trash2 className='h-3 w-3' /> Remove
            </Button>
          </div>

          <div className='mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground'>
            {value.px_w && value.px_h ? <span>{value.px_w} × {value.px_h} px</span> : null}
            {value.bytes ? <span>· {formatBytes(value.bytes)}</span> : null}
            {dpi ? (
              <span className={dpi < MIN_PRINT_DPI ? 'text-amber-600' : ''}>
                · ≈{dpi} dpi at this width
              </span>
            ) : null}
            {dpi && dpi < MIN_PRINT_DPI ? (
              <span className='flex items-center gap-1 text-amber-600'>
                <AlertTriangle className='h-3 w-3' /> may print soft — use a larger source
                image or a smaller width
              </span>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export default QuestionImageField;
