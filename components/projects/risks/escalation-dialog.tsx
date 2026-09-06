'use client';

/**
 * Escalation Dialog — manually escalate one risk + show its escalation history.
 *
 * Manual path only: pick a level + reason → writes a project_risk_escalations
 * row and flags the risk is_escalated. Auto-escalation is a cron concern (see
 * RiskService.escalateRisk TODO + policy keys pm.escalation_*).
 *
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F3 (manual + auto
 * escalation; this UI ships the manual half).
 */

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, AlertTriangle, Bot, User } from 'lucide-react';
import { useEscalateRisk, useEscalations } from '@/hooks/projects/use-risks';
import type { ProjectRisk } from '@/types/projects';
import type { EscalationLevel } from '@/types/projects-risks';

const ESCALATION_LEVELS: { key: EscalationLevel; label: string }[] = [
  { key: 'manager', label: 'Project manager' },
  { key: 'sponsor', label: 'Sponsor' },
  { key: 'director', label: 'Director' },
];

interface EscalationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  risk: ProjectRisk;
}

export function EscalationDialog({ open, onOpenChange, risk }: EscalationDialogProps) {
  const [level, setLevel] = useState<EscalationLevel>('manager');
  const [reason, setReason] = useState('');

  const { data: history } = useEscalations(open ? risk.id : null);
  const escalate = useEscalateRisk();

  async function handleEscalate() {
    try {
      await escalate.mutateAsync({
        risk_id: risk.id,
        escalation_level: level,
        reason: reason.trim() || null,
        is_auto: false,
      });
      toast.success('Risk escalated.');
      setReason('');
    } catch (err) {
      toast.error(`Failed to escalate: ${(err as Error)?.message ?? 'error'}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            Escalate risk
          </DialogTitle>
          <DialogDescription className="line-clamp-2">{risk.title}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Escalate to</Label>
            <Select value={level} onValueChange={(v) => setLevel(v as EscalationLevel)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ESCALATION_LEVELS.map((l) => (
                  <SelectItem key={l.key} value={l.key}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="esc-reason">Reason</Label>
            <Textarea
              id="esc-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this being escalated now?"
              rows={2}
            />
          </div>

          {/* History */}
          <div className="space-y-1.5">
            <Label>Escalation history</Label>
            {(history?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">
                Not escalated yet.
              </p>
            ) : (
              <ul className="max-h-40 space-y-1.5 overflow-y-auto">
                {history!.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-sm"
                  >
                    {e.is_auto ? (
                      <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                    ) : (
                      <User className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium capitalize">
                          {e.escalation_level ?? 'escalated'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {e.is_auto ? 'auto' : 'manual'} ·{' '}
                          {new Date(e.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      {e.reason && (
                        <p className="text-xs text-muted-foreground">{e.reason}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            variant="destructive"
            onClick={handleEscalate}
            disabled={escalate.isPending}
          >
            {escalate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Escalate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
