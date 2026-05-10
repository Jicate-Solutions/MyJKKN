'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';

import {
  useAttendanceStatusTypes,
  useRegularizationReasons,
  useSubmitRegularization,
} from '@/hooks/hr/use-regularization';

interface RegularizeFormProps {
  employeeId: string;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export function RegularizeForm({ employeeId }: RegularizeFormProps) {
  const { data: reasons, isLoading: reasonsLoading } = useRegularizationReasons();
  const { data: statusTypes, isLoading: statusLoading } = useAttendanceStatusTypes();
  const submit = useSubmitRegularization();

  const [forDate, setForDate] = useState<string>(todayIso());
  const [reasonCodeId, setReasonCodeId] = useState<string>('');
  const [reasonText, setReasonText] = useState<string>('');
  const [proposedStatusTypeId, setProposedStatusTypeId] = useState<string>('');

  const reasonsAvailable = (reasons?.length ?? 0) > 0;

  const canSubmit =
    !!forDate &&
    (!!reasonCodeId || reasonText.trim().length > 0) &&
    !submit.isPending;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    await submit
      .mutateAsync({
        employeeId,
        forDate,
        reasonCodeId: reasonCodeId || null,
        reasonText: reasonText.trim() ? reasonText.trim() : null,
        proposedStatusTypeId: proposedStatusTypeId || null,
      })
      .then(() => {
        // Reset form on success.
        setReasonCodeId('');
        setReasonText('');
        setProposedStatusTypeId('');
      })
      .catch(() => {
        /* toast handled in hook */
      });
  };

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="for-date">Date being regularized</Label>
              <Input
                id="for-date"
                type="date"
                value={forDate}
                max={todayIso()}
                onChange={(e) => setForDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="reason-code">
                Reason{reasonsAvailable ? '' : ' (free text)'}
              </Label>
              {reasonsAvailable ? (
                <Select
                  value={reasonCodeId}
                  onValueChange={(v) => setReasonCodeId(v)}
                  disabled={reasonsLoading}
                >
                  <SelectTrigger id="reason-code">
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {(reasons ?? []).map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="reason-code"
                  placeholder="Brief reason"
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                />
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="proposed-status">Proposed status</Label>
            <Select
              value={proposedStatusTypeId}
              onValueChange={(v) => setProposedStatusTypeId(v)}
              disabled={statusLoading}
            >
              <SelectTrigger id="proposed-status">
                <SelectValue placeholder="What should this day be marked as?" />
              </SelectTrigger>
              <SelectContent>
                {(statusTypes ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              HR will review and may overwrite your proposed status.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any extra context for the approver"
              rows={3}
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={!canSubmit}>
              {submit.isPending ? 'Submitting...' : 'Submit request'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
