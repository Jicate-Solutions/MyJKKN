'use client';

/**
 * The form that finally makes sh_community_engagements writable.
 *
 * The SDGs are checkboxes, not a Select: `sdg_goals` is a multi-value column,
 * and Radix Select is single-value with a documented empty-string footgun
 * (scripts/ci/check-radix-select-empty-values.sh). Both Selects on this form —
 * the optional solution link and the optional event link — use an explicit
 * sentinel for "none" rather than the empty string for the same reason, and the
 * one multi-value picker (the other departments that ran the initiative) is a
 * cmdk combobox rather than a Select at all.
 *
 * TWO OPTIONAL FIELDS BELONG TO A SUBSTRATE THAT SHIPS SEPARATELY — naming
 * other departments, and linking the initiative to an event. Neither is
 * offered unless this build can actually save it; see ./engagement-participants.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import {
  useDepartmentSolutionOptions,
  useRecordCommunityEngagement,
} from '@/hooks/solutions/use-community-engagements';
import {
  FUTURE_ENGAGEMENT_DATE_MESSAGE,
  SDG_GOALS,
  todayLocalISO,
} from '@/lib/services/solutions/societal-service';
import {
  participantsSupport,
  useAddEngagementParticipants,
  useLinkEngagementToEvent,
} from './engagement-participants';
import { EngagementEventField, JointDepartmentsField, NO_EVENT } from './joint-work-fields';

/** Radix Select rejects value=""; this is the "no solution linked" option. */
const NO_SOLUTION = '__none__';

interface RecordEngagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departmentId: string;
  institutionId: string | null;
}

