'use client';

/**
 * Term Actions - Client components for term management
 * Includes create term dialog and status update buttons
 */

import { useState } from 'react';
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

export function TermActions({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [termType, setTermType] = useState<'annual' | 'executive_rotation'>('annual');
  const [description, setDescription] = useState('');

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

    setName('');
    setStartDate('');
    setEndDate('');
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
