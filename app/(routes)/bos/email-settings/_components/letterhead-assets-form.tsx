'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Stamp, Upload, Trash2, Info } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { logger } from '@/lib/utils/enhanced-logger';

// ── Per-institution seal + principal signature (20260729120000) ──────────────
// Both images are uploaded here and stored as base64 data URIs. The BoS
// call-letter PDF stamps them at the bottom of the letter — seal on the left,
// signature above the "Principal" line on the right. Leaving one blank simply
// omits that image from the letter.

const ACCEPTED = 'image/png,image/jpeg,image/webp';
// Keep the source file comfortably under the API's ~750k-char data-URI ceiling
// (base64 is ~4/3 the byte size).
const MAX_BYTES = 500 * 1024;

interface AssetsRow {
  seal_image: string | null;
  signature_image: string | null;
}

type SlotKey = 'seal_image' | 'signature_image';

const SLOTS: Array<{
  key: SlotKey;
  title: string;
  hint: string;
  /** Transparent-background PNG guidance differs slightly per slot. */
  spec: string;
}> = [
  {
    key: 'seal_image',
    title: 'Office seal',
    hint: 'Round college/office stamp printed at the bottom-left of the letter.',
    spec: 'PNG with a transparent background, roughly square, ≥ 300 × 300 px.',
  },
  {
    key: 'signature_image',
    title: 'Principal signature',
    hint: 'Scanned signature placed just above the “Principal” line, bottom-right.',
    spec: 'PNG with a transparent background, wide (≈ 3:1), ≥ 600 px across.',
  },
];

function readAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the selected file'));
    reader.readAsDataURL(file);
  });
}

interface LetterheadAssetsFormProps {
  institutionsId: string | null;
}

export function LetterheadAssetsForm({ institutionsId }: LetterheadAssetsFormProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<AssetsRow>({ seal_image: null, signature_image: null });
  const [isSaving, setIsSaving] = useState(false);
  // One hidden <input type="file"> per slot, clicked by the visible button.
  const fileInputs = useRef<Record<SlotKey, HTMLInputElement | null>>({
    seal_image: null,
    signature_image: null,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['bos', 'letterhead-assets', institutionsId],
    queryFn: async () => {
      const res = await fetch(`/api/bos/letterhead-assets?institutionsId=${institutionsId}`);
      if (!res.ok) throw new Error('Failed to load letterhead assets');
      return res.json() as Promise<{ data: AssetsRow; canEdit: boolean }>;
    },
    enabled: !!institutionsId,
    staleTime: 5 * 60 * 1000,
  });

  // Reseed the draft whenever the saved row (or institution) changes.
  useEffect(() => {
    if (!data) return;
    setDraft({
      seal_image: data.data.seal_image ?? null,
      signature_image: data.data.signature_image ?? null,
    });
  }, [data]);

  const canEdit = data?.canEdit ?? false;

  const handlePick = async (key: SlotKey, file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error(`${file.name} is ${Math.round(file.size / 1024)} KB — keep it under 500 KB`);
      return;
    }
    try {
      const uri = await readAsDataUri(file);
      setDraft((d) => ({ ...d, [key]: uri }));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleSave = async () => {
    if (!institutionsId) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/bos/letterhead-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          institutions_id: institutionsId,
          // Send '' (not null) for a cleared slot — the API treats the key's
          // presence as "write this column" and '' as "clear it".
          seal_image: draft.seal_image ?? '',
          signature_image: draft.signature_image ?? '',
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Save failed');
      toast.success('Seal & signature saved');
      queryClient.invalidateQueries({ queryKey: ['bos', 'letterhead-assets'] });
    } catch (err) {
      logger.error('academic/bos', 'Letterhead assets save failed', err);
      toast.error((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!institutionsId) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-sm font-semibold flex items-center gap-2'>
          <Stamp className='h-4 w-4 text-muted-foreground' />
          Seal &amp; Signature (call-letter PDF)
        </CardTitle>
        <CardDescription className='text-xs'>
          Stamped on every Board of Studies / Academic Council / Governing Body call letter for this
          institution — seal at the bottom-left, signature above the <strong>Principal</strong> line at
          the bottom-right. Leave a slot empty to print that letter without it.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {isLoading ? (
          <div className='grid gap-3 md:grid-cols-2'>
            <Skeleton className='h-40 w-full' />
            <Skeleton className='h-40 w-full' />
          </div>
        ) : (
          <>
            <div className='grid gap-3 md:grid-cols-2'>
              {SLOTS.map((slot) => {
                const value = draft[slot.key];
                return (
                  <div key={slot.key} className='rounded-lg border p-3 space-y-2'>
                    <div>
                      <div className='text-sm font-medium'>{slot.title}</div>
                      <p className='text-[11px] text-muted-foreground'>{slot.hint}</p>
                    </div>

                    {/* Preview well — checkerboard-free plain surface is enough to
                        spot a non-transparent white box before it hits the PDF. */}
                    <div className='flex h-28 items-center justify-center rounded-md border border-dashed bg-muted/30 p-2'>
                      {value ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={value}
                          alt={`${slot.title} preview`}
                          className='max-h-24 max-w-full object-contain'
                        />
                      ) : (
                        <span className='text-[11px] text-muted-foreground'>Not configured</span>
                      )}
                    </div>

                    <input
                      ref={(el) => {
                        fileInputs.current[slot.key] = el;
                      }}
                      type='file'
                      accept={ACCEPTED}
                      className='hidden'
                      onChange={(e) => {
                        void handlePick(slot.key, e.target.files?.[0]);
                        // Reset so re-picking the same filename fires onChange again.
                        e.target.value = '';
                      }}
                    />

                    <div className='flex items-center gap-2'>
                      <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        disabled={!canEdit}
                        onClick={() => fileInputs.current[slot.key]?.click()}
                      >
                        <Upload className='mr-2 h-3.5 w-3.5' />
                        {value ? 'Replace' : 'Upload'}
                      </Button>
                      {value && (
                        <Button
                          type='button'
                          size='sm'
                          variant='ghost'
                          disabled={!canEdit}
                          onClick={() => setDraft((d) => ({ ...d, [slot.key]: null }))}
                        >
                          <Trash2 className='mr-2 h-3.5 w-3.5' />
                          Remove
                        </Button>
                      )}
                    </div>

                    <p className='text-[11px] text-muted-foreground'>{slot.spec}</p>
                  </div>
                );
              })}
            </div>

            {!canEdit && (
              <Alert>
                <AlertDescription className='text-xs flex items-center gap-2'>
                  <Info className='h-3.5 w-3.5' />
                  Read-only — only a board chairman, the principal, or a super-admin can change the
                  seal &amp; signature.
                </AlertDescription>
              </Alert>
            )}

            <div className='flex justify-end'>
              <Button size='sm' variant='outline' onClick={handleSave} disabled={!canEdit || isSaving}>
                <Save className='mr-2 h-3.5 w-3.5' />
                {isSaving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </>
        )}

        <p className='text-[11px] text-muted-foreground'>
          Preview the result from any meeting → <strong>Members</strong> tab → the per-member PDF
          download. Changes apply to letters generated after saving; already-sent emails keep their
          original attachment.
        </p>
      </CardContent>
    </Card>
  );
}
