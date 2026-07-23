'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  Building2,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Flame,
  Loader2,
  Mail,
  Phone,
  Star,
  Tag,
  User as UserIcon,
  Users,
  XCircle,
  Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Minimal subset of CounselorRecord that this dialog reads. Kept loose so we
// don't import the full CounselorRecord interface (which would create a
// circular import path through counselor-list.tsx).
export interface CounselorDetailsInput {
  id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  max_leads: number;
  current_leads: number;
  assigned_lead_count?: number;
  specializations: string[] | null;
  institution_id: string;
  created_at: string;
  institutions: { name: string } | null;
  profile_role?: string | null;
  profile_full_name?: string | null;
}

interface MappedSource {
  id: string;
  source_id: string;
  priority_weight: number;
  max_leads_per_day: number | null;
  effective_from: string | null;
  effective_to: string | null;
  is_paused: boolean;
  source: {
    id: string;
    key: string;
    label: string;
    is_active: boolean;
  } | null;
}

interface AssignedLead {
  id: string;
  full_name: string | null;
  first_name: string;
  last_name: string | null;
  phone: string;
  email: string | null;
  funnel_stage: string;
  score: number | null;
  is_hot_lead: boolean | null;
  is_priority: boolean | null;
  last_activity_at: string | null;
  source: string | null;
  created_at: string;
}

