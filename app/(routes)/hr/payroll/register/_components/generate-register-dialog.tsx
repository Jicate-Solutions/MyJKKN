'use client';

/**
 * Generate a register: pick an institution and a month, read the readiness, act.
 *
 * THE READINESS CHECK IS THE POINT OF THIS DIALOG, not a formality attached to
 * it. A register freezes money against day counts, so generating one over a
 * month that is still open — or over a roster nobody has salaries for — produces
 * a document that looks authoritative and is wrong. ReadinessPanel is reused
 * from the previous page and brings its own Generate button, which it disables
 * while `can_generate` is false.
 *
 * The check runs AGAIN server-side in the route handler. This one decides what
 * to show; that one decides what happens.
 *
 * NO STATE-SYNCING EFFECTS. The form is a separate component rendered only while
 * the dialog is open, so Radix unmounts it on close and `useState`'s initialiser
 * re-seeds it from `initial` on every open — which is what an effect watching
 * `open` would have been faking. The "default to the first institution" case is
 * DERIVED rather than stored, so nothing has to write state during render either.
 */

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getErrorMessage } from '@/lib/utils';
import { useHrOrgMappings } from '@/hooks/hr/use-hr-org-mappings';
import {
  useGenerateSalaryRegister,
  useSalaryRegisterPreflight,
} from '@/hooks/hr/payroll/use-salary-register';

import { ReadinessPanel } from './readiness-panel';
import { MONTHS } from './run-columns';

export interface GenerateInitial {
  /** hr_organization_id from the Attendance · Month Close deep link, if any. */
  orgId: string | null;
  year: number;
  month: number;
}

function GenerateForm({
  initial,
  canManage,
  onGenerated,
}: {
  initial: GenerateInitial;
  canManage: boolean;
  onGenerated: () => void;
}) {
  const router = useRouter();
  const { mappings, isLoading: orgsLoading } = useHrOrgMappings();

  // Seeded once per opening — this component is mounted by the open dialog.
  const [pickedOrgId, setPickedOrgId] = useState<string | null>(initial.orgId);
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);

  // Derived, not stored: falling back to the first accessible institution keeps
  // the dialog from opening on an empty picker, which reads as "nothing here"
  // rather than "choose one".
  const orgId = pickedOrgId ?? mappings[0]?.hr_organization_id ?? null;

  const preflight = useSalaryRegisterPreflight(orgId, year, month);
  const generate = useGenerateSalaryRegister();

  const stepMonth = useCallback((delta: number) => {
    setMonth((m) => {
      const next = m + delta;
      if (next < 1) { setYear((y) => y - 1); return 12; }
      if (next > 12) { setYear((y) => y + 1); return 1; }
      return next;
    });
  }, []);

  const handleGenerate = useCallback(() => {
    if (!orgId) return;
    generate.mutate(
      { hrOrganizationId: orgId, year, month },
      {
        onSuccess: (res) => {
          toast.success(
            res.excluded > 0
              ? `Register generated. ${res.included} payable, ${res.excluded} excluded.`
              : `Register generated for ${res.included} staff.`,
          );
          onGenerated();
          // Straight to the register that was just made — looking at it is the
          // reason anyone opened this dialog. The mutation has already dropped
          // SALARY_REGISTER_KEYS.all, so the index behind is correct either way.
          if (res.run_id) router.push(`/hr/payroll/register/${res.run_id}`);
        },
        // The service's refusals are the whole point of the readiness check, so
        // they are surfaced verbatim rather than replaced with a generic failure.
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    );
  }, [orgId, year, month, generate, onGenerated, router]);

  return (
    <div className="-mx-6 min-h-0 flex-1 space-y-4 overflow-y-auto px-6">
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="gen-institution">Institution</Label>
          <Select
            value={orgId ?? ''}
            onValueChange={setPickedOrgId}
            disabled={orgsLoading || mappings.length === 0}
          >
            <SelectTrigger id="gen-institution">
              <SelectValue placeholder={orgsLoading ? 'Loading…' : 'Choose an institution'} />
            </SelectTrigger>
            <SelectContent>
              {mappings.map((m) => (
                <SelectItem key={m.hr_organization_id} value={m.hr_organization_id}>
                  {m.organization_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Month</Label>
          <div className="flex items-center gap-1">
            <Button
              type="button" variant="outline" size="icon" className="h-9 w-9"
              onClick={() => stepMonth(-1)} aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex h-9 min-w-[10rem] items-center justify-center gap-2 rounded-md border border-border px-3 text-sm">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              {MONTHS[month - 1]} {year}
            </div>
            <Button
              type="button" variant="outline" size="icon" className="h-9 w-9"
              onClick={() => stepMonth(1)} aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {!orgId ? (
        <p className="text-sm text-muted-foreground">
          {orgsLoading
            ? 'Loading the institutions you can generate for…'
            : 'You have access to no institution that can hold a register.'}
        </p>
      ) : (
        <ReadinessPanel
          preflight={preflight.data}
          isLoading={preflight.isLoading}
          error={preflight.error as Error | null}
          canManage={canManage}
          isGenerating={generate.isPending}
          onGenerate={handleGenerate}
        />
      )}
    </div>
  );
}

export function GenerateRegisterDialog({
  open,
  onOpenChange,
  canManage,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
  initial: GenerateInitial;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* A flex shell, not a scrolling root: the readiness panel grows with the
          number of blockers, and only the body should scroll. */}
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Generate a register</DialogTitle>
          <DialogDescription>
            Freezes this month&apos;s day counts and each person&apos;s recorded salary into
            a register. Close the attendance month first.
          </DialogDescription>
        </DialogHeader>

        {/* Mounted only while open, which is what re-seeds the form. */}
        {open && (
          <GenerateForm
            initial={initial}
            canManage={canManage}
            onGenerated={() => onOpenChange(false)}
          />
        )}

        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
