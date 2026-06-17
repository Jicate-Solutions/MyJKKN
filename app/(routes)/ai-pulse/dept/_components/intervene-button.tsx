// app/(routes)/ai-pulse/dept/_components/intervene-button.tsx
// Created: 2026-06-11 — AI Pulse SOP §4 HOD oversight (intervention trigger).
//
// Per-department "Intervene" action. Gated by aiPulse:dept.intervene; when
// the caller lacks the key the button is hidden (the page itself is already
// gated by aiPulse:dept.heatmap with an explicit 403).
//
// Clicking writes a notifications row to the dept's HOD(s) + the AI Pulse
// Champions (insert shape copied from rotation-service escalateAbsence —
// best-effort, degrades gracefully).

'use client';

import { useState } from 'react';
import { BellRing, Check, Loader2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

import { usePermissions } from '@/hooks/use-permissions';
import {
  useInterveneDept,
  type ConsequenceTier,
} from '@/lib/services/ai-pulse/dept-heatmap-service';

const PERMISSION_KEY = 'aiPulse:dept.intervene';

interface InterveneButtonProps {
  departmentId: string;
  departmentName: string;
  missCount: number;
  tier: ConsequenceTier;
  institutionId?: string | null;
}

export function InterveneButton({
  departmentId,
  departmentName,
  missCount,
  tier,
  institutionId,
}: InterveneButtonProps) {
  const { can, isSuperAdmin } = usePermissions();
  const intervene = useInterveneDept();
  const [result, setResult] = useState<string | null>(null);

  if (!isSuperAdmin && !can(PERMISSION_KEY)) {
    return null;
  }

  const handleClick = async () => {
    setResult(null);
    try {
      const { notified } = await intervene.mutateAsync({
        department_id: departmentId,
        department_name: departmentName,
        miss_count: missCount,
        tier,
        institution_id: institutionId ?? null,
      });
      setResult(
        notified > 0 ? `Notified ${notified}` : 'No recipients found',
      );
    } catch (e) {
      setResult(e instanceof Error ? e.message : 'Failed');
    }
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            disabled={intervene.isPending}
            title={`Send an intervention notification about ${departmentName} to its HOD and the AI Pulse Champions.`}
          >
            {intervene.isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : result ? (
              <Check className="mr-1 h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <BellRing className="mr-1 h-3.5 w-3.5" />
            )}
            Intervene
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send intervention notice?</AlertDialogTitle>
            <AlertDialogDescription>
              This notifies the department&apos;s HOD and the AI Pulse Champion
              and records the intervention. It can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={intervene.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClick}
              disabled={intervene.isPending}
            >
              Yes, notify
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {result && (
        <span className="text-[10px] text-muted-foreground">{result}</span>
      )}
    </div>
  );
}