interface CounselorDetailsDialogProps {
  counselor: CounselorDetailsInput | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STAGE_COLORS: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800 border-blue-200',
  contacted: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  interested: 'bg-violet-100 text-violet-800 border-violet-200',
  engaged: 'bg-purple-100 text-purple-800 border-purple-200',
  qualified: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200',
  applied: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  application_started: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  application_submitted: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  documents_pending: 'bg-amber-100 text-amber-800 border-amber-200',
  documents_verified: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  offer_sent: 'bg-teal-100 text-teal-800 border-teal-200',
  offered: 'bg-teal-100 text-teal-800 border-teal-200',
  offer_accepted: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  confirmed: 'bg-green-100 text-green-800 border-green-200',
  enrolled: 'bg-green-200 text-green-900 border-green-300',
  lost: 'bg-red-100 text-red-700 border-red-200',
  dormant: 'bg-gray-100 text-gray-600 border-gray-200',
  not_reachable: 'bg-orange-100 text-orange-800 border-orange-200',
  follow_up_scheduled: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  declined: 'bg-rose-100 text-rose-700 border-rose-200',
  withdrew: 'bg-pink-100 text-pink-700 border-pink-200',
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatStage(stage: string) {
  return stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const LEAD_PAGE_SIZE = 50;

export function CounselorDetailsDialog({
  counselor,
  open,
  onOpenChange,
}: CounselorDetailsDialogProps) {
  const supabase = createClientSupabaseClient();
  const [isLoading, setIsLoading] = useState(false);
  const [sources, setSources] = useState<MappedSource[]>([]);
  const [leads, setLeads] = useState<AssignedLead[]>([]);
  const [totalLeadCount, setTotalLeadCount] = useState(0);

  const isRoleOnly = counselor?.id.startsWith('role-') ?? false;

  useEffect(() => {
    if (!open || !counselor) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setSources([]);
      setLeads([]);
      setTotalLeadCount(0);
      try {
        // assigned_counselor_id has mixed writer history — some paths store
        // profiles.id (auth.uid()), others store admission_counselors.id. We
        // match on both. Mirrors the live-count logic in counselor-list.tsx.
        const idsForLeadMatch: string[] = [];
        if (counselor.user_id) idsForLeadMatch.push(counselor.user_id);
        if (!isRoleOnly) idsForLeadMatch.push(counselor.id);

        // Run both queries in parallel — they're independent.
        const [sourcesRes, leadsRes, leadCountRes] = await Promise.allSettled([
          // Mapped sources: only meaningful for real (non-role-only) records
          isRoleOnly
            ? Promise.resolve({ data: [], error: null } as any)
            : (supabase as any)
                .from('admission_counselor_sources')
                .select(
                  `
                  id, source_id, priority_weight, max_leads_per_day,
                  effective_from, effective_to, is_paused,
                  source:admission_lead_sources_master!source_id (
                    id, key, label, is_active
                  )
                  `,
                )
                .eq('counselor_id', counselor.id)
                .order('priority_weight', { ascending: false }),

          // Top N assigned leads — recent activity first
          idsForLeadMatch.length === 0
            ? Promise.resolve({ data: [], error: null } as any)
            : (supabase as any)
                .from('admission_leads')
                .select(
                  `
                  id, full_name, first_name, last_name, phone, email,
                  funnel_stage, score, is_hot_lead, is_priority,
                  last_activity_at, source, created_at
                  `,
                )
                .in('assigned_counselor_id', idsForLeadMatch)
                .order('last_activity_at', {
                  ascending: false,
                  nullsFirst: false,
                })
                .order('created_at', { ascending: false })
                .limit(LEAD_PAGE_SIZE),

          // Total count (head-only, no rows transferred)
          idsForLeadMatch.length === 0
            ? Promise.resolve({ count: 0, error: null } as any)
            : (supabase as any)
                .from('admission_leads')
                .select('id', { count: 'exact', head: true })
                .in('assigned_counselor_id', idsForLeadMatch),
        ]);

        if (cancelled) return;

        if (sourcesRes.status === 'fulfilled' && !sourcesRes.value.error) {
          setSources((sourcesRes.value.data ?? []) as MappedSource[]);
        } else if (sourcesRes.status === 'fulfilled' && sourcesRes.value.error) {
          console.warn('[counselor-details] sources load failed', sourcesRes.value.error);
        }

        if (leadsRes.status === 'fulfilled' && !leadsRes.value.error) {
          setLeads((leadsRes.value.data ?? []) as AssignedLead[]);
        } else if (leadsRes.status === 'fulfilled' && leadsRes.value.error) {
          console.warn('[counselor-details] leads load failed', leadsRes.value.error);
        }

        if (leadCountRes.status === 'fulfilled' && !leadCountRes.value.error) {
          setTotalLeadCount(leadCountRes.value.count ?? 0);
        }
      } catch (err) {
        console.error('[counselor-details] load failed', err);
        toast.error('Failed to load counselor details');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, counselor, isRoleOnly, supabase]);

  // Derived KPIs
  const hotLeadCount = useMemo(
    () => leads.filter((l) => l.is_hot_lead).length,
    [leads],
  );
  const sourceCount = sources.length;
  const activeSourceCount = useMemo(
    () => sources.filter((s) => !s.is_paused).length,
    [sources],
  );
  const capacityPct =
    counselor && counselor.max_leads > 0
      ? Math.min(100, Math.round((totalLeadCount / counselor.max_leads) * 100))
      : 0;

  if (!counselor) return null;

  const displayName = counselor.name || counselor.profile_full_name || 'Unnamed';
  const initials = displayName
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-base">
              {initials || <UserIcon className="h-5 w-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg flex items-center gap-2 flex-wrap">
                <span className="truncate">{displayName}</span>
                {counselor.is_active ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-300 bg-emerald-50 text-emerald-700 text-[10px]"
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Active
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-gray-300 bg-gray-50 text-gray-600 text-[10px]"
                  >
                    <XCircle className="h-3 w-3 mr-1" />
                    Inactive
                  </Badge>
                )}
                {isRoleOnly && (
                  <Badge
                    variant="outline"
                    className="border-amber-300 bg-amber-50 text-amber-700 text-[10px]"
                  >
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Role-only
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs">
                {counselor.email && (
                  <span className="inline-flex items-center gap-1 mr-3">
                    <Mail className="h-3 w-3" />
                    {counselor.email}
                  </span>
                )}
                {counselor.phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {counselor.phone}
                  </span>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <KpiCard
            icon={<Users className="h-3.5 w-3.5" />}
            label="Assigned Leads"
            value={totalLeadCount}
            sub={
              counselor.max_leads > 0 ? `${capacityPct}% of cap` : 'No cap set'
            }
            isLoading={isLoading}
          />
          <KpiCard
            icon={<Zap className="h-3.5 w-3.5" />}
            label="Capacity"
            value={counselor.max_leads || '∞'}
            sub={counselor.max_leads ? 'max leads' : 'unlimited'}
            isLoading={false}
          />
          <KpiCard
            icon={<Tag className="h-3.5 w-3.5" />}
            label="Sources"
            value={sourceCount}
            sub={
              sourceCount > 0
                ? `${activeSourceCount} active`
                : isRoleOnly
                  ? 'n/a — role-only'
                  : 'none mapped'
            }
            isLoading={isLoading}
          />
          <KpiCard
            icon={<Flame className="h-3.5 w-3.5" />}
            label="Hot Leads"
            value={hotLeadCount}
            sub={
              totalLeadCount > 0
                ? `of ${totalLeadCount} loaded`
                : 'no leads'
            }
            isLoading={isLoading}
          />
        </div>

        <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="sources">
              Sources
              {sourceCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">
                  {sourceCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="leads">
              Leads
              {totalLeadCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">
                  {totalLeadCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="flex-1 overflow-y-auto mt-3 space-y-3">
            <div className="rounded-lg border p-3 space-y-2.5">
              <DetailRow
                icon={<UserIcon className="h-3.5 w-3.5" />}
                label="Primary Role"
                value={counselor.profile_role || '—'}
              />
              <DetailRow
                icon={<Building2 className="h-3.5 w-3.5" />}
                label="Institution"
                value={counselor.institutions?.name || '—'}
              />
              <DetailRow
                icon={<CalendarClock className="h-3.5 w-3.5" />}
                label="Created"
                value={formatDate(counselor.created_at)}
              />
              {counselor.specializations && counselor.specializations.length > 0 && (
                <div className="flex items-start gap-2 text-sm">
                  <Star className="h-3.5 w-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground mb-1">
                      Specializations
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {counselor.specializations.map((spec) => (
                        <Badge key={spec} variant="secondary" className="text-[10px]">
                          {spec}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Capacity progress visualization */}
            {counselor.max_leads > 0 && (
              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground">Load</span>
                  <span className="font-medium tabular-nums">
                    {totalLeadCount} / {counselor.max_leads}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      'h-full transition-all',
                      capacityPct >= 100
                        ? 'bg-red-500'
                        : capacityPct >= 80
                          ? 'bg-amber-500'
                          : 'bg-emerald-500',
                    )}
                    style={{ width: `${capacityPct}%` }}
                  />
                </div>
              </div>
            )}

            {isRoleOnly && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                This user holds a counselor role but has no
                {' '}<code className="font-mono text-[10px]">admission_counselors</code>{' '}
                record yet. Add them via the Add Counselor dialog to enable
                source mappings and lead assignment.
              </div>
            )}
          </TabsContent>

          {/* SOURCES */}
          <TabsContent value="sources" className="flex-1 overflow-y-auto mt-3">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading sources…</span>
              </div>
            ) : sources.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm gap-1">
                <Tag className="h-6 w-6 mb-1 opacity-50" />
                <span>No sources mapped to this counselor</span>
                {!isRoleOnly && (
                  <span className="text-xs">
                    Use the row action "Assign Leads (Sources)" to map them.
                  </span>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {sources.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-md border p-3 flex items-center gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">
                          {m.source?.label || '(unknown source)'}
                        </span>
                        {m.is_paused && (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-amber-300 bg-amber-50 text-amber-700"
                          >
                            Paused
                          </Badge>
                        )}
                        {m.source && !m.source.is_active && (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-gray-300 text-gray-600"
                          >
                            Source inactive
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
                        {m.source?.key || m.source_id}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>
                          Priority:{' '}
                          <span className="font-medium tabular-nums">
                            {m.priority_weight}
                          </span>
                        </span>
                        {m.max_leads_per_day !== null && (
                          <span>
                            Cap/day:{' '}
                            <span className="font-medium tabular-nums">
                              {m.max_leads_per_day}
                            </span>
                          </span>
                        )}
                        {m.effective_from && (
                          <span>From: {formatDate(m.effective_from)}</span>
                        )}
                        {m.effective_to && (
                          <span>Until: {formatDate(m.effective_to)}</span>
                        )}
                      </div>
                    </div>
                    {m.source && (
                      <Button
                        asChild
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 flex-shrink-0"
                      >
                        <Link
                          href={`/admission/counselors/team/allocation/${m.source.id}`}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span className="sr-only">Open source assignment</span>
                        </Link>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* LEADS */}
          <TabsContent value="leads" className="flex-1 overflow-y-auto mt-3">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading leads…</span>
              </div>
            ) : leads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm gap-1">
                <Users className="h-6 w-6 mb-1 opacity-50" />
                <span>No leads assigned to this counselor</span>
              </div>
            ) : (
              <>
                {totalLeadCount > leads.length && (
                  <div className="mb-2 rounded-md border border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/30 px-3 py-2 text-xs text-blue-900 dark:text-blue-200 flex items-center justify-between gap-2">
                    <span>
                      Showing the {leads.length} most recent of {totalLeadCount} leads
                    </span>
                    <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                      <Link
                        href={`/admission/leads?assigned_counselor_id=${encodeURIComponent(
                          counselor.user_id || counselor.id,
                        )}`}
                      >
                        View all
                        <ExternalLink className="ml-1 h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                )}
                <div className="space-y-1.5">
                  {leads.map((lead) => {
                    const name =
                      lead.full_name ||
                      [lead.first_name, lead.last_name].filter(Boolean).join(' ') ||
                      '(unnamed)';
                    return (
                      <Link
                        key={lead.id}
                        href={`/admission/leads/${lead.id}`}
                        className="block rounded-md border p-2.5 hover:bg-accent transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-medium text-sm truncate">
                                {name}
                              </span>
                              {lead.is_hot_lead && (
                                <Flame className="h-3 w-3 text-orange-500 flex-shrink-0" />
                              )}
                              {lead.is_priority && (
                                <Star className="h-3 w-3 text-amber-500 flex-shrink-0" />
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                              <span className="tabular-nums">{lead.phone}</span>
                              {lead.source && (
                                <span className="font-mono">{lead.source}</span>
                              )}
                              {lead.last_activity_at && (
                                <span>· {formatDate(lead.last_activity_at)}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {typeof lead.score === 'number' && (
                              <span className="text-xs font-medium tabular-nums text-muted-foreground">
                                {lead.score}
                              </span>
                            )}
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[10px]',
                                STAGE_COLORS[lead.funnel_stage] ||
                                  'bg-gray-100 text-gray-700 border-gray-200',
                              )}
                            >
                              {formatStage(lead.funnel_stage)}
                            </Badge>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  isLoading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub: string;
  isLoading: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums">
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          value
        )}
      </div>
      <div className="text-[10px] text-muted-foreground truncate">{sub}</div>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground flex-shrink-0">{icon}</span>
      <span className="text-xs text-muted-foreground w-28 flex-shrink-0">{label}</span>
      <span className="font-medium truncate">{value}</span>
    </div>
  );
}
