'use client';

// AI Career Guidance (BUG-004057) — counsellor tool.
// Pick a learner → AI suggests career paths / skill gaps / next steps from the
// learner's available data. A "Data completeness" panel shows which signals are
// present vs missing (with where-to-add hints) so CDC can fill the gaps and
// sharpen future guidance.

import { useState, useEffect } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useLearnersForPicker } from '@/hooks/cdc/use-cdc-pickers';
import { useGenerateCareerGuidance, useSavedCareerGuidance } from '@/hooks/cdc/use-career-guidance';
import { Sparkles, Loader2, CheckCircle2, CircleDashed, Target, Wrench, ListChecks, Database, Compass, History } from 'lucide-react';
import type { CareerGuidanceResult } from '@/types/cdc/career-guidance';

// Runs on the AI Max lane — enqueue + drain typically finishes in ~35s.
const EXPECTED_SECONDS = 35;

function CareerGuidanceContent() {
  const [learnerId, setLearnerId] = useState('');
  // Freshly generated this session (overrides any saved report).
  const [generated, setGenerated] = useState<CareerGuidanceResult | null>(null);
  const { data: learnerOptions, isLoading: learnersLoading } = useLearnersForPicker();
  const { data: savedReport, isFetching: savedLoading } = useSavedCareerGuidance(learnerId);
  const generate = useGenerateCareerGuidance();

  // New learner picked → drop the previous session's fresh result so the new
  // learner's saved report (if any) surfaces. savedReport refetches on its own
  // (query key carries learnerId).
  useEffect(() => { setGenerated(null); }, [learnerId]);

  // Live elapsed-seconds counter while the Max-lane job runs — gives the
  // counsellor a visible timer against the ~35s expected time instead of an
  // opaque spinner during the server-side long-poll.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!generate.isPending) { setElapsed(0); return; }
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [generate.isPending]);

  async function handleGenerate() {
    if (!learnerId) return;
    const r = await generate.mutateAsync(learnerId);
    setGenerated(r);
  }

  // Derived (single source of truth): fresh generation wins, else the saved one.
  const result = generated ?? savedReport ?? null;
  const isSaved = !generated && !!savedReport;
  const savedAt = isSaved && savedReport ? new Date(savedReport.generatedAt) : null;
  const missingSignals = result?.signals.filter((s) => !s.present) ?? [];

  return (
    <ContentLayout title="AI Career Guidance">
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'CDC', href: '/cdc' },
        { label: 'AI Career Guidance' },
      ]} />

      <div className="max-w-4xl space-y-4 mt-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Compass className="w-6 h-6 text-primary" /> AI Career Guidance
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pick a student to get AI-suggested career paths, skill gaps and next steps from their record.
            The guidance gets sharper as more of their data is recorded.
          </p>
        </div>

        {/* Picker */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Choose a student</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="learner">Student</Label>
              <SearchableSelect
                value={learnerId}
                onValueChange={setLearnerId}
                options={learnerOptions ?? []}
                placeholder="Search by name or register number…"
                searchPlaceholder="Type to search students…"
                emptyMessage="No matching students"
                loading={learnersLoading}
                className="w-full"
              />
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Button onClick={handleGenerate} disabled={!learnerId || generate.isPending}>
                {generate.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                {generate.isPending ? 'Generating…' : result ? 'Regenerate guidance' : 'Generate guidance'}
              </Button>
              {learnerId && savedLoading && !generate.isPending && !generated && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Checking for a saved report…
                </span>
              )}
              {savedAt && !generate.isPending && (
                <Badge variant="outline" className="gap-1 font-normal">
                  <History className="w-3 h-3" /> Saved report from {savedAt.toLocaleDateString()}
                </Badge>
              )}
            </div>
            {generate.isPending && (
              <p className="text-xs text-muted-foreground">
                Reading the student&apos;s record and asking the AI on the Max lane — about {EXPECTED_SECONDS}s.
                {' '}<span className="font-medium tabular-nums">{elapsed}s elapsed{elapsed > EXPECTED_SECONDS ? ' — almost there…' : ''}</span>
              </p>
            )}
            {isSaved && !generate.isPending && (
              <p className="text-xs text-muted-foreground">Showing the last saved report. Click <span className="font-medium">Regenerate guidance</span> to refresh it from the student&apos;s current record.</p>
            )}
          </CardContent>
        </Card>

        {result && (
          <>
            {/* Data completeness — the gap surface */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="w-4 h-4" /> Data completeness
                  <Badge variant={result.completenessPct >= 67 ? 'default' : result.completenessPct >= 34 ? 'secondary' : 'outline'}>
                    {result.completenessPct}% available
                  </Badge>
                </CardTitle>
                <CardDescription>
                  The more of this we record, the more personalised the guidance. Missing items are flagged below.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
                {result.signals.map((s) => (
                  <div key={s.key} className="flex items-start gap-2 text-sm">
                    {s.present
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      : <CircleDashed className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />}
                    <div>
                      <span className={s.present ? 'font-medium' : 'font-medium text-muted-foreground'}>{s.label}</span>
                      <span className="text-muted-foreground"> — {s.detail}</span>
                      {!s.present && s.fillHint && (
                        <span className="block text-xs text-amber-700">→ {s.fillHint}</span>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {missingSignals.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <strong>Guidance is based on partial data.</strong> Recording the {missingSignals.length} missing item
                {missingSignals.length > 1 ? 's' : ''} above (e.g. {missingSignals.slice(0, 3).map((s) => s.label.toLowerCase()).join(', ')})
                will make future guidance for this student materially sharper.
              </div>
            )}

            {/* Guidance */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Guidance for {result.learner.name}
                  {result.learner.program ? ` · ${result.learner.program}` : ''}
                </CardTitle>
                {result.guidance.summary && <CardDescription className="text-foreground/90 pt-1">{result.guidance.summary}</CardDescription>}
              </CardHeader>
              <CardContent className="space-y-5">
                {result.guidance.careerPaths.length > 0 && (
                  <section>
                    <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2"><Target className="w-4 h-4 text-primary" /> Suggested career paths</h3>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {result.guidance.careerPaths.map((c, i) => (
                        <div key={i} className="rounded-md border p-3">
                          <p className="font-medium text-sm">{c.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{c.why}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
                {result.guidance.skillGaps.length > 0 && (
                  <section>
                    <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2"><Wrench className="w-4 h-4 text-primary" /> Skill gaps to close</h3>
                    <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                      {result.guidance.skillGaps.map((g, i) => <li key={i}>{g}</li>)}
                    </ul>
                  </section>
                )}
                {result.guidance.nextSteps.length > 0 && (
                  <section>
                    <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2"><ListChecks className="w-4 h-4 text-primary" /> Next steps</h3>
                    <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                      {result.guidance.nextSteps.map((n, i) => <li key={i}>{n}</li>)}
                    </ul>
                  </section>
                )}
                {result.guidance.dataToImprove.length > 0 && (
                  <section>
                    <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2"><Database className="w-4 h-4 text-amber-600" /> Record this to sharpen future guidance</h3>
                    <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                      {result.guidance.dataToImprove.map((d, i) => <li key={i}>{d}</li>)}
                    </ul>
                  </section>
                )}
                <p className="text-xs text-muted-foreground border-t pt-3">
                  AI-generated from the student&apos;s recorded data · {result.model} · for counsellor reference, not a final decision.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ContentLayout>
  );
}

export default function CareerGuidancePage() {
  return (
    <PermissionGuard module="cdc" action="view">
      <CareerGuidanceContent />
    </PermissionGuard>
  );
}
