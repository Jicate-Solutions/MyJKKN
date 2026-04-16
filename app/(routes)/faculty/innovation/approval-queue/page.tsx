'use client';

// app/(routes)/faculty/innovation/approval-queue/page.tsx
// Role-routed approval queue for Faculty Innovation initiatives.
// Director sees director-routed items, Dean sees dean items, etc.
// Each row has 4 action buttons: Approve / Request Changes / Reject / Defer.

import { useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  MessageSquareWarning,
  XCircle,
  Clock,
  AlertTriangle,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  useApprovalQueue,
  useApprovalActions,
} from '@/hooks/faculty-innovation/use-approval-queue';
import {
  CATEGORY_LABEL,
  STATUS_LABEL,
  STATUS_COLOR,
  type ApprovalAction,
  type FacultyApprovalAuthority,
} from '@/types/faculty-innovation';

type ActionType = ApprovalAction['action'];

export default function ApprovalQueuePage() {
  const { queue, isLoading, isApprover, refetch } = useApprovalQueue();
  const { executeAction } = useApprovalActions();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [selectedAction, setSelectedAction] = useState<ActionType>('approve');
  const [reason, setReason] = useState('');
  const [deferDays, setDeferDays] = useState(7);
  const [rerouteTo, setRerouteTo] = useState<FacultyApprovalAuthority | ''>('');

  const openDialog = (id: string, action: ActionType) => {
    setSelectedId(id);
    setSelectedAction(action);
    setReason('');
    setDeferDays(7);
    setRerouteTo('');
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const input: ApprovalAction = {
      initiative_id: selectedId,
      action: selectedAction,
      reason: reason || undefined,
      defer_days: selectedAction === 'defer' ? deferDays : undefined,
      reroute_to:
        selectedAction === 'reject' && rerouteTo
          ? (rerouteTo as FacultyApprovalAuthority)
          : undefined,
    };

    executeAction.mutate(input, {
      onSuccess: () => {
        setDialogOpen(false);
        refetch();
      },
    });
  };

  const overdueCount = queue.filter((q) => q.is_overdue).length;

  return (
    <ContentLayout title="Approval Queue">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/faculty/innovation">Faculty Innovation</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Approval Queue</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PermissionGuard module="faculty_innovation" action="initiative.approve">
        <div className="mt-6 space-y-4">
          {/* Summary bar */}
          <div className="flex items-center gap-4">
            <Card className="flex-1">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="text-2xl font-bold">{queue.length}</div>
                <div className="text-sm text-muted-foreground">
                  Pending Review
                </div>
              </CardContent>
            </Card>
            {overdueCount > 0 && (
              <Card className="flex-1 border-orange-200 bg-orange-50">
                <CardContent className="flex items-center gap-3 p-4">
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                  <div>
                    <div className="text-2xl font-bold text-orange-700">
                      {overdueCount}
                    </div>
                    <div className="text-sm text-orange-600">
                      Overdue (needs escalation)
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Queue list */}
          {isLoading ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                Loading approval queue...
              </CardContent>
            </Card>
          ) : !isApprover ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                Your role does not have approval permissions.
              </CardContent>
            </Card>
          ) : queue.length === 0 ? (
            <Card>
              <CardContent className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                <p className="font-medium">Queue is empty</p>
                <p className="mt-1">
                  No initiatives are awaiting your review at this time.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {queue.map((item) => (
                <Card
                  key={item.id}
                  className={
                    item.is_overdue
                      ? 'border-orange-300 bg-orange-50/50'
                      : ''
                  }
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base">
                            {item.title}
                          </CardTitle>
                          {item.is_overdue && (
                            <Badge
                              variant="destructive"
                              className="text-xs"
                            >
                              Overdue ({item.days_pending}d)
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="mt-1 line-clamp-2">
                          {item.abstract}
                        </CardDescription>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge className={STATUS_COLOR[item.status]}>
                          {STATUS_LABEL[item.status]}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {CATEGORY_LABEL[item.category]}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-muted-foreground">
                        Pending {item.days_pending} day(s)
                        {item.approval_authority && (
                          <> &middot; Routed to: {item.approval_authority}</>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => openDialog(item.id, 'approve')}
                          className="gap-1"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            openDialog(item.id, 'request_changes')
                          }
                          className="gap-1"
                        >
                          <MessageSquareWarning className="h-3.5 w-3.5" />
                          Changes
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => openDialog(item.id, 'reject')}
                          className="gap-1"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openDialog(item.id, 'defer')}
                          className="gap-1"
                        >
                          <Clock className="h-3.5 w-3.5" />
                          Defer
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </PermissionGuard>

      {/* Action dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedAction === 'approve' && 'Approve Initiative'}
              {selectedAction === 'request_changes' && 'Request Changes'}
              {selectedAction === 'reject' && 'Reject Initiative'}
              {selectedAction === 'defer' && 'Defer Review'}
            </DialogTitle>
            <DialogDescription>
              {selectedAction === 'approve' &&
                'This will move the initiative to Approved status.'}
              {selectedAction === 'request_changes' &&
                'The inventor will be notified to make changes.'}
              {selectedAction === 'reject' &&
                'You can reject outright or reroute to another authority.'}
              {selectedAction === 'defer' &&
                'The initiative will stay in queue but be snoozed for N days.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="reason">
                {selectedAction === 'approve' ? 'Note (optional)' : 'Reason'}
              </Label>
              <Textarea
                id="reason"
                placeholder={
                  selectedAction === 'approve'
                    ? 'Add a note for the inventor...'
                    : 'Provide a reason...'
                }
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            {selectedAction === 'reject' && (
              <div>
                <Label htmlFor="reroute">
                  Reroute instead of rejecting? (optional)
                </Label>
                <Select
                  value={rerouteTo}
                  onValueChange={(v) =>
                    setRerouteTo(v as FacultyApprovalAuthority | '')
                  }
                >
                  <SelectTrigger id="reroute">
                    <SelectValue placeholder="No reroute — reject outright" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none_clear">
                      No reroute — reject outright
                    </SelectItem>
                    <SelectItem value="director">Director</SelectItem>
                    <SelectItem value="dean">Dean</SelectItem>
                    <SelectItem value="ip_cell">IP Cell</SelectItem>
                    <SelectItem value="hod">HOD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedAction === 'defer' && (
              <div>
                <Label htmlFor="defer-days">Defer for (days)</Label>
                <Input
                  id="defer-days"
                  type="number"
                  min={1}
                  max={90}
                  value={deferDays}
                  onChange={(e) => setDeferDays(parseInt(e.target.value) || 7)}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                executeAction.isPending ||
                (['request_changes', 'reject'].includes(selectedAction) &&
                  !reason &&
                  !rerouteTo)
              }
            >
              {executeAction.isPending ? 'Processing...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
