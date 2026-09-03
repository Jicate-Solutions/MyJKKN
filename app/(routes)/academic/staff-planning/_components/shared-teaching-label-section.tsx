'use client';

// ============================================================================
// "Is this a planned partnership, or are we covering a shortage?"
//
// One question, asked of BOTH colleges (Director decision 5, 2026-08-18). The
// council can count 53 assignments arriving from a sibling college; it cannot
// tell from 53 whether the college planned it or could not staff it, and those
// are opposite readings of the same number. Each college answers for itself and
// both answers are printed together.
//
// THE TWO ANSWERS MAY DISAGREE, AND THAT IS THE USEFUL CASE. One college calling
// it a planned partnership while the other calls it covering a shortage is not a
// data error to be reconciled away — it is the clearest thing either of them
// says, and the earlier one-label-per-relationship design deleted it silently.
// Nothing on this screen marks a disagreement as a problem.
//
// SILENCE IS PRINTED, NOT LEFT BLANK (decisions 9 and 12). When only one side
// has answered, that answer is shown AND the other side is named as still
// pending. A blank there would read as agreement with whoever did answer.
//
// WHAT IS DELIBERATELY ABSENT FROM THIS SCREEN: any score, grade, percentage or
// ordering of colleges. Rows are sorted by volume so the biggest relationship is
// answered first — that is a reading order, not a ranking, and no position is
// printed. Neither answer is styled as the good one.
// ============================================================================

import moment from 'moment';
import { ArrowLeftRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useSetSharedTeachingLabel,
  useSharedTeachingRelationships
} from '@/hooks/academic/use-shared-teaching-labels';
import {
  EDITED_COPY,
  SHARED_TEACHING_LABELS,
  SHARED_TEACHING_LABEL_COPY,
  canSetSharedTeachingLabel,
  labellingInstitutionIdFor,
  otherCollegeNameOf,
  otherSideNotYetLabelledNote,
  otherSideOf,
  ownSideOf,
  readSharedTeachingSide,
  sharedTeachingRelationshipKey,
  summariseSharedTeachingLabels,
  type SharedTeachingLabel,
  type SharedTeachingLabelSide,
  type SharedTeachingRelationship
} from '@/lib/academic/shared-teaching-label';

interface SharedTeachingLabelSectionProps {
  /** The institution filter in force on the page, if any. */
  institutionId?: string;
}

/** "3 assignment" reads as a typo; "3 assignments" does not. */
function plural(count: number, one: string, many: string): string {
  return count === 1 ? `${count} ${one}` : `${count} ${many}`;
}

/**
 * One college's answer, printed under that college's name.
 *
 * Absence is printed as its own sentence rather than left blank, and the
 * carried-forward and edited markers ride with the answer so an old or revised
 * position never passes as a fresh one (decisions 6 and 8).
 */
function SideAnswer({
  collegeName,
  side,
  pendingNote
}: {
  collegeName: string | null;
  side: SharedTeachingLabelSide | null;
  pendingNote: string;
}) {
  const reading = readSharedTeachingSide(side);

  return (
    <div className='text-xs'>
      <span className='font-medium'>{collegeName ?? 'Unnamed college'}</span>
      <span className='text-muted-foreground'> says: </span>
      {reading.state === 'not-yet-labelled' ? (
        <span className='text-muted-foreground'>{pendingNote}</span>
      ) : (
        <>
          <span>{reading.title}</span>
          {reading.carriedForward && (
            <Badge variant='outline' className='ml-2 font-normal'>
              {reading.carriedForwardNote}
            </Badge>
          )}
          {reading.edited && (
            <Badge
              variant='outline'
              className='ml-2 font-normal'
              title={EDITED_COPY.help}
            >
              {EDITED_COPY.title}
            </Badge>
          )}
          <span className='ml-2 text-muted-foreground'>
            {reading.setByName ? `Set by ${reading.setByName}` : 'Set'}
            {reading.setAt
              ? ` on ${moment(reading.setAt).format('D MMM YYYY')}`
              : ''}
          </span>
        </>
      )}
    </div>
  );
}

