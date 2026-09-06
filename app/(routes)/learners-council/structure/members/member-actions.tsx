'use client';

/**
 * Member Actions - Client components for member management
 * Includes assign member dialog, status update, and position history viewer
 */

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { PersonPicker } from './person-picker';
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
  usePositionHistory,
  useLCMembers
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

  // Which seats in this term are already taken. A position may not be given
  // more active holders than its max_holders allows, so a filled seat is shown
  // as filled instead of being offered and refused after the fact. Only
  // fetched once a term is chosen and the dialog is open.
  const { data: termMembers, isError: occupancyFailed } = useLCMembers(
    { term_id: termId, status: 'active' },
    // staleTime 0: occupancy decides whether a seat is DISABLED, and the
    // default 2-minute cache would keep a seat greyed out for two minutes
    // after it was freed in another tab — blocking the assignment with no way
    // to attempt it. Only fetched while the dialog is open, so re-reading on
    // open is cheap.
    { enabled: open && !!termId, staleTime: 0 }
  );

  // Until the occupancy query answers, nothing can be greyed out — so the
  // Position select stays disabled rather than briefly offering a filled seat
  // under a hint that claims filled seats are already greyed out.
  //
  // An ERROR must count as ready, not as "still loading". This convenience
  // lookup failing is not a reason to make the seat unassignable: if it were
  // derived from `data !== undefined` alone, a failed query would leave the
  // select disabled forever with no error, no retry and no way to assign
  // anyone for that term. Treat it as ready-but-unknown — offer every seat,
  // grey out nothing, say so — and let the service guard and the unique index
  // do what they were built for.
  const occupancyReady = !termId || termMembers !== undefined || occupancyFailed;

  // Holder names per position, so a filled seat can say who holds it. This is
  // a convenience only — the service layer re-checks occupancy before
  // inserting, and a unique index backstops that, so a stale list here cannot
  // let a second holder through.
  const holdersByPosition = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const m of termMembers ?? []) {
      const positionId = (m as { position_id?: string }).position_id;
      if (!positionId) continue;
      const name = ((m as { user?: { full_name?: string | null } | null }).user?.full_name || '').trim();
      map.set(positionId, [...(map.get(positionId) ?? []), name || 'a sitting member']);
    }
    return map;
  }, [termMembers]);

  // Floored at 1 for the same reason as the service guard: max_holders has no
  // CHECK constraint, and a stored 0 would otherwise grey out every seat.
  const seatIsFull = (position: LCPosition) =>
    (holdersByPosition.get(position.id)?.length ?? 0) >= Math.max(1, position.max_holders ?? 1);

  // The 4 executive seats are elected FROM the sitting council — a learner
  // becomes an LC member first, then is elected President/VP/Secretary/
  // Treasurer (ElectionType 'executive_rotation'). So for an executive seat the
  // learner list is narrowed to that term's active members.
  const selectedPosition = positions.find((p) => p.id === positionId);
  const isExecutiveSeat = selectedPosition?.category === 'executive';
  const pickerScope = isExecutiveSeat ? 'lc_members' : 'all';

  // Occupancy is per term, so a seat picked while one term was selected may be
  // filled in the next one. Clear the position (and the learner, whose pool is
  // also term-scoped for executive seats) rather than carry a stale choice
  // that only reveals itself as a refusal at submit.
  const handleTermChange = (nextTermId: string) => {
    if (nextTermId !== termId) {
      setPositionId('');
      setUserId('');
    }
    setTermId(nextTermId);
  };

  // Switching between an executive seat and any other seat changes the pool, so
  // a person picked from the previous pool must not silently carry over.
  const handlePositionChange = (nextPositionId: string) => {
    const next = positions.find((p) => p.id === nextPositionId);
    if ((next?.category === 'executive') !== isExecutiveSeat) {
      setUserId('');
    }
    setPositionId(nextPositionId);
  };

  const handleSubmit = async () => {
    if (!termId || !positionId || !userId || !institutionId) return;

    try {
      await assignMember.mutateAsync({
        term_id: termId,
        position_id: positionId,
        user_id: userId,
        institution_id: institutionId,
        appointment_notes: notes || undefined
      });
    } catch {
      // useAssignMember already shows the reason as a toast. Keep the dialog
      // open with the entries intact so the fix — retire the sitting holder,
      // then assign — can be made without filling the form in again.
      return;
    }

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
            <Select value={termId} onValueChange={handleTermChange}>
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
            <Select value={positionId} onValueChange={handlePositionChange} disabled={!occupancyReady}>
              <SelectTrigger id="assign-position">
                <SelectValue placeholder={occupancyReady ? 'Select position' : 'Checking which seats are free...'} />
              </SelectTrigger>
              <SelectContent>
                {positions.map((p) => {
                  const holders = holdersByPosition.get(p.id) ?? [];
                  const full = seatIsFull(p);
                  return (
                    <SelectItem key={p.id} value={p.id} disabled={full}>
                      {p.title} ({p.category})
                      {full && ` — held by ${holders.join(', ')}`}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {termId && occupancyReady && (
              occupancyFailed ? (
                <p className="text-xs text-amber-700 mt-1">
                  Could not check which seats are already filled, so none are greyed out here.
                  You can still assign — if the seat is taken, it will be refused with the
                  current holder&apos;s name.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">
                  Seats already filled are greyed out. To replace someone, set their status to
                  Inactive or Graduated in the members list first — the seat frees up immediately.
                </p>
              )
            )}
          </div>

          <div>
            <Label htmlFor="assign-user">Learner</Label>
            <PersonPicker
              id="assign-user"
              value={userId}
              onChange={setUserId}
              scope={pickerScope}
              termId={termId}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {isExecutiveSeat
                ? 'Executive seats are filled from the sitting council — only active members of the selected term are listed.'
                : 'Search by name or email. Only learners from institutions you can access are listed.'}
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
