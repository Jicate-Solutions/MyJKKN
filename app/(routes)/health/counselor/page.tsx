'use client';

/**
 * health/counselor/page.tsx
 * JKKN Health — Counselor Dashboard (Mental Health Triage)
 *
 * RESTRICTED: health_counselor / health_supervisor roles only.
 * Super admins are also permitted.
 *
 * Sections:
 *  1. Stats bar — Open, Contacted, Resolved today, Total active (15s auto-refresh)
 *  2. Active alerts list — escalated students with severity, actions, status updates
 *  3. Resolved history — collapsible, recently resolved escalations
 *
 * Live operations view — counselors leave it open on their desk.
 * Auto-refreshes every 15 seconds via useActiveEscalations + useCounselorStats.
 */

import { useState, useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle,
  Phone,
  Clock,
  CheckCircle,
  XCircle,
  MessageSquare,
  Shield,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Users,
  Activity,
  CalendarCheck,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useActiveEscalations,
  useAllEscalations,
  useUpdateEscalation,
  useCounselorStats,
} from '@/hooks/health/use-health-assessments';
import type {
  HealthEscalation,
  EscalationStatus,
} from '@/types/health-mental';
import { ESCALATION_STATUS_CONFIG } from '@/types/health-mental';

// ============================================================================
// Permission constants — health roles that can access this page
// ============================================================================

const ALLOWED_ROLES = ['health_counselor', 'health_supervisor', 'super_admin'] as const;

// ============================================================================
// Time helpers
// ============================================================================

function timeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

// ============================================================================
// Severity helpers — derives HIGH / MEDIUM from escalation_level
// ============================================================================

type SeverityLevel = 'HIGH' | 'MEDIUM';

function getSeverity(escalation: HealthEscalation): SeverityLevel {
  // escalation_level >= 2 or trigger_score >= 20 = HIGH
  if (escalation.escalation_level >= 2) return 'HIGH';
  if (escalation.trigger_score !== null && escalation.trigger_score >= 20) return 'HIGH';
  return 'MEDIUM';
}

function SeverityPill({ level }: { level: SeverityLevel }) {
  if (level === 'HIGH') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 border border-red-200 px-2 py-0.5 text-xs font-semibold text-red-700">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
        HIGH
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-700">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
      MEDIUM
    </span>
  );
}

// ============================================================================
// Status badge
// ============================================================================

