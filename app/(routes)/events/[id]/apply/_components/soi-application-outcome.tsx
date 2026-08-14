'use client';

// School of Influence — what actually happened to YOUR application, in the
// coordinator's own words (Director decision, 2026-08-01).
//
// THE GAP THIS CLOSES
//   Until now a turned-down applicant read one generic sentence: "your
//   application has been dealt with … Contact the programme coordinator if you
//   think it should be looked at afresh." True, but it names no cause, so the
//   applicant cannot act on it and cannot tell whether the decision was about
//   their answers, their eligibility, or a full batch. CLAUDE.md rule 27: a
//   refusal must state the real reason, not bounce the person somewhere generic.
//   The reviewer already types a reason — this file is the first surface that
//   shows it to the person it is about.
//
// WHERE THE REASON COMES FROM
//   The reject path stores it on the APPLICANT'S OWN events_registrations row at
//   custom_data -> 'soi' -> 'review' ->> 'reason', beside 'decision' and
//   'decided_at'. So it is read here straight from that row. Nothing is
//   summarised, softened or re-worded: the coordinator's text is rendered
//   exactly as typed, whitespace and line breaks included.
//
// WHY THIS READS THE TABLE DIRECTLY AND IMPORTS NO SERVICE
//   The coordinator-side service that also exposes this data is part of an
//   unmerged branch. Importing it would make this a stacked pull request, which
//   in this repository runs ZERO continuous-integration checks and merges into
//   that branch rather than into main. A direct read has no such coupling, and
//   the applicant's own row is the authoritative record either way.
//
//   The source token 'soi_apply' is spelled out below rather than imported from
//   apply-service.ts: that module builds a server Supabase client at import
//   time, and pulling it into a client component would drag server code into the
//   browser bundle — the exact hazard apply-types.ts was split out to avoid.
//
// WHY THE profile_id FILTER IS LOAD-BEARING, NOT DECORATION
//   events_registrations carries TWO read policies. events_reg_self_read admits
//   the owner (profile_id = auth.uid()), but events_reg_institution_read also
//   admits any signed-in person from the same institution. So row-level security
//   alone would let somebody read a colleague's application. The filter below
//   pins the query to the id on the CURRENT SESSION, taken from
//   supabase.auth.getUser() — never from a prop, a URL segment or anything the
//   browser could be talked into supplying. One person, one row, their own.

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { soiDisplayName } from '@/lib/services/school-of-influence/constants';

/** events_registrations.source written by the apply flow. */
const SOI_APPLICATION_SOURCE = 'soi_apply';

/** Statuses that mean a coordinator has not decided yet. */
const UNDER_REVIEW_STATUSES = ['pending', 'waitlisted'];

/**
 * One person's own application to one programme, reduced to what they are
 * entitled to be told. `reason` is null when the coordinator recorded none —
 * it is never an empty string, so the screen can say so plainly instead of
 * drawing an empty box.
 */
export interface SoiOwnApplicationOutcome {
  state: 'pending' | 'accepted' | 'rejected';
  submittedAt: string | null;
  decidedAt: string | null;
  reason: string | null;
  batchName: string | null;
}

const formatDay = (value: string | null) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const cleanText = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Turn one registration row into an outcome, or into null when this screen
 * cannot honestly name what happened.
 *
 * Returning null matters as much as returning a state. A 'cancelled'
 * application is one the applicant may submit again, so there is no outcome to
 * report; and a status this flow never writes (say 'registered' or 'no_show',
 * both admitted by the shared events_registrations constraint) is one we cannot
 * interpret. In either case the caller falls back to the message it already
 * had, rather than this screen guessing at a decision.
 */
function toOutcome(row: {
  status: string | null;
  created_at: string | null;
  custom_data: unknown;
} | null): SoiOwnApplicationOutcome | null {
  if (!row) return null;

  const status = cleanText(row.status);
  if (!status || status === 'cancelled') return null;

  const review = (row.custom_data as Record<string, any> | null)?.soi?.review ?? null;
  const decision = cleanText(review?.decision);

  // The review record is the decision of record and is read first; the row's
  // status is only a fallback, for a decision written before that record
  // existed. If the two ever disagree, the coordinator's own entry wins.
  let state: SoiOwnApplicationOutcome['state'] | null = null;
  if (decision === 'accepted') state = 'accepted';
  else if (decision === 'rejected') state = 'rejected';
  else if (UNDER_REVIEW_STATUSES.includes(status)) state = 'pending';
  else if (status === 'confirmed') state = 'accepted';
  else if (status === 'disqualified') state = 'rejected';

  if (!state) return null;

  return {
    state,
    submittedAt: cleanText(row.created_at),
    decidedAt: state === 'pending' ? null : cleanText(review?.decided_at),
    reason: state === 'rejected' ? cleanText(review?.reason) : null,
    // The stored batch name still carries the programme's old spelling on rows
    // written before the 2026-08-13 rename, so it is printed under the current
    // one. soiDisplayName is idempotent, so a newer row passes through unchanged.
    batchName:
      state === 'accepted' && cleanText(review?.batch_name)
        ? soiDisplayName(cleanText(review?.batch_name))
        : null,
  };
}

