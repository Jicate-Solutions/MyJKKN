'use client';

/**
 * Recruitment Need Signal — Drill-Down Detail Page
 *
 * Shows all programs for a given institution with per-input breakdown.
 * Each input row: label, R/A/G badge, value vs. norm, gap, percentage.
 * Actions: snooze, escalate, force-refresh.
 * Side-by-side raw data view (Decision F1.7).
 *
 * Route: /hr/intelligence/recruitment-need/[institutionId]
 */

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  RefreshCw,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronUp,
  Code,
  Ban,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  useRecruitmentSignals,
  useRecruitmentSignal,
  useComputeSignal,
  useSuppressions,
  useCreateEscalation,
} from '@/hooks/hr/recruitment-need/use-recruitment-signal';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { SignalScoreBadge } from '@/components/hr/recruitment-need/signal-score-badge';
import { SignalStatusDot } from '@/components/hr/recruitment-need/signal-status-dot';
import { SnoozeDialog, UnsnoozeButton } from '@/components/hr/recruitment-need/snooze-dialog';
import { EscalationQueue } from '@/components/hr/recruitment-need/escalation-queue';
import {
  SIGNAL_INPUT_KEYS,
  INPUT_KEY_LABELS,
  STATUS_COLORS,
  OVERALL_STATUS_COLORS,
  formatScore,
  formatPercentage,
  formatGap,
  formatDateRelative,
  formatDateShort,
} from '@/components/hr/recruitment-need/signal-helpers';
import type { HRRecruitmentSignalCache, SignalInputKey } from '@/types/hr-recruitment-need';

