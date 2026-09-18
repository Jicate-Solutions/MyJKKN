'use client';

/**
 * The confirmation queue itself.
 *
 * TWO SECTIONS, NOT A FILTER. Unanswered work is the reason to open this page,
 * so it sits at the top and is loud. Answered work sits below it, quieter — a
 * head has to be able to see what they already agreed to, and to what hours,
 * without that history competing with the thing that needs doing today.
 *
 * EVERY EMPTY STATE HERE SAYS WHICH EMPTY IT IS (CLAUDE.md rule 27). An RLS
 * SELECT policy filters instead of raising, so "nothing named your department"
 * and "you cannot read the initiatives that did" both arrive as an empty list
 * and mean completely different things.
 */

import { useMemo, useState } from 'react';
import { CheckCircle2, Clock, Users, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  EngagementRegisterMissingError,
  shortSdgLabel,
  useParticipationQueue,
  type ParticipationRow,
} from '@/hooks/solutions/use-participation-confirmations';
import { AnswerParticipationDialog, type AnswerMode } from './answer-participation-dialog';

/**
 * A short, plain sentence a head of department can act on. Used for every
 * "you cannot use this screen" case, so none of them is a blank area.
 */
function NoAccessNotice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      role='note'
      className='flex max-w-2xl items-start gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm'
    >
      <div className='space-y-1.5'>
        <p className='font-medium text-foreground'>{title}</p>
        <div className='space-y-1.5 text-muted-foreground'>{children}</div>
      </div>
    </div>
  );
}

function StatusBadge({ row }: { row: ParticipationRow }) {
  if (row.confirmation_status === 'confirmed') {
    return (
      <Badge variant='secondary' className='gap-1 text-[10px]'>
        <CheckCircle2 className='h-3 w-3' aria-hidden='true' /> confirmed
      </Badge>
    );
  }
  if (row.confirmation_status === 'declined') {
    return (
      <Badge variant='outline' className='gap-1 text-[10px]'>
        <XCircle className='h-3 w-3' aria-hidden='true' /> declined
      </Badge>
    );
  }
  return (
    <Badge className='gap-1 text-[10px]'>
      <Clock className='h-3 w-3' aria-hidden='true' /> waiting for you
    </Badge>
  );
}