export function SharedTeachingLabelSection({
  institutionId
}: SharedTeachingLabelSectionProps) {
  const { can, isSuperAdmin, userProfile } = usePermissions();

  // The page's filter wins; otherwise the viewer's own college, which is the
  // one they can actually answer for.
  const scopedInstitutionId = institutionId ?? userProfile?.institution_id ?? null;

  const canView = isSuperAdmin || can('academic.shared_teaching.label.view');
  const canManage = can('academic.shared_teaching.label.manage');

  const { data, isLoading, error } = useSharedTeachingRelationships(
    canView ? scopedInstitutionId : null
  );
  const setLabel = useSetSharedTeachingLabel(scopedInstitutionId);

  // No key, no card. A viewer without the key would otherwise see an empty
  // panel and read it as "this college shares no teaching".
  if (!canView) return null;

  const rows = data?.relationships ?? [];
  const hubAssignments = data?.hub_assignments ?? 0;
  const tally = summariseSharedTeachingLabels(rows);

  const handleSet = (
    row: SharedTeachingRelationship,
    label: SharedTeachingLabel
  ) => {
    setLabel.mutate({
      giverInstitutionId: row.giver_institution_id,
      receiverInstitutionId: row.receiver_institution_id,
      academicYearId: row.academic_year_id,
      // Whichever side this college is on — never the other one.
      labelledByInstitutionId: labellingInstitutionIdFor(row),
      label
    });
  };

  // WHICH row is mid-save, not WHETHER any row is. `setLabel.isPending` alone
  // greyed out every row's buttons while one row saved, so a viewer answering a
  // list of relationships was locked out of the other lines by their own click
  // and had no way to tell why.
  const pendingRowKey =
    setLabel.isPending && setLabel.variables
      ? sharedTeachingRelationshipKey({
          giverInstitutionId: setLabel.variables.giverInstitutionId,
          receiverInstitutionId: setLabel.variables.receiverInstitutionId,
          academicYearId: setLabel.variables.academicYearId
        })
      : null;

  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='flex items-center gap-2 text-base font-semibold'>
          <ArrowLeftRight className='h-4 w-4 text-muted-foreground' />
          Shared teaching with other colleges
        </CardTitle>
        <p className='text-sm text-muted-foreground'>
          Teaching that crosses between colleges — theirs coming here, and ours
          going there. Both colleges say which of the two each arrangement is,
          and both answers are shown. Nothing is assumed for you, and the two are
          allowed to differ.
        </p>
      </CardHeader>

      <CardContent className='space-y-4'>
        {isLoading ? (
          <div className='space-y-2'>
            <Skeleton className='h-12 w-full' />
            <Skeleton className='h-12 w-3/4' />
          </div>
        ) : error ? (
          <p className='text-sm text-destructive'>
            Shared teaching could not be read just now, so this list is not
            complete. It is not a sign that there is none.
          </p>
        ) : !scopedInstitutionId ? (
          <p className='text-sm text-muted-foreground'>
            Choose a college above to see the teaching it shares.
          </p>
        ) : rows.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            No teaching is shared with another college in the plans recorded so
            far.
          </p>
        ) : (
          <>
            {/* Your college's outstanding answers and the other colleges'
                silence are counted separately — a college cannot act on the
                second, and folding them together produces a number nobody can
                move. */}
            <p className='text-sm text-muted-foreground'>
              {tally.notYetLabelled === 0
                ? `Your college has answered all ${plural(tally.total, 'arrangement', 'arrangements')}.`
                : `${tally.notYetLabelled} of ${tally.total} not yet labelled by your college.`}
              {tally.awaitingOtherCollege > 0 &&
                ` Still waiting on the other college for ${plural(tally.awaitingOtherCollege, 'arrangement', 'arrangements')}.`}
            </p>

            <ul className='space-y-3'>
              {rows.map((row) => {
                const ownSide = ownSideOf(row);
                const own = readSharedTeachingSide(ownSide);
                const writable = canSetSharedTeachingLabel({
                  isSuperAdmin,
                  canManage,
                  direction: row.direction
                });
                const rowKey = sharedTeachingRelationshipKey({
                  giverInstitutionId: row.giver_institution_id,
                  receiverInstitutionId: row.receiver_institution_id,
                  academicYearId: row.academic_year_id
                });
                const isSaving = pendingRowKey === rowKey;
                const otherPending = otherSideNotYetLabelledNote(
                  otherCollegeNameOf(row)
                );

                return (
                  <li key={rowKey} className='rounded-md border p-3'>
                    <div className='flex flex-wrap items-center gap-2 text-sm'>
                      <span className='font-medium'>
                        {row.giver_name ?? 'Unnamed college'}
                      </span>
                      <ArrowLeftRight className='h-3 w-3 text-muted-foreground' />
                      <span className='font-medium'>
                        {row.receiver_name ?? 'Unnamed college'}
                      </span>
                      <Badge variant='outline'>
                        {row.direction === 'incoming'
                          ? 'Taught here'
                          : 'Taught elsewhere'}
                      </Badge>
                      <span className='text-muted-foreground'>
                        {plural(row.assignments, 'assignment', 'assignments')} ·{' '}
                        {plural(row.people, 'person', 'people')}
                        {row.academic_year_name
                          ? ` · ${row.academic_year_name}`
                          : ''}
                      </span>
                    </div>

                    {/* Both answers, each under the name of the college that
                        gave it. Order is fixed — giver then receiver — so a
                        reader is never left working out whose sentence is
                        whose. */}
                    <div className='mt-2 space-y-1 rounded-sm bg-muted/40 p-2'>
                      <SideAnswer
                        collegeName={row.giver_name}
                        side={row.giver_label}
                        pendingNote={
                          row.direction === 'outgoing'
                            ? 'not yet labelled by you'
                            : otherPending
                        }
                      />
                      <SideAnswer
                        collegeName={row.receiver_name}
                        side={row.receiver_label}
                        pendingNote={
                          row.direction === 'incoming'
                            ? 'not yet labelled by you'
                            : otherPending
                        }
                      />
                    </div>

                    <div className='mt-2 flex flex-wrap items-center gap-2'>
                      {SHARED_TEACHING_LABELS.map((value) => {
                        const selected = own.label === value;
                        return (
                          <Button
                            key={value}
                            type='button'
                            size='sm'
                            variant={selected ? 'default' : 'outline'}
                            disabled={!writable || isSaving}
                            aria-pressed={selected}
                            title={SHARED_TEACHING_LABEL_COPY[value].help}
                            onClick={() => handleSet(row, value)}
                          >
                            {SHARED_TEACHING_LABEL_COPY[value].title}
                          </Button>
                        );
                      })}

                      {own.state === 'not-yet-labelled' && (
                        <Badge variant='secondary'>{own.title}</Badge>
                      )}
                    </div>

                    {/* Decision 9 — the other college's silence is stated, not
                        implied by an empty space. */}
                    {!otherSideOf(row) && (
                      <p className='mt-2 text-xs text-muted-foreground'>
                        {otherPending}
                      </p>
                    )}

                    {!writable && (
                      <p className='mt-2 text-xs text-muted-foreground'>
                        You can see both answers but not change your college&apos;s.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>

            {hubAssignments > 0 && (
              <p className='text-xs text-muted-foreground'>
                A further{' '}
                {plural(hubAssignments, 'assignment involves', 'assignments involve')}{' '}
                the central office. Those are not labelled here — the question is
                about two colleges, not about central support.
              </p>
            )}
          </>
        )}

        {setLabel.isError && (
          <p className='text-sm text-destructive'>
            That label was not saved. Nothing was changed.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
