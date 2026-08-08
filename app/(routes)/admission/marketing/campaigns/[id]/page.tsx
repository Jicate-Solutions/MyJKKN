'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { AttributionModeToggle } from '@/components/admission/marketing/attribution-mode-toggle';
import { CampaignFunnelCard } from '@/components/admission/marketing/campaign-funnel-card';
import { CampaignKPIs } from '@/components/admission/marketing/campaign-kpis';
import { CampaignTimeSeriesChart } from '@/components/admission/marketing/campaign-time-series-chart';
import { CampaignLinksTable } from '@/components/admission/marketing/campaign-links-table';
import { CreateLinkDialog } from '@/components/admission/marketing/create-link-dialog';
import {
  useCampaign,
  useCampaignFunnel,
  useCampaignTimeSeries,
  useCampaignLinks,
  useUpdateCampaign,
  useArchiveCampaign,
  useDeactivateCampaignLink,
} from '@/hooks/admission/use-campaigns';
import { FALLBACK_LEAD_SOURCE_LABELS } from '@/hooks/admission/use-active-lead-sources';
import type {
  AttributionMode,
  CampaignStatus,
} from '@/types/admission/campaign';
import type { LeadSource } from '@/types/admission';
import {
  ArrowLeft,
  Pencil,
  Pause,
  Play,
  CheckCircle2,
  Archive,
  FileEdit,
  Rocket,
  Globe2,
  MapPin,
  Calendar,
  Link2,
  Users,
  TrendingUp,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ─── Status helpers ────────────────────────────────────────────────────
//
// Each status is rendered with a distinctive color + lucide icon so the
// page communicates state at a glance. The transition map below drives
// the contextual primary CTA (e.g. draft → Activate, paused → Resume).

const STATUS_META: Record<
  CampaignStatus,
  {
    label: string;
    dotClass: string;
    pillClass: string;
    Icon: typeof FileEdit;
  }
> = {
  draft: {
    label: 'Draft',
    dotClass: 'bg-amber-500',
    pillClass:
      'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900',
    Icon: FileEdit,
  },
  active: {
    label: 'Active',
    dotClass: 'bg-emerald-500',
    pillClass:
      'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900',
    Icon: Play,
  },
  paused: {
    label: 'Paused',
    dotClass: 'bg-blue-500',
    pillClass:
      'bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900',
    Icon: Pause,
  },
  completed: {
    label: 'Completed',
    dotClass: 'bg-slate-500',
    pillClass:
      'bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900/60 dark:text-slate-300 dark:ring-slate-800',
    Icon: CheckCircle2,
  },
  archived: {
    label: 'Archived',
    dotClass: 'bg-zinc-400',
    pillClass:
      'bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-800',
    Icon: Archive,
  },
};

interface QuickStatProps {
  label: string;
  value: string | number;
  hint?: string;
  Icon: typeof FileEdit;
  loading?: boolean;
}

function QuickStat({ label, value, hint, Icon, loading }: QuickStatProps) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between p-5">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          {loading ? (
            <div className="h-8 w-16 animate-pulse rounded bg-muted" />
          ) : (
            <p className="text-2xl font-semibold tabular-nums">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
          )}
          {hint && (
            <p className="text-xs text-muted-foreground">{hint}</p>
          )}
        </div>
        <div className="rounded-full bg-muted/50 p-2 text-muted-foreground">
          <Icon className="size-4" />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page component ────────────────────────────────────────────────────

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  // Default to 'any' so the KPI/funnel/time-series include EVERY lead this
  // campaign has touched — including pre-existing leads that the
  // capture_admission_lead RPC merged into instead of creating fresh. The
  // dedup path still inserts a capture row (and the AFTER INSERT trigger
  // bumps admission_campaign_links.capture_count), so 'any' is the only
  // mode whose count agrees with the per-link denormalized counter. Users
  // can still flip to 'first' or 'last' for first-touch / last-touch
  // attribution via the AttributionModeToggle.
  const [mode, setMode] = useState<AttributionMode>('any');
  const [range] = useState(() => ({
    from: new Date(Date.now() - 30 * 24 * 3600 * 1000),
    to: new Date(),
  }));
  const [pendingDeactivateLinkId, setPendingDeactivateLinkId] =
    useState<string>('');

  const { data: campaign } = useCampaign(id);
  const { data: funnel, isLoading: funnelLoading } = useCampaignFunnel(
    id,
    mode,
    range,
  );
  const { data: timeSeries, isLoading: tsLoading } = useCampaignTimeSeries(
    id,
    mode,
    'day',
    range,
  );
  const { data: links, isLoading: linksLoading } = useCampaignLinks(id);

  const update = useUpdateCampaign(id);
  const archive = useArchiveCampaign(id);
  const deactivateLink = useDeactivateCampaignLink(
    id,
    pendingDeactivateLinkId,
  );

  const spentInr = useMemo(
    () => (links ?? []).reduce((sum, l) => sum + (l.cost_inr ?? 0), 0),
    [links],
  );

  if (!campaign) {
    return (
      <div className="space-y-4 p-6">
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        <div className="h-24 animate-pulse rounded bg-muted" />
        <div className="h-72 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  const meta = STATUS_META[campaign.status];
  const sourceLabel =
    FALLBACK_LEAD_SOURCE_LABELS[campaign.source as LeadSource] ??
    campaign.source;

  async function setStatus(next: CampaignStatus, label: string) {
    try {
      await update.mutateAsync({ status: next });
      toast.success(`Campaign marked as ${label}`);
    } catch (e: any) {
      toast.error(e?.message ?? `Failed to set status to ${label}`);
    }
  }

  return (
    <PermissionGuard module="admission.marketing" action="view">
      <div className="space-y-6 p-6">
        {/* ─── Back link ─────────────────────────────────────── */}
        <Link
          href="/admission/marketing/campaigns"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to campaigns
        </Link>

        {/* ─── Hero header card ──────────────────────────────── */}
        <Card className="overflow-hidden border-l-4" style={{ borderLeftColor: 'var(--primary)' }}>
          <CardContent className="p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${meta.pillClass}`}
                  >
                    <span
                      className={`size-1.5 rounded-full ${meta.dotClass}`}
                    />
                    <meta.Icon className="size-3" />
                    {meta.label}
                  </span>
                  {campaign.scope === 'global' ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Globe2 className="size-3.5" />
                      Global · all institutions
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3.5" />
                      {campaign.institution?.name ?? 'Institution-scoped'}
                    </span>
                  )}
                  <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {campaign.category}
                  </span>
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">
                    {campaign.name}
                  </h1>
                  {campaign.description && (
                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                      {campaign.description}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <TrendingUp className="size-3.5" />
                    <span className="font-medium text-foreground">
                      {sourceLabel}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="size-3.5" />
                    {campaign.starts_at
                      ? new Date(campaign.starts_at).toLocaleDateString()
                      : '—'}
                    <span className="text-muted-foreground/60">→</span>
                    {campaign.ends_at
                      ? new Date(campaign.ends_at).toLocaleDateString()
                      : '—'}
                  </span>
                  {campaign.budget_inr && (
                    <span>
                      Budget:{' '}
                      <span className="font-medium text-foreground tabular-nums">
                        ₹{campaign.budget_inr.toLocaleString('en-IN')}
                      </span>
                    </span>
                  )}
                </div>
                {/* Program / Admission Year — only shown when the
                    admission category fields are populated. Hidden for
                    event/promotion/awareness/other categories where
                    these can't be set. */}
                {(campaign.program || campaign.admission_year) && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    {campaign.program && (
                      <span className="text-muted-foreground">
                        Program:{' '}
                        <span className="font-medium text-foreground">
                          {campaign.program.display_name ??
                            campaign.program.program_name}
                        </span>
                      </span>
                    )}
                    {campaign.admission_year && (
                      <span className="text-muted-foreground">
                        Admission Year:{' '}
                        <span className="font-medium text-foreground">
                          {campaign.admission_year.admission_year_name}
                        </span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2">
                <PermissionGuard
                  module="admission.marketing"
                  action="edit"
                >
                  {/* Contextual primary action driven by current status */}
                  {campaign.status === 'draft' && (
                    <Button
                      size="sm"
                      onClick={() => setStatus('active', 'Active')}
                      disabled={update.isPending}
                    >
                      <Rocket className="mr-1.5 size-3.5" />
                      Activate
                    </Button>
                  )}
                  {campaign.status === 'active' && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setStatus('paused', 'Paused')}
                        disabled={update.isPending}
                      >
                        <Pause className="mr-1.5 size-3.5" />
                        Pause
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setStatus('completed', 'Completed')
                        }
                        disabled={update.isPending}
                      >
                        <CheckCircle2 className="mr-1.5 size-3.5" />
                        Mark complete
                      </Button>
                    </>
                  )}
                  {campaign.status === 'paused' && (
                    <Button
                      size="sm"
                      onClick={() => setStatus('active', 'Active')}
                      disabled={update.isPending}
                    >
                      <Play className="mr-1.5 size-3.5" />
                      Resume
                    </Button>
                  )}
                  {campaign.status === 'completed' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setStatus('active', 'Active')}
                      disabled={update.isPending}
                    >
                      <Play className="mr-1.5 size-3.5" />
                      Reactivate
                    </Button>
                  )}

                  <Link
                    href={`/admission/marketing/campaigns/${id}/edit`}
                  >
                    <Button size="sm" variant="outline">
                      <Pencil className="mr-1.5 size-3.5" />
                      Edit
                    </Button>
                  </Link>
                </PermissionGuard>

                <PermissionGuard
                  module="admission.marketing"
                  action="delete"
                >
                  {campaign.status !== 'archived' && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline">
                          <Archive className="mr-1.5 size-3.5" />
                          Archive
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Archive this campaign?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Archiving hides the campaign from active lists
                            but preserves all attribution data. Existing
                            share links will stop accepting new clicks once
                            paused — archive after pausing.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => archive.mutate()}
                          >
                            Archive
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </PermissionGuard>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ─── Status banner for non-active states ──────────── */}
        {campaign.status === 'draft' && (
          <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
              <FileEdit className="size-4" />
              <span>
                <strong>This campaign is a draft.</strong> Add at least one
                share link, then activate to start collecting leads.
              </span>
            </div>
            <PermissionGuard module="admission.marketing" action="edit" fallback={null}>
              <Button
                size="sm"
                onClick={() => setStatus('active', 'Active')}
                disabled={update.isPending}
              >
                Activate now
              </Button>
            </PermissionGuard>
          </div>
        )}
        {campaign.status === 'paused' && (
          <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm dark:border-blue-900 dark:bg-blue-950/40">
            <div className="flex items-center gap-2 text-blue-800 dark:text-blue-200">
              <Pause className="size-4" />
              <span>
                <strong>Campaign is paused.</strong> Share links stop
                redirecting and clicks aren&apos;t logged until you resume.
              </span>
            </div>
            <PermissionGuard module="admission.marketing" action="edit" fallback={null}>
              <Button
                size="sm"
                onClick={() => setStatus('active', 'Active')}
                disabled={update.isPending}
              >
                Resume
              </Button>
            </PermissionGuard>
          </div>
        )}

        {/* ─── Quick stats ──────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <QuickStat
            label="Clicks (30d)"
            value={funnel?.stages.clicks ?? 0}
            Icon={Link2}
            loading={funnelLoading}
          />
          <QuickStat
            label="Captures"
            value={funnel?.stages.captures ?? 0}
            hint={
              funnel && funnel.stages.clicks > 0
                ? `${funnel.rates.click_to_capture}% of clicks`
                : undefined
            }
            Icon={Users}
            loading={funnelLoading}
          />
          <QuickStat
            label="Enrolled"
            value={funnel?.stages.enrolled ?? 0}
            hint={
              funnel && funnel.stages.captures > 0
                ? `${funnel.rates.overall}% of captures`
                : undefined
            }
            Icon={CheckCircle2}
            loading={funnelLoading}
          />
          <QuickStat
            label="Spend"
            value={
              spentInr > 0
                ? `₹${spentInr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                : '—'
            }
            hint={
              campaign.budget_inr
                ? `of ₹${campaign.budget_inr.toLocaleString('en-IN')} budget`
                : 'no budget set'
            }
            Icon={TrendingUp}
            loading={linksLoading}
          />
        </div>

        {/* ─── Performance section ──────────────────────────────
            A semantic wrapper so the header sits inside the same
            scroll context as the charts. On mobile the header stacks
            (title above toggle); on md+ they sit side-by-side.        */}
        <section
          aria-labelledby="campaign-performance-heading"
          className="space-y-4"
        >
          <div className="flex flex-col gap-3 border-b pb-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2
                id="campaign-performance-heading"
                className="text-lg font-semibold leading-tight"
              >
                Performance
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Last 30 days · attribution mode controls how leads are
                credited to this campaign
              </p>
            </div>
            <div className="self-start sm:self-auto">
              <AttributionModeToggle value={mode} onChange={setMode} />
            </div>
          </div>

          {/* Funnel + KPIs:
              - mobile (<lg): single column, KPIs first (most actionable
                summary numbers), then full-width funnel
              - lg+: funnel takes 2/3, KPIs takes 1/3 sticky-ish on the right */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="order-2 lg:order-1 lg:col-span-2">
              <CampaignFunnelCard
                funnel={funnel}
                loading={funnelLoading}
              />
            </div>
            <div className="order-1 lg:order-2">
              <CampaignKPIs
                campaign={campaign}
                funnel={funnel}
                spentInr={spentInr}
              />
            </div>
          </div>

          {/* Time series — full width below */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Daily acquisition</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Clicks, captures, and enrolments per day
              </p>
            </CardHeader>
            <CardContent>
              <CampaignTimeSeriesChart
                data={timeSeries}
                loading={tsLoading}
              />
            </CardContent>
          </Card>
        </section>

        {/* ─── Share links ─────────────────────────────────── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Share links</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {links?.length ?? 0} link
                {(links?.length ?? 0) === 1 ? '' : 's'} ·{' '}
                <Link
                  href={`/admission/marketing/campaigns/${id}/links`}
                  className="hover:underline"
                >
                  manage all
                </Link>
                {' · '}
                <Link
                  href={`/admission/marketing/campaigns/${id}/leads`}
                  className="hover:underline"
                >
                  attributed leads
                </Link>
              </p>
            </div>
            <PermissionGuard
              module="admission.marketing"
              action="create"
            >
              <CreateLinkDialog
                campaignId={id}
                campaignSource={campaign.source}
              />
            </PermissionGuard>
          </CardHeader>
          <CardContent>
            <CampaignLinksTable
              links={links}
              loading={linksLoading}
              onDeactivate={(linkId) => {
                setPendingDeactivateLinkId(linkId);
                setTimeout(() => deactivateLink.mutate(), 0);
              }}
            />
          </CardContent>
        </Card>
      </div>
    </PermissionGuard>
  );
}
