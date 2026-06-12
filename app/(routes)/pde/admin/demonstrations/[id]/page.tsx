// =====================================================================
// /pde/admin/demonstrations/[id] — Faculty validator detail + action
// =====================================================================
// Server component — fetches the demonstration row + (if present) the
// rubric stored at `rubric_policy_key` via `fn_get_policy_json`. Hands
// the data to the client `<ValidationForm>` for the actual review action.
// =====================================================================

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PDEValidatorService } from '@/lib/services/pde-validator-service';
import { getSyllabusCLOs, normalizeCloRefs } from '@/lib/services/pde-curriculum-service';
import type { SyllabusCLOResult } from '@/lib/types/pde-curriculum';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ValidationForm } from '../_components/ValidationForm';

export const dynamic = 'force-dynamic';

async function fetchRubric(rubricKey: string | null): Promise<Record<string, any> | null> {
  if (!rubricKey) return null;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('fn_get_policy_json', {
    p_key: rubricKey,
    p_default: {},
    p_scope_id: null,
  });
  if (error) return null;
  if (!data || typeof data !== 'object' || Object.keys(data).length === 0) return null;
  return data as Record<string, any>;
}

export default async function PdeDemonstrationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const demonstration = await PDEValidatorService.getById(id);
  if (!demonstration) {
    notFound();
  }
  const rubric = await fetchRubric(demonstration.rubric_policy_key);

  // Curriculum connector: when the demo links a BoS syllabus, load its CLOs so
  // the validator can confirm/adjust the learner's proposals (spec §4.8).
  const bosSyllabusId = (demonstration as any).bos_syllabus_id as string | null;
  let syllabusResult: SyllabusCLOResult | null = null;
  if (bosSyllabusId) {
    try {
      syllabusResult = await getSyllabusCLOs(bosSyllabusId);
    } catch {
      syllabusResult = null; // fail-soft: validation works without the panel
    }
  }
  const cloProposals = normalizeCloRefs((demonstration as any).clo_refs);
  const existingConfirmedRaw = (demonstration as any).clo_refs_confirmed;
  const existingConfirmed =
    existingConfirmedRaw == null ? null : normalizeCloRefs(existingConfirmedRaw);
  const syllabusLabel = syllabusResult
    ? `${syllabusResult.syllabus.course_code} · ${syllabusResult.syllabus.course_name}`
    : null;

  const evidenceUrl =
    demonstration.evidence && typeof demonstration.evidence === 'object'
      ? (demonstration.evidence as any).url
      : null;

  return (
    <ContentLayout title="Validate Demonstration">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Admin', href: '/vac/admin' },
          { label: 'PDE', href: '/pde/admin/assessments' },
          { label: 'Demonstrations', href: '/pde/admin/demonstrations' },
          { label: id.slice(0, 8) },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold py-1">Validate Demonstration</h1>
            <p className="text-sm text-muted-foreground">
              Review the learner&apos;s evidence and record your validation.
            </p>
          </div>
          <Link
            href="/pde/admin/demonstrations"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Back to inbox
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Demonstration Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-muted-foreground">Learner</div>
                <div className="font-mono text-xs">{demonstration.learner_id}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Status</div>
                <Badge variant="outline">{demonstration.status}</Badge>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Category</div>
                <Badge variant="outline">{demonstration.category_key}</Badge>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Skill</div>
                <div>{demonstration.skill_name || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Evidence type</div>
                <div>{demonstration.evidence_type || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Submitted</div>
                <div>
                  {demonstration.submitted_at
                    ? new Date(demonstration.submitted_at).toLocaleString()
                    : '—'}
                </div>
              </div>
              <div className="md:col-span-2">
                <div className="text-xs text-muted-foreground">Rubric</div>
                <div className="font-mono text-xs">
                  {demonstration.rubric_policy_key || '(no rubric attached)'}
                </div>
              </div>
              {syllabusLabel ? (
                <div className="md:col-span-2">
                  <div className="text-xs text-muted-foreground">Curriculum link (BoS)</div>
                  <div className="text-sm">
                    {syllabusLabel}
                    {cloProposals.length > 0 ? (
                      <span className="text-xs text-muted-foreground ml-2">
                        learner proposed: {cloProposals.map((n) => `CLO ${n}`).join(', ')}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {evidenceUrl ? (
                <div className="md:col-span-2">
                  <div className="text-xs text-muted-foreground">Evidence link</div>
                  <a
                    href={evidenceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline break-all"
                  >
                    {evidenceUrl}
                  </a>
                </div>
              ) : null}
              <div className="md:col-span-2">
                <div className="text-xs text-muted-foreground mb-1">Raw evidence JSON</div>
                <pre className="text-xs bg-muted/30 p-3 rounded overflow-x-auto">
                  {JSON.stringify(demonstration.evidence, null, 2)}
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>

        <ValidationForm
          demonstrationId={demonstration.id}
          status={demonstration.status}
          rubric={rubric}
          rubricKey={demonstration.rubric_policy_key}
          existingRawScore={
            typeof demonstration.raw_score === 'number' ? demonstration.raw_score : null
          }
          syllabusLabel={syllabusLabel}
          syllabusClos={syllabusResult?.clos ?? null}
          cloProposals={cloProposals}
          existingConfirmed={existingConfirmed}
        />
      </div>
    </ContentLayout>
  );
}
