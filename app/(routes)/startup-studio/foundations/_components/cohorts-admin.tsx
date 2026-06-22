'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus, Users } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth-provider';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import {
  useFoundationsCohorts,
  useCreateFoundationsCohort,
  useFoundationsRoster,
} from '@/hooks/startup-studio/use-foundations';
import type { FoundationsCohort } from '@/types/startup-studio/foundations';
import type { FoundationsRosterEntry } from '@/lib/services/startup-studio/foundations-service';

const MODE_LABEL: Record<string, string> = {
  facilitator: 'Facilitator-added',
  self: 'Self-enrol',
  both: 'Both',
};

export function CohortsAdmin() {
  const { data, isLoading } = useFoundationsCohorts() as {
    data?: { data: FoundationsCohort[] };
    isLoading: boolean;
  };
  const [createOpen, setCreateOpen] = useState(false);
  const [rosterCohort, setRosterCohort] = useState<FoundationsCohort | null>(null);

  const cohorts = data?.data ?? [];

  return (
    <div className="space-y-6 mt-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold py-1">Cohorts</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Organise learners running Foundations together — a class, a club, or a college intake.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> New cohort
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : cohorts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No cohorts yet. Create one to start tracking a group of learners.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Academic year</TableHead>
                  <TableHead>Enrolment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Roster</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cohorts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.academic_year || '—'}</TableCell>
                    <TableCell>{MODE_LABEL[c.enrollment_mode] ?? c.enrollment_mode}</TableCell>
                    <TableCell>
                      <Badge variant={c.status === 'active' ? 'default' : 'secondary'}>
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setRosterCohort(c)}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <CreateCohortDialog open={createOpen} onOpenChange={setCreateOpen} />
      <RosterDialog cohort={rosterCohort} onClose={() => setRosterCohort(null)} />
    </div>
  );
}

function CreateCohortDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { profile } = useAuth();
  const { institutions } = useInstitutionsWithAccess();
  const create = useCreateFoundationsCohort();

  const [name, setName] = useState('');
  const [institutionId, setInstitutionId] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [mode, setMode] = useState('both');
  const [error, setError] = useState<string | null>(null);

  // Default to the user's own institution when available.
  const resolvedInstitution = institutionId || profile?.institution_id || '';

  async function handleCreate() {
    setError(null);
    if (!name.trim()) {
      setError('Please give the cohort a name.');
      return;
    }
    if (!resolvedInstitution) {
      setError('Please choose an institution.');
      return;
    }
    try {
      await create.mutateAsync({
        name: name.trim(),
        institution_id: resolvedInstitution,
        academic_year: academicYear.trim() || null,
        enrollment_mode: mode,
      });
      setName('');
      setAcademicYear('');
      setInstitutionId('');
      setMode('both');
      onOpenChange(false);
    } catch {
      setError('Could not create the cohort. Please try again.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New cohort</DialogTitle>
          <DialogDescription>Create a group of learners to run Foundations together.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cohort-name">Name</Label>
            <Input
              id="cohort-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. CSE 2026 Intake — Section A"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cohort-institution">Institution</Label>
            <Select value={resolvedInstitution} onValueChange={setInstitutionId}>
              <SelectTrigger id="cohort-institution">
                <SelectValue placeholder="Select institution..." />
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cohort-year">Academic year</Label>
              <Input
                id="cohort-year"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="2026-27"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cohort-mode">Enrolment</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger id="cohort-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Both</SelectItem>
                  <SelectItem value="self">Self-enrol</SelectItem>
                  <SelectItem value="facilitator">Facilitator-added</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={create.isPending}>
            {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create cohort
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RosterDialog({
  cohort,
  onClose,
}: {
  cohort: FoundationsCohort | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useFoundationsRoster(cohort?.id ?? '') as {
    data?: { data: FoundationsRosterEntry[] };
    isLoading: boolean;
  };
  const roster = data?.data ?? [];

  return (
    <Dialog open={!!cohort} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{cohort?.name}</DialogTitle>
          <DialogDescription>
            {roster.length} learner{roster.length === 1 ? '' : 's'} enrolled
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : roster.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No learners yet. Learners can self-enrol, or add them from the roster (coming soon).
          </p>
        ) : (
          <div className="max-h-80 overflow-y-auto divide-y">
            {roster.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {r.student?.full_name || r.student?.email || 'Learner'}
                  </p>
                  {r.student?.email && (
                    <p className="text-xs text-muted-foreground truncate">{r.student.email}</p>
                  )}
                </div>
                <Badge variant="secondary">{r.enrolled_via}</Badge>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
