// ============================================================================
// /hr/admin/disciplinary/[id] — Disciplinary case detail
// ============================================================================
// T6.2 spec — HR Admin lands here to:
//   * see case header (stage, status, outcome, alleged misconduct)
//   * see event timeline (initiated, enquiry, hearing, decision, notes)
//   * see witness statements
//   * see linked evidence memos (cross-ref to /hr/admin/memos/[memo_id])
//   * advance the stage (initiated → enquiry → hearing → decision)
//   * add notes + witnesses
//   * at decision stage: record outcome (warning|suspension|termination|exonerated).
//     termination triggers an additive write to hr_offboarding_cases.
// ============================================================================

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  HRDisciplinaryService,
  type DisciplinaryStage,
} from '@/lib/services/hr/disciplinary-service';
import { Badge } from '@/components/ui/badge';
import {
  AdvanceStageButton,
  AddNoteForm,
  AddWitnessForm,
  DecisionForm,
} from '../_components/case-actions';

const STAGE_LABEL: Record<DisciplinaryStage, string> = {
  initiated: 'Initiated',
  enquiry: 'Enquiry',
  hearing: 'Hearing',
  decision: 'Decision',
  closed: 'Closed',
};

const STAGE_VARIANT: Record<
  DisciplinaryStage,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  initiated: 'destructive',
  enquiry: 'outline',
  hearing: 'outline',
  decision: 'secondary',
  closed: 'default',
};

const EVENT_LABEL: Record<string, string> = {
  initiated: 'Case initiated',
  enquiry_started: 'Enquiry started',
  enquiry_finding: 'Enquiry finding',
  hearing_scheduled: 'Hearing scheduled',
  hearing_held: 'Hearing held',
  decision: 'Decision recorded',
  note: 'Note',
  stage_change: 'Stage change',
  evidence_added: 'Evidence added',
};

const OUTCOME_LABEL: Record<string, string> = {
  warning: 'Warning (formal)',
  suspension: 'Suspension',
  termination: 'Termination',
  exonerated: 'Exonerated',
};

export default async function DisciplinaryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="Disciplinary case">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            Restricted to HR Admin / super administrators.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="Disciplinary case detail">
        {/* @ts-expect-error Async Server Component */}
        <DetailBody id={id} />
      </ContentLayout>
    </SuperAdminOnly>
  );
}

