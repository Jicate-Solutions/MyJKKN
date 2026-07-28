'use client';

// app/(routes)/meetings/triggers/_components/triggers-console.tsx
//
// PR4 — interactive client for the Auto-Meeting Triggers console.
//   • Rules table: per college, current rate vs editable threshold + on/off +
//     cooldown/weekly-cap, saved via PATCH /api/meetings/triggers/rules.
//   • Missing-attendance table also sets the per-college alert owner, options
//     from GET /api/meetings/triggers/staff-options?institution_id=…
//   • Events list: recent breaches; skip/meet on actionable ones via
//     POST /api/meetings/triggers/decision, then refresh.
//
// Copy honesty: the engine NEVER writes a meeting_bookings row (grep the
// service — 0 hits; the decision route's own comment says "PR1c books it" and
// PR1c was never built). So all blurbs say "escalated … for a review meeting",
// never "a meeting is booked/scheduled". Don't reintroduce the booking wording
// until something actually books.
//
// Hooks-order safety: all hooks declared unconditionally at the top before any
// early return (feedback memory: hooks_order_runtime_crash_passes_ci).

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, Check, X } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import type {
  TriggerRuleWithRate,
  TriggerEventRow
} from '@/lib/services/meetings/meeting-trigger-service';

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  notified: { label: 'Awaiting explanation', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  explained: { label: 'Explained — decide', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  meeting_pending: { label: 'Meeting pending', cls: 'bg-purple-100 text-purple-700 border-purple-200' },
  booked: { label: 'Booked', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  dismissed: { label: 'Skipped', cls: 'bg-neutral-100 text-neutral-600 border-neutral-200' },
  expired: { label: 'Expired', cls: 'bg-neutral-100 text-neutral-600 border-neutral-200' }
};

const DECIDABLE = new Set(['notified', 'explained', 'meeting_pending']);

const ATTENDANCE_METRIC = 'attendance_rate_daily';
const MISSING_DATA_METRIC = 'attendance_missing_data';

/** Friendly labels for the project-accountability metrics (RACI-driven). */
const PROJECT_METRIC: Record<
  string,
  { name: string; fires: string; thresholdLabel: string }
> = {
  task_overdue: {
    name: 'Overdue tasks',
    fires: 'a task is overdue by at least this many days (Accountable explains, else it goes to their reporting head)',
    thresholdLabel: 'days'
  },
  project_at_risk: {
    name: 'At-risk projects',
    fires: 'a project RAG reaches this risk level (amber = 1, red = 2)',
    thresholdLabel: 'level'
  }
};

function ruleDisplayName(r: { metric_key: string; college_name: string }): string {
  return PROJECT_METRIC[r.metric_key]?.name ?? r.college_name;
}

/**
 * The rules the server sends already carry `alert_owner_staff_id` (the service
 * selects it), but the exported `TriggerRuleWithRate` type does not declare it.
 * Widen it here rather than in the shared service file.
 */
type RuleRow = TriggerRuleWithRate & { alert_owner_staff_id?: string | null };

type StaffOption = { value: string; label: string };

/** Shared classes for the native <select> used by the alert-owner picker. */
const SELECT_CLS =
  'h-8 w-full min-w-[10rem] max-w-[16rem] rounded-md border border-input bg-background px-2 text-xs ' +
  'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
  'focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

/** Metric-appropriate detail line for a breach event. */
function eventDetail(ev: {
  metric_key: string;
  observed_value: number | null;
  threshold: number;
}): string {
  if (ev.metric_key === 'task_overdue') {
    return `overdue ${ev.observed_value ?? '—'} days (≥ ${ev.threshold})`;
  }
  if (ev.metric_key === 'project_at_risk') {
    return `risk level ${ev.observed_value ?? '—'} (≥ ${ev.threshold})`;
  }
  if (ev.metric_key === MISSING_DATA_METRIC) {
    return 'no attendance recorded';
  }
  return `${ev.observed_value ?? '—'}% (below ${ev.threshold}%)`;
}

export function TriggersConsole({
  initialRules,
  initialEvents
}: {
  initialRules: TriggerRuleWithRate[];
  initialEvents: TriggerEventRow[];
}) {
  const [rules, setRules] = useState<RuleRow[]>(initialRules);
  const [events, setEvents] = useState<TriggerEventRow[]>(initialEvents);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  // institution_id → staff options, filled lazily the first time a row's picker
  // is focused/hovered. `null` while that institution's fetch is in flight.
  const [staffOptions, setStaffOptions] = useState<
    Record<string, StaffOption[] | null>
  >({});

  const attendanceRules = rules.filter((r) => r.metric_key === ATTENDANCE_METRIC);
  const missingDataRules = rules.filter(
    (r) => r.metric_key === MISSING_DATA_METRIC
  );
  const projectRules = rules.filter(
    (r) =>
      r.metric_key !== ATTENDANCE_METRIC && r.metric_key !== MISSING_DATA_METRIC
  );

  function patchLocal(id: string, patch: Partial<RuleRow>) {
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  /** Load a college's staff list once, on first focus/hover of its picker. */
  const ensureStaffOptions = useCallback(async (institutionId: string | null) => {
    if (!institutionId) return;
    let shouldFetch = false;
    setStaffOptions((prev) => {
      if (institutionId in prev) return prev;
      shouldFetch = true;
      return { ...prev, [institutionId]: null };
    });
    if (!shouldFetch) return;
    try {
      const res = await fetch(
        `/api/meetings/triggers/staff-options?institution_id=${encodeURIComponent(
          institutionId
        )}`,
        { cache: 'no-store' }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Could not load staff');
      setStaffOptions((prev) => ({
        ...prev,
        [institutionId]: Array.isArray(json.options) ? json.options : []
      }));
    } catch (e: any) {
      // Drop the placeholder so a retry (next focus) can fetch again.
      setStaffOptions((prev) => {
        const next = { ...prev };
        delete next[institutionId];
        return next;
      });
      toast.error(e?.message ?? 'Could not load staff');
    }
  }, []);

  async function saveRule(rule: RuleRow) {
    setSavingId(rule.id);
    try {
      const res = await fetch('/api/meetings/triggers/rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: rule.id,
          threshold: Number(rule.threshold),
          active: rule.active,
          cooldown_days: Number(rule.cooldown_days),
          weekly_cap: Number(rule.weekly_cap),
          // Send back exactly what we hold so an untouched owner round-trips
          // unchanged; omit the key entirely when the row never carried one.
          ...(rule.alert_owner_staff_id !== undefined
            ? { alert_owner_staff_id: rule.alert_owner_staff_id }
            : {})
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Save failed');
      toast.success(`${ruleDisplayName(rule)}: saved`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Save failed');
    } finally {
      setSavingId(null);
    }
  }

  async function refreshEvents() {
    try {
      const res = await fetch('/api/meetings/triggers/events?limit=30', {
        cache: 'no-store'
      });
      const json = await res.json();
      if (res.ok && Array.isArray(json.events)) setEvents(json.events);
    } catch {
      /* non-fatal */
    }
  }

  async function decide(ev: TriggerEventRow, decision: 'skip' | 'meet') {
    setDecidingId(ev.id);
    try {
      const res = await fetch('/api/meetings/triggers/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: ev.id, decision })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Decision failed');
      toast.success(
        decision === 'skip'
          ? `${ev.subject_label ?? ev.college_name}: skipped`
          : `${ev.subject_label ?? ev.college_name}: meeting marked`
      );
      await refreshEvents();
    } catch (e: any) {
      toast.error(e?.message ?? 'Decision failed');
    } finally {
      setDecidingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* ---- Rules ---- */}
      <Card className="rounded-2xl border-neutral-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">College thresholds</CardTitle>
          <p className="text-xs text-muted-foreground">
            A rule fires when a college&apos;s daily attendance drops below its
            threshold. The Principal is asked to explain within 24h, and you
            decide below whether to let it go or hold a review meeting. Rules
            stay off until you switch them on. &quot;Now&quot; is the last 7 days
            (latest day in brackets).
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>College</TableHead>
                <TableHead className="text-right">Now (7-day)</TableHead>
                <TableHead className="w-28 text-right">Threshold %</TableHead>
                <TableHead className="w-20 text-right">Cooldown</TableHead>
                <TableHead className="w-20 text-right">Weekly cap</TableHead>
                <TableHead className="w-20 text-center">Active</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {attendanceRules.map((r) => {
                const breaching =
                  r.latest_rate != null && r.latest_rate < r.threshold;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.college_name}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.avg_rate != null ? (
                        <span
                          className={
                            breaching ? 'text-red-600 font-semibold' : ''
                          }
                        >
                          {r.avg_rate}%
                          {r.latest_rate != null && (
                            <span className="text-muted-foreground font-normal">
                              {' '}
                              ({r.latest_rate}%)
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">no data</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={r.threshold}
                        onChange={(e) =>
                          patchLocal(r.id, {
                            threshold: Number(e.target.value)
                          })
                        }
                        className="h-8 w-20 text-right tabular-nums"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        value={r.cooldown_days}
                        onChange={(e) =>
                          patchLocal(r.id, {
                            cooldown_days: Number(e.target.value)
                          })
                        }
                        className="h-8 w-16 text-right tabular-nums"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={1}
                        value={r.weekly_cap}
                        onChange={(e) =>
                          patchLocal(r.id, {
                            weekly_cap: Number(e.target.value)
                          })
                        }
                        className="h-8 w-16 text-right tabular-nums"
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={r.active}
                        onCheckedChange={(v) => patchLocal(r.id, { active: v })}
                        aria-label={`Activate ${r.college_name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => saveRule(r)}
                        disabled={savingId === r.id}
                        aria-label={`Save ${r.college_name}`}
                      >
                        {savingId === r.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ---- Missing-data (data-gap) rules ---- */}
      {missingDataRules.length > 0 && (
        <Card className="rounded-2xl border-neutral-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">
              Missing attendance (data gaps)
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              These flag a college when a working day has{' '}
              <strong>no attendance recorded — or far less than usual</strong>{' '}
              (below the % of that college&apos;s normal day set here) — on a day
              that isn&apos;t a Sunday or an approved holiday. The Principal is
              asked to explain within 24h, otherwise it is escalated to the
              Director for a review meeting. Capped to once a week. Rules stay
              off until you switch them on.
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>College</TableHead>
                  <TableHead className="w-28 text-right">
                    Gap if below %
                  </TableHead>
                  <TableHead className="w-56">Alert owner</TableHead>
                  <TableHead className="w-20 text-right">Cooldown</TableHead>
                  <TableHead className="w-20 text-right">Weekly cap</TableHead>
                  <TableHead className="w-20 text-center">Active</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {missingDataRules.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.college_name}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={r.threshold}
                          onChange={(e) =>
                            patchLocal(r.id, {
                              threshold: Number(e.target.value)
                            })
                          }
                          className="h-8 w-16 text-right tabular-nums"
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const instId = r.institution_id;
                        const loaded = instId ? staffOptions[instId] : undefined;
                        const current = r.alert_owner_staff_id ?? '';
                        const isLoading = instId != null && loaded === null;
                        // Keep the saved owner selectable before the list loads.
                        const showStub =
                          current !== '' &&
                          !(loaded ?? []).some((o) => o.value === current);
                        return (
                          <select
                            className={SELECT_CLS}
                            aria-label={`Alert owner for ${r.college_name}`}
                            value={current}
                            disabled={!instId}
                            onFocus={() => ensureStaffOptions(instId)}
                            onPointerEnter={() => ensureStaffOptions(instId)}
                            onChange={(e) =>
                              patchLocal(r.id, {
                                alert_owner_staff_id: e.target.value || null
                              })
                            }
                          >
                            <option value="">(Principal / default)</option>
                            {showStub && (
                              <option value={current}>
                                {isLoading
                                  ? 'Loading staff…'
                                  : 'Currently assigned'}
                              </option>
                            )}
                            {(loaded ?? []).map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        value={r.cooldown_days}
                        onChange={(e) =>
                          patchLocal(r.id, {
                            cooldown_days: Number(e.target.value)
                          })
                        }
                        className="h-8 w-16 text-right tabular-nums"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={1}
                        value={r.weekly_cap}
                        onChange={(e) =>
                          patchLocal(r.id, {
                            weekly_cap: Number(e.target.value)
                          })
                        }
                        className="h-8 w-16 text-right tabular-nums"
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={r.active}
                        onCheckedChange={(v) => patchLocal(r.id, { active: v })}
                        aria-label={`Activate missing-data for ${r.college_name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => saveRule(r)}
                        disabled={savingId === r.id}
                        aria-label={`Save ${r.college_name}`}
                      >
                        {savingId === r.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-3 text-xs text-muted-foreground">
              <strong>Alert owner</strong>{' '}
              is only used when a college has no Principal on record — the alert
              then goes to that one person instead of to every super-admin.
              Leave it on &quot;(Principal / default)&quot; when the college has
              a Principal. Remember to press Save on the row.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ---- Project accountability rules (RACI-driven) ---- */}
      {projectRules.length > 0 && (
        <Card className="rounded-2xl border-neutral-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Project accountability</CardTitle>
            <p className="text-xs text-muted-foreground">
              These watch every project. On a breach, the task&apos;s Accountable
              person (RACI) is asked to explain within 24h, otherwise it is
              escalated to their reporting head for a review meeting. Rules stay
              off until you switch them on.
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Fires when</TableHead>
                  <TableHead className="w-28 text-right">Threshold</TableHead>
                  <TableHead className="w-20 text-right">Cooldown</TableHead>
                  <TableHead className="w-20 text-right">Weekly cap</TableHead>
                  <TableHead className="w-20 text-center">Active</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {projectRules.map((r) => {
                  const meta = PROJECT_METRIC[r.metric_key];
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {meta?.name ?? r.metric_key}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {meta?.fires ?? '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Input
                            type="number"
                            min={0}
                            value={r.threshold}
                            onChange={(e) =>
                              patchLocal(r.id, { threshold: Number(e.target.value) })
                            }
                            className="h-8 w-16 text-right tabular-nums"
                          />
                          <span className="text-xs text-muted-foreground">
                            {meta?.thresholdLabel ?? ''}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          value={r.cooldown_days}
                          onChange={(e) =>
                            patchLocal(r.id, { cooldown_days: Number(e.target.value) })
                          }
                          className="h-8 w-16 text-right tabular-nums"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={1}
                          value={r.weekly_cap}
                          onChange={(e) =>
                            patchLocal(r.id, { weekly_cap: Number(e.target.value) })
                          }
                          className="h-8 w-16 text-right tabular-nums"
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={r.active}
                          onCheckedChange={(v) => patchLocal(r.id, { active: v })}
                          aria-label={`Activate ${meta?.name ?? r.metric_key}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => saveRule(r)}
                          disabled={savingId === r.id}
                          aria-label={`Save ${meta?.name ?? r.metric_key}`}
                        >
                          {savingId === r.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Save className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ---- Events ---- */}
      <Card className="rounded-2xl border-neutral-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Recent breach events</CardTitle>
          <p className="text-xs text-muted-foreground">
            Each breach and where it stands. For an explained breach, choose
            whether to skip it or still hold a review meeting.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {events.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No breach events yet.
            </p>
          )}
          {events.map((ev) => {
            const badge = STATUS_BADGE[ev.status] ?? {
              label: ev.status,
              cls: 'bg-neutral-100 text-neutral-600 border-neutral-200'
            };
            return (
              <div
                key={ev.id}
                className="rounded-xl border border-neutral-200 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {ev.subject_label ?? ev.college_name}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {ev.breach_date} · {eventDetail(ev)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                    {ev.director_decision && (
                      <Badge variant="outline" className="text-xs">
                        {ev.director_decision === 'skip'
                          ? 'you skipped'
                          : 'you chose meet'}
                      </Badge>
                    )}
                  </div>
                </div>
                {ev.explanation_text && (
                  <p className="mt-2 rounded-lg bg-muted/50 p-2 text-xs italic text-muted-foreground">
                    “{ev.explanation_text}”
                  </p>
                )}
                {DECIDABLE.has(ev.status) && (
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => decide(ev, 'skip')}
                      disabled={decidingId === ev.id}
                    >
                      <X className="mr-1 h-3.5 w-3.5" /> Skip
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => decide(ev, 'meet')}
                      disabled={decidingId === ev.id}
                    >
                      <Check className="mr-1 h-3.5 w-3.5" /> Still meet
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
