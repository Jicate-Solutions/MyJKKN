'use client';

import { useEffect, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  RoutingErrorsService,
  type RoutingError,
} from '@/lib/services/admission/routing-errors-service';
import toast from 'react-hot-toast';

interface Props {
  error: RoutingError | null;
  onClose: () => void;
  onResolved: () => void;
}

export function ErrorDetailDrawer({ error, onClose, onResolved }: Props) {
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reset local state when a new row is selected
  useEffect(() => {
    setNotes('');
    setSubmitError(null);
  }, [error?.id]);

  const open = !!error;
  const isResolved = !!error?.resolved_at;

  const handleResolve = async () => {
    if (!error) return;
    if (!notes.trim()) {
      setSubmitError('Resolution notes are required.');
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await RoutingErrorsService.markResolved(error.id, notes.trim());
      toast.success('Routing error marked as resolved');
      onResolved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to mark resolved';
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Routing error detail
          </SheetTitle>
          <SheetDescription>
            Full diagnostic context for this counselor-routing failure.
          </SheetDescription>
        </SheetHeader>

        {error && (
          <div className="mt-6 space-y-5">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Occurred at</div>
                <div className="font-mono">
                  {new Date(error.occurred_at).toISOString()}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Tier</div>
                <div>
                  {error.tier_order != null ? (
                    <Badge variant="outline">Tier {error.tier_order}</Badge>
                  ) : (
                    <span className="text-muted-foreground">pre-tier</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">SQLSTATE</div>
                <div>
                  {error.sqlstate ? (
                    <code className="text-xs">{error.sqlstate}</code>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Outcome</div>
                <div>
                  {error.resulted_in_unassigned ? (
                    <Badge variant="destructive">Unassigned</Badge>
                  ) : (
                    <Badge variant="secondary">Recovered</Badge>
                  )}
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-muted-foreground">Lead ID</div>
                <div className="font-mono text-xs break-all">
                  {error.lead_id ?? '—'}
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-muted-foreground">Institution ID</div>
                <div className="font-mono text-xs break-all">
                  {error.institution_id ?? '—'}
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <Label className="text-xs text-muted-foreground">
                Error message
              </Label>
              <pre className="mt-1 whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-xs">
                {error.error_message}
              </pre>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">
                Context (NEW row at time of failure)
              </Label>
              <pre className="mt-1 max-h-72 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
                {JSON.stringify(error.context ?? {}, null, 2)}
              </pre>
            </div>

            <Separator />

            {isResolved ? (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  Resolved at{' '}
                  <span className="font-mono">
                    {new Date(error.resolved_at!).toISOString()}
                  </span>
                  {error.resolution_notes && (
                    <div className="mt-2 whitespace-pre-wrap">
                      {error.resolution_notes}
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="resolution-notes" className="text-sm">
                    Resolution notes
                  </Label>
                  <Textarea
                    id="resolution-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="What was the underlying cause? What did you change to prevent recurrence?"
                    rows={4}
                    className="mt-1"
                  />
                </div>

                {submitError && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{submitError}</AlertDescription>
                  </Alert>
                )}

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                    Cancel
                  </Button>
                  <Button onClick={handleResolve} disabled={isSubmitting}>
                    {isSubmitting && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Mark resolved
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
