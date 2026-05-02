'use client';

// members-tab.tsx
// Tab 1: Counselor member list with active/emergency toggles.
// Shows counselors (or all for super_admin). Handles empty state gracefully.
// Phase 5+: "+ Add Counselor" button (admin-only) opens AddCounselorDialog.

import { useState } from 'react';
import { useCounselorMembers, useToggleCounselorActive } from '@/hooks/admission/use-counselor-team-data';
import { AddCounselorDialog } from '@/app/(routes)/admission/counselors/_components/add-counselor-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Users, AlertCircle, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';

const CATEGORY_LABELS: Record<string, string> = {
  counselor: 'General',
  learner_counselor: 'Learner',
  staff_counselor: 'Staff',
  health_counselor: 'Health',
};

function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

interface MembersTabProps {
  institutionId: string | undefined;
  isAdmin: boolean;
}

export function MembersTab({ institutionId, isAdmin }: MembersTabProps) {
  const { data: members = [], isLoading, error, refetch } = useCounselorMembers(institutionId);
  const toggleActive = useToggleCounselorActive();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const addButton = isAdmin ? (
    <>
      <div className="flex justify-end mb-3">
        <Button
          size="sm"
          className="gap-2"
          onClick={() => setDialogOpen(true)}
          aria-label="Add counselor"
        >
          <UserPlus className="h-4 w-4" />
          Add Counselor
        </Button>
      </div>
      <AddCounselorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        institutionId={institutionId}
        onSuccess={() => {
          setDialogOpen(false);
          refetch();
        }}
      />
    </>
  ) : null;

  if (error) {
    return (
      <>
        {addButton}
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm">{(error as Error).message}</p>
        </div>
      </>
    );
  }

  if (members.length === 0) {
    return (
      <>
        {addButton}
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <Users className="mb-4 h-12 w-12 opacity-40" />
          <p className="font-medium">No counselors found</p>
          <p className="mt-1 text-sm">
            {isAdmin
              ? 'Click "+ Add Counselor" to onboard the first counselor.'
              : 'Counselors will appear here once they are registered in this institution.'}
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      {addButton}
      <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Counselor</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Designation</TableHead>
            <TableHead className="text-center">Open Leads</TableHead>
            <TableHead className="text-center">Max Leads</TableHead>
            <TableHead className="text-center">Active</TableHead>
            {isAdmin && <TableHead className="text-center">Emergency Off</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => (
            <TableRow key={m.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="text-xs">{initials(m.name)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium leading-tight">{m.name}</p>
                    {m.email && (
                      <p className="text-xs text-muted-foreground">{m.email}</p>
                    )}
                  </div>
                </div>
              </TableCell>

              <TableCell>
                {m.category ? (
                  <Badge variant="outline" className="text-xs">
                    {CATEGORY_LABELS[m.category] ?? m.category}
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">General</span>
                )}
              </TableCell>

              <TableCell className="text-sm text-muted-foreground">
                {m.designation ?? '—'}
              </TableCell>

              <TableCell className="text-center">
                <span
                  className={cn(
                    'text-sm font-semibold',
                    m.current_leads >= m.max_leads ? 'text-red-600' : 'text-foreground'
                  )}
                >
                  {m.current_leads}
                </span>
              </TableCell>

              <TableCell className="text-center text-sm text-muted-foreground">
                {m.max_leads}
              </TableCell>

              <TableCell className="text-center">
                <Switch
                  checked={m.is_active}
                  disabled={!isAdmin || toggleActive.isPending}
                  onCheckedChange={(checked) =>
                    toggleActive.mutate({ id: m.id, isActive: checked })
                  }
                  aria-label={`Toggle active for ${m.name}`}
                />
              </TableCell>

              {isAdmin && (
                <TableCell className="text-center">
                  {m.emergency_off != null ? (
                    <Badge
                      variant={m.emergency_off ? 'destructive' : 'secondary'}
                      className="text-xs"
                    >
                      {m.emergency_off ? 'Off' : 'On'}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
    </>
  );
}