/**
 * Read the signed-in person's own application to this programme.
 *
 * `enabled` is passed false on every path where the applicant has no live
 * application, so the ordinary apply screen costs no extra query. staleTime is
 * zero because a coordinator can decide between two page loads and a cached
 * "still being reviewed" would be a stale answer to the one question this
 * screen exists to answer.
 */
export function useOwnApplicationOutcome(eventId: string, enabled: boolean) {
  return useQuery<SoiOwnApplicationOutcome | null>({
    queryKey: ['soi-own-application-outcome', eventId],
    enabled: enabled && !!eventId,
    staleTime: 0,
    queryFn: async () => {
      const supabase = createClientSupabaseClient();

      const { data: auth } = await supabase.auth.getUser();
      const profileId = auth?.user?.id ?? null;
      // No session means no row of this person's to read. The apply screen
      // already tells a signed-out visitor to sign in.
      if (!profileId) return null;

      const { data, error } = await supabase
        .from('events_registrations')
        .select('status, created_at, custom_data')
        .eq('event_id', eventId)
        .eq('profile_id', profileId)
        .eq('source', SOI_APPLICATION_SOURCE)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return toOutcome(data);
    },
  });
}

/**
 * The applicant-facing account of their own application. Replaces the generic
 * refusal on this screen whenever there is something truer to say — and says
 * nothing it cannot support from the record.
 */
export function SoiApplicationOutcome({
  outcome,
  fallbackBatchName,
}: {
  outcome: SoiOwnApplicationOutcome;
  /** The batch from the apply context, used only if the decision record has none. */
  fallbackBatchName?: string | null;
}) {
  const submittedOn = formatDay(outcome.submittedAt);
  const decidedOn = formatDay(outcome.decidedAt);

  if (outcome.state === 'pending') {
    return (
      <Alert>
        <Clock className="h-4 w-4" />
        <AlertTitle>Your application is with a coordinator</AlertTitle>
        <AlertDescription>
          {submittedOn ? `You applied on ${submittedOn}. ` : ''}
          It has not been decided yet. You will be told the outcome, and you do not
          need to apply again.
        </AlertDescription>
      </Alert>
    );
  }

  if (outcome.state === 'accepted') {
    const batchName = outcome.batchName ?? fallbackBatchName ?? null;
    return (
      <Alert>
        <CheckCircle2 className="h-4 w-4" />
        <AlertTitle>Your application was accepted</AlertTitle>
        <AlertDescription>
          {batchName
            ? `You have a place in ${batchName}.`
            : 'You have a place in this programme.'}
          {decidedOn ? ` Accepted on ${decidedOn}.` : ''} A person can be in only one
          batch of this programme at a time, so there is nothing more to apply for.
          {/*
            Deliberately no "view your batch" link: this programme has no
            participant-facing batch screen yet, and its only landing path
            redirects into a coordinator-only settings page. Sending an accepted
            applicant there would bounce them straight back out — the silent
            redirect CLAUDE.md rule 27 exists to stop. A named batch and no link
            is more use than a link that goes nowhere they can stand.
          */}{' '}
          A coordinator will be in touch about when your batch meets.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <Alert variant="destructive">
        <XCircle className="h-4 w-4" />
        <AlertTitle>Your application was not accepted</AlertTitle>
        <AlertDescription>
          {submittedOn ? `You applied on ${submittedOn}. ` : ''}
          {decidedOn
            ? `A coordinator decided this on ${decidedOn}.`
            : 'A coordinator has decided this application.'}
        </AlertDescription>
      </Alert>

      {outcome.reason ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              The reason, in the coordinator&rsquo;s own words
            </CardTitle>
            <CardDescription>
              This is exactly what the coordinator wrote. It has not been edited or
              shortened.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/*
              whitespace-pre-wrap keeps the coordinator's own line breaks and
              spacing. React escapes the text, so nothing typed into the reason
              box can render as markup.
            */}
            <blockquote className="whitespace-pre-wrap border-l-2 border-muted-foreground/40 pl-3 text-sm">
              {outcome.reason}
            </blockquote>
            <p className="text-xs text-muted-foreground">
              If you think this should be looked at afresh, contact the programme
              coordinator.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">No reason was recorded</CardTitle>
            <CardDescription>
              The coordinator did not write one with this decision, so there is
              nothing further we can show you here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Contact the programme coordinator to ask why your application was not
              accepted, and whether you can apply in a later round.
            </p>
          </CardContent>
        </Card>
      )}
    </>
  );
}