function StatusBadge({ status }: { status: EscalationStatus }) {
  const config = ESCALATION_STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${config.color}`}
    >
      {status === 'open' && <AlertTriangle className="h-3 w-3" />}
      {status === 'contacted' && <Phone className="h-3 w-3" />}
      {status === 'in_session' && <MessageSquare className="h-3 w-3" />}
      {status === 'resolved' && <CheckCircle className="h-3 w-3" />}
      {status === 'false_positive' && <XCircle className="h-3 w-3" />}
      {config.label}
    </span>
  );
}

// ============================================================================
// Card border color per status
// ============================================================================

function cardBorderClass(status: EscalationStatus): string {
  switch (status) {
    case 'open':
      return 'border-l-4 border-l-red-500 border-t border-r border-b border-red-100';
    case 'contacted':
      return 'border-l-4 border-l-amber-400 border-t border-r border-b border-amber-100';
    case 'in_session':
      return 'border-l-4 border-l-blue-500 border-t border-r border-b border-blue-100';
    case 'resolved':
      return 'border-l-4 border-l-emerald-500 border-t border-r border-b border-emerald-100';
    default:
      return 'border-l-4 border-l-slate-300 border-t border-r border-b border-slate-100';
  }
}

// ============================================================================
// Assessment type label
// ============================================================================

function assessmentLabel(triggerType: HealthEscalation['trigger_type']): string {
  switch (triggerType) {
    case 'phq9_high': return 'PHQ-9 (Depression)';
    case 'gad7_high': return 'GAD-7 (Anxiety)';
    case 'mood_pattern': return 'Mood Pattern';
    case 'manual': return 'Manual Referral';
    default: return triggerType;
  }
}

// ============================================================================
// Status Update Dialog
// ============================================================================

const STATUS_OPTIONS: { value: EscalationStatus; label: string; description: string }[] = [
  { value: 'contacted', label: 'Contacted', description: 'Reached out to the student' },
  { value: 'in_session', label: 'In Session', description: 'Currently in a counseling session' },
  { value: 'resolved', label: 'Resolved', description: 'Issue addressed and closed' },
  { value: 'false_positive', label: 'False Positive', description: 'Alert was not clinically significant' },
];

interface StatusUpdateDialogProps {
  escalation: HealthEscalation | null;
  open: boolean;
  onClose: () => void;
}

function StatusUpdateDialog({ escalation, open, onClose }: StatusUpdateDialogProps) {
  const [selectedStatus, setSelectedStatus] = useState<EscalationStatus>('contacted');
  const [notes, setNotes] = useState('');

  const updateMutation = useUpdateEscalation();

  function handleSubmit() {
    if (!escalation) return;
    updateMutation.mutate(
      { id: escalation.id, status: selectedStatus, notes: notes.trim() || undefined },
      {
        onSuccess: () => {
          setNotes('');
          setSelectedStatus('contacted');
          onClose();
        },
      }
    );
  }

  // Reset form when dialog opens for a new escalation
  if (!escalation) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-800">
            <MessageSquare className="h-4 w-4 text-slate-500" />
            Update Status
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1 pb-1">
          <p className="text-sm font-medium text-slate-700">
            {escalation.learner_name ?? 'Student'}
          </p>
          <p className="text-xs text-slate-400">
            {assessmentLabel(escalation.trigger_type)}
            {escalation.trigger_score !== null && ` — Score ${escalation.trigger_score}`}
          </p>
        </div>

        <Separator />

        <div className="space-y-3 pt-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            New Status
          </p>
          <RadioGroup
            value={selectedStatus}
            onValueChange={(v) => setSelectedStatus(v as EscalationStatus)}
            className="space-y-2"
          >
            {STATUS_OPTIONS.map((opt) => (
              <div
                key={opt.value}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors cursor-pointer ${
                  selectedStatus === opt.value
                    ? 'border-slate-400 bg-slate-50'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                }`}
                onClick={() => setSelectedStatus(opt.value)}
              >
                <RadioGroupItem value={opt.value} id={`status-${opt.value}`} className="mt-0.5 shrink-0" />
                <div>
                  <Label
                    htmlFor={`status-${opt.value}`}
                    className="text-sm font-medium text-slate-700 cursor-pointer"
                  >
                    {opt.label}
                  </Label>
                  <p className="text-xs text-slate-400">{opt.description}</p>
                </div>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="space-y-1.5 pt-1">
          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Notes (optional)
          </Label>
          <Textarea
            placeholder="Document what happened — what was discussed, next steps, referrals made..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-[80px] resize-none text-sm placeholder:text-slate-400 focus:border-slate-400"
            maxLength={500}
          />
          <p className="text-right text-xs text-slate-400">{notes.length}/500</p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={updateMutation.isPending}
            className="text-slate-600"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={updateMutation.isPending}
            className="bg-slate-800 hover:bg-slate-700 text-white"
          >
            {updateMutation.isPending ? 'Saving...' : 'Save Update'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Stats Bar
// ============================================================================

interface CounselorStatsData {
  open: number;
  contacted: number;
  resolved_today: number;
  total_active: number;
}

function StatCard({
  icon: Icon,
  label,
  value,
  isLoading,
  colorClass,
  bgClass,
}: {
  icon: React.ElementType;
  label: string;
  value: number | undefined;
  isLoading: boolean;
  colorClass: string;
  bgClass: string;
}) {
  return (
    <Card className="flex-1 min-w-0">
      <CardContent className="flex items-center gap-3 py-4 px-4">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${bgClass}`}>
          <Icon className={`h-4.5 w-4.5 ${colorClass}`} style={{ height: '18px', width: '18px' }} />
        </div>
        <div className="min-w-0">
          {isLoading ? (
            <>
              <Skeleton className="h-6 w-8 mb-1" />
              <Skeleton className="h-3 w-16" />
            </>
          ) : (
            <>
              <p className="text-xl font-bold text-slate-800 leading-none">{value ?? 0}</p>
              <p className="text-xs text-slate-500 mt-0.5 leading-tight">{label}</p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatsBar({ stats, isLoading }: { stats: CounselorStatsData | undefined; isLoading: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard
        icon={AlertTriangle}
        label="Open Alerts"
        value={stats?.open}
        isLoading={isLoading}
        colorClass="text-red-600"
        bgClass="bg-red-50"
      />
      <StatCard
        icon={Phone}
        label="Contacted"
        value={stats?.contacted_count}
        isLoading={isLoading}
        colorClass="text-amber-600"
        bgClass="bg-amber-50"
      />
      <StatCard
        icon={CalendarCheck}
        label="Resolved Today"
        value={stats?.resolved_today}
        isLoading={isLoading}
        colorClass="text-emerald-600"
        bgClass="bg-emerald-50"
      />
      <StatCard
        icon={Users}
        label="Total Active"
        value={stats?.total_active}
        isLoading={isLoading}
        colorClass="text-blue-600"
        bgClass="bg-blue-50"
      />
    </div>
  );
}

// ============================================================================
// Escalation Alert Card
// ============================================================================

interface AlertCardProps {
  escalation: HealthEscalation;
  onUpdateStatus: (escalation: HealthEscalation) => void;
  onContact: (escalation: HealthEscalation) => void;
  isContactPending: boolean;
}

function AlertCard({ escalation, onUpdateStatus, onContact, isContactPending }: AlertCardProps) {
  const severity = getSeverity(escalation);

  return (
    <div className={`rounded-xl bg-white shadow-sm ${cardBorderClass(escalation.status)} transition-all`}>
      <div className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            <SeverityPill level={severity} />
            <StatusBadge status={escalation.status} />
          </div>
          <div className="flex items-center gap-1 shrink-0 text-xs text-slate-400">
            <Clock className="h-3 w-3" />
            {timeAgo(escalation.created_at)}
          </div>
        </div>

        {/* Student info */}
        <div>
          <p className="text-sm font-semibold text-slate-800 leading-tight">
            {escalation.learner_name ?? 'Unknown Student'}
          </p>
          {escalation.learner_institution && (
            <p className="text-xs text-slate-400 mt-0.5">{escalation.learner_institution}</p>
          )}
        </div>

        {/* Assessment details */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600 font-medium">
            <Activity className="h-3 w-3" />
            {assessmentLabel(escalation.trigger_type)}
          </span>
          {escalation.trigger_score !== null && (
            <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600 font-medium">
              Score: <strong className="ml-1 text-slate-800">{escalation.trigger_score}</strong>
            </span>
          )}
          {escalation.trigger_severity && (
            <span className="text-xs text-slate-400 italic">{escalation.trigger_severity}</span>
          )}
        </div>

        {/* Counselor notes preview */}
        {escalation.counselor_notes && (
          <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100 line-clamp-2">
            <span className="font-medium text-slate-600">Note: </span>
            {escalation.counselor_notes}
          </p>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 pt-1">
          {escalation.learner_phone ? (
            <a
              href={`tel:${escalation.learner_phone}`}
              onClick={() => {
                if (escalation.status === 'open') {
                  onContact(escalation);
                }
              }}
              className="flex-1"
            >
              <Button
                variant="default"
                size="sm"
                className="w-full bg-slate-800 hover:bg-slate-700 text-white text-xs gap-1.5"
                disabled={isContactPending}
              >
                <Phone className="h-3.5 w-3.5" />
                Contact
              </Button>
            </a>
          ) : (
            <Button
              variant="default"
              size="sm"
              className="flex-1 bg-slate-300 text-slate-500 text-xs gap-1.5 cursor-not-allowed"
              disabled
              title="No phone number on file"
            >
              <Phone className="h-3.5 w-3.5" />
              No Number
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs gap-1.5 border-slate-300 hover:border-slate-400 hover:bg-slate-50"
            onClick={() => onUpdateStatus(escalation)}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Update Status
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Active Alerts List
// ============================================================================

function AlertCardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 space-y-3 shadow-sm">
      <div className="flex justify-between">
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <Skeleton className="h-4 w-12" />
      </div>
      <div className="space-y-1.5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-28" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-5 w-32 rounded-md" />
        <Skeleton className="h-5 w-20 rounded-md" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 flex-1 rounded-md" />
        <Skeleton className="h-8 flex-1 rounded-md" />
      </div>
    </div>
  );
}

// ============================================================================
// Resolved History Row
// ============================================================================

function ResolvedRow({ escalation }: { escalation: HealthEscalation }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 border border-emerald-100 mt-0.5">
        <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-700 truncate">
            {escalation.learner_name ?? 'Unknown Student'}
          </p>
          <StatusBadge status={escalation.status} />
        </div>
        <p className="text-xs text-slate-400 mt-0.5">
          {escalation.resolved_at
            ? formatDate(escalation.resolved_at)
            : formatDate(escalation.updated_at)}
        </p>
        {escalation.counselor_notes && (
          <p className="text-xs text-slate-500 mt-1 line-clamp-2 italic">
            &ldquo;{escalation.counselor_notes}&rdquo;
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Access Denied screen
// ============================================================================

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 border border-slate-200">
        <Shield className="h-8 w-8 text-slate-400" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-slate-700">Access Restricted</h2>
        <p className="text-sm text-slate-500 mt-1 max-w-xs leading-relaxed">
          This page is restricted to health counselors.
          Contact your administrator for access.
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Main dashboard inner (data-consuming)
// ============================================================================

function CounselorDashboardInner() {
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions(profile ?? undefined);

  // Access control check
  const hasAccess = useMemo(() => {
    if (!profile) return false;
    if (isSuperAdmin) return true;
    return ALLOWED_ROLES.includes(profile.role as typeof ALLOWED_ROLES[number]);
  }, [profile, isSuperAdmin]);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedEscalation, setSelectedEscalation] = useState<HealthEscalation | null>(null);

  // Resolved history toggle
  const [showResolved, setShowResolved] = useState(false);

  // Data hooks
  const { data: activeEscalations, isLoading: loadingActive } = useActiveEscalations();
  const { data: allEscalations, isLoading: loadingAll } = useAllEscalations(true);
  const { data: stats, isLoading: loadingStats } = useCounselorStats();

  const contactMutation = useUpdateEscalation();

  // Derived data
  const resolvedEscalations = useMemo(() => {
    if (!allEscalations) return [];
    return allEscalations
      .filter((e) => e.status === 'resolved' || e.status === 'false_positive')
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 20); // Show last 20
  }, [allEscalations]);

  // Sort active: HIGH severity first, then by created_at desc
  const sortedActive = useMemo(() => {
    if (!activeEscalations) return [];
    return [...activeEscalations].sort((a, b) => {
      const severityWeight = (e: HealthEscalation) => (getSeverity(e) === 'HIGH' ? 1 : 0);
      if (severityWeight(b) !== severityWeight(a)) return severityWeight(b) - severityWeight(a);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [activeEscalations]);

  function handleOpenUpdateDialog(escalation: HealthEscalation) {
    setSelectedEscalation(escalation);
    setDialogOpen(true);
  }

  function handleContact(escalation: HealthEscalation) {
    // Auto-update status to 'contacted' when counselor taps Call
    if (escalation.status === 'open') {
      contactMutation.mutate({ id: escalation.id, status: 'contacted' });
    }
  }

  if (!profile) {
    // Auth still loading
    return (
      <div className="space-y-4 pt-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="py-4 px-4"><Skeleton className="h-14 w-full" /></CardContent></Card>
          ))}
        </div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <AlertCardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return <AccessDenied />;
  }

  return (
    <div className="space-y-6">

      {/* ── Live indicator ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-700">Mental Health Triage</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Students who scored high on PHQ-9 or GAD-7 appear here automatically.
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1">
          <RefreshCw className="h-3 w-3 text-emerald-500 animate-spin [animation-duration:3s]" />
          <span className="text-xs text-emerald-600 font-medium">Live</span>
        </div>
      </div>

      {/* ── 1. Stats bar ── */}
      <StatsBar stats={stats as CounselorStatsData | undefined} isLoading={loadingStats} />

      {/* ── 2. Active alerts ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            Active Alerts
            {!loadingActive && sortedActive.length > 0 && (
              <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-100 px-1.5 text-xs font-bold text-red-700">
                {sortedActive.length}
              </span>
            )}
          </h3>
        </div>

        {loadingActive ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <AlertCardSkeleton key={i} />)}
          </div>
        ) : sortedActive.length === 0 ? (
          <Card className="border-dashed border-slate-200">
            <CardContent className="flex flex-col items-center py-10 gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 border border-emerald-100">
                <CheckCircle className="h-6 w-6 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-600">No active alerts</p>
                <p className="text-xs text-slate-400 mt-1">
                  All escalated students have been addressed. Check back in 15 seconds.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {sortedActive.map((escalation) => (
              <AlertCard
                key={escalation.id}
                escalation={escalation}
                onUpdateStatus={handleOpenUpdateDialog}
                onContact={handleContact}
                isContactPending={
                  contactMutation.isPending &&
                  (contactMutation.variables as { id: string } | undefined)?.id === escalation.id
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* ── 3. Resolved history ── */}
      <div>
        <button
          className="flex w-full items-center justify-between py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
          onClick={() => setShowResolved((v) => !v)}
          aria-expanded={showResolved}
        >
          <span className="flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-slate-400" />
            Resolved History
            {resolvedEscalations.length > 0 && (
              <span className="text-xs text-slate-400">({resolvedEscalations.length})</span>
            )}
          </span>
          {showResolved ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </button>

        {showResolved && (
          <Card className="mt-2">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-medium text-slate-600">
                Recently Resolved
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {loadingAll ? (
                <div className="space-y-3 py-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <Skeleton className="h-7 w-7 rounded-full shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-36" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : resolvedEscalations.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-400">
                  No resolved escalations yet.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {resolvedEscalations.map((escalation, i) => (
                    <ResolvedRow key={escalation.id} escalation={escalation} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Bottom breathing room */}
      <div className="h-4" />
    </div>
  );
}

// ============================================================================
// Status Update Dialog (rendered at page level to avoid re-mount on card re-render)
// ============================================================================

function CounselorDashboardWithDialog() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedEscalation, setSelectedEscalation] = useState<HealthEscalation | null>(null);

  // This wrapper exists so the dialog stays mounted at a stable level
  // while the inner component re-renders on 15s polling.
  return (
    <>
      <CounselorDashboardInner_WithCallbacks
        onOpenDialog={(e) => { setSelectedEscalation(e); setDialogOpen(true); }}
      />
      <StatusUpdateDialog
        escalation={selectedEscalation}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </>
  );
}

// ============================================================================
// Inner component that accepts external dialog callbacks
// (Avoids dialog state living inside the polled component)
// ============================================================================

function CounselorDashboardInner_WithCallbacks({
  onOpenDialog,
}: {
  onOpenDialog: (e: HealthEscalation) => void;
}) {
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions(profile ?? undefined);

  const hasAccess = useMemo(() => {
    if (!profile) return false;
    if (isSuperAdmin) return true;
    return ALLOWED_ROLES.includes(profile.role as typeof ALLOWED_ROLES[number]);
  }, [profile, isSuperAdmin]);

  const [showResolved, setShowResolved] = useState(false);

  const { data: activeEscalations, isLoading: loadingActive } = useActiveEscalations();
  const { data: allEscalations, isLoading: loadingAll } = useAllEscalations(true);
  const { data: stats, isLoading: loadingStats } = useCounselorStats();

  const contactMutation = useUpdateEscalation();

  const resolvedEscalations = useMemo(() => {
    if (!allEscalations) return [];
    return allEscalations
      .filter((e) => e.status === 'resolved' || e.status === 'false_positive')
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 20);
  }, [allEscalations]);

  const sortedActive = useMemo(() => {
    if (!activeEscalations) return [];
    return [...activeEscalations].sort((a, b) => {
      const w = (e: HealthEscalation) => (getSeverity(e) === 'HIGH' ? 1 : 0);
      if (w(b) !== w(a)) return w(b) - w(a);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [activeEscalations]);

  function handleContact(escalation: HealthEscalation) {
    if (escalation.status === 'open') {
      contactMutation.mutate({ id: escalation.id, status: 'contacted' });
    }
  }

  if (!profile) {
    return (
      <div className="space-y-4 pt-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="py-4 px-4"><Skeleton className="h-14 w-full" /></CardContent></Card>
          ))}
        </div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <AlertCardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  if (!hasAccess) return <AccessDenied />;

  return (
    <div className="space-y-6">

      {/* Live indicator */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-700">Mental Health Triage</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Students who scored high on PHQ-9 or GAD-7 appear here automatically.
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1">
          <RefreshCw className="h-3 w-3 text-emerald-500 animate-spin [animation-duration:3s]" />
          <span className="text-xs text-emerald-600 font-medium">Live</span>
        </div>
      </div>

      {/* Stats bar */}
      <StatsBar stats={stats as CounselorStatsData | undefined} isLoading={loadingStats} />

      {/* Active alerts */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            Active Alerts
            {!loadingActive && sortedActive.length > 0 && (
              <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-100 px-1.5 text-xs font-bold text-red-700">
                {sortedActive.length}
              </span>
            )}
          </h3>
        </div>

        {loadingActive ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <AlertCardSkeleton key={i} />)}
          </div>
        ) : sortedActive.length === 0 ? (
          <Card className="border-dashed border-slate-200">
            <CardContent className="flex flex-col items-center py-10 gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 border border-emerald-100">
                <CheckCircle className="h-6 w-6 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-600">No active alerts</p>
                <p className="text-xs text-slate-400 mt-1">
                  All escalated students have been addressed.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {sortedActive.map((escalation) => (
              <AlertCard
                key={escalation.id}
                escalation={escalation}
                onUpdateStatus={onOpenDialog}
                onContact={handleContact}
                isContactPending={
                  contactMutation.isPending &&
                  (contactMutation.variables as { id: string } | undefined)?.id === escalation.id
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Resolved history */}
      <div>
        <button
          className="flex w-full items-center justify-between py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
          onClick={() => setShowResolved((v) => !v)}
          aria-expanded={showResolved}
          aria-controls="resolved-history"
        >
          <span className="flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-slate-400" />
            Resolved History
            {resolvedEscalations.length > 0 && (
              <span className="text-xs text-slate-400">({resolvedEscalations.length})</span>
            )}
          </span>
          {showResolved ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </button>

        {showResolved && (
          <Card className="mt-2" id="resolved-history">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-medium text-slate-600">
                Recently Resolved
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {loadingAll ? (
                <div className="space-y-3 py-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <Skeleton className="h-7 w-7 rounded-full shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-36" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : resolvedEscalations.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-400">
                  No resolved escalations yet.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {resolvedEscalations.map((escalation) => (
                    <ResolvedRow key={escalation.id} escalation={escalation} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="h-4" />
    </div>
  );
}

// ============================================================================
// Exported page
// ============================================================================

export default function CounselorDashboardPage() {
  return (
    <ContentLayout title="Counselor Dashboard">
      <CounselorDashboardWithDialog />
    </ContentLayout>
  );
}
