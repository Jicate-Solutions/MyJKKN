'use client';

// /admin/whatsapp-byow/secret-rotation
// BYOW Spec 3 Phase 2 Task 15 (5.1): Super-admin-only page to rotate the
// BYOW webhook HMAC secret. Generates a new secret server-side and surfaces
// it for manual paste into Vercel + Railway env vars.
//
// Pattern mirrors app/(routes)/admin/whatsapp-limits/page.tsx — SuperAdminOnly
// guard wraps a ContentLayout, inner client component does the actual UX.
//
// Spec: /Users/omm/PROJECTS/MyJKKN/specs/byow-platform-v2.md §5 Round 5.1, §8b item 13.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, RefreshCcw, Copy, ShieldAlert, KeyRound } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { Button } from '@/components/ui/button';
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

import { getPolicyInt } from '@/lib/policies/get-policy-client';
import { POLICY_KEYS } from '@/lib/policies/keys';

const ROTATION_DAYS_DEFAULT = 90;

type RotateResponse = {
  new_secret: string;
  instructions: string;
};

function SecretRotationEditor() {
  const { data: rotationDays, isLoading: policyLoading } = useQuery({
    queryKey: ['policy', POLICY_KEYS.WA_BYOW_WEBHOOK_SECRET_ROTATION_DAYS],
    queryFn: () =>
      getPolicyInt(
        POLICY_KEYS.WA_BYOW_WEBHOOK_SECRET_ROTATION_DAYS,
        ROTATION_DAYS_DEFAULT
      ),
  });

  const [isRotating, setIsRotating] = useState(false);
  const [rotated, setRotated] = useState<RotateResponse | null>(null);

  // Rotation history is not persisted yet (no migration in this task).
  // Surface a placeholder until a future task adds tracking.
  const lastRotatedDisplay = 'unknown';
  const daysSinceRotation: number | null = null;

  const handleRotate = async () => {
    if (!confirm(
      'Generate a new BYOW webhook secret? The old secret stays valid until you redeploy Vercel + Railway with the new value.'
    )) {
      return;
    }
    setIsRotating(true);
    try {
      const res = await fetch('/api/admin/whatsapp-byow/rotate-secret', {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as RotateResponse;
      setRotated(data);
      toast.success('New webhook secret generated');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Rotation failed';
      toast.error(msg);
    } finally {
      setIsRotating(false);
    }
  };

  const handleCopy = async () => {
    if (!rotated?.new_secret) return;
    try {
      await navigator.clipboard.writeText(rotated.new_secret);
      toast.success('Secret copied to clipboard');
    } catch {
      toast.error('Copy failed — select and copy manually');
    }
  };

  if (policyLoading) {
    return (
      <div className='space-y-4'>
        <Skeleton className='h-32 w-full' />
        <Skeleton className='h-48 w-full' />
      </div>
    );
  }

  const policyDays = rotationDays ?? ROTATION_DAYS_DEFAULT;
  const daysUntilThreshold =
    daysSinceRotation === null ? null : Math.max(0, policyDays - daysSinceRotation);

  return (
    <div className='space-y-6'>
      <Alert>
        <KeyRound className='h-4 w-4' />
        <AlertTitle>BYOW webhook secret rotation</AlertTitle>
        <AlertDescription>
          The BYOW WhatsApp service signs every webhook payload with an HMAC
          secret. Rotate it on schedule (policy{' '}
          <code>wa_byow.webhook_secret_rotation_days</code>) so a leaked
          secret can&apos;t be used indefinitely. This page generates a fresh
          secret &mdash; you then paste it into Vercel{' '}
          <em>and</em> Railway and redeploy both.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Rotation status</CardTitle>
          <CardDescription>
            Read from policy{' '}
            <code>{POLICY_KEYS.WA_BYOW_WEBHOOK_SECRET_ROTATION_DAYS}</code>.
            Rotation history tracking will land in a future task.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-3 text-sm'>
          <div className='flex items-center justify-between border-b border-border pb-2'>
            <span className='text-muted-foreground'>Last rotated</span>
            <span className='font-medium'>{lastRotatedDisplay}</span>
          </div>
          <div className='flex items-center justify-between border-b border-border pb-2'>
            <span className='text-muted-foreground'>Days since rotation</span>
            <span className='font-medium'>
              {daysSinceRotation === null ? 'Never rotated' : daysSinceRotation}
            </span>
          </div>
          <div className='flex items-center justify-between border-b border-border pb-2'>
            <span className='text-muted-foreground'>Policy threshold</span>
            <span className='font-medium'>{policyDays} days</span>
          </div>
          <div className='flex items-center justify-between'>
            <span className='text-muted-foreground'>Days until threshold</span>
            <span className='font-medium'>
              {daysUntilThreshold === null ? '—' : `${daysUntilThreshold} days`}
            </span>
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleRotate} disabled={isRotating}>
            {isRotating ? (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            ) : (
              <RefreshCcw className='mr-2 h-4 w-4' />
            )}
            Rotate Now
          </Button>
        </CardFooter>
      </Card>

      {rotated && (
        <Card className='border-amber-300 dark:border-amber-700'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <ShieldAlert className='h-4 w-4 text-amber-600' />
              New secret &mdash; copy now
            </CardTitle>
            <CardDescription>
              This value is shown ONCE. Save it before leaving the page.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='space-y-1.5'>
              <Textarea
                readOnly
                value={rotated.new_secret}
                rows={2}
                className='font-mono text-xs'
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                size='sm'
                variant='outline'
                onClick={handleCopy}
                type='button'
              >
                <Copy className='mr-2 h-3.5 w-3.5' />
                Copy to clipboard
              </Button>
            </div>
            <Alert>
              <AlertTitle>Next steps</AlertTitle>
              <AlertDescription>{rotated.instructions}</AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function SecretRotationPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title='BYOW Webhook Secret Rotation'>
          <div className='rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground'>
            Access Denied. This page is restricted to super administrators.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title='BYOW Webhook Secret Rotation'>
        <SecretRotationEditor />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
