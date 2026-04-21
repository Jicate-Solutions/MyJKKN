'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FileText,
  Edit,
  CheckCircle,
  Loader2,
  Paperclip,
  Flag,
  Mail,
  ExternalLink,
} from 'lucide-react';
import { useServiceType } from '@/hooks/service-requests/use-service-types';
import { useScopeLookups, resolveScopeNames } from '@/hooks/service-requests/use-scope-lookups';
import { SERVICE_TYPE_SCOPE_CONFIG } from '@/types/service-request';
import { SCOPE_ICONS } from './scope-icons';
import { cn } from '@/lib/utils';

interface ServiceTypeDetailDialogProps {
  serviceTypeId: string | null;
  onClose: () => void;
}

export function ServiceTypeDetailDialog({
  serviceTypeId,
  onClose,
}: ServiceTypeDetailDialogProps) {
  const open = !!serviceTypeId;
  const { data: serviceType, isLoading } = useServiceType(serviceTypeId ?? '');
  const lookups = useScopeLookups();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {isLoading || !serviceType ? (
          <div className="flex items-center justify-center min-h-[200px]">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-start gap-4">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-lg shrink-0"
                  style={{ backgroundColor: `${serviceType.color}20` }}
                >
                  <FileText
                    className="h-6 w-6"
                    style={{ color: serviceType.color }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <DialogTitle className="flex items-center gap-2 flex-wrap">
                    <span>{serviceType.name}</span>
                    {serviceType.is_system_default && (
                      <Badge variant="outline" className="text-[10px]">
                        System
                      </Badge>
                    )}
                    {!serviceType.is_active && (
                      <Badge variant="secondary" className="text-[10px]">
                        Inactive
                      </Badge>
                    )}
                  </DialogTitle>
                  <DialogDescription className="font-mono text-xs mt-1">
                    {serviceType.slug}
                  </DialogDescription>
                </div>
              </div>
              {serviceType.description && (
                <p className="text-sm text-muted-foreground pt-2">
                  {serviceType.description}
                </p>
              )}
            </DialogHeader>

            <div className="space-y-5 pt-2">
              {/* Scope */}
              <Section title="Scope">
                <ScopeBlock
                  scopeLevel={serviceType.scope_level}
                  institutionIds={serviceType.institution_ids ?? []}
                  degreeIds={serviceType.degree_ids ?? []}
                  departmentIds={serviceType.department_ids ?? []}
                  programIds={serviceType.program_ids ?? []}
                  lookups={lookups}
                />
              </Section>

              {/* Configuration grid */}
              <Section title="Configuration">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <InfoRow
                    label="Approval Workflow"
                    value={
                      <Badge variant="secondary" className="capitalize">
                        {serviceType.approval_workflow_type}
                      </Badge>
                    }
                  />
                  <InfoRow
                    label="Max Active Requests"
                    value={String(serviceType.max_active_requests)}
                  />
                  <InfoRow
                    label="Auto-Fulfill on Approval"
                    value={serviceType.auto_fulfill_on_approval ? 'Yes' : 'No'}
                  />
                  {serviceType.validity_period_days != null && (
                    <InfoRow
                      label="Validity Period"
                      value={`${serviceType.validity_period_days} days`}
                    />
                  )}
                  <InfoRow
                    label="Created"
                    value={format(new Date(serviceType.created_at), 'MMM dd, yyyy')}
                  />
                  <InfoRow
                    label="Updated"
                    value={format(new Date(serviceType.updated_at), 'MMM dd, yyyy')}
                  />
                </div>

                <div className="flex items-center gap-4 pt-3 border-t mt-3">
                  <CapabilityTag
                    enabled={serviceType.enable_attachments}
                    icon={Paperclip}
                    label="Attachments"
                  />
                  <CapabilityTag
                    enabled={serviceType.enable_priority}
                    icon={Flag}
                    label="Priority"
                  />
                  <CapabilityTag
                    enabled={serviceType.enable_email_notifications}
                    icon={Mail}
                    label="Email"
                  />
                </div>
              </Section>

              {/* Allowed Roles */}
              <Section title={`Allowed Roles (${serviceType.allowed_roles?.length ?? 0})`}>
                {serviceType.allowed_roles && serviceType.allowed_roles.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {serviceType.allowed_roles.map((role) => (
                      <Badge key={role} variant="outline" className="capitalize">
                        {role.replace(/_/g, ' ')}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No roles configured</p>
                )}
              </Section>

              {/* Form Fields */}
              <Section title={`Form Fields (${serviceType.fields?.length ?? 0})`}>
                {serviceType.fields && serviceType.fields.length > 0 ? (
                  <div className="space-y-2">
                    {[...serviceType.fields]
                      .sort((a, b) => a.display_order - b.display_order)
                      .map((field) => (
                        <div
                          key={field.id}
                          className="flex items-center justify-between p-2.5 rounded-md border"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">
                                {field.field_label}
                              </span>
                              {field.is_required && (
                                <Badge variant="destructive" className="text-[10px]">
                                  Required
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground font-mono truncate">
                              {field.field_key}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-xs capitalize">
                            {field.field_type}
                          </Badge>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No fields configured</p>
                )}
              </Section>

              {/* Approval Steps */}
              <Section
                title={`Approval Steps (${serviceType.approval_steps?.length ?? 0})`}
              >
                {serviceType.approval_steps &&
                serviceType.approval_steps.length > 0 ? (
                  <div className="space-y-2">
                    {[...serviceType.approval_steps]
                      .sort((a, b) => a.step_order - b.step_order)
                      .map((step) => (
                        <div
                          key={step.id}
                          className="flex items-center gap-3 p-2.5 rounded-md border"
                        >
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
                            {step.step_order}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium truncate">
                              {step.step_name}
                            </span>
                            <p className="text-xs text-muted-foreground capitalize">
                              {step.approver_role.replace(/_/g, ' ')}
                            </p>
                          </div>
                          {step.is_required && (
                            <Badge variant="outline" className="text-[10px]">
                              Required
                            </Badge>
                          )}
                          <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No approval steps configured
                  </p>
                )}
              </Section>
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" asChild>
                <Link href={`/service-requests/types/${serviceType.id}`}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open Full Page
                </Link>
              </Button>
              <Button asChild>
                <Link href={`/service-requests/types/${serviceType.id}/edit`}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Link>
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function CapabilityTag({
  enabled,
  icon: Icon,
  label,
}: {
  enabled: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 text-xs',
        enabled ? 'text-foreground' : 'text-muted-foreground/50'
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>
        {label}: {enabled ? 'On' : 'Off'}
      </span>
    </div>
  );
}

function ScopeBlock({
  scopeLevel,
  institutionIds,
  degreeIds,
  departmentIds,
  programIds,
  lookups,
}: {
  scopeLevel: string;
  institutionIds: string[];
  degreeIds: string[];
  departmentIds: string[];
  programIds: string[];
  lookups: ReturnType<typeof useScopeLookups>;
}) {
  const cfg = SERVICE_TYPE_SCOPE_CONFIG[scopeLevel as keyof typeof SERVICE_TYPE_SCOPE_CONFIG];
  const Icon = SCOPE_ICONS[scopeLevel as keyof typeof SCOPE_ICONS];

  const ids =
    scopeLevel === 'institution'
      ? institutionIds
      : scopeLevel === 'degree'
      ? degreeIds
      : scopeLevel === 'department'
      ? departmentIds
      : scopeLevel === 'program'
      ? programIds
      : [];
  const names = resolveScopeNames(scopeLevel, ids, lookups);

  return (
    <div className="space-y-2">
      <Badge className={cn('text-xs gap-1', cfg.color)}>
        <Icon className="h-3 w-3" />
        {cfg.label}
      </Badge>
      {scopeLevel === 'common' ? (
        <p className="text-sm text-muted-foreground">
          Available to all users across every institution.
        </p>
      ) : names.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No {scopeLevel}s selected for this scope.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {names.map((name, i) => (
            <Badge key={i} variant="secondary" className="text-xs font-normal">
              {name}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
