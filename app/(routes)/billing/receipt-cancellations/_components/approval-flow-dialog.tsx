'use client';

// Super-admin-only configuration of WHO decides receipt cancellations.
//
// Writes are gated by RLS on is_super_admin(); the button that opens this is
// hidden for everyone else, but that is an affordance — the control is in the
// database.

import { useMemo, useState } from 'react';
import { AlertTriangle, Building2, Globe, Pencil, Plus, Trash2, UserCog } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useCustomRolesForApproval } from '@/hooks/organization/use-custom-roles';
import {
  useReceiptCancelFlows,
  useSaveReceiptCancelFlow,
  useDeleteReceiptCancelFlow,
  useApproverSearch,
} from '@/hooks/billing/use-receipt-cancel-flows';
import type { ReceiptCancelApprovalFlowView } from '@/lib/services/billing/receipts/receipt-cancel-flow-service';

const GLOBAL = '__global__';

interface ApprovalFlowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ApprovalFlowDialog({ open, onOpenChange }: ApprovalFlowDialogProps) {
  const { data: flows = [], isLoading } = useReceiptCancelFlows(open);
  const save = useSaveReceiptCancelFlow();
  const remove = useDeleteReceiptCancelFlow();

  const [editing, setEditing] = useState<ReceiptCancelApprovalFlowView | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<ReceiptCancelApprovalFlowView | null>(null);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (flow: ReceiptCancelApprovalFlowView) => {
    setEditing(flow);
    setFormOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className='max-h-[85vh] max-w-3xl overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>Receipt cancellation approval flow</DialogTitle>
            <DialogDescription>
              Name who decides cancellation requests. A flow for an institution
              overrides the group-wide default. With no flow at all, only super
              admins can decide — and super admins can always decide regardless.
            </DialogDescription>
          </DialogHeader>

          <div className='flex justify-end'>
            <Button size='sm' onClick={openNew}>
              <Plus className='mr-2 h-4 w-4' />
              Add flow
            </Button>
          </div>

          {isLoading ? (
            <div className='space-y-2'>
              <Skeleton className='h-10 w-full' />
              <Skeleton className='h-10 w-full' />
            </div>
          ) : flows.length === 0 ? (
            <div className='rounded-lg border border-dashed p-8 text-center'>
              <p className='text-sm font-medium'>No approval flow configured</p>
              <p className='text-muted-foreground mt-1 text-sm'>
                Every cancellation is decided by a super admin. Add a flow to
                delegate that to a role or a person.
              </p>
            </div>
          ) : (
            <div className='overflow-x-auto rounded-md border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Applies to</TableHead>
                    <TableHead>Approver</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className='text-right'>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flows.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell>
                        <span className='flex items-center gap-2 font-medium'>
                          {f.institution_id ? (
                            <Building2 className='h-4 w-4 shrink-0' aria-hidden='true' />
                          ) : (
                            <Globe className='h-4 w-4 shrink-0' aria-hidden='true' />
                          )}
                          {f.institution_name ?? 'All institutions (default)'}
                        </span>
                        <span className='text-muted-foreground text-xs'>
                          {f.flow_name}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className='space-y-1'>
                          <span>
                            {f.approver_role_name
                              ? `Role · ${f.approver_role_name}`
                              : `Person · ${f.approver_user_name ?? '—'}`}
                          </span>
                          {f.approver_role_lacks_receipts_view && (
                            <p className='flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400'>
                              <AlertTriangle
                                className='mt-0.5 h-3 w-3 shrink-0'
                                aria-hidden='true'
                              />
                              This role cannot view receipts, so the queue will
                              look empty to them.
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={f.is_active ? 'default' : 'secondary'}>
                          {f.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className='text-right'>
                        <div className='flex justify-end gap-1'>
                          <Button
                            variant='ghost'
                            size='sm'
                            className='h-8 w-8 p-0'
                            onClick={() => openEdit(f)}
                            aria-label={`Edit ${f.flow_name}`}
                          >
                            <Pencil className='h-4 w-4' />
                          </Button>
                          <Button
                            variant='ghost'
                            size='sm'
                            className='text-destructive hover:text-destructive h-8 w-8 p-0'
                            onClick={() => setToDelete(f)}
                            aria-label={`Delete ${f.flow_name}`}
                          >
                            <Trash2 className='h-4 w-4' />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <DialogFooter>
            <Button variant='outline' onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FlowFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        flow={editing}
        onSave={(dto) =>
          save.mutate(dto, { onSuccess: () => setFormOpen(false) })
        }
        saving={save.isPending}
      />

      <AlertDialog
        open={!!toDelete}
        onOpenChange={(o) => {
          if (!o) setToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this approval flow?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete?.institution_name
                ? `${toDelete.institution_name} cancellations`
                : 'Institutions with no flow of their own'}{' '}
              will fall back to the group-wide default, or to super-admin-only
              if there is none. Requests already decided are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Keep</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!toDelete) return;
                remove.mutate(toDelete.id, {
                  onSuccess: () => setToDelete(null),
                });
              }}
            >
              {remove.isPending ? 'Removing…' : 'Remove flow'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface FlowFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flow: ReceiptCancelApprovalFlowView | null;
  onSave: (dto: {
    id?: string;
    institution_id: string | null;
    flow_name: string;
    approver_role_key: string | null;
    approver_user_id: string | null;
    is_active: boolean;
  }) => void;
  saving: boolean;
}

function FlowFormDialog({
  open,
  onOpenChange,
  flow,
  onSave,
  saving,
}: FlowFormDialogProps) {
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess({
    entityType: 'all',
  });
  const { data: roles = [] } = useCustomRolesForApproval();

  const [name, setName] = useState('');
  const [institution, setInstitution] = useState<string>(GLOBAL);
  const [mode, setMode] = useState<'role' | 'user'>('role');
  const [roleKey, setRoleKey] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  const [userLabel, setUserLabel] = useState<string>('');
  const [userTerm, setUserTerm] = useState('');

  const { data: userResults = [], isFetching: searching } = useApproverSearch(userTerm);

  // Reset from the edited flow during render — React's documented way to sync
  // state to a prop, and it avoids the extra committed render an effect costs.
  const token = open ? (flow?.id ?? 'new') : '';
  const [lastToken, setLastToken] = useState(token);
  if (token !== lastToken) {
    setLastToken(token);
    setName(flow?.flow_name ?? '');
    setInstitution(flow?.institution_id ?? GLOBAL);
    setMode(flow?.approver_user_id ? 'user' : 'role');
    setRoleKey(flow?.approver_role_key ?? '');
    setUserId(flow?.approver_user_id ?? '');
    setUserLabel(flow?.approver_user_name ?? '');
    setUserTerm('');
  }

  const selectedRole = useMemo(
    () => roles.find((r: any) => r.role_key === roleKey),
    [roles, roleKey]
  );
  const roleLacksReceiptsView =
    mode === 'role' &&
    !!selectedRole &&
    (selectedRole as any).permissions?.['billing.receipts.view'] !== true;

  const approverChosen = mode === 'role' ? !!roleKey : !!userId;
  const canSave = name.trim().length > 0 && approverChosen && !saving;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[85vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>{flow ? 'Edit approval flow' : 'Add approval flow'}</DialogTitle>
          <DialogDescription>
            The approver still cannot decide their own request — four-eyes
            applies to everyone except the super-admin fallback.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='space-y-1.5'>
            <Label htmlFor='flow-name'>Name</Label>
            <Input
              id='flow-name'
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='e.g. Dental — Principal approves'
            />
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='flow-institution'>Applies to</Label>
            <Select value={institution} onValueChange={setInstitution}>
              <SelectTrigger id='flow-institution'>
                <SelectValue placeholder='Select' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={GLOBAL}>All institutions (default)</SelectItem>
                {institutionsLoading ? (
                  <SelectItem value='__loading__' disabled>
                    Loading…
                  </SelectItem>
                ) : (
                  institutions.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className='text-muted-foreground text-xs'>
              An institution&apos;s own flow overrides the default.
            </p>
          </div>

          <div className='space-y-2'>
            <Label>Approver</Label>
            <div className='flex gap-2'>
              <Button
                type='button'
                size='sm'
                variant={mode === 'role' ? 'default' : 'outline'}
                onClick={() => setMode('role')}
              >
                By role
              </Button>
              <Button
                type='button'
                size='sm'
                variant={mode === 'user' ? 'default' : 'outline'}
                onClick={() => setMode('user')}
              >
                By person
              </Button>
            </div>
          </div>

          {mode === 'role' ? (
            <div className='space-y-1.5'>
              <Label htmlFor='flow-role'>Approver role</Label>
              <Select value={roleKey} onValueChange={setRoleKey}>
                <SelectTrigger id='flow-role'>
                  <SelectValue placeholder='Select a role' />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r: any) => (
                    <SelectItem key={r.role_key} value={r.role_key}>
                      {r.role_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className='text-muted-foreground text-xs'>
                Anyone holding this role at the institution can decide. A role
                outlives the person, so it does not break when staff change.
              </p>
            </div>
          ) : (
            <div className='space-y-1.5'>
              <Label htmlFor='flow-user'>Approver</Label>
              {userId && (
                <div className='flex items-center justify-between rounded-md border p-2'>
                  <span className='text-sm font-medium'>{userLabel}</span>
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => {
                      setUserId('');
                      setUserLabel('');
                    }}
                  >
                    Change
                  </Button>
                </div>
              )}
              {!userId && (
                <>
                  <Input
                    id='flow-user'
                    value={userTerm}
                    onChange={(e) => setUserTerm(e.target.value)}
                    placeholder='Search by name or email…'
                    autoComplete='off'
                  />
                  {userTerm.trim().length >= 2 && (
                    <div className='max-h-44 overflow-y-auto rounded-md border'>
                      {searching ? (
                        <p className='text-muted-foreground p-3 text-sm'>Searching…</p>
                      ) : userResults.length === 0 ? (
                        <p className='text-muted-foreground p-3 text-sm'>
                          No matching people.
                        </p>
                      ) : (
                        userResults.map((u) => (
                          <button
                            key={u.id}
                            type='button'
                            className='hover:bg-accent flex w-full flex-col items-start px-3 py-2 text-left'
                            onClick={() => {
                              setUserId(u.id);
                              setUserLabel(u.full_name || u.email || u.id);
                              setUserTerm('');
                            }}
                          >
                            <span className='text-sm font-medium'>
                              {u.full_name || '—'}
                            </span>
                            <span className='text-muted-foreground text-xs'>
                              {u.email}
                              {u.role ? ` · ${u.role}` : ''}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
              <p className='text-muted-foreground text-xs'>
                One named person decides. This breaks silently if they leave or
                change role, so prefer a role unless it must be an individual.
              </p>
            </div>
          )}

          {roleLacksReceiptsView && (
            <div className='flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300'>
              <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0' aria-hidden='true' />
              <span>
                <strong>{(selectedRole as any)?.role_name}</strong> does not hold{' '}
                <code>billing.receipts.view</code>. They will be allowed to decide,
                but the cancellations queue will render empty for them until that
                permission is granted in Role Management.
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            disabled={!canSave}
            onClick={() =>
              onSave({
                id: flow?.id,
                institution_id: institution === GLOBAL ? null : institution,
                flow_name: name.trim(),
                approver_role_key: mode === 'role' ? roleKey : null,
                approver_user_id: mode === 'user' ? userId : null,
                is_active: flow?.is_active ?? true,
              })
            }
          >
            <UserCog className='mr-2 h-4 w-4' />
            {saving ? 'Saving…' : 'Save flow'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
