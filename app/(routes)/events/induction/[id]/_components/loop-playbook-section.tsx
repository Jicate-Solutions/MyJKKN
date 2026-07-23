'use client';

// Induction self-improving loop — playbook + ADOPTION VERDICT control.
// The verdict (adopted / partial / ignored) is the loop's counterfactual arm:
// naturally-ignored cohorts are the control that lets the year-over-year lift be
// falsified (drift vs the playbook actually working). Without this human signal,
// a positive lift can't be told apart from a better admission year — so marking
// it honestly is what eventually lets the loop EARN trust. Manager-gated.
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  InductionService, type InductionLoopPlaybook,
} from '@/lib/services/induction/induction-service';
import { usePermissions } from '@/hooks/use-permissions';
import { Lightbulb, CheckCircle2, CircleDashed, XCircle } from 'lucide-react';

type Verdict = 'adopted' | 'partial' | 'ignored';

const VERDICT_META: Record<Verdict, { label: string; icon: typeof CheckCircle2; cls: string }> = {
  adopted: { label: 'Adopted', icon: CheckCircle2, cls: 'text-emerald-600' },
  partial: { label: 'Partial', icon: CircleDashed, cls: 'text-amber-600' },
  ignored: { label: 'Ignored', icon: XCircle, cls: 'text-rose-600' },
};

export function LoopPlaybookSection({
  institutionId,
  academicYearId,
}: {
  institutionId: string | null;
  academicYearId: string | null;
}) {
  const [playbook, setPlaybook] = useState<InductionLoopPlaybook | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Verdict | null>(null);
  const { can } = usePermissions();
  const canManage = can('induction.manage');

  const load = useCallback(async () => {
    if (!institutionId || !academicYearId) { setLoading(false); return; }
    setLoading(true);
    try {
      setPlaybook(await InductionService.getLoopPlaybook(institutionId, academicYearId));
    } catch (e: any) {
      toast.error(`Couldn't load the loop playbook: ${e.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }, [institutionId, academicYearId]);

  useEffect(() => { load(); }, [load]);

  const setVerdict = async (verdict: Verdict) => {
    if (!institutionId || !academicYearId) return;
    setSaving(verdict);
    try {
      await InductionService.setPlaybookVerdict(institutionId, academicYearId, verdict);
      toast.success(`Recorded: playbook ${VERDICT_META[verdict].label.toLowerCase()}.`);
      await load();
    } catch (e: any) {
      toast.error(`Couldn't save the verdict: ${e.message ?? e}`);
    } finally {
      setSaving(null);
    }
  };

  // No cohort key (e.g. induction with no academic year) → nothing to mark.
  if (!institutionId || !academicYearId) return null;

  const summary =
    playbook?.suggestion && typeof playbook.suggestion === 'object'
      ? String((playbook.suggestion as Record<string, unknown>).summary ?? '')
      : '';
  const current = (playbook?.human_verdict ?? null) as Verdict | null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-500" />
          <CardTitle className="text-base">Loop playbook</CardTitle>
        </div>
        <CardDescription>
          The self-improving loop&apos;s value-first playbook for this cohort. Marking whether you{' '}
          <span className="font-medium text-foreground">adopted</span> it is what lets the loop tell a
          real improvement apart from a better admission year.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <Skeleton className="h-20 w-full" />
        ) : !playbook ? (
          <p className="text-sm text-muted-foreground">
            No loop playbook yet — one is generated automatically before each cohort, drawing on the
            previous cohort&apos;s measured outcome.
          </p>
        ) : (
          <>
            {summary && <p className="text-sm">{summary}</p>}

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Adoption:</span>
              {current ? (
                <Badge variant="outline" className={VERDICT_META[current].cls}>
                  {VERDICT_META[current].label}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">Not yet recorded</Badge>
              )}
            </div>

            {canManage ? (
              <div className="flex flex-wrap gap-2">
                {(Object.keys(VERDICT_META) as Verdict[]).map((v) => {
                  const Icon = VERDICT_META[v].icon;
                  return (
                    <Button
                      key={v}
                      size="sm"
                      variant={current === v ? 'default' : 'outline'}
                      disabled={saving !== null}
                      onClick={() => setVerdict(v)}
                    >
                      <Icon className="h-3.5 w-3.5 mr-1" />
                      {saving === v ? 'Saving…' : VERDICT_META[v].label}
                    </Button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Only induction managers can record the adoption verdict.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