async function DetailBody({ id }: { id: string }) {
  const supabase = await createServerSupabaseClient();
  const service = new HRDisciplinaryService(supabase);

  const discCase = await service.getCase(id);
  if (!discCase) notFound();

  const [events, witnesses, evidenceMemos, staffRow] = await Promise.all([
    service.listEvents(id).catch(() => []),
    service.listWitnesses(id).catch(() => []),
    service.listEvidenceMemos(id).catch(() => []),
    supabase
      .from('staff')
      .select('id, first_name, last_name, email')
      .eq('id', discCase.staff_id)
      .maybeSingle()
      .then((r) => r.data),
  ]);

  const staffName =
    `${staffRow?.first_name ?? ''} ${staffRow?.last_name ?? ''}`.trim() ||
    (staffRow?.email as string) ||
    'Unknown';

  const isClosed = discCase.status === 'closed';
  const atDecision = discCase.current_stage === 'decision';

  return (
    <div className="space-y-6">
      <Link
        href="/hr/admin/disciplinary"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Back to disciplinary cases
      </Link>

      {/* Header */}
      <div className="rounded-md border border-border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Case
            </div>
            <div className="mt-1 font-mono text-sm">{discCase.case_number}</div>
            <div className="mt-2 text-xl font-semibold">{staffName}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Initiated {new Date(discCase.initiated_at).toLocaleString()}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant={STAGE_VARIANT[discCase.current_stage]}>
              Stage: {STAGE_LABEL[discCase.current_stage]}
            </Badge>
            <span className="text-xs capitalize text-muted-foreground">
              {discCase.status}
            </span>
            {discCase.outcome && (
              <span
                className={
                  discCase.outcome === 'termination'
                    ? 'text-sm font-medium text-red-700 dark:text-red-400'
                    : discCase.outcome === 'exonerated'
                      ? 'text-sm font-medium text-green-700 dark:text-green-400'
                      : 'text-sm font-medium'
                }
              >
                Outcome: {OUTCOME_LABEL[discCase.outcome] ?? discCase.outcome}
              </span>
            )}
          </div>
        </div>

        <div className="mt-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Alleged misconduct
          </div>
          <div className="mt-1 text-sm whitespace-pre-wrap">
            {discCase.alleged_misconduct}
          </div>
        </div>

        {discCase.outcome === 'suspension' && (
          <div className="mt-4 rounded-md border border-amber-500/40 bg-amber-50 p-3 text-xs dark:bg-amber-950/30">
            Suspension period:{' '}
            <strong>
              {discCase.suspension_start_date ?? '—'} to{' '}
              {discCase.suspension_end_date ?? '—'}
            </strong>
          </div>
        )}

        {discCase.outcome_note && (
          <div className="mt-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Decision rationale
            </div>
            <div className="mt-1 text-sm whitespace-pre-wrap">
              {discCase.outcome_note}
            </div>
          </div>
        )}
      </div>

      {/* Stage actions */}
      {!isClosed && (
        <div className="rounded-md border border-border p-4">
          <div className="mb-3 text-sm font-medium">Stage actions</div>
          {atDecision ? (
            <DecisionForm caseId={discCase.id} />
          ) : (
            <div className="flex flex-col items-start gap-3">
              <AdvanceStageButton
                caseId={discCase.id}
                currentStage={discCase.current_stage}
              />
            </div>
          )}
        </div>
      )}

      {/* Two-column: timeline + witnesses */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Timeline */}
        <div className="lg:col-span-2 space-y-3">
          <div className="text-sm font-medium">Event timeline</div>
          <div className="space-y-2">
            {events.length === 0 && (
              <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
                No events recorded yet.
              </div>
            )}
            {events.map((ev) => (
              <div
                key={ev.id}
                className="rounded-md border border-border p-3"
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {EVENT_LABEL[ev.event_type] ?? ev.event_type}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(ev.occurred_at).toLocaleString()}
                  </div>
                </div>
                <div className="mt-1 text-sm whitespace-pre-wrap">
                  {ev.description}
                </div>
              </div>
            ))}
          </div>

          {!isClosed && (
            <div className="mt-4 rounded-md border border-border p-3">
              <AddNoteForm caseId={discCase.id} />
            </div>
          )}
        </div>

        {/* Right column: witnesses + evidence memos */}
        <div className="space-y-6">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-medium">Witnesses</div>
              {!isClosed && <AddWitnessForm caseId={discCase.id} />}
            </div>
            <div className="space-y-2">
              {witnesses.length === 0 && (
                <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
                  No witness statements recorded.
                </div>
              )}
              {witnesses.map((w) => (
                <div
                  key={w.id}
                  className="rounded-md border border-border p-3 text-sm"
                >
                  <div className="font-medium">{w.witness_name}</div>
                  {w.witness_role && (
                    <div className="text-xs text-muted-foreground">
                      {w.witness_role}
                    </div>
                  )}
                  <div className="mt-2 whitespace-pre-wrap text-sm">
                    {w.witness_statement}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {new Date(w.recorded_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium">Linked memos (evidence)</div>
            <div className="space-y-2">
              {evidenceMemos.length === 0 && (
                <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
                  No memos linked as evidence.
                </div>
              )}
              {evidenceMemos.map((m) => (
                <Link
                  key={m.id}
                  href={`/hr/admin/memos/${m.id}`}
                  className="block rounded-md border border-border p-3 text-sm hover:border-primary/50"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      {m.memo_type}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(m.issued_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="mt-1 line-clamp-2 text-sm">{m.reason}</div>
                  <div className="mt-1 text-xs capitalize text-muted-foreground">
                    Status: {m.status}
                  </div>
                </Link>
              ))}
            </div>
            {!isClosed && (
              <div className="mt-2 text-xs text-muted-foreground">
                Linking memos at initiation only — re-initiate or use the API
                to add more.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