export default function RecruitmentNeedDetailPage() {
  const params = useParams<{ institutionId: string }>();
  const institutionId = params.institutionId;

  // Queries
  const { data: allSignals, isLoading: signalsLoading } = useRecruitmentSignals({ institution_id: institutionId });
  const { data: institutionSignal, isLoading: instLoading } = useRecruitmentSignal(institutionId);
  const { data: suppressions } = useSuppressions(institutionId);
  const { institutions } = useInstitutionsWithAccess({ entityType: 'all' });
  const computeSignal = useComputeSignal();
  const createEscalation = useCreateEscalation();

  // State
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [escalateReason, setEscalateReason] = useState('');
  const [showRawData, setShowRawData] = useState(false);
  const [expandedPrograms, setExpandedPrograms] = useState<Set<string>>(new Set());

  const institutionName = institutions?.find((i) => i.id === institutionId)?.name
    ?? `Institution ${institutionId.slice(0, 8)}`;

  const isLoading = signalsLoading || instLoading;

  // Institution-level signal (program_id is null)
  const overviewSignal = institutionSignal ?? allSignals?.find((s) => !s.program_id) ?? null;

  // Program-level signals
  const programSignals = allSignals?.filter((s) => s.program_id) ?? [];

  // Active suppression for this institution
  const activeSuppression = suppressions?.find((s) => s.is_active && !s.program_id);

  function handleForceRefresh() {
    computeSignal.mutate({ institution_id: institutionId });
  }

  function handleEscalate() {
    if (!escalateReason.trim()) return;
    createEscalation.mutate(
      { institution_id: institutionId, reason: escalateReason.trim() },
      {
        onSuccess: () => {
          setEscalateOpen(false);
          setEscalateReason('');
        },
      }
    );
  }

  function toggleProgram(programId: string) {
    setExpandedPrograms((prev) => {
      const next = new Set(prev);
      if (next.has(programId)) next.delete(programId);
      else next.add(programId);
      return next;
    });
  }

  return (
    <ContentLayout title={`Recruitment Need — ${institutionName}`}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/hr">HR</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/hr/intelligence?tab=recruitment-need">Intelligence</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{institutionName}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        {/* Institution Overview Card */}
        {isLoading ? (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <Skeleton className="h-16 w-20 rounded-lg" />
                <div className="flex-1">
                  <Skeleton className="h-5 w-48 mb-2" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
              <div className="mt-4 flex gap-1.5">
                {Array.from({ length: 7 }).map((_, i) => (
                  <Skeleton key={i} className="h-3 w-3 rounded-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : overviewSignal ? (
          <Card className={`border-l-4 ${OVERALL_STATUS_COLORS[overviewSignal.overall_status].border}`}>
            <CardContent className="p-6">
              <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                <SignalScoreBadge
                  score={overviewSignal.composite_score}
                  status={overviewSignal.overall_status}
                  size="lg"
                />
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold">{institutionName}</h2>
                  <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                    <Badge
                      variant="outline"
                      className={`text-xs ${OVERALL_STATUS_COLORS[overviewSignal.overall_status].text}`}
                    >
                      {OVERALL_STATUS_COLORS[overviewSignal.overall_status].label}
                    </Badge>
                    <span>Updated {formatDateRelative(overviewSignal.computed_at)}</span>
                  </div>

                  {/* Blocked inputs banner */}
                  {overviewSignal.blocked_inputs && overviewSignal.blocked_inputs.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs bg-gray-100 rounded px-2 py-1.5 mt-2 w-fit">
                      <Ban className="h-3.5 w-3.5 text-gray-600" />
                      <span className="font-medium">BLOCKED</span>
                      <span>— {overviewSignal.blocked_inputs.join(', ')} missing</span>
                    </div>
                  )}

                  {/* Snoozed banner */}
                  {activeSuppression && (
                    <div className="flex items-center gap-2 text-xs bg-blue-50 text-blue-700 rounded px-2 py-1.5 mt-2 w-fit">
                      <Clock className="h-3.5 w-3.5" />
                      <span>
                        Snoozed until {formatDateShort(activeSuppression.suppress_until)}
                      </span>
                      <UnsnoozeButton suppressionId={activeSuppression.id} />
                    </div>
                  )}

                  {/* Per-input dots */}
                  <div className="flex items-center gap-2 mt-3">
                    {SIGNAL_INPUT_KEYS.map((key) => {
                      const inp = overviewSignal.input_signals?.[key];
                      return (
                        <SignalStatusDot
                          key={key}
                          status={inp?.status ?? 'insufficient_data'}
                          inputKey={key}
                          size="md"
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1.5"
                    onClick={handleForceRefresh}
                    disabled={computeSignal.isPending}
                  >
                    <RefreshCw className={`h-3 w-3 ${computeSignal.isPending ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1.5"
                    onClick={() => setSnoozeOpen(true)}
                  >
                    <Clock className="h-3 w-3" />
                    Snooze
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1.5 text-red-600 hover:text-red-700"
                    onClick={() => setEscalateOpen(true)}
                  >
                    <AlertTriangle className="h-3 w-3" />
                    Escalate
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs gap-1.5"
                    onClick={() => setShowRawData(!showRawData)}
                  >
                    {showRawData ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    {showRawData ? 'Hide' : 'Raw'} Data
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No signal data for this institution. Run a force refresh or complete the setup wizard.
            </CardContent>
          </Card>
        )}

        {/* Input Breakdown Table */}
        {overviewSignal && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Input Breakdown</CardTitle>
              <CardDescription className="text-xs">
                Each of the 7 signal inputs with value, norm, gap, and percentage.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left px-3 py-2 font-medium text-xs">Input</th>
                      <th className="text-center px-3 py-2 font-medium text-xs">Status</th>
                      <th className="text-right px-3 py-2 font-medium text-xs">Value</th>
                      <th className="text-right px-3 py-2 font-medium text-xs">Norm</th>
                      <th className="text-right px-3 py-2 font-medium text-xs">Gap</th>
                      <th className="text-right px-3 py-2 font-medium text-xs">% of Norm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SIGNAL_INPUT_KEYS.map((key) => {
                      const inp = overviewSignal.input_signals?.[key];
                      const status = inp?.status ?? 'insufficient_data';
                      const colors = STATUS_COLORS[status];

                      return (
                        <tr key={key} className="border-t">
                          <td className="px-3 py-2.5">
                            <span className="font-medium text-xs">
                              {INPUT_KEY_LABELS[key].label}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 ${colors.text} ${colors.border}`}
                            >
                              {colors.label}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5 text-right text-xs tabular-nums">
                            {inp?.value?.toFixed(1) ?? '--'}
                          </td>
                          <td className="px-3 py-2.5 text-right text-xs tabular-nums">
                            {inp?.norm?.toFixed(1) ?? '--'}
                          </td>
                          <td className="px-3 py-2.5 text-right text-xs tabular-nums">
                            {formatGap(inp?.gap)}
                          </td>
                          <td className="px-3 py-2.5 text-right text-xs tabular-nums">
                            <span className={colors.text}>{formatPercentage(inp?.pct_of_norm)}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Raw Data Side-by-Side (Decision F1.7) */}
        {showRawData && overviewSignal && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Code className="h-4 w-4" />
                Raw Data
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-medium mb-1.5 text-muted-foreground">Input Signals</h4>
                  <pre className="text-[11px] bg-muted/50 rounded-lg p-3 overflow-x-auto max-h-[400px]">
                    {JSON.stringify(overviewSignal.input_signals, null, 2)}
                  </pre>
                </div>
                <div>
                  <h4 className="text-xs font-medium mb-1.5 text-muted-foreground">Raw Data</h4>
                  <pre className="text-[11px] bg-muted/50 rounded-lg p-3 overflow-x-auto max-h-[400px]">
                    {JSON.stringify(overviewSignal.raw_data, null, 2)}
                  </pre>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Program-Level Signals */}
        {programSignals.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Program-Level Signals</CardTitle>
              <CardDescription className="text-xs">
                {programSignals.length} program{programSignals.length !== 1 ? 's' : ''} with signal data
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {programSignals.map((signal) => {
                  const isExpanded = expandedPrograms.has(signal.id);
                  const programLabel = signal.program_id
                    ? `Program ${signal.program_id.slice(0, 8)}`
                    : 'Unknown';

                  return (
                    <div key={signal.id} className="border rounded-lg">
                      {/* Program summary row */}
                      <button
                        className="w-full flex items-center gap-3 p-3 text-left hover:bg-accent/30 transition-colors"
                        onClick={() => toggleProgram(signal.id)}
                      >
                        <SignalScoreBadge
                          score={signal.composite_score}
                          status={signal.overall_status}
                          size="sm"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{programLabel}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            {SIGNAL_INPUT_KEYS.map((key) => (
                              <SignalStatusDot
                                key={key}
                                status={signal.input_signals?.[key]?.status ?? 'insufficient_data'}
                                inputKey={key}
                              />
                            ))}
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${OVERALL_STATUS_COLORS[signal.overall_status].text}`}
                        >
                          {OVERALL_STATUS_COLORS[signal.overall_status].label}
                        </Badge>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="border-t px-3 py-3 overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-muted-foreground">
                                <th className="text-left pb-1.5">Input</th>
                                <th className="text-center pb-1.5">Status</th>
                                <th className="text-right pb-1.5">Value</th>
                                <th className="text-right pb-1.5">Norm</th>
                                <th className="text-right pb-1.5">Gap</th>
                                <th className="text-right pb-1.5">%</th>
                              </tr>
                            </thead>
                            <tbody>
                              {SIGNAL_INPUT_KEYS.map((key) => {
                                const inp = signal.input_signals?.[key];
                                const status = inp?.status ?? 'insufficient_data';
                                const colors = STATUS_COLORS[status];
                                return (
                                  <tr key={key} className="border-t border-dashed">
                                    <td className="py-1.5 font-medium">{INPUT_KEY_LABELS[key].short}</td>
                                    <td className="py-1.5 text-center">
                                      <span className={`inline-block h-2 w-2 rounded-full ${colors.dot}`} />
                                    </td>
                                    <td className="py-1.5 text-right tabular-nums">{inp?.value?.toFixed(1) ?? '--'}</td>
                                    <td className="py-1.5 text-right tabular-nums">{inp?.norm?.toFixed(1) ?? '--'}</td>
                                    <td className="py-1.5 text-right tabular-nums">{formatGap(inp?.gap)}</td>
                                    <td className={`py-1.5 text-right tabular-nums ${colors.text}`}>
                                      {formatPercentage(inp?.pct_of_norm)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Escalation queue for this institution */}
        <EscalationQueue institutionId={institutionId} />
      </div>

      {/* Snooze dialog */}
      <SnoozeDialog
        open={snoozeOpen}
        onOpenChange={setSnoozeOpen}
        institutionId={institutionId}
        institutionName={institutionName}
      />

      {/* Escalate dialog */}
      <Dialog open={escalateOpen} onOpenChange={setEscalateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Escalate Signal
            </DialogTitle>
            <DialogDescription>
              Flag this signal for Director review. Describe the concern clearly.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium">
              Reason <span className="text-red-500">*</span>
            </label>
            <Textarea
              value={escalateReason}
              onChange={(e) => setEscalateReason(e.target.value)}
              placeholder="Describe why this needs escalation..."
              className="mt-1.5"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEscalateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleEscalate}
              disabled={!escalateReason.trim() || createEscalation.isPending}
            >
              {createEscalation.isPending ? 'Escalating...' : 'Escalate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
