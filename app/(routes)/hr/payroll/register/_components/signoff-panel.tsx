'use client';

/**
 * Who signed this register, and when (migration 20271007161107).
 *
 * Two rows, in order: the college check, then the accounts sign-off. A signed
 * row shows the person's name and the time. An unsigned row offers Sign only to
 * someone holding that step's key; the database still decides (the generator,
 * the order, one person per step, the college), and its refusal is shown as is.
 * The person who signed sees a link to withdraw their signature.
 *
 * Nothing here changes a figure on the register.
 */

import { useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { getErrorMessage } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useRegisterSignoffStatus,
  useRevokeRegisterSignoff,
  useSignRegister,
} from '@/hooks/hr/payroll/use-register-signoff';
import {
  REGISTER_SIGNOFF_STAGES,
  REGISTER_SIGNOFF_STAGE_KEY,
  REGISTER_SIGNOFF_STAGE_LABEL,
  type RegisterSignoffStage,
  type RegisterSignoffStep,
} from '@/types/hr-register-signoff';

const signedAtText = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

interface Props {
  runId: string;
  /** A replaced register cannot be signed; the panel still shows its history. */
  isSuperseded?: boolean;
}

export function SignoffPanel({ runId, isSuperseded = false }: Props) {
  const { canAccess } = usePermissions();
  const status = useRegisterSignoffStatus(runId);
  const sign = useSignRegister(runId);
  const revoke = useRevokeRegisterSignoff(runId);

  const [signing, setSigning] = useState<RegisterSignoffStage | null>(null);
  const [note, setNote] = useState('');
  const [revoking, setRevoking] = useState<RegisterSignoffStep | null>(null);
  const [reason, setReason] = useState('');

  const holdsKey = (stage: RegisterSignoffStage) => {
    const key = REGISTER_SIGNOFF_STAGE_KEY[stage];
    const dot = key.lastIndexOf('.');
    return canAccess(key.slice(0, dot), key.slice(dot + 1));
  };

  const stages = status.data?.stages;
  const nothingSigned = Boolean(stages) && REGISTER_SIGNOFF_STAGES.every((s) => !stages?.[s]?.signed);

  const confirmSign = () => {
    if (!signing) return;
    sign.mutate(
      { stage: signing, note: note.trim() || null },
      {
        onSuccess: () => {
          toast.success(`${REGISTER_SIGNOFF_STAGE_LABEL[signing]} recorded.`);
          setSigning(null);
          setNote('');
        },
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    );
  };

  const confirmRevoke = () => {
    if (!revoking?.signoff_id) return;
    revoke.mutate(
      { signoffId: revoking.signoff_id, reason: reason.trim() },
      {
        onSuccess: (res) => {
          toast.success(
            res?.also_withdrew_sign
              ? 'Signature withdrawn. The accounts sign-off was withdrawn with it.'
              : 'Signature withdrawn.',
          );
          setRevoking(null);
          setReason('');
        },
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    );
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <h2 className="text-sm font-medium">Sign-off</h2>

        {status.isLoading && <Skeleton className="h-16 w-full" />}

        {status.error && (
          <p className="text-sm text-destructive" role="alert">
            {getErrorMessage(status.error)}
          </p>
        )}

        {stages && (
          <ul className="divide-y">
            {REGISTER_SIGNOFF_STAGES.map((stage) => {
              const step = stages[stage];
              const signed = Boolean(step?.signed);
              return (
                <li
                  key={stage}
                  data-testid={`signoff-row-${stage}`}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {signed ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-500" />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="text-sm">{REGISTER_SIGNOFF_STAGE_LABEL[stage]}</span>
                  </div>

                  <div className="flex min-w-0 items-center gap-3 text-sm">
                    {signed ? (
                      <>
                        <span className="truncate">
                          {step.signer_name ?? 'Unknown person'}
                          <span className="text-muted-foreground"> · {signedAtText(step.signed_at)}</span>
                        </span>
                        {step.is_mine && (
                          <button
                            type="button"
                            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                            onClick={() => setRevoking(step)}
                          >
                            Withdraw
                          </button>
                        )}
                      </>
                    ) : !isSuperseded && holdsKey(stage) ? (
                      <Button size="sm" variant="outline" onClick={() => setSigning(stage)}>
                        Sign
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">Not signed</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {nothingSigned && (
          <p className="text-sm text-muted-foreground">This register has not been signed.</p>
        )}
      </CardContent>

      <Dialog open={Boolean(signing)} onOpenChange={(open) => { if (!open) { setSigning(null); setNote(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{signing ? REGISTER_SIGNOFF_STAGE_LABEL[signing] : ''}</DialogTitle>
            <DialogDescription>
              Your name and the time are recorded against this register. You can withdraw it later
              with a reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="signoff-note">Note (optional)</Label>
            <Textarea
              id="signoff-note"
              value={note}
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSigning(null); setNote(''); }}>
              Cancel
            </Button>
            <Button onClick={confirmSign} disabled={sign.isPending}>
              {sign.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(revoking)} onOpenChange={(open) => { if (!open) { setRevoking(null); setReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw your signature</DialogTitle>
            <DialogDescription>
              {revoking?.stage === 'college_check'
                ? 'Withdrawing the college check also withdraws the accounts sign-off.'
                : 'The register goes back to waiting for this step.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="signoff-reason">Reason (at least 10 characters)</Label>
            <Textarea
              id="signoff-reason"
              value={reason}
              maxLength={1000}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRevoking(null); setReason(''); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmRevoke}
              disabled={revoke.isPending || reason.trim().length < 10}
            >
              {revoke.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Withdraw
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