export function RecordEngagementDialog({
  open,
  onOpenChange,
  departmentId,
  institutionId,
}: RecordEngagementDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // Recomputed on every render rather than frozen at mount: a form left open
  // across midnight would otherwise cap the input at yesterday.
  const maxEngagementDate = todayLocalISO();
  const [engagementDate, setEngagementDate] = useState(todayLocalISO);
  const [hours, setHours] = useState('');
  const [beneficiaries, setBeneficiaries] = useState('');
  const [goals, setGoals] = useState<string[]>([]);
  const [solutionId, setSolutionId] = useState<string>(NO_SOLUTION);
  const [jointDepartmentIds, setJointDepartmentIds] = useState<string[]>([]);
  const [eventId, setEventId] = useState<string>(NO_EVENT);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: solutionOptions = [], error: solutionOptionsError } =
    useDepartmentSolutionOptions(departmentId, open);
  const record = useRecordCommunityEngagement();
  const addParticipants = useAddEngagementParticipants();
  const linkEvent = useLinkEngagementToEvent();

  // Asked of the build, not assumed of it. The substrate for joint departments
  // and the event link ships separately, so this form must be able to say "not
  // here yet" rather than offer a field whose value goes nowhere.
  const support = participantsSupport();

  /** One submission is in flight across all three writes, not just the first. */
  const busy = record.isPending || addParticipants.isPending || linkEvent.isPending;

  const reset = () => {
    setTitle('');
    setDescription('');
    setEngagementDate(todayLocalISO());
    setHours('');
    setBeneficiaries('');
    setGoals([]);
    setSolutionId(NO_SOLUTION);
    setJointDepartmentIds([]);
    setEventId(NO_EVENT);
    setFormError(null);
  };

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const toggleGoal = (code: string, checked: boolean) => {
    setGoals((prev) => (checked ? [...prev, code] : prev.filter((c) => c !== code)));
  };

  const handleSubmit = async () => {
    setFormError(null);

    const hoursValue = hours.trim() === '' ? 0 : Number(hours);
    const beneficiariesValue = beneficiaries.trim() === '' ? 0 : Number(beneficiaries);

    if (!title.trim()) {
      setFormError('Give the engagement a title.');
      return;
    }
    if (!engagementDate) {
      setFormError('Give the engagement a date.');
      return;
    }
    // Mirrors the identical guard in SocietalService.record(). Neither is the
    // control on its own — this one is convenience, that one is the last line
    // the application owns — but a date ahead of today would set the
    // department's activity clock into the future and hold it out of dormancy
    // until that date arrives.
    if (engagementDate > maxEngagementDate) {
      setFormError(FUTURE_ENGAGEMENT_DATE_MESSAGE);
      return;
    }
    if (!Number.isFinite(hoursValue) || hoursValue < 0) {
      setFormError('Hours spent must be a number and cannot be negative.');
      return;
    }
    if (!Number.isInteger(beneficiariesValue) || beneficiariesValue < 0) {
      setFormError('People reached must be a whole number and cannot be negative.');
      return;
    }

    try {
      const engagement = await record.mutateAsync({
        department_id: departmentId,
        institution_id: institutionId,
        solution_id: solutionId === NO_SOLUTION ? null : solutionId,
        title,
        description,
        engagement_date: engagementDate,
        hours_spent: hoursValue,
        beneficiaries_count: beneficiariesValue,
        sdg_goals: goals,
      });

      /**
       * THE ENTRY IS SAVED BY THIS POINT. The two follow-up writes can still
       * fail on their own, and when one does the coordinator must not be told
       * "recorded" and left believing three departments were named. The dialog
       * closes either way — re-submitting the same form would create a second
       * copy of the initiative, which is exactly the double-counting this
       * feature exists to stop — and the message says precisely which half
       * landed and which did not.
       */
      const partialFailures: string[] = [];
      // What the database actually created, never what the form asked for. A
      // department already on the initiative is returned as `alreadyNamed`, not
      // as `added`, and announcing the ask would let "all three were already
      // named, nothing happened" read as "three departments named".
      let namedCount = 0;

      if (jointDepartmentIds.length > 0 && support.canAdd) {
        try {
          const outcome = await addParticipants.mutateAsync({
            engagementId: engagement.id,
            departmentIds: jointDepartmentIds,
          });
          namedCount = outcome?.added?.length ?? 0;
        } catch (err: unknown) {
          partialFailures.push(
            `the other departments were not named (${
              err instanceof Error ? err.message : 'the write was refused'
            })`
          );
        }
      }

      if (eventId !== NO_EVENT && support.canLinkEvent) {
        try {
          await linkEvent.mutateAsync({ engagementId: engagement.id, eventId });
        } catch (err: unknown) {
          partialFailures.push(
            `the event was not linked (${
              err instanceof Error ? err.message : 'the write was refused'
            })`
          );
        }
      }

      if (partialFailures.length > 0) {
        toast.error(
          `The entry was saved, but ${partialFailures.join(' and ')}. Do not record it again — ` +
            'open the entry and add what is missing, or ask an administrator.',
          { duration: 15000 }
        );
      } else if (namedCount > 0) {
        toast.success(
          `Recorded, and ${namedCount} other department${
            namedCount === 1 ? '' : 's'
          } named. Each one confirms its own part; until it does, it counts towards nobody. ` +
            'The entry itself still waits for a head of department to approve it.'
        );
      } else {
        toast.success('Recorded. It now waits for a head of department to approve it.');
      }

      close(false);
    } catch (err: unknown) {
      // Rule 27: the database's refusal is shown, never swallowed into a
      // closed dialog that looks like it saved.
      setFormError(err instanceof Error ? err.message : 'The engagement could not be recorded.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record a community engagement</DialogTitle>
          <DialogDescription>
            Work this department did for the community that produced no invoice. It is saved as
            waiting for approval — a head of department approves it, and only then does it count
            towards the department&apos;s activity.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="engagement-title">What was done</Label>
            <Input
              id="engagement-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Free eye-screening camp at Kumarapalayam"
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="engagement-description">Details (optional)</Label>
            <Textarea
              id="engagement-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Who took part, where it happened, what came of it."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="engagement-date">Date</Label>
              <Input
                id="engagement-date"
                type="date"
                max={maxEngagementDate}
                value={engagementDate}
                onChange={(e) => setEngagementDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="engagement-hours">Hours spent</Label>
              <Input
                id="engagement-hours"
                type="number"
                min={0}
                step="0.5"
                inputMode="decimal"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="engagement-beneficiaries">People reached</Label>
              <Input
                id="engagement-beneficiaries"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={beneficiaries}
                onChange={(e) => setBeneficiaries(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="engagement-solution">Linked solution (optional)</Label>
            <Select value={solutionId} onValueChange={setSolutionId}>
              <SelectTrigger id="engagement-solution">
                <SelectValue placeholder="Not linked to a solution" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SOLUTION}>Not linked to a solution</SelectItem>
                {solutionOptions.map((solution) => (
                  <SelectItem key={solution.id} value={solution.id}>
                    {solution.solution_code ? `${solution.solution_code} — ` : ''}
                    {solution.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {solutionOptionsError ? (
              // The list failing to load and the department leading no solutions
              // produce the same empty picker, and they mean opposite things.
              // Say which one happened; the link is optional, so the entry can
              // still be saved without it.
              <p className="text-xs text-amber-700 dark:text-amber-400">
                The list of this department&apos;s solutions could not be loaded, so this picker is
                empty for a reason that is not &ldquo;there are none&rdquo;. You can still save the
                entry without a link.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Most community work has no solution behind it. Leave this alone if that is the case.
              </p>
            )}
          </div>

          <JointDepartmentsField
            recordingDepartmentId={departmentId}
            selectedDepartmentIds={jointDepartmentIds}
            onChange={setJointDepartmentIds}
            disabled={busy}
            supported={support.canAdd}
          />

          <EngagementEventField
            value={eventId}
            onChange={setEventId}
            disabled={busy}
            supported={support.canLinkEvent}
          />

          <div className="space-y-2">
            <Label>Sustainable Development Goals addressed (optional)</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto rounded-md border border-border p-3">
              {SDG_GOALS.map((goal) => {
                const checked = goals.includes(goal.code);
                return (
                  <label
                    key={goal.code}
                    htmlFor={`sdg-${goal.code}`}
                    className="flex items-start gap-2 text-sm cursor-pointer rounded-md px-2 py-1 hover:bg-muted"
                  >
                    <Checkbox
                      id={`sdg-${goal.code}`}
                      checked={checked}
                      onCheckedChange={(value) => toggleGoal(goal.code, value === true)}
                      className="mt-0.5"
                    />
                    <span className="text-foreground">
                      <span className="font-medium">SDG {goal.number}</span>{' '}
                      <span className="text-muted-foreground">{goal.title}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {formError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={busy}>
            {busy ? 'Submitting…' : 'Submit for approval'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
