'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  Mail,
  Send,
  AlertCircle,
  UserCircle2,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
  BosMeetingStatus,
  BOS_MEETING_STATUS_LABELS,
  bosCallLetterFilename,
  bosMemberTypeLabel,
  isBosChairmanRow,
  isCouncilMeetingType,
} from '@/types/bos';
import { useBosMembersByComposition } from '@/hooks/bos/use-bos-members';
import { useBosBoardScope } from '@/hooks/bos/use-bos-board-scope';
import { logger } from '@/lib/utils/enhanced-logger';

interface MemberEmailStatus {
  status: 'sent' | 'failed';
  sent_at: string;
  message_id: string | null;
  error_message: string | null;
}

// Status at which invitation emails can be sent. Mirrors the server-side gate
// in /api/bos/meetings/[id]/notify-members:
//   • Board of Studies   → chairman sends at 'expert_invited'
//   • Academic Council   → principal sends at 'noticed' (no expert_invited step)
const NOTIFY_STATUS_BOS: BosMeetingStatus = 'expert_invited';
const NOTIFY_STATUS_AC: BosMeetingStatus = 'noticed';

interface MembersTabProps {
  meetingId: string;
  compositionId: string;
  meetingStatus: BosMeetingStatus;
  /** Meeting type — 'academic_council' flips the send gate to principal @ noticed. */
  meetingType?: string;
  /**
   * Convening council/committee of the meeting (bos_meetings.committee_id).
   * When set, only that committee's members are listed/invited.
   */
  committeeId?: string | null;
}

