'use client';

import { format } from 'date-fns';
import { CheckCircle2, MapPin, Phone, ThumbsDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PhotoStrip } from '@/components/instasolver/photo-strip';
import { CategoryTeamLine } from '@/components/instasolver/assign';
import type { Issue } from '@/types/instasolver';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

const when = (iso: string) => format(new Date(iso), 'dd MMM yyyy, hh:mm a');

function PhoneLink({ number }: { number: string }) {
  return (
    <a
      href={`tel:${number.replace(/\s+/g, '')}`}
      className="inline-flex items-center gap-1.5 text-primary underline-offset-2 hover:underline"
    >
      <Phone className="h-3.5 w-3.5" />
      {number}
    </a>
  );
}

export function IssueDetails({ issue, showPhones }: { issue: Issue; showPhones: boolean }) {
  const assignedTo = issue.assignee?.full_name;
  const hasAssignment = !!(issue.assigned_to || issue.assigned_team_id);

  return (
    <div className="space-y-4">
      {issue.status === 'completed' && (issue.resolution_confirmed_at || issue.resolution_disputed_at) && (
        <Card
          className={
            issue.resolution_disputed_at
              ? 'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/30'
              : 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/30'
          }
        >
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            {issue.resolution_disputed_at ? (
              <>
                <ThumbsDown className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <div>
                  <p className="font-medium">
                    {issue.reporter?.full_name ?? 'The reporter'} says it is still a problem
                    <span className="font-normal text-muted-foreground"> · {when(issue.resolution_disputed_at)}</span>
                  </p>
                  {issue.resolution_dispute_reason && (
                    <p className="mt-1 whitespace-pre-wrap text-muted-foreground">“{issue.resolution_dispute_reason}”</p>
                  )}
                </div>
              </>
            ) : (
              <>
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <p className="font-medium">
                  {issue.reporter?.full_name ?? 'The reporter'} confirmed the fix
                  <span className="font-normal text-muted-foreground">
                    {' '}
                    · {when(issue.resolution_confirmed_at as string)}
                  </span>
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="flex items-start gap-1.5 text-sm font-medium">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 break-words">{issue.location}</span>
          </p>

          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="Institution">{issue.institution?.name ?? '—'}</Field>
            <Field label="Category">{issue.category?.name ?? '—'}</Field>
            <Field label="Reported by">{issue.reporter?.full_name ?? '—'}</Field>
            <Field label="Reported on">{when(issue.created_at)}</Field>
            {issue.reopened_count > 0 && (
              <Field label="Reopened">
                {issue.reopened_count} {issue.reopened_count === 1 ? 'time' : 'times'}
                {issue.last_reopened_at ? `, last on ${when(issue.last_reopened_at)}` : ''}
              </Field>
            )}
          </dl>

          <Field label="What is wrong">
            <p className="whitespace-pre-wrap">{issue.details}</p>
          </Field>
          {issue.suspected_reason && (
            <Field label="Suspected reason">
              <p className="whitespace-pre-wrap">{issue.suspected_reason}</p>
            </Field>
          )}
          {issue.resolution_suggestion && (
            <Field label="Suggested fix">
              <p className="whitespace-pre-wrap">{issue.resolution_suggestion}</p>
            </Field>
          )}

          {showPhones && (issue.contact_phone || issue.alternate_phone) && (
            <Field label="Reporter’s phone">
              <div className="flex flex-col gap-1">
                {issue.contact_phone && <PhoneLink number={issue.contact_phone} />}
                {issue.alternate_phone && <PhoneLink number={issue.alternate_phone} />}
              </div>
            </Field>
          )}

          {issue.image_urls?.length > 0 && (
            <Field label="Photographs">
              <PhotoStrip urls={issue.image_urls} label="Reported photograph" />
            </Field>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Assignment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasAssignment ? (
            <p className="text-sm text-muted-foreground">Not assigned yet.</p>
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Assigned to">{assignedTo ?? 'Not claimed by anyone yet'}</Field>
              <Field label="Team">{issue.team?.name ?? '—'}</Field>
              <Field label="Assigned on">{issue.assigned_at ? when(issue.assigned_at) : '—'}</Field>
              <Field label="Assigned by">{issue.assigner?.full_name ?? '—'}</Field>
            </dl>
          )}
          {/* Who covers this category — shown to the CAO and the people working it
              (standalone quick-assign.tsx, CategoryTeamLine). */}
          {showPhones && <CategoryTeamLine issue={issue} />}
        </CardContent>
      </Card>

      {issue.status === 'completed' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Resolution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {issue.completed_at && <p className="text-xs text-muted-foreground">Completed {when(issue.completed_at)}</p>}
            <p className="whitespace-pre-wrap text-sm">{issue.resolution_notes ?? 'No notes were left.'}</p>
            {issue.resolution_image_urls?.length > 0 && (
              <PhotoStrip urls={issue.resolution_image_urls} label="Resolution photograph" />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
