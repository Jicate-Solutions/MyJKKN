'use client';

// "Pull from usage log" — copies the last 30 days of matching usage_events into
// feature_usage for every labelled feature that names its event. Idempotent.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export function SyncUsageButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function pull() {
    setBusy(true);
    try {
      const response = await fetch('/api/admin/adoption/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ days: 30 }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        features?: number;
        rows?: number;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? 'Usage could not be pulled.');
      }
      toast.success(
        `Pulled the last 30 days: ${payload.rows ?? 0} person-days across ${payload.features ?? 0} feature(s).`
      );
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Usage could not be pulled.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" size="sm" variant="outline" onClick={pull} disabled={disabled || busy || isPending}>
      {busy ? 'Pulling…' : 'Pull from usage log (30 days)'}
    </Button>
  );
}
