import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';

/**
 * Learner clinical-case list.
 *
 * Previously this route was a redirect stub — published cases were reachable
 * only by pasting a case UUID, so nobody could find them (CARRE 35/100: the
 * plumbing worked, the experience layer did not). This is the browse surface:
 * every published clinical case the learner is enrolled for, with their attempt
 * status and a start/continue/review action.
 *
 * Access model (unchanged): the fetch relies on the pde_assess_read RLS policy,
 * which returns a published clinical case only to a learner enrolled in its
 * course. No answer-key table is touched here.
 */

export const dynamic = 'force-dynamic';

interface CaseRow {
  id: string;
  title: string;
  description: string | null;
}

interface SubmissionRow {
  assessment_id: string;
  completed_at: string | null;
  final_score: number | null;
  auto_score: number | null;
}

const BRAND_GREEN = '#0b6d41';

export default async function LearnClinicalCasesList() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/auth/login?next=/pde/learn/cases');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  // Published clinical cases the learner may attempt. RLS (pde_assess_read)
  // already scopes this to published + enrolled, so no explicit course filter
  // is needed and cross-course leakage is impossible.
  const { data: caseRows } = await sb
    .from('pde_assessments')
    .select('id, title, description')
    .eq('assessment_type', 'clinical_case')
    .eq('status', 'published')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  const cases: CaseRow[] = caseRows ?? [];

  // The learner's own submissions (RLS: pde_sub_own_read) → per-case status.
  const { data: subRows } = await sb
    .from('pde_submissions')
    .select('assessment_id, completed_at, final_score, auto_score')
    .eq('learner_id', user.id);

  const submissions: SubmissionRow[] = subRows ?? [];
  const statusByCase = new Map<
    string,
    { attempts: number; completed: number; bestScore: number | null }
  >();
  for (const s of submissions) {
    const cur = statusByCase.get(s.assessment_id) ?? {
      attempts: 0,
      completed: 0,
      bestScore: null,
    };
    cur.attempts += 1;
    if (s.completed_at) cur.completed += 1;
    const score = s.final_score ?? s.auto_score ?? null;
    if (score !== null) {
      cur.bestScore = cur.bestScore === null ? score : Math.max(cur.bestScore, score);
    }
    statusByCase.set(s.assessment_id, cur);
  }

  return (
    <ContentLayout>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learn', href: '/learn/quests' },
          { label: 'Clinical Cases' },
        ]}
      />

      <div className="mx-auto mt-4 max-w-4xl px-4 sm:px-6">
        <header className="rounded-lg border bg-card p-5 sm:p-6">
          <h1 className="text-xl font-semibold sm:text-2xl">Clinical Cases</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Work through real, de-identified clinical scenarios. Reason step by step —
            you get coaching as you go, and the model answers unlock after you finish.
          </p>
        </header>

        {cases.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed bg-card p-8 text-center">
            <h2 className="text-base font-semibold">No cases published yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              There are no clinical cases available for your course right now. Check back
              after your Senior Learners publish one.
            </p>
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {cases.map((c) => {
              const st = statusByCase.get(c.id);
              const attempts = st?.attempts ?? 0;
              const bestScore = st?.bestScore ?? null;
              const hasCompleted = (st?.completed ?? 0) > 0;

              let actionLabel = 'Start case';
              if (attempts > 0) actionLabel = hasCompleted ? 'Attempt again' : 'Continue';

              return (
                <li key={c.id}>
                  <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-foreground/20 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold leading-snug">{c.title}</h2>
                      {c.description ? (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {c.description}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        {attempts === 0 ? (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                            Not started
                          </span>
                        ) : (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                            {attempts} attempt{attempts === 1 ? '' : 's'}
                          </span>
                        )}
                        {bestScore !== null ? (
                          <span
                            className="rounded-full px-2 py-0.5 font-medium text-white"
                            style={{ backgroundColor: BRAND_GREEN }}
                          >
                            Best {Math.round(bestScore)}%
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="shrink-0">
                      <Link
                        href={`/pde/learn/cases/${c.id}`}
                        className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                        style={{ backgroundColor: BRAND_GREEN }}
                      >
                        {actionLabel}
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </ContentLayout>
  );
}
