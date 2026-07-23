'use client';

import { use, useMemo, type ComponentType, type ReactNode } from 'react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useServiceType } from '@/hooks/service-requests/use-service-types';
import {
  useApproversByIds,
  roleKeyToLabel,
} from '@/hooks/service-requests/use-eligible-approvers';
import {
  SERVICE_TYPE_SCOPE_OPTIONS,
  type ServiceType,
} from '@/types/service-request';
import {
  Edit,
  FileText,
  CheckCircle2,
  XCircle,
  ArrowRight,
  GitBranch,
  ListChecks,
  Layers,
  CalendarClock,
  Mail,
  Paperclip,
  Flag,
  Zap,
  Users,
  Eye,
  UserRound,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ServiceTypeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: serviceType, isLoading, error } = useServiceType(id);

  // Resolve every named approver across all steps in ONE query. Derived before
  // the early returns so the hook runs on every render (rules of hooks); the
  // list is [] while the type loads and the hook self-disables on empty.
  const approverIds = useMemo(
    () =>
      (serviceType?.approval_steps ?? []).flatMap(
        (s) => s.approver_user_ids ?? []
      ),
    [serviceType]
  );
  const { data: approverMap } = useApproversByIds(approverIds);

  if (isLoading) {
    return (
      <ContentLayout title="Service Type">
        <DetailSkeleton />
      </ContentLayout>
    );
  }

  if (error || !serviceType) {
    return (
      <ContentLayout title="Service Type">
        <div className="flex flex-col items-center justify-center gap-3 min-h-[400px] text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <XCircle className="h-6 w-6 text-destructive" />
          </div>
          <p className="text-sm font-medium">
            {error?.message || 'Service type not found'}
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link href="/service-requests/types">Back to Service Types</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const fields = [...(serviceType.fields ?? [])].sort(
    (a, b) => a.display_order - b.display_order
  );
  const steps = [...(serviceType.approval_steps ?? [])].sort(
    (a, b) => a.step_order - b.step_order
  );
  const isSequential = serviceType.approval_workflow_type !== 'parallel';
  const scopeLabel =
    SERVICE_TYPE_SCOPE_OPTIONS.find((o) => o.value === serviceType.scope_level)
      ?.label ?? 'Common';

  return (
    <ContentLayout title={serviceType.name}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/service-requests">Service Requests</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/service-requests/types">Types</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{serviceType.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6 mt-4 max-w-5xl">
        {/* Header */}
        <Card className="overflow-hidden">
          <div
            className="h-1.5 w-full"
            style={{ backgroundColor: serviceType.color }}
            aria-hidden
          />
          <CardContent className="p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex items-start gap-4 min-w-0">
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-black/5 dark:ring-white/10"
                  style={{ backgroundColor: `${serviceType.color}1a` }}
                >
                  <FileText
                    className="h-7 w-7"
                    style={{ color: serviceType.color }}
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">
                      {serviceType.name}
                    </h1>
                    <StatusPill active={serviceType.is_active} />
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground font-mono">
                    {serviceType.slug}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="gap-1 font-normal">
                      <Eye className="h-3.5 w-3.5" />
                      {scopeLabel}
                    </Badge>
                    <Badge variant="secondary" className="gap-1 font-normal">
                      {isSequential ? (
                        <ArrowRight className="h-3.5 w-3.5" />
                      ) : (
                        <GitBranch className="h-3.5 w-3.5" />
                      )}
                      {isSequential ? 'Sequential' : 'Parallel'} approval
                    </Badge>
                  </div>
                </div>
              </div>
              <Button asChild className="shrink-0">
                <Link href={`/service-requests/types/${id}/edit`}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Link>
              </Button>
            </div>

            {serviceType.description && (
              <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
                {serviceType.description}
              </p>
            )}
          </CardContent>
        </Card>

        {/* At-a-glance stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile
            icon={ListChecks}
            label="Form Fields"
            value={fields.length}
          />
          <StatTile
            icon={GitBranch}
            label="Approval Steps"
            value={steps.length}
          />
          <StatTile
            icon={Layers}
            label="Max Active / User"
            value={serviceType.max_active_requests}
          />
          <StatTile
            icon={CalendarClock}
            label="Validity"
            value={
              serviceType.validity_period_days
                ? `${serviceType.validity_period_days}d`
                : '—'
            }
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <ConfigRow
                icon={Zap}
                label="Auto-fulfill on approval"
                value={<BoolPill on={serviceType.auto_fulfill_on_approval} />}
              />
              <ConfigRow
                icon={Flag}
                label="Priority"
                value={<BoolPill on={serviceType.enable_priority} />}
              />
              <ConfigRow
                icon={Paperclip}
                label="Attachments"
                value={<BoolPill on={serviceType.enable_attachments} />}
              />
              <ConfigRow
                icon={Mail}
                label="Email notifications"
                value={<BoolPill on={serviceType.enable_email_notifications} />}
              />
              <Separator className="my-3" />
              <div className="flex items-start gap-3 py-1">
                <Users className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground mb-1.5">
                    Allowed roles
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {/* '*' (ALL_ROLES_WILDCARD) = every authenticated user */}
                    {serviceType.allowed_roles.includes('*') ? (
                      <Badge variant="outline" className="text-xs">
                        All roles
                      </Badge>
                    ) : serviceType.allowed_roles.length > 0 ? (
                      serviceType.allowed_roles.map((role) => (
                        <Badge
                          key={role}
                          variant="outline"
                          className="text-xs capitalize"
                        >
                          {role.replace(/_/g, ' ')}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        None assigned
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Form Fields */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Form Fields{' '}
                <span className="text-muted-foreground font-normal">
                  ({fields.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {fields.length > 0 ? (
                <ul className="space-y-2">
                  {fields.map((field) => (
                    <li
                      key={field.id}
                      className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">
                            {field.field_label}
                          </span>
                          {field.is_required && (
                            <span className="text-xs font-medium text-destructive">
                              *
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground font-mono truncate">
                          {field.field_key}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[10px] capitalize shrink-0"
                      >
                        {field.field_type}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyHint
                  icon={ListChecks}
                  text="No form fields configured."
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Approval Workflow */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">
                Approval Workflow{' '}
                <span className="text-muted-foreground font-normal">
                  ({steps.length} {steps.length === 1 ? 'step' : 'steps'})
                </span>
              </CardTitle>
              {steps.length > 0 && (
                <Badge variant="secondary" className="gap-1 font-normal">
                  {isSequential ? (
                    <ArrowRight className="h-3.5 w-3.5" />
                  ) : (
                    <GitBranch className="h-3.5 w-3.5" />
                  )}
                  {isSequential ? 'Sequential' : 'Parallel'}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {steps.length > 0 ? (
              <ol className="relative">
                {steps.map((step, i) => (
                  <ApprovalStepRow
                    key={step.id}
                    step={step}
                    isLast={i === steps.length - 1}
                    showConnector={isSequential}
                    approverMap={approverMap}
                  />
                ))}
              </ol>
            ) : (
              <EmptyHint
                icon={ShieldCheck}
                text="No approval steps — requests are auto-approved on submit."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}

/* ------------------------------------------------------------------ */
/* Approval step row — shows the named approvers (avatars + names).    */
/* ------------------------------------------------------------------ */

type ApprovalStep = NonNullable<ServiceType['approval_steps']>[number];

function ApprovalStepRow({
  step,
  isLast,
  showConnector,
  approverMap,
}: {
  step: ApprovalStep;
  isLast: boolean;
  showConnector: boolean;
  approverMap?: Map<string, { id: string; full_name: string; email: string; role: string }>;
}) {
  const namedIds = step.approver_user_ids ?? [];
  const hasNamed = namedIds.length > 0;

  return (
    <li className="relative flex gap-4 pb-5 last:pb-0">
      {/* Connector line between sequential steps */}
      {showConnector && !isLast && (
        <span
          className="absolute left-[15px] top-9 bottom-1 w-px bg-border"
          aria-hidden
        />
      )}

      {/* Step order badge */}
      <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold ring-4 ring-background">
        {step.step_order}
      </div>

      {/* Step body */}
      <div className="flex-1 min-w-0 rounded-lg border bg-card p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{step.step_name}</p>
            <p className="text-xs text-muted-foreground capitalize">
              {roleKeyToLabel(step.approver_role)}
            </p>
          </div>
          <Badge
            variant={step.is_required ? 'outline' : 'secondary'}
            className="text-[10px] shrink-0"
          >
            {step.is_required ? 'Required' : 'Optional'}
          </Badge>
        </div>

        {/* Approvers */}
        <div className="mt-3">
          {hasNamed ? (
            <>
              {namedIds.length > 1 && (
                <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                  Any one of {namedIds.length} can approve
                </p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {namedIds.map((uid) => {
                  const p = approverMap?.get(uid);
                  return (
                    <ApproverChip
                      key={uid}
                      id={uid}
                      name={p?.full_name}
                      role={p?.role}
                    />
                  );
                })}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              Anyone with the{' '}
              <span className="font-medium text-foreground capitalize">
                {roleKeyToLabel(step.approver_role)}
              </span>{' '}
              role can approve
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function ApproverChip({
  id,
  name,
  role,
}: {
  id: string;
  name?: string;
  role?: string;
}) {
  const display = name?.trim() || 'Unknown user';
  const known = Boolean(name);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border bg-background py-0.5 pl-0.5 pr-2.5 text-xs',
        !known && 'text-muted-foreground'
      )}
    >
      <Avatar className="h-6 w-6">
        <AvatarFallback className={cn('text-[10px] font-medium', tintFor(id))}>
          {known ? getInitials(name) : <UserRound className="h-3 w-3" />}
        </AvatarFallback>
      </Avatar>
      <span className="max-w-[160px] truncate font-medium">{display}</span>
      {role && (
        <span className="capitalize text-muted-foreground">
          · {roleKeyToLabel(role)}
        </span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Small presentational helpers                                        */
/* ------------------------------------------------------------------ */

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        active
          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          : 'bg-muted text-muted-foreground'
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          active ? 'bg-emerald-500' : 'bg-muted-foreground/50'
        )}
        aria-hidden
      />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <p className="mt-2 text-2xl font-bold tabular-nums leading-none">
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function ConfigRow({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="flex items-center gap-3 text-sm text-muted-foreground">
        <Icon className="h-4 w-4 shrink-0" />
        {label}
      </span>
      {value}
    </div>
  );
}

function BoolPill({ on }: { on: boolean }) {
  return on ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
      <CheckCircle2 className="h-3.5 w-3.5" />
      Enabled
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
      <XCircle className="h-3.5 w-3.5" />
      Off
    </span>
  );
}

function EmptyHint({
  icon: Icon,
  text,
}: {
  icon: ComponentType<{ className?: string }>;
  text: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6 mt-4 max-w-5xl animate-pulse">
      <div className="h-32 rounded-xl border bg-muted/40" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border bg-muted/40" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-56 rounded-xl border bg-muted/40" />
        <div className="h-56 rounded-xl border bg-muted/40" />
      </div>
      <div className="h-48 rounded-xl border bg-muted/40" />
    </div>
  );
}

/* Deterministic, low-saturation avatar tint (decorative — name text is always
   shown, so color never carries meaning on its own). */
const AVATAR_TINTS = [
  'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
];

function tintFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

function getInitials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase() || '?';
}
