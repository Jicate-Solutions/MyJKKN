'use client';
// app/(routes)/resource-management/resources/[id]/_components/approval-config-tab.tsx


import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, AlertCircle, Users, Mail } from 'lucide-react';
import { useProfiles } from '@/hooks/organization/use-profiles';
import type { Resource } from '@/types/resource-management';

interface ApprovalConfigTabProps {
  resource: Resource;
}

// Format a role_key like "coo" / "head_of_dept" into a readable label.
const formatRoleKey = (roleKey: string) =>
  roleKey.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());

export function ApprovalConfigTab({ resource }: ApprovalConfigTabProps) {
  const approvalConfig = resource.approval_config || {};

  // Resolve approver user_ids -> profiles so each level shows the actual
  // person (name/email), not a raw role key or UUID. Hooks must run before
  // the disabled early-return below, so compute the id list unconditionally.
  const approverUserIds = useMemo(
    () =>
      (approvalConfig.approvers || [])
        .map((a: any) => a.user_id)
        .filter((id: string | undefined): id is string => !!id),
    [approvalConfig.approvers]
  );

  const { data: approverProfiles = [] } = useProfiles(approverUserIds);

  const profileById = useMemo(() => {
    const map = new Map<string, (typeof approverProfiles)[number]>();
    for (const p of approverProfiles) map.set(p.id, p);
    return map;
  }, [approverProfiles]);

  if (!approvalConfig.enabled) {
    return (
      <Card>
        <CardContent className='py-12 text-center'>
          <XCircle className='h-12 w-12 mx-auto mb-4 text-muted-foreground' />
          <h3 className='text-lg font-semibold mb-2'>
            Approval Workflow Disabled
          </h3>
          <p className='text-muted-foreground'>
            This resource does not require approval for reservations
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Approval Type */}
      {approvalConfig.approval_type && (
        <Card>
          <CardHeader>
            <CardTitle>Approval Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='flex items-center gap-2'>
              <Badge variant='outline' className='text-base px-4 py-2'>
                {approvalConfig.approval_type === 'sequential' &&
                  '🔄 Sequential'}
                {approvalConfig.approval_type === 'parallel' && '⚡ Parallel'}
                {approvalConfig.approval_type === 'conditional' &&
                  '🎯 Conditional'}
              </Badge>
              <p className='text-sm text-muted-foreground'>
                {approvalConfig.approval_type === 'sequential' &&
                  'Approvers review one after another'}
                {approvalConfig.approval_type === 'parallel' &&
                  'All approvers review simultaneously'}
                {approvalConfig.approval_type === 'conditional' &&
                  'Routing based on conditions'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Approvers List */}
      {approvalConfig.approvers && approvalConfig.approvers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Users className='h-5 w-5' />
              Approvers ({approvalConfig.approvers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='space-y-3'>
              {approvalConfig.approvers.map((approver: any, index: number) => {
                const profile = approver.user_id
                  ? profileById.get(approver.user_id)
                  : undefined;
                // Primary label: real person's name when resolvable, else the
                // configured role, else a clear "unassigned" message.
                const primaryName =
                  profile?.full_name ||
                  (approver.role_key
                    ? formatRoleKey(approver.role_key)
                    : approver.user_id
                    ? 'User (no longer available)'
                    : 'Not Configured');

                return (
                  <div
                    key={approver.id || index}
                    className='flex items-center gap-4 p-4 rounded-lg border bg-card'
                  >
                    <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold'>
                      {approver.level}
                    </div>

                    <div className='flex-1 min-w-0'>
                      <p className='font-semibold truncate'>{primaryName}</p>

                      {/* Email when we resolved the actual user */}
                      {profile?.email && (
                        <p className='flex items-center gap-1 text-sm text-muted-foreground truncate'>
                          <Mail className='h-3 w-3 shrink-0' />
                          {profile.email}
                        </p>
                      )}

                      <div className='mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground'>
                        <Badge variant='outline' className='text-xs'>
                          Level {approver.level}
                        </Badge>
                        {profile?.designation && (
                          <span className='truncate'>{profile.designation}</span>
                        )}
                        {approver.role_key && (
                          <Badge variant='outline' className='text-xs'>
                            {formatRoleKey(approver.role_key)}
                          </Badge>
                        )}
                        {approver.can_delegate && (
                          <Badge variant='outline' className='text-xs'>
                            Can Delegate
                          </Badge>
                        )}
                      </div>
                    </div>

                    <Badge
                      variant={approver.is_required ? 'default' : 'secondary'}
                      className='ml-auto shrink-0'
                    >
                      {approver.is_required ? 'Required' : 'Optional'}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Auto-approval Settings */}
      <div className='grid gap-6 md:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <AlertCircle className='h-5 w-5' />
              Auto-approval Settings
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            {approvalConfig.auto_approve_hours && (
              <div className='flex justify-between items-center'>
                <span className='text-sm text-muted-foreground'>
                  Auto-approve After
                </span>
                <span className='font-semibold'>
                  {approvalConfig.auto_approve_hours} hours
                </span>
              </div>
            )}

            {approvalConfig.escalation_hours && (
              <div className='flex justify-between items-center'>
                <span className='text-sm text-muted-foreground'>
                  Escalate After
                </span>
                <span className='font-semibold'>
                  {approvalConfig.escalation_hours} hours
                </span>
              </div>
            )}

            {!approvalConfig.auto_approve_hours &&
              !approvalConfig.escalation_hours && (
                <p className='text-sm text-muted-foreground'>
                  No auto-approval settings configured
                </p>
              )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workflow Options</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div className='flex items-center gap-2'>
              {approvalConfig.allow_parallel_approval ? (
                <CheckCircle2 className='h-5 w-5 text-green-600' />
              ) : (
                <XCircle className='h-5 w-5 text-red-600' />
              )}
              <span className='text-sm'>Parallel Approvals</span>
            </div>

            <div className='flex items-center gap-2'>
              {approvalConfig.notify_requester ? (
                <CheckCircle2 className='h-5 w-5 text-green-600' />
              ) : (
                <XCircle className='h-5 w-5 text-red-600' />
              )}
              <span className='text-sm'>Notify Requester</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Workflow Flow Diagram */}
      {approvalConfig.approvers && approvalConfig.approvers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Approval Workflow Flow</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='flex items-center gap-2 overflow-x-auto pb-2'>
              <div className='flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-50 border border-blue-200'>
                <span className='text-sm font-medium text-blue-800'>
                  Request Submitted
                </span>
              </div>

              {approvalConfig.approvers.map((approver: any, index: number) => {
                const profile = approver.user_id
                  ? profileById.get(approver.user_id)
                  : undefined;
                const chipLabel =
                  profile?.full_name ||
                  (approver.role_key
                    ? formatRoleKey(approver.role_key)
                    : 'Approver');

                return (
                  <div
                    key={approver.id || index}
                    className='flex items-center gap-2'
                  >
                    <div className='h-0.5 w-8 bg-gray-300' />
                    <div className='flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-50 border border-purple-200'>
                      <span className='text-xs font-semibold text-purple-600 mr-1'>
                        L{approver.level}
                      </span>
                      <span className='text-sm font-medium text-purple-800 whitespace-nowrap'>
                        {chipLabel}
                      </span>
                    </div>
                  </div>
                );
              })}

              <div className='h-0.5 w-8 bg-gray-300' />
              <div className='flex items-center gap-2 px-4 py-2 rounded-lg bg-green-50 border border-green-200'>
                <span className='text-sm font-medium text-green-800'>
                  Approved & Confirmed
                </span>
              </div>
            </div>

            {approvalConfig.approval_type === 'parallel' && (
              <p className='text-xs text-muted-foreground mt-4'>
                ⚡ All approvers can review simultaneously{' '}
                {approvalConfig.require_all_approvers
                  ? '(ALL required)'
                  : '(ANY can approve)'}
              </p>
            )}

            {approvalConfig.approval_type === 'sequential' && (
              <p className='text-xs text-muted-foreground mt-4'>
                🔄 Approvers will review in sequential order (Level 1 → Level 2
                → ...)
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
