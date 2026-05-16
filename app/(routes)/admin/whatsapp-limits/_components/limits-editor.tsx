'use client';

// Created: 2026-04-29
// Editor for the whatsapp_send_limits singleton row. Super-admin only
// (enforced by both the parent <SuperAdminOnly> guard and the RLS WRITE
// policy on the table).
//
// Director can:
//   - Read the current cap (default seeded 950)
//   - Change it to any integer in [1, 10000]
//   - Optionally annotate why (free-text notes)
//   - See the audit trail (updated_by + updated_at)

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Save, MessageSquare } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import {
  useWhatsAppSendLimit,
  useUpdateWhatsAppSendLimit,
  WHATSAPP_DAILY_LIMIT_DEFAULT,
} from '@/lib/services/admin/whatsapp-send-limits-service';

const DAILY_LIMIT_MIN = 1;
const DAILY_LIMIT_MAX = 10000;

export function LimitsEditor() {
  const { data: row, isLoading, error } = useWhatsAppSendLimit();
  const updateMutation = useUpdateWhatsAppSendLimit();

  const [draftLimit, setDraftLimit] = useState<string>('');
  const [draftNotes, setDraftNotes] = useState<string>('');

  // Hydrate drafts when row arrives (or after a successful save).
  useEffect(() => {
    if (row) {
      setDraftLimit(String(row.daily_limit));
      setDraftNotes(row.notes ?? '');
    }
  }, [row]);

  if (isLoading) {
    return (
      <div className='space-y-4'>
        <Skeleton className='h-32 w-full' />
        <Skeleton className='h-48 w-full' />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant='destructive'>
        <AlertTitle>Failed to load WhatsApp send limits</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : 'Unknown error'}
        </AlertDescription>
      </Alert>
    );
  }

  if (!row) {
    return (
      <Alert>
        <AlertTitle>WhatsApp send-limits row not seeded</AlertTitle>
        <AlertDescription>
          The <code>whatsapp_send_limits</code> singleton row is missing.
          Re-run migration{' '}
          <code className='rounded bg-muted px-1 py-0.5 text-xs'>
            20260429_whatsapp_send_limits.sql
          </code>{' '}
          to seed the default ({WHATSAPP_DAILY_LIMIT_DEFAULT}).
        </AlertDescription>
      </Alert>
    );
  }

  const parsedLimit = Number(draftLimit);
  const isInteger = Number.isInteger(parsedLimit);
  const inRange =
    isInteger && parsedLimit >= DAILY_LIMIT_MIN && parsedLimit <= DAILY_LIMIT_MAX;
  const isDirty =
    parsedLimit !== row.daily_limit || (draftNotes || null) !== (row.notes || null);
  const canSave = inRange && isDirty && !updateMutation.isPending;

  const handleSave = () => {
    if (!canSave) return;
    updateMutation.mutate(
      { dailyLimit: parsedLimit, notes: draftNotes || null },
      {
        onSuccess: (result) => {
          if (result.ok) {
            toast.success(`Daily limit updated to ${parsedLimit}`);
          } else {
            toast.error(result.error || 'Update failed');
          }
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : 'Update failed';
          toast.error(msg);
        },
      },
    );
  };

  return (
    <div className='space-y-6'>
      <Alert>
        <MessageSquare className='h-4 w-4' />
        <AlertTitle>Zero-deploy WhatsApp daily-cap tweaks</AlertTitle>
        <AlertDescription>
          This is the platform-wide daily ceiling for WhatsApp template
          sends (Meta Cloud API). The expo-welcome service queues new sends
          once this count is hit. Edit the value here and the very next
          send picks it up &mdash; no PR, no deploy, no developer
          round-trip. Meta tier <code>TIER_1K</code> caps at 1000, so
          950 leaves a 50-msg safety margin.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Daily send limit</CardTitle>
          <CardDescription>
            Singleton config row in <code>whatsapp_send_limits</code>.
            Read by <code>fn_get_whatsapp_daily_limit()</code> in
            <code> expo-whatsapp-service.ts</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='space-y-1.5'>
            <Label htmlFor='daily-limit'>Daily limit (messages)</Label>
            <Input
              id='daily-limit'
              type='number'
              step={1}
              min={DAILY_LIMIT_MIN}
              max={DAILY_LIMIT_MAX}
              value={draftLimit}
              onChange={(e) => setDraftLimit(e.target.value)}
              className='max-w-xs'
              disabled={updateMutation.isPending}
            />
            <p className='text-xs text-muted-foreground'>
              Must be an integer between {DAILY_LIMIT_MIN} and {DAILY_LIMIT_MAX}.
              Default seeded value: {WHATSAPP_DAILY_LIMIT_DEFAULT}.
            </p>
            {!inRange && draftLimit !== '' && (
              <p className='text-xs text-destructive'>
                Value out of range. Use an integer between {DAILY_LIMIT_MIN}
                and {DAILY_LIMIT_MAX}.
              </p>
            )}
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='daily-limit-notes'>Notes (optional)</Label>
            <Textarea
              id='daily-limit-notes'
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
              placeholder='Why this value? e.g. "Raised to 980 after Meta tier upgrade on 2026-05-15"'
              rows={3}
              disabled={updateMutation.isPending}
            />
            <p className='text-xs text-muted-foreground'>
              Free-text audit note shown in the row history.
            </p>
          </div>

          <div className='space-y-1 text-xs text-muted-foreground'>
            <div>
              <span className='font-medium text-foreground'>Last updated:</span>{' '}
              {row.updated_at
                ? new Date(row.updated_at).toLocaleString()
                : '—'}
            </div>
            <div>
              <span className='font-medium text-foreground'>Updated by:</span>{' '}
              {row.updated_by ?? '— (initial seed)'}
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleSave} disabled={!canSave}>
            {updateMutation.isPending ? (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            ) : (
              <Save className='mr-2 h-4 w-4' />
            )}
            Save
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