export function MembersTab({ meetingId, compositionId, meetingStatus, meetingType, committeeId }: MembersTabProps) {
  const queryClient = useQueryClient();
  const { data: allMembers = [], isLoading } = useBosMembersByComposition(compositionId);
  const scope = useBosBoardScope();

  // Scope the list to the meeting's convening committee. Legacy compositions
  // may have members with no committee assignment — fall back to the full
  // composition rather than showing an empty member list.
  const members = useMemo(() => {
    if (!committeeId) return allMembers;
    const scoped = allMembers.filter((m) => m.committee_id === committeeId);
    return scoped.length > 0 ? scoped : allMembers;
  }, [allMembers, committeeId]);

  // Per-member latest email status for THIS meeting, sourced from
  // bos_email_send_log. Members with no log row appear as "Not Sent".
  const emailStatusKey = useMemo(
    () => ['bos', 'meeting-email-status', meetingId] as const,
    [meetingId],
  );
  const { data: emailStatusData } = useQuery({
    queryKey: emailStatusKey,
    queryFn: async () => {
      const res = await fetch(`/api/bos/meetings/${meetingId}/email-status`);
      if (!res.ok) throw new Error('Failed to load email status');
      return res.json() as Promise<{ byMemberId: Record<string, MemberEmailStatus> }>;
    },
    staleTime: 30 * 1000,
  });
  const statusByMember = emailStatusData?.byMemberId ?? {};

  // Selection state — keyed by member.id for O(1) toggle. Reset whenever
  // the underlying member list shrinks or the status moves away from the
  // sending-eligible state.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isSending, setIsSending] = useState(false);

  // ── Permission + lifecycle gate ────────────────────────────────────────────
  // BoS: chairman (or super-admin) sends at 'expert_invited'.
  // Council (Academic Council / Governing Body): the principal (or super-admin)
  // is the convener and sends the call letters at 'noticed' — they are NOT a
  // bos_members chairman of the council body, so the chairman check would
  // wrongly lock them out.
  const isAc = isCouncilMeetingType(meetingType);
  const notifyStatus = isAc ? NOTIFY_STATUS_AC : NOTIFY_STATUS_BOS;
  const canSend = isAc
    ? scope.isSuperAdmin || scope.isPrincipal
    : scope.isSuperAdmin ||
      (compositionId ? scope.isChairmanIn.has(compositionId) : false);
  const canSendNotices = !scope.isLoading && canSend && meetingStatus === notifyStatus;

  // Members with usable email addresses — only these can be selected/sent.
  const eligibleIds = useMemo(
    () => members.filter((m) => m.email && m.email.includes('@')).map((m) => m.id),
    [members]
  );

  const allEligibleSelected =
    eligibleIds.length > 0 && eligibleIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  const toggleAll = () => {
    setSelected(allEligibleSelected ? new Set() : new Set(eligibleIds));
  };

  const toggleOne = (memberId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const handleSendEmails = async () => {
    if (selected.size === 0) return;
    setIsSending(true);
    try {
      const res = await fetch(`/api/bos/meetings/${meetingId}/notify-members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberIds: Array.from(selected) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Failed to send emails');

      const skipped = body.skippedNoEmail ?? 0;
      const sent = body.sent ?? 0;
      const failed = body.failed ?? 0;

      if (sent > 0 && failed === 0) {
        toast.success(
          skipped > 0
            ? `Sent ${sent} email${sent === 1 ? '' : 's'}. Skipped ${skipped} member(s) with no email.`
            : `Sent ${sent} email${sent === 1 ? '' : 's'} to selected members.`
        );
      } else if (sent > 0 && failed > 0) {
        // Partial success — surface the failure details in the toast so the
        // chairman knows which addresses bounced and can fix them.
        const firstError = body.failedDetails?.[0];
        toast.error(
          `Sent ${sent}, but ${failed} failed.` +
            (firstError ? ` First failure: ${firstError.email} — ${firstError.error}` : '')
        );
      } else if (failed > 0) {
        const firstError = body.failedDetails?.[0];
        toast.error(
          `All ${failed} sends failed.` +
            (firstError ? ` First failure: ${firstError.email} — ${firstError.error}` : '')
        );
      } else {
        toast.error('No emails sent — none of the selected members have an email on file.');
      }
      setSelected(new Set());
      // Refresh the per-member status column so the chairman sees the
      // updated state (Sent / Failed) immediately without a page reload.
      queryClient.invalidateQueries({ queryKey: emailStatusKey });
    } catch (err) {
      logger.error('academic/bos', 'Failed to notify members', err);
      toast.error((err as Error).message || 'Failed to send notifications');
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className='space-y-2'>
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className='h-12 w-full' />)}
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className='rounded-lg border border-dashed p-8 text-center'>
        <UserCircle2 className='h-8 w-8 mx-auto mb-3 opacity-30' />
        <p className='text-sm font-medium'>No members in this composition</p>
        <p className='text-xs text-muted-foreground mt-1'>
          Add members to the composition before scheduling a meeting.
        </p>
      </div>
    );
  }

  return (
    <div className='space-y-3'>
      {/* Header strip: count + send button + status hint */}
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='space-y-0.5'>
          <p className='text-sm text-muted-foreground'>
            {members.length} member{members.length === 1 ? '' : 's'} in this composition
            {canSendNotices && eligibleIds.length !== members.length && (
              <span className='ml-2 text-xs text-amber-700 dark:text-amber-400'>
                ({members.length - eligibleIds.length} without email)
              </span>
            )}
          </p>
          {!canSendNotices && meetingStatus !== notifyStatus && (
            <p className='text-xs text-muted-foreground'>
              Invitation emails can be sent once the meeting is at{' '}
              <span className='font-medium'>{BOS_MEETING_STATUS_LABELS[notifyStatus]}</span>.
            </p>
          )}
          {!canSendNotices && meetingStatus === notifyStatus && !canSend && !scope.isLoading && (
            <p className='text-xs text-muted-foreground'>
              {isAc
                ? 'Only the Principal can send invitation emails.'
                : 'Only the board chairman can send invitation emails.'}
            </p>
          )}
        </div>

        {canSendNotices && (
          <Button
            size='sm'
            onClick={handleSendEmails}
            disabled={isSending || !someSelected}
          >
            <Send className='mr-2 h-3.5 w-3.5' />
            {isSending
              ? 'Sending…'
              : someSelected
                ? `Send Invitation Email${selected.size === 1 ? '' : 's'} (${selected.size})`
                : 'Select members to send'}
          </Button>
        )}
      </div>

      {/* Inline hint about which rows can be selected */}
      {canSendNotices && eligibleIds.length === 0 && (
        <Alert variant='destructive'>
          <AlertCircle className='h-4 w-4' />
          <AlertDescription>
            No members have an email address on file. Add emails to the composition members
            before sending invitations.
          </AlertDescription>
        </Alert>
      )}

      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              {canSendNotices && (
                <TableHead className='w-10'>
                  <Checkbox
                    checked={allEligibleSelected}
                    onCheckedChange={toggleAll}
                    disabled={eligibleIds.length === 0 || isSending}
                    aria-label='Select all members with email'
                  />
                </TableHead>
              )}
              <TableHead className='w-14 text-center'>S.No</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className='w-40'>Role</TableHead>
              <TableHead>Designation</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className='w-32'>Contact</TableHead>
              <TableHead className='w-28 text-center'>Preview</TableHead>
              <TableHead className='w-36'>Email Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m, index) => {
              const hasEmail = !!m.email && m.email.includes('@');
              const isSelected = selected.has(m.id);
              return (
                <TableRow
                  key={m.id}
                  data-state={isSelected ? 'selected' : undefined}
                  className={canSendNotices && hasEmail ? 'cursor-pointer' : ''}
                  onClick={() => canSendNotices && hasEmail && toggleOne(m.id)}
                >
                  {canSendNotices && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleOne(m.id)}
                        disabled={!hasEmail || isSending}
                        aria-label={`Select ${m.display_name}`}
                      />
                    </TableCell>
                  )}
                  <TableCell className='text-center text-muted-foreground text-sm'>
                    {index + 1}
                  </TableCell>
                  <TableCell className='text-sm font-medium'>
                    {m.display_name}
                    {isBosChairmanRow(m) && (
                      <Badge variant='secondary' className='ml-2 text-xs'>
                        Chairman
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant='outline' className='text-xs'>
                      {/* Selected catalog type (bos_member_types) first; the
                          coarse category label only for legacy rows with no
                          member_type_id. */}
                      {m.member_type_rec?.name ?? bosMemberTypeLabel(m.member_type)}
                    </Badge>
                  </TableCell>
                  <TableCell className='text-sm text-muted-foreground'>
                    {m.display_designation ?? '—'}
                  </TableCell>
                  <TableCell className='text-sm'>
                    {hasEmail ? (
                      <span className='inline-flex items-center gap-1.5'>
                        <Mail className='h-3.5 w-3.5 text-muted-foreground' />
                        {m.email}
                      </span>
                    ) : (
                      <span className='text-xs text-amber-700 dark:text-amber-400'>
                        No email on file
                      </span>
                    )}
                  </TableCell>
                  <TableCell className='text-sm text-muted-foreground'>
                    {m.contact_no ?? '—'}
                  </TableCell>
                  <TableCell className='text-center' onClick={(e) => e.stopPropagation()}>
                    {/* asChild lets the Button render its styles directly on the
                        anchor so the native `download` attribute triggers a
                        same-origin file save without a JS blob handler. */}
                    <Button variant='outline' size='sm' className='h-8 gap-1.5' asChild>
                      <a
                        href={`/api/bos/meetings/${meetingId}/preview-pdf?memberId=${m.id}`}
                        download={bosCallLetterFilename(meetingType, m.display_name)}
                        target='_blank'
                        rel='noopener noreferrer'
                        aria-label={`Download call letter PDF for ${m.display_name}`}
                      >
                        <FileText className='h-3.5 w-3.5' />
                        Preview
                      </a>
                    </Button>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const s = statusByMember[m.id];
                      if (!s) {
                        return (
                          <Badge variant='outline' className='gap-1 text-xs font-normal text-muted-foreground'>
                            <Clock className='h-3 w-3' />
                            Not Sent
                          </Badge>
                        );
                      }
                      const when = (() => {
                        try {
                          return formatDistanceToNow(new Date(s.sent_at), { addSuffix: true });
                        } catch {
                          return '';
                        }
                      })();
                      if (s.status === 'sent') {
                        return (
                          <Badge
                            variant='outline'
                            className='gap-1 text-xs font-normal border-green-300 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
                            title={when ? `Sent ${when}` : undefined}
                          >
                            <CheckCircle2 className='h-3 w-3' />
                            Sent
                          </Badge>
                        );
                      }
                      return (
                        <Badge
                          variant='outline'
                          className='gap-1 text-xs font-normal border-red-300 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400'
                          title={s.error_message ?? undefined}
                        >
                          <XCircle className='h-3 w-3' />
                          Failed
                        </Badge>
                      );
                    })()}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
