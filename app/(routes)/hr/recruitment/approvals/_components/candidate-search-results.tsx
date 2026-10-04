'use client';

/**
 * Cross-job people search for the "All pending" approvals view.
 *
 * The job-first list answers "which job needs attention". It could not answer
 * "where is this person", because the page's search only matched job title /
 * code / institution — finding one applicant meant opening every job workspace
 * in turn. This panel searches PEOPLE across every job the viewer can see and
 * links each hit straight to the job they applied under.
 *
 * Two record types have to be searched, because an applicant changes table on
 * promotion (see stage-model.ts):
 *   hr_job_applications        — screening rows      (first_name/last_name/email)
 *   hr_recruitment_candidates  — promoted candidacies (name/email/role_title)
 * Both endpoints already accept a job-less `search`, so no API change is needed.
 * A promoted person matches BOTH, so rows are deduped on the candidate id and
 * the candidacy wins — it carries the live approval step.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import {
  AlertCircle, AlertTriangle, ArrowUpRight, Briefcase, Mail, Phone, SearchX,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useDebounceValue } from '@/hooks/use-debounce-value';
import { useCandidates, useJobApplications } from '@/hooks/hr/use-recruitment';
import type { HRRecruitmentCandidate } from '@/types/hr-recruitment';
import {
  applicationStage,
  candidateStage,
  stageMeta,
  type StageKey,
} from '../[jobId]/_components/stage-model';

/** Below this, a search is too broad to be worth a round-trip per keystroke. */
const MIN_QUERY_LENGTH = 2;
const MAX_ROWS = 25;

