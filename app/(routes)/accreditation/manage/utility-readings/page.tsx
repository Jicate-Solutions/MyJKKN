// app/(routes)/accreditation/manage/utility-readings/page.tsx
// ============================================================================
// Monthly utility meter readings — the entry surface for NAAC Attribute 10.
// One campus, one month, four numbers. Each stream shows the month you are
// entering, the month before it, and the change between them, because the
// assessment rewards a TREND ("progressing towards net zero"), not a snapshot.
//
// Honesty rules baked into the UI:
//   - A stream with no row for the selected month says "Not recorded" — it
//     never carries last month's number forward to look filled.
//   - Clearing a box DELETES the reading rather than storing 0. "We did not
//     read the meter" and "we used nothing" are different facts.
//   - The banner names the last month this campus reported and how many
//     completed months are still missing.
//   - Evidence stays dark until the series is long enough. That is stated on
//     the page so a quiet first month does not read as a broken build.
//
// The yearly green audit runs through the EXISTING audit module — the button
// here creates an audit_cycles row with module_key='sustainability' and hands
// off to /audit/cycles/[id]. Closing it there emits NAAC 10.4. There is no
// second audit engine.
// ============================================================================

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ArrowDownRight, ArrowUpRight, Leaf, Minus, ShieldCheck } from 'lucide-react';
import {
  UtilityReadingsService,
  STREAM_META,
  UTILITY_STREAMS,
  deltaPct,
  defaultMonth,
  monthLabel,
  monthOptions,
  priorMonth,
  type UtilityStream,
} from '@/lib/services/accreditation/utility-readings-service';
import { AuditCycleService } from '@/lib/services/audit/audit-cycle-service';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';

// Module constants — hoisted so no inline array/object literal is ever handed
// to a data hook (an inline literal re-identifies every render and loops the
// fetch forever).
const MONTH_CHOICES = monthOptions();
const BREADCRUMBS = [
  { label: 'Accreditation', href: '/accreditation' },
  { label: 'Manage', href: '/accreditation/manage/metrics' },
  { label: 'Utility Readings' },
];

interface InstitutionOption {
  id: string;
  name: string;
}

async function fetchInstitutions(): Promise<InstitutionOption[]> {
  const supabase = createClientSupabaseClient();
  const { data, error } = await (supabase as any)
    .from('institutions')
    .select('id, name')
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as InstitutionOption[];
}

type Draft = Record<UtilityStream, { value: string; isEstimated: boolean }>;

function emptyDraft(): Draft {
  return UTILITY_STREAMS.reduce((acc, s) => {
    acc[s] = { value: '', isEstimated: false };
    return acc;
  }, {} as Draft);
}

