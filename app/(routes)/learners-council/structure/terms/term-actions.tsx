'use client';

/**
 * Term Actions - Client components for term management
 * Includes create term dialog and status update buttons
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Plus, ArrowRight } from 'lucide-react';
import { useCreateTerm, useUpdateTerm } from '@/hooks/learners-council/use-lc-structure';

// ============================================================================
// CREATE TERM DIALOG
// ============================================================================

/**
 * Compute sensible academic-year defaults for a new term.
 *
 * JKKN's academic year runs July 1 → June 30 and is labeled "YYYY-YY"
 * (e.g. 2026-27 = Jul 2026 → Jun 2027). These defaults steer users away
 * from accidentally creating calendar-year terms (Jan 1 → Dec 31), which
 * has been a source of drift.
 *
 *   Current month range   | Default academic year
 *   ----------------------|----------------------
 *   Jul–Dec               | current year          (e.g. Oct 2026 → 2026-27)
 *   Jan–Mar               | current year − 1      (e.g. Feb 2027 → 2026-27, still in it)
 *   Apr–Jun               | current year          (planning the upcoming Jul start)
 *
 * Executive rotation defaults to the first half (Jul–Dec) of the same
 * academic year. User can always override the dates manually.
 */
function computeAcademicYearDefaults(
  termType: 'annual' | 'executive_rotation'
): { name: string; start_date: string; end_date: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  // Picks the academic year the user is most likely planning.
  const startYear =
    month >= 7 ? year : month <= 3 ? year - 1 : year; // Apr–Jun: plan upcoming Jul.
  const endYear = startYear + 1;
  const label = `${startYear}-${String(endYear).slice(-2)}`;

  if (termType === 'executive_rotation') {
    return {
      name: `LC Exec Rotation H1 ${label}`,
      start_date: `${startYear}-07-01`,
      end_date: `${startYear}-12-31`,
    };
  }
  return {
    name: `LC Term ${label}`,
    start_date: `${startYear}-07-01`,
    end_date: `${endYear}-06-30`,
  };
}

export function TermActions({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const initial = computeAcademicYearDefaults('annual');
  const [name, setName] = useState(initial.name);
  const [startDate, setStartDate] = useState(initial.start_date);
  const [endDate, setEndDate] = useState(initial.end_date);
  const [termType, setTermType] = useState<'annual' | 'executive_rotation'>('annual');
  const [description, setDescription] = useState('');

  // Re-prefill academic-year defaults when the term type changes. Users can
  // still manually edit any field afterward — this just sets a sensible
  // starting point so the dialog never presents empty date inputs.
  useEffect(() => {
    const d = computeAcademicYearDefaults(termType);
    setName(d.name);
    setStartDate(d.start_date);
    setEndDate(d.end_date);
  }, [termType]);

  const createTerm = useCreateTerm();

  const handleSubmit = async () => {
    if (!name || !startDate || !endDate) return;

    await createTerm.mutateAsync({
      data: {
        name,
        start_date: startDate,
        end_date: endDate,
        term_type: termType,
        description: description || undefined
      },
      userId
    });

    // Reset to fresh academic-year defaults for the next term creation
    const d = computeAcademicYearDefaults('annual');
    setName(d.name);
    setStartDate(d.start_date);
    setEndDate(d.end_date);
    setTermType('annual');
    setDescription('');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" />
          New Term
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Governance Term</DialogTitle>
          <DialogDescription>
            Define a new LC governance period. Annual terms run for a full year, while executive rotations last 6 months.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="term-name">Term Name</Label>
            <Input
              id="term-name"
              placeholder="e.g., LC Term 2025-26"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="term-type">Term Type</Label>
            <Select value={termType} onValueChange={(v) => setTermType(v as 'annual' | 'executive_rotation')}>
              <SelectTrigger id="term-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="annual">Annual</SelectItem>
                <SelectItem value="executive_rotation">6-Month Executive Rotation</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="start-date">Start Date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="end-date">End Date</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              JKKN academic year runs <span className="font-medium">July 1 → June 30</span>. Defaults are pre-filled based on the term type; override if backfilling a past period.
            </p>
          </div>

          <div>
            <Label htmlFor="term-desc">Description (optional)</Label>
            <Textarea
              id="term-desc"
              placeholder="Notes about this term..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name || !startDate || !endDate || createTerm.isPending}
          >
            {createTerm.isPending ? 'Creating...' : 'Create Term'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// TERM STATUS UPDATE BUTTONS
// ============================================================================

const statusTransitions: Record<string, { label: string; next: string }[]> = {
  upcoming: [{ label: 'Activate', next: 'active' }],
  active: [{ label: 'Complete', next: 'completed' }],
  completed: [{ label: 'Archive', next: 'archived' }],
  archived: []
};

export function TermStatusButtons({ termId, currentStatus }: { termId: string; currentStatus: string }) {
  const updateTerm = useUpdateTerm();
  const transitions = statusTransitions[currentStatus] || [];

  if (transitions.length === 0) return null;

  return (
    <div className="flex gap-1">
      {transitions.map((t) => (
        <Button
          key={t.next}
          variant="ghost"
          size="sm"
          className="text-xs h-7"
          disabled={updateTerm.isPending}
          onClick={() => updateTerm.mutate({ id: termId, data: { status: t.next as any } })}
        >
          {t.label}
          <ArrowRight className="h-3 w-3 ml-1" />
        </Button>
      ))}
    </div>
  );
}
