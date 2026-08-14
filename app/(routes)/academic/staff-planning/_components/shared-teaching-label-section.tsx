'use client';

// ============================================================================
// "Is this a planned partnership, or are we covering a shortage?"
//
// One question, two answers, asked of the college that receives the teaching —
// because that is the only party who knows. The council can count 53 assignments
// arriving from a sibling college; it cannot tell from 53 whether the college
// planned it or could not staff it, and those are opposite readings of the same
// number.
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
  SHARED_TEACHING_LABELS,
  SHARED_TEACHING_LABEL_COPY,
  canSetSharedTeachingLabel,
  describeSharedTeachingLabel,
  summariseSharedTeachingLabels,
  type SharedTeachingLabel,
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
      label
    });
  };

  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='flex items-center gap-2 text-base font-semibold'>
          <ArrowLeftRight className='h-4 w-4 text-muted-foreground' />
          Shared teaching with other colleges
        </CardTitle>
        <p className='text-sm text-muted-foreground'>
          Senior Learners from another college teaching here, and ours teaching
          there. Your college says which of the two each arrangement is; nothing
          is assumed for you.
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
            <p className='text-sm text-muted-foreground'>
              {tally.notYetLabelled === 0
                ? `All ${plural(tally.total, 'arrangement', 'arrangements')} are labelled.`
                : `${tally.notYetLabelled} of ${tally.total} not yet labelled.`}
            </p>

            <ul className='space-y-3'>
              {rows.map((row) => {
                const described = describeSharedTeachingLabel(row.label);
                const writable = canSetSharedTeachingLabel({
                  isSuperAdmin,
                  canManage,
                  direction: row.direction
                });

                return (
                  <li
                    key={`${row.giver_institution_id}-${row.receiver_institution_id}-${row.academic_year_id}`}
                    className='rounded-md border p-3'
                  >
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

                    <div className='mt-2 flex flex-wrap items-center gap-2'>
                      {SHARED_TEACHING_LABELS.map((value) => {
                        const selected = described.label === value;
                        return (
                          <Button
                            key={value}
                            type='button'
                            size='sm'
                            variant={selected ? 'default' : 'outline'}
                            disabled={!writable || setLabel.isPending}
                            aria-pressed={selected}
                            title={SHARED_TEACHING_LABEL_COPY[value].help}
                            onClick={() => handleSet(row, value)}
                          >
                            {SHARED_TEACHING_LABEL_COPY[value].title}
                          </Button>
                        );
                      })}

                      {described.state === 'not-yet-labelled' ? (
                        <Badge variant='secondary'>{described.title}</Badge>
                      ) : (
                        <span className='text-xs text-muted-foreground'>
                          {row.label_set_by_name
                            ? `Set by ${row.label_set_by_name}`
                            : 'Set'}
                          {row.label_set_at
                            ? ` on ${moment(row.label_set_at).format('D MMM YYYY')}`
                            : ''}
                        </span>
                      )}
                    </div>

                    {!writable && (
                      <p className='mt-2 text-xs text-muted-foreground'>
                        {row.direction === 'outgoing'
                          ? 'The receiving college answers this one. You can see what they said.'
                          : 'You can see this label but not change it.'}
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
