'use client';

/**
 * Member Actions - Client components for member management
 * Includes assign member dialog, status update, and position history viewer
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { UserPlus, Filter, History, X } from 'lucide-react';
import {
  useAssignMember,
  useUpdateMemberStatus,
  usePositionHistory
} from '@/hooks/learners-council/use-lc-structure';
import type { LCPosition, LCTerm } from '@/types/learners-council';

// ============================================================================
// ASSIGN MEMBER DIALOG
// ============================================================================

interface AssignMemberDialogProps {
  positions: LCPosition[];
  terms: LCTerm[];
  institutions: { id: string; name: string }[];
}

export function AssignMemberDialog({ positions, terms, institutions }: AssignMemberDialogProps) {
  const [open, setOpen] = useState(false);
  const [termId, setTermId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [userId, setUserId] = useState('');
  const [institutionId, setInstitutionId] = useState('');
  const [notes, setNotes] = useState('');

  const assignMember = useAssignMember();

  const handleSubmit = async () => {
    if (!termId || !positionId || !userId || !institutionId) return;

    await assignMember.mutateAsync({
      term_id: termId,
      position_id: positionId,
      user_id: userId,
      institution_id: institutionId,
      appointment_notes: notes || undefined
    });

    setTermId('');
    setPositionId('');
    setUserId('');
    setInstitutionId('');
    setNotes('');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="h-4 w-4 mr-1" />
          Assign Member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Learner to LC Position</DialogTitle>
          <DialogDescription>
            Assign a learner to a council position for the selected term.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="assign-term">Term</Label>
            <Select value={termId} onValueChange={setTermId}>
              <SelectTrigger id="assign-term">
                <SelectValue placeholder="Select term" />
              </SelectTrigger>
              <SelectContent>
                {terms.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({t.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="assign-position">Position</Label>
            <Select value={positionId} onValueChange={setPositionId}>
              <SelectTrigger id="assign-position">
                <SelectValue placeholder="Select position" />
              </SelectTrigger>
              <SelectContent>
                {positions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title} ({p.category})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="assign-user">Learner User ID</Label>
            <Input
              id="assign-user"
              placeholder="Enter the learner's user ID"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              The UUID of the learner from the profiles table
            </p>
          </div>

          <div>
            <Label htmlFor="assign-institution">Home Institution</Label>
            <Select value={institutionId} onValueChange={setInstitutionId}>
              <SelectTrigger id="assign-institution">
                <SelectValue placeholder="Select institution" />
              </SelectTrigger>
              <SelectContent>
                {institutions.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="assign-notes">Appointment Notes (optional)</Label>
            <Textarea
              id="assign-notes"
              placeholder="Notes about this appointment..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
            disabled={!termId || !positionId || !userId || !institutionId || assignMember.isPending}
          >
            {assignMember.isPending ? 'Assigning...' : 'Assign Member'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// MEMBER STATUS UPDATE
// ============================================================================

const statusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'on_leave', label: 'On Leave' },
  { value: 'graduated', label: 'Graduated' },
  { value: 'removed', label: 'Removed' }
];

export function MemberStatusSelect({ memberId, currentStatus }: { memberId: string; currentStatus: string }) {
  const updateStatus = useUpdateMemberStatus();

  return (
    <Select
      value={currentStatus}
      onValueChange={(value) => updateStatus.mutate({ id: memberId, status: value })}
      disabled={updateStatus.isPending}
    >
      <SelectTrigger className="h-7 w-[120px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {statusOptions.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ============================================================================
// POSITION HISTORY VIEWER
// ============================================================================

export function PositionHistoryDialog({ positionId, positionTitle }: { positionId: string; positionTitle: string }) {
  const [open, setOpen] = useState(false);
  const { data: history, isLoading } = usePositionHistory(open ? positionId : '');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs">
          <History className="h-3 w-3 mr-1" />
          History
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Position History: {positionTitle}</DialogTitle>
          <DialogDescription>
            All holders of this position across governance terms.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : history && history.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Holder</TableHead>
                <TableHead>Term</TableHead>
                <TableHead>Period</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium text-sm">
                    {(entry.user as any)?.full_name || 'Unknown'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {(entry.term as any)?.name || '-'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(entry.started_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                    {entry.ended_at ? (
                      <> - {new Date(entry.ended_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</>
                    ) : (
                      <Badge variant="outline" className="ml-1 text-xs bg-green-50 text-green-700">Current</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            No history records for this position.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// MEMBER FILTER BAR
// ============================================================================

interface MemberFilterBarProps {
  terms: LCTerm[];
  institutions: { id: string; name: string }[];
  filters: { term_id: string; status: string; institution_id: string };
  onFilterChange: (key: string, value: string) => void;
  onReset: () => void;
}

export function MemberFilterBar({ terms, institutions, filters, onFilterChange, onReset }: MemberFilterBarProps) {
  const hasFilters = filters.term_id || filters.status || filters.institution_id;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Filter className="h-4 w-4 text-muted-foreground" />

      <Select value={filters.term_id || 'all'} onValueChange={(v) => onFilterChange('term_id', v === 'all' ? '' : v)}>
        <SelectTrigger className="h-8 w-[160px] text-xs">
          <SelectValue placeholder="All Terms" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Terms</SelectItem>
          {terms.map((t) => (
            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.status || 'all'} onValueChange={(v) => onFilterChange('status', v === 'all' ? '' : v)}>
        <SelectTrigger className="h-8 w-[120px] text-xs">
          <SelectValue placeholder="All Statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          {statusOptions.map((s) => (
            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.institution_id || 'all'} onValueChange={(v) => onFilterChange('institution_id', v === 'all' ? '' : v)}>
        <SelectTrigger className="h-8 w-[180px] text-xs">
          <SelectValue placeholder="All Institutions" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Institutions</SelectItem>
          {institutions.map((inst) => (
            <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onReset}>
          <X className="h-3 w-3 mr-1" />
          Clear
        </Button>
      )}
    </div>
  );
}