function DeltaChip({ current, prior, unit }: {
  current: number | null;
  prior: number | null;
  unit: string;
}) {
  const pct = deltaPct(current, prior);
  if (pct == null) {
    return (
      <span className="text-xs text-muted-foreground">
        {prior == null ? 'No prior month to compare' : 'Prior month was zero'}
      </span>
    );
  }
  // Falling consumption is the good direction for every stream except solar
  // generation, so the caller decides colour by passing unit-agnostic values;
  // here we only state the direction and leave judgement to the reader.
  const Icon = pct < 0 ? ArrowDownRight : pct > 0 ? ArrowUpRight : Minus;
  const tone = pct < 0 ? 'text-emerald-600' : pct > 0 ? 'text-amber-600' : 'text-muted-foreground';
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${tone}`}>
      <Icon className="h-3.5 w-3.5" />
      {pct > 0 ? '+' : ''}{pct}% vs prior month
      <span className="text-muted-foreground font-normal">
        ({prior} {unit})
      </span>
    </span>
  );
}

function ReadingsSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-9 w-64" />
      {UTILITY_STREAMS.map((s) => (
        <Skeleton key={s} className="h-20 w-full" />
      ))}
    </div>
  );
}

function AccessDenied() {
  return (
    <ContentLayout title="Utility Readings">
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-lg">You do not have access to this page</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Monthly utility readings are restricted to the people who maintain
            accreditation evidence for a campus.
          </p>
          <p>
            To get access, contact your IQAC coordinator and ask for the
            <span className="font-medium text-foreground"> Utility Readings </span>
            permission (<code>accreditation.sustainability_readings.view</code>).
          </p>
        </CardContent>
      </Card>
    </ContentLayout>
  );
}

function UtilityReadingsInner() {
  const router = useRouter();
  const { profile } = useAuth();
  const { isSuperAdmin, canAccess } = usePermissions();
  const qc = useQueryClient();

  const canManage =
    isSuperAdmin || canAccess('accreditation.sustainability_readings', 'manage');

  const [month, setMonth] = useState<string>(defaultMonth());
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [startingAudit, setStartingAudit] = useState(false);

  const { data: pickableInstitutions = [] } = useQuery({
    queryKey: ['utility-readings', 'institutions'],
    queryFn: fetchInstitutions,
    enabled: isSuperAdmin,
  });

  const [pickedInstId, setPickedInstId] = useState<string>('');

  useEffect(() => {
    if (isSuperAdmin && !pickedInstId && pickableInstitutions.length > 0) {
      setPickedInstId(pickableInstitutions[0].id);
    }
  }, [isSuperAdmin, pickedInstId, pickableInstitutions]);

  const institutionId = useMemo(
    () => (isSuperAdmin ? pickedInstId : profile?.institution_id ?? ''),
    [isSuperAdmin, pickedInstId, profile?.institution_id]
  );

  const { data: rows, isLoading, error } = useQuery({
    queryKey: ['utility-readings', institutionId, month],
    queryFn: () => UtilityReadingsService.listForMonthPair(institutionId, month),
    enabled: !!institutionId,
  });

  const { data: reported } = useQuery({
    queryKey: ['utility-readings', 'reported-months', institutionId],
    queryFn: () => UtilityReadingsService.reportedMonths(institutionId),
    enabled: !!institutionId,
  });

  const prior = priorMonth(month);

  const currentByStream = useMemo(() => {
    const m = new Map<UtilityStream, number>();
    (rows ?? []).forEach((r) => {
      if (r.period_month === month) m.set(r.stream, Number(r.reading_value));
    });
    return m;
  }, [rows, month]);

  const priorByStream = useMemo(() => {
    const m = new Map<UtilityStream, number>();
    (rows ?? []).forEach((r) => {
      if (r.period_month === prior) m.set(r.stream, Number(r.reading_value));
    });
    return m;
  }, [rows, prior]);

  // Reload the draft from the server whenever the campus or month changes.
  // Streams with no row stay BLANK — never pre-filled from another month.
  useEffect(() => {
    if (!rows) return;
    const next = emptyDraft();
    let noteSeen = '';
    rows.forEach((r) => {
      if (r.period_month !== month) return;
      next[r.stream] = {
        value: String(Number(r.reading_value)),
        isEstimated: !!r.is_estimated,
      };
      if (r.notes) noteSeen = r.notes;
    });
    setDraft(next);
    setNotes(noteSeen);
  }, [rows, month]);

  const missingMonths = useMemo(() => {
    if (!reported) return null;
    const have = new Set(reported);
    return MONTH_CHOICES.filter((m) => !have.has(m)).length;
  }, [reported]);

  const lastReported = reported && reported.length > 0 ? reported[0] : null;

  const handleSave = async () => {
    if (!institutionId) return;
    const values: Parameters<typeof UtilityReadingsService.saveMonth>[2] = {};
    for (const s of UTILITY_STREAMS) {
      const raw = draft[s].value.trim();
      if (raw === '') {
        values[s] = { value: null, isEstimated: false };
        continue;
      }
      const num = Number(raw);
      if (Number.isNaN(num) || num < 0) {
        toast.error(`${STREAM_META[s].label}: enter a number of 0 or more, or leave it blank.`);
        return;
      }
      values[s] = { value: num, isEstimated: draft[s].isEstimated };
    }

    setSaving(true);
    try {
      await UtilityReadingsService.saveMonth(
        institutionId, month, values, notes.trim() || null
      );
      toast.success(`${monthLabel(month)} saved. Evidence refreshes overnight.`);
      qc.invalidateQueries({ queryKey: ['utility-readings', institutionId] });
      qc.invalidateQueries({ queryKey: ['utility-readings', 'reported-months', institutionId] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleStartGreenAudit = async () => {
    if (!institutionId || !profile?.id) return;
    setStartingAudit(true);
    try {
      const now = new Date();
      const ayStart = now.getMonth() + 1 >= 6 ? now.getFullYear() : now.getFullYear() - 1;
      const cycle = await AuditCycleService.create({
        name: `Green audit ${ayStart}-${String(ayStart + 1).slice(-2)}`,
        description:
          'Yearly green audit — water, waste, energy and net-zero progress. Closing this cycle emits NAAC 10.4 evidence.',
        frameworks: ['NAAC'],
        start_date: `${ayStart}-06-01`,
        end_date: `${ayStart + 1}-05-31`,
        lead_auditor_id: profile.id,
        institution_ids: [institutionId],
        module_key: 'sustainability',
      });
      toast.success('Green audit cycle created — continue in the audit module.');
      router.push(`/audit/cycles/${cycle.id}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setStartingAudit(false);
    }
  };

  return (
    <ContentLayout title="Utility Readings">
      <PageBreadcrumb items={BREADCRUMBS} />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-2xl">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Leaf className="h-5 w-5" /> Monthly Utility Readings
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Four numbers per campus, once a month. Each campus is compared
                against its own earlier months, so the numbers only become
                evidence once there is a series to read a direction from. Until
                then Attribute 10 stays blank rather than showing a zero that
                nobody measured.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              {isSuperAdmin && (
                <div className="w-56">
                  <Label className="text-xs">Campus</Label>
                  <Select
                    value={pickedInstId}
                    onValueChange={setPickedInstId}
                    disabled={pickableInstitutions.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pick a campus…" />
                    </SelectTrigger>
                    <SelectContent>
                      {pickableInstitutions.map((inst) => (
                        <SelectItem key={inst.id} value={inst.id}>
                          {inst.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="w-44">
                <Label className="text-xs">Month</Label>
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTH_CHOICES.map((m) => (
                      <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Coverage banner — names the last reported month plainly. */}
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            {reported == null ? (
              <Skeleton className="h-5 w-72" />
            ) : lastReported == null ? (
              <span>
                <span className="font-medium">Nothing recorded yet for this campus.</span>{' '}
                Start with {monthLabel(month)} — two months is enough to show a direction.
              </span>
            ) : (
              <span>
                Last recorded month:{' '}
                <span className="font-medium">{monthLabel(lastReported)}</span>
                {' · '}
                {reported.length} month{reported.length === 1 ? '' : 's'} on record
                {missingMonths != null && missingMonths > 0 && (
                  <>
                    {' · '}
                    <span className="text-amber-700">
                      {missingMonths} of the last {MONTH_CHOICES.length} completed months missing
                    </span>
                  </>
                )}
              </span>
            )}
          </div>

          {error && (
            <p className="text-sm text-destructive">
              Could not load readings: {(error as Error).message}
            </p>
          )}

          {isLoading || !institutionId ? (
            <ReadingsSkeleton />
          ) : (
            <div className="space-y-3">
              {UTILITY_STREAMS.map((stream) => {
                const meta = STREAM_META[stream];
                const saved = currentByStream.get(stream) ?? null;
                const priorVal = priorByStream.get(stream) ?? null;
                return (
                  <div
                    key={stream}
                    className="grid grid-cols-1 items-start gap-3 rounded-md border p-3 md:grid-cols-[1fr_auto]"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{meta.label}</span>
                        <Badge variant="outline" className="text-xs">{meta.unit}</Badge>
                        {saved == null && (
                          <Badge variant="secondary" className="text-xs">
                            Not recorded for {monthLabel(month)}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{meta.hint}</p>
                      <DeltaChip current={saved} prior={priorVal} unit={meta.unit} />
                    </div>
                    <div className="flex items-end gap-3">
                      <div className="w-40">
                        <Label className="text-xs">{monthLabel(month)}</Label>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          inputMode="decimal"
                          disabled={!canManage}
                          value={draft[stream].value}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              [stream]: { ...d[stream], value: e.target.value },
                            }))
                          }
                          placeholder="Leave blank if unknown"
                        />
                      </div>
                      <label className="flex items-center gap-2 pb-2 text-xs text-muted-foreground">
                        <Checkbox
                          disabled={!canManage}
                          checked={draft[stream].isEstimated}
                          onCheckedChange={(v) =>
                            setDraft((d) => ({
                              ...d,
                              [stream]: { ...d[stream], isEstimated: v === true },
                            }))
                          }
                        />
                        Estimated
                      </label>
                    </div>
                  </div>
                );
              })}

              <div>
                <Label className="text-xs">Note for this month (optional)</Label>
                <Textarea
                  rows={2}
                  disabled={!canManage}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. EB bill reference, or why a figure is estimated"
                />
              </div>

              {canManage ? (
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={handleSave} disabled={saving || !institutionId}>
                    {saving ? 'Saving…' : `Save ${monthLabel(month)}`}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    A box left blank is recorded as “not read”, not as zero.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  You can view these readings but not change them. Ask your IQAC
                  coordinator for the Utility Readings manage permission.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" /> Yearly green audit
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            The green audit runs in the existing audit module, the same one that
            runs academic audits — parameters, findings, sign-off, close. When
            the cycle is closed it emits NAAC 10.4 automatically. Nothing here
            is a separate audit system.
          </p>
          {canManage && (
            <Button
              variant="outline"
              onClick={handleStartGreenAudit}
              disabled={startingAudit || !institutionId || !profile?.id}
            >
              {startingAudit ? 'Creating…' : 'Start this year’s green audit'}
            </Button>
          )}
        </CardContent>
      </Card>
    </ContentLayout>
  );
}

export default function UtilityReadingsPage() {
  return (
    <PermissionGuard
      module="accreditation.sustainability_readings"
      action="view"
      loading={
        <ContentLayout title="Utility Readings">
          <ReadingsSkeleton />
        </ContentLayout>
      }
      fallback={<AccessDenied />}
    >
      <UtilityReadingsInner />
    </PermissionGuard>
  );
}
