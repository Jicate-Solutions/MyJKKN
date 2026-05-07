'use client';
// app/(routes)/ai-pulse/admin/cycles/_components/cycle-list.tsx
// Created: 2026-05-06
// Purpose: AI Pulse Champion Console list view. Shows all cycles ordered by demo_date DESC,
//          with permission gate (super_admin OR aiPulse:cycles.manage) and a "Create Cycle"
//          button that triggers the cycle-generation cron (PR #718).

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, RefreshCw, ShieldAlert, Sparkles } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useAIPulseCycles,
  useTriggerCycleGeneration,
} from '@/lib/services/ai-pulse/cycles-service';
import { CycleCard } from './cycle-card';

const PERMISSION_KEY = 'aiPulse:cycles.manage';

export function CycleList() {
  const { isSuperAdmin, can, isLoading: permsLoading } = usePermissions();
  const canManage = isSuperAdmin || can(PERMISSION_KEY);

  const {
    data: cycles,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useAIPulseCycles();

  const generate = useTriggerCycleGeneration();
  const [pendingCreate, setPendingCreate] = useState(false);

  // ---------------------------------------------------------------------------
  // Permission gate
  // ---------------------------------------------------------------------------
  if (permsLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!canManage) {
    return (
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Champion access required</AlertTitle>
        <AlertDescription>
          The AI Pulse Champion Console is restricted to super-admin users and
          users granted the <code className="font-mono">{PERMISSION_KEY}</code>{' '}
          permission (Krishnaveni and Ranjith). Contact the super-admin if you
          believe you should have access.
        </AlertDescription>
      </Alert>
    );
  }

  // ---------------------------------------------------------------------------
  // Create-cycle handler — calls /api/cron/ai-pulse-tick. Idempotent.
  // ---------------------------------------------------------------------------
  const handleCreate = async () => {
    setPendingCreate(true);
    const res = await generate.mutateAsync();
    setPendingCreate(false);

    if (!res.ok) {
      toast.error(res.error || 'Failed to trigger cycle generation');
      return;
    }
    if (res.data?.existed) {
      toast(
        `Next cycle already exists${
          res.data?.demo_date ? ` (demo ${res.data.demo_date})` : ''
        }`,
        { icon: 'ℹ️' }
      );
    } else {
      toast.success(
        `New cycle created${
          res.data?.demo_date ? ` for ${res.data.demo_date}` : ''
        }`
      );
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {cycles ? `${cycles.length} cycle${cycles.length === 1 ? '' : 's'}` : '—'}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-2"
          >
            <RefreshCw
              className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={pendingCreate || generate.isPending}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            {pendingCreate || generate.isPending
              ? 'Creating…'
              : 'Create Cycle'}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Failed to load cycles</AlertTitle>
          <AlertDescription>
            {(error as Error).message ||
              'Unknown error reading startup_events.'}
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : !cycles || cycles.length === 0 ? (
        <Alert>
          <Sparkles className="h-4 w-4" />
          <AlertTitle>No cycles yet</AlertTitle>
          <AlertDescription>
            Use <strong>Create Cycle</strong> to generate the next Thursday
            cycle. The cron is idempotent — clicking it twice won&apos;t create
            duplicates.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-3">
          {cycles.map((c) => (
            <CycleCard key={c.id} cycle={c} />
          ))}
        </div>
      )}
    </div>
  );
}