function InitiativeCard({
  row,
  onAnswer,
}: {
  row: ParticipationRow;
  onAnswer: (mode: AnswerMode, row: ParticipationRow) => void;
}) {
  const pending = row.confirmation_status === 'pending';

  return (
    <div className='rounded-lg border border-border p-4'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='min-w-0 space-y-1'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='font-medium text-foreground'>{row.title}</span>
            <StatusBadge row={row} />
            {row.is_lead && (
              <Badge variant='outline' className='text-[10px]'>
                your department recorded this
              </Badge>
            )}
            {/* The parent register has its own approval step. A confirmation on
                an initiative nobody has approved yet still counts for nothing,
                so saying which is which prevents a head reading "confirmed" as
                "counted". */}
            {row.approval_status !== 'approved' && (
              <Badge variant='outline' className='text-[10px]'>
                initiative not approved yet
              </Badge>
            )}
          </div>

          {row.description && (
            <p className='text-sm text-muted-foreground'>{row.description}</p>
          )}

          <dl className='flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground'>
            <div>
              <dt className='inline font-medium'>When: </dt>
              <dd className='inline'>{row.engagement_date}</dd>
            </div>
            <div>
              {/* The register stores no location column, so "where" is answered
                  by whose college ran it — the nearest true thing we hold. */}
              <dt className='inline font-medium'>Where: </dt>
              <dd className='inline'>{row.lead_institution_name ?? 'college not recorded'}</dd>
            </div>
            <div>
              <dt className='inline font-medium'>Led by: </dt>
              <dd className='inline'>
                {row.lead_department_name ?? 'department not readable from here'}
                {row.recorded_by_name ? ` (${row.recorded_by_name})` : ''}
              </dd>
            </div>
            <div>
              <dt className='inline font-medium'>People served: </dt>
              <dd className='inline'>{row.beneficiaries_count}</dd>
            </div>
          </dl>

          {row.sdg_goals.length > 0 && (
            <div className='flex flex-wrap gap-1 pt-1'>
              {row.sdg_goals.map((code) => (
                <Badge key={code} variant='outline' className='text-[10px]'>
                  {shortSdgLabel(code)}
                </Badge>
              ))}
            </div>
          )}

          {row.co_participants.length > 0 && (
            <p className='flex items-start gap-1.5 pt-1 text-xs text-muted-foreground'>
              <Users className='mt-0.5 h-3 w-3 shrink-0' aria-hidden='true' />
              <span>
                Also named:{' '}
                {row.co_participants
                  .map(
                    (other) =>
                      `${other.department_name ?? 'a department you cannot see'}${
                        other.is_lead ? ' (lead)' : ''
                      } — ${other.confirmation_status}`
                  )
                  .join('; ')}
              </span>
            </p>
          )}

          {row.confirmation_status === 'confirmed' && (
            <p className='pt-1 text-xs text-muted-foreground'>
              You confirmed{' '}
              {row.hours_contributed != null
                ? `${row.hours_contributed} hours from your department`
                : 'without recording hours'}
              {row.confirmed_at ? ` on ${row.confirmed_at.slice(0, 10)}` : ''}.
            </p>
          )}
          {row.confirmation_status === 'declined' && row.decline_note && (
            <p className='pt-1 text-xs text-muted-foreground'>
              You declined: &ldquo;{row.decline_note}&rdquo;
            </p>
          )}
        </div>

        {pending && (
          <div className='flex shrink-0 gap-2'>
            <Button size='sm' onClick={() => onAnswer('confirm', row)}>
              Confirm
            </Button>
            <Button size='sm' variant='outline' onClick={() => onAnswer('decline', row)}>
              Decline
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ConfirmationsPanel({
  departmentId,
  canConfirm,
}: {
  /** The viewer's own department, straight from their profile. */
  departmentId: string | null;
  /** Whether the viewer holds solutions.societal.confirm (or is an admin). */
  canConfirm: boolean;
}) {
  const { data, isLoading, error, refetch } = useParticipationQueue(departmentId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<AnswerMode>('confirm');
  const [activeRow, setActiveRow] = useState<ParticipationRow | null>(null);

  const rows = data?.rows ?? [];
  const pendingRows = useMemo(
    () => rows.filter((row) => row.confirmation_status === 'pending'),
    [rows]
  );
  const answeredRows = useMemo(
    () =>
      rows
        .filter((row) => row.confirmation_status !== 'pending')
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [rows]
  );

  const openAnswer = (mode: AnswerMode, row: ParticipationRow) => {
    setDialogMode(mode);
    setActiveRow(row);
    setDialogOpen(true);
  };

  // ── The viewer has no department ─────────────────────────────────────────
  // Rule 27: this is a refusal and it says so. It must never redirect — a null
  // department check that bounced to a landing page would be an unexplainable
  // loop for exactly the person who most needs to know what is wrong.
  if (data?.visibility === 'no_department') {
    return (
      <NoAccessNotice title="You don't have access — your profile has no department">
        <p>
          This screen answers for one department, and your account is not
          attached to one, so there is nothing it could show you. Nothing is
          broken.
        </p>
        <p>
          Ask whoever manages accounts for your institution to set your
          department under Users, then your profile. If you believe it is
          already set, tap the red bug button at the bottom right and report it.
        </p>
      </NoAccessNotice>
    );
  }

  if (isLoading) {
    return <p className='text-sm text-muted-foreground'>Loading the initiatives naming your department…</p>;
  }

  if (error) {
    const missing = error instanceof EngagementRegisterMissingError;
    return (
      <NoAccessNotice
        title={
          missing
            ? 'This part of the register has not been created yet'
            : 'The list could not be read'
        }
      >
        <p>
          {missing
            ? 'The joint-initiative tables are not present in this environment yet, so there is nothing to confirm. This is a setup step, not a permission problem — an empty list here would have been a lie.'
            : (error as Error).message}
        </p>
        <Button size='sm' variant='outline' onClick={() => void refetch()}>
          Try again
        </Button>
      </NoAccessNotice>
    );
  }

  return (
    <div className='space-y-6'>
      {!canConfirm && (
        <NoAccessNotice title='You can see these, but you cannot answer them'>
          <p>
            None of your roles include{' '}
            <code className='rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground'>
              solutions.societal.confirm
            </code>
            , so the Confirm and Decline buttons are hidden rather than offered
            and refused. Ask your Solutions Hub administrator to add it under
            Users, then Role Management.
          </p>
        </NoAccessNotice>
      )}

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>
            Waiting for your answer{pendingRows.length > 0 ? ` (${pendingRows.length})` : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          {pendingRows.length === 0 ? (
            <div className='space-y-2 text-sm text-muted-foreground'>
              <p>Nothing is waiting for your answer.</p>
              {/* An empty queue is genuinely ambiguous here and must not be
                  reported as certainty. The participants table is readable only
                  where the PARENT initiative is readable, and the parent's
                  policy is scoped to the recording college — so a department
                  named by another college can be named and still see nothing. */}
              <p className='text-xs'>
                That means either no other department has named yours on a
                community initiative, or one has and this screen cannot read
                their initiative: you can only see an initiative recorded by a
                college your roles reach. If you were told you were named on
                something and it is not here, that is the reason — report it with
                the red bug button so the scope can be widened.
              </p>
            </div>
          ) : (
            pendingRows.map((row) => (
              <InitiativeCard
                key={row.id}
                row={row}
                onAnswer={canConfirm ? openAnswer : () => undefined}
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base text-muted-foreground'>
            Already answered{answeredRows.length > 0 ? ` (${answeredRows.length})` : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          {answeredRows.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              Your department has not answered any initiative yet.
            </p>
          ) : (
            answeredRows.map((row) => (
              // No action buttons render on an answered row (InitiativeCard
              // shows them only while pending), and the write refuses anything
              // that is not still `pending` — so there is no offered-then-
              // refused control here. The handler is passed for symmetry only.
              <InitiativeCard
                key={row.id}
                row={row}
                onAnswer={canConfirm ? openAnswer : () => undefined}
              />
            ))
          )}
        </CardContent>
      </Card>

      <AnswerParticipationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        row={activeRow}
        departmentId={departmentId}
      />
    </div>
  );
}