interface PersonRow {
  key: string;
  name: string;
  email: string;
  phone: string | null;
  stage: StageKey;
  jobId: string | null;
  /** The person's own page — candidate detail once promoted, else the application. */
  profileHref: string;
  submittedAt: string;
  isEmergency: boolean;
  /** "Step 2 of 4 · principal" while a candidacy is in flight, else null. */
  stepLabel: string | null;
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';

/** A candidacy's job link lives in role_specific_details, not a column. */
function candidateJobId(c: HRRecruitmentCandidate): string | null {
  const jobId = (c.role_specific_details as Record<string, unknown> | null)?.job_id;
  return typeof jobId === 'string' && jobId ? jobId : null;
}

function stepLabelFor(c: HRRecruitmentCandidate): string | null {
  if (c.status !== 'submitted' && c.status !== 'pending_approval') return null;
  const chain = c.approval_chain ?? [];
  if (chain.length === 0) return null;
  const step = chain[c.current_step];
  return `Step ${c.current_step + 1} of ${chain.length} · ${step?.approver_role ?? '—'}`;
}

export function CandidateSearchResults({
  search, jobTitleById,
}: {
  search: string;
  jobTitleById: Map<string, string>;
}) {
  // Debounced so a five-letter name is one pair of requests, not five.
  const q = useDebounceValue(search.trim(), 300);
  const enabled = q.length >= MIN_QUERY_LENGTH;

  const {
    data: appsData, isLoading: appsLoading, error: appsError,
  } = useJobApplications({ search: q, pageSize: 50 }, { enabled });
  const {
    data: candData, isLoading: candLoading, error: candError,
  } = useCandidates({ search: q, pageSize: 50 }, { enabled });

  const isLoading = enabled && (appsLoading || candLoading);
  const error = appsError ?? candError;

  const rows = useMemo<PersonRow[]>(() => {
    if (!enabled) return [];
    const apps = appsData?.data ?? [];
    const cands = candData?.data ?? [];

    // Candidacies first — a promoted person's live step beats the stale
    // screening row, and claiming the id here dedupes the application below.
    const claimed = new Set<string>();
    const merged: PersonRow[] = cands.map((c) => {
      claimed.add(c.id);
      return {
        key: `cand-${c.id}`,
        name: c.name,
        email: c.email,
        phone: c.phone ?? null,
        stage: candidateStage(c.status),
        jobId: candidateJobId(c),
        profileHref: `/hr/recruitment/candidates/${c.id}`,
        submittedAt: c.submitted_at,
        isEmergency: !!c.is_emergency,
        stepLabel: stepLabelFor(c),
      };
    });

    for (const a of apps) {
      if (a.promoted_candidate_id && claimed.has(a.promoted_candidate_id)) continue;
      merged.push({
        key: `app-${a.id}`,
        name: `${a.first_name} ${a.last_name}`.trim(),
        email: a.email,
        phone: a.phone,
        stage: applicationStage(a.status),
        jobId: a.job_id,
        profileHref: a.promoted_candidate_id
          ? `/hr/recruitment/candidates/${a.promoted_candidate_id}`
          : `/hr/recruitment/applications/${a.id}`,
        submittedAt: a.submitted_at,
        isEmergency: false,
        stepLabel: null,
      });
    }

    return merged
      .sort((x, y) => new Date(y.submittedAt).getTime() - new Date(x.submittedAt).getTime())
      .slice(0, MAX_ROWS);
  }, [enabled, appsData, candData]);

  if (!enabled) return null;

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{(error as Error).message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        People matching &ldquo;{q}&rdquo;
        {!isLoading && (
          <span className="ml-1 tabular-nums font-semibold text-foreground">{rows.length}</span>
        )}
      </p>

      {isLoading && (
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            {[1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 p-4">
                <div className="h-9 w-9 rounded-full bg-muted/60 animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-44 rounded bg-muted/60 animate-pulse" />
                  <div className="h-3 w-64 rounded bg-muted/40 animate-pulse" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!isLoading && rows.length === 0 && (
        <Card>
          <CardContent className="py-6 flex flex-col items-center gap-1.5 text-center">
            <SearchX className="h-6 w-6 text-muted-foreground/60" />
            <p className="text-sm font-medium">No candidate matches &ldquo;{q}&rdquo;</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Searches applicant names and email addresses across every job you can see.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && rows.length > 0 && (
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            {rows.map((row) => (
              <PersonResultRow
                key={row.key}
                row={row}
                jobTitle={row.jobId ? jobTitleById.get(row.jobId) : undefined}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {!isLoading && rows.length === MAX_ROWS && (
        <p className="text-xs text-muted-foreground">
          Showing the {MAX_ROWS} most recent matches — narrow the search to see the rest.
        </p>
      )}
    </div>
  );
}

function PersonResultRow({ row, jobTitle }: { row: PersonRow; jobTitle?: string }) {
  const meta = stageMeta(row.stage);

  return (
    <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
          {initials(row.name)}
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={row.profileHref}
              className="text-sm font-semibold text-foreground hover:text-primary hover:underline"
            >
              {row.name}
            </Link>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${meta.badge}`}>
              {meta.label}
            </Badge>
            {row.isEmergency && (
              <Badge variant="outline" className="border-red-500 text-red-700 dark:text-red-300 text-[10px] px-1.5 py-0 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Urgent
              </Badge>
            )}
          </div>

          {/* The answer to "which job posting is this person under".
              The title comes from the overview, which is capped at 200 jobs and
              RLS-bounded — so it can legitimately miss. When it does, say
              nothing about the job rather than guess why; "Open in job" below
              still works, because the row carries the id either way. */}
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {jobTitle ? (
              <span className="inline-flex items-center gap-1 min-w-0">
                <Briefcase className="h-3 w-3 shrink-0" />
                <span className="truncate font-medium text-foreground">{jobTitle}</span>
              </span>
            ) : !row.jobId ? (
              <span className="inline-flex items-center gap-1">
                <Briefcase className="h-3 w-3" />
                Not linked to a job
              </span>
            ) : null}
            <span title={new Date(row.submittedAt).toLocaleString()}>
              Applied {fmtDate(row.submittedAt)}
            </span>
          </p>

          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 min-w-0">
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">{row.email}</span>
            </span>
            {row.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {row.phone}
              </span>
            )}
          </p>

          {row.stepLabel && (
            <p className="text-xs">
              <span className="inline-flex items-center rounded border border-blue-500/40 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:border-blue-500/40 dark:bg-blue-900/20 dark:text-blue-300">
                {row.stepLabel}
              </span>
            </p>
          )}
        </div>
      </div>

      {/* Lands on the job workspace with this person already filtered in */}
      {row.jobId && (
        <Link
          href={`/hr/recruitment/approvals/${row.jobId}?q=${encodeURIComponent(row.name)}`}
          className="inline-flex shrink-0 items-center justify-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted/60"
        >
          Open in job
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}
