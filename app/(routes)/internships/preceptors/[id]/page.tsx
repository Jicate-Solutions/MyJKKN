'use client';

/**
 * Preceptor detail / edit — MOBILE-FIRST per spec acceptance criterion #12
 * (line 254): "Hospital portal works on mobile + 3G connection (preceptor 24/7
 * use case)." Layout uses single-column stacks at default; the existing nav
 * shell collapses on small screens via the global mobile bottom navbar.
 *
 * Surfaces:
 *   - Preceptor profile (read-only with Edit toggle, non-auth fields)
 *   - Currently assigned learners (active or pending assignments)
 *   - Recent completed rotations (history snapshot)
 *   - Audit trail (created/updated timestamps)
 */

import Link from 'next/link';
import { use, useMemo, useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BeatLoader } from 'react-spinners';
import {
  AlertCircle,
  ArrowLeft,
  Edit,
  X,
  Phone,
  Mail,
  Stethoscope,
  Building2,
  GraduationCap,
  ClipboardList,
  ClipboardCheck,
  CalendarClock,
  UserCircle,
  ShieldCheck,
} from 'lucide-react';
import { usePreceptor, useUpdatePreceptor } from '@/hooks/internships/usePreceptors';
import { useSite } from '@/hooks/internships/useSites';
import { useAssignments } from '@/hooks/internships/useAssignments';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import {
  PreceptorForm,
  preceptorToFormValues,
  formValuesToCreatePayload,
  type PreceptorFormValues,
} from '../../_components/preceptors/preceptor-form';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { NoAccessAlert } from '../../_components/no-access-alert';

const SCOPE_HINT: Record<string, string> = {
  cycle: 'Authority limited to current cycle',
  site: 'Authority across all learners at this site',
  institution: 'Authority across the whole institution',
};

export default function PreceptorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <PermissionGuard module="internship.preceptors" action="view" fallback={<NoAccessAlert />}>
      <PreceptorDetailPageInner params={params} />
    </PermissionGuard>
  );
}

function PreceptorDetailPageInner({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: preceptor, isLoading, error } = usePreceptor(id);
  const update = useUpdatePreceptor();
  const { data: site } = useSite(preceptor?.site_id);
  const { data: assignments = [], isLoading: assignmentsLoading } = useAssignments();
  const { institutions } = useUserInstitutionAccess();
  const [isEditing, setIsEditing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const institutionLookup = useMemo(() => {
    const m = new Map<string, string>();
    institutions.forEach((i) => m.set(i.institution_id, i.institution_name));
    return m;
  }, [institutions]);

  // Active or pending assignments where this preceptor is the named supervisor.
  const myAssignments = useMemo(() => {
    return assignments.filter(
      (a) =>
        a.preceptor_id === id && (a.status === 'active' || a.status === 'pending')
    );
  }, [assignments, id]);

  // Completed past assignments (history snapshot).
  const pastAssignments = useMemo(() => {
    return assignments
      .filter((a) => a.preceptor_id === id && a.status === 'completed')
      .slice(0, 5);
  }, [assignments, id]);

  const handleSubmit = async (values: PreceptorFormValues) => {
    setSubmitError(null);
    try {
      await update.mutateAsync({ id, updates: formValuesToCreatePayload(values) });
      setIsEditing(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to update preceptor');
    }
  };

  return (
    <ContentLayout title={preceptor ? `Preceptors — ${preceptor.full_name}` : 'Preceptor'}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/">Home</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/internships">Internships</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/internships/preceptors">Preceptors</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{preceptor?.full_name ?? '…'}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Mobile-first: max-w-2xl keeps reading width comfortable; cards stack. */}
      <div className="mt-4 sm:mt-6 space-y-3 sm:space-y-4 max-w-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/internships/preceptors">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          {preceptor && !isEditing && (
            <Button size="sm" onClick={() => setIsEditing(true)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}
          {isEditing && (
            <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
              <X className="mr-2 h-4 w-4" />
              Cancel edit
            </Button>
          )}
        </div>

        {isLoading && (
          <div className="flex justify-center py-12">
            <BeatLoader color="#3b82f6" />
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error instanceof Error ? error.message : 'Failed to load preceptor'}</span>
          </div>
        )}

        {preceptor && submitError && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        {preceptor && isEditing && (
          <PreceptorForm
            initialValues={preceptorToFormValues(preceptor)}
            onSubmit={handleSubmit}
            onCancel={() => setIsEditing(false)}
            submitLabel="Save changes"
            submitting={update.isPending}
            lockSite
          />
        )}

        {preceptor && !isEditing && (
          <>
            <Card>
              <CardHeader>
                <div className="space-y-1">
                  <CardTitle className="text-xl flex items-start gap-2">
                    <Stethoscope className="h-5 w-5 mt-1 shrink-0" />
                    <span className="break-words">{preceptor.full_name}</span>
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    {preceptor.is_active ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-gray-50 text-gray-600">
                        Inactive
                      </Badge>
                    )}
                    <Badge variant="outline" className="capitalize">
                      <ShieldCheck className="h-3 w-3 mr-1" />
                      {preceptor.scope_type} scope
                    </Badge>
                    {preceptor.qualification && (
                      <Badge variant="secondary">{preceptor.qualification}</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {preceptor.designation && (
                  <DetailRow
                    icon={<UserCircle className="h-4 w-4" />}
                    label="Designation"
                    value={preceptor.designation}
                  />
                )}
                {preceptor.specialization && (
                  <DetailRow
                    icon={<GraduationCap className="h-4 w-4" />}
                    label="Specialization"
                    value={preceptor.specialization}
                  />
                )}
                {site && (
                  <DetailRow
                    icon={<Building2 className="h-4 w-4" />}
                    label="Primary site"
                    value={
                      <Link
                        href={`/internships/sites/${site.id}`}
                        className="hover:underline"
                      >
                        {site.site_name}
                      </Link>
                    }
                    secondary={institutionLookup.get(site.institution_id)}
                  />
                )}
                {!site && (
                  <DetailRow
                    icon={<Building2 className="h-4 w-4" />}
                    label="College"
                    value={institutionLookup.get(preceptor.institution_id) ?? preceptor.institution_id}
                  />
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  {preceptor.mobile && (
                    <a
                      href={`tel:${preceptor.mobile.replace(/\s+/g, '')}`}
                      className="flex items-center gap-2 rounded-md border p-3 hover:bg-muted/40"
                    >
                      <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">
                          Mobile
                        </div>
                        <div className="font-medium truncate">{preceptor.mobile}</div>
                      </div>
                    </a>
                  )}
                  {preceptor.email && (
                    <a
                      href={`mailto:${preceptor.email}`}
                      className="flex items-center gap-2 rounded-md border p-3 hover:bg-muted/40"
                    >
                      <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">
                          Email
                        </div>
                        <div className="font-medium truncate">{preceptor.email}</div>
                      </div>
                    </a>
                  )}
                </div>
                <DetailRow
                  icon={<UserCircle className="h-4 w-4" />}
                  label="Max concurrent students"
                  value={`${preceptor.max_students}`}
                />
                <DetailRow
                  icon={<ShieldCheck className="h-4 w-4" />}
                  label="Sign-off scope"
                  value={`${preceptor.scope_type}`}
                  secondary={SCOPE_HINT[preceptor.scope_type]}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" />
                  Currently assigned learners
                  <span className="text-sm text-muted-foreground">({myAssignments.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {assignmentsLoading && (
                  <div className="flex justify-center py-4">
                    <BeatLoader color="#3b82f6" size={8} />
                  </div>
                )}
                {!assignmentsLoading && myAssignments.length === 0 && (
                  <div className="text-sm text-muted-foreground py-2">
                    No active learners.
                  </div>
                )}
                {!assignmentsLoading && myAssignments.length > 0 && (
                  <ul className="divide-y">
                    {myAssignments.map((a) => (
                      <li key={a.id} className="py-3 space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-mono text-xs text-muted-foreground">
                            Learner {a.learner_id.slice(0, 8)}…
                          </div>
                          <Badge
                            variant="outline"
                            className={
                              a.status === 'active'
                                ? 'bg-green-50 text-green-700 border-green-300'
                                : 'bg-amber-50 text-amber-700 border-amber-300'
                            }
                          >
                            {a.status}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock className="h-3 w-3" />
                            {a.start_date} → {a.end_date}
                          </span>
                          {a.department && <span>{a.department}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {pastAssignments.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ClipboardCheck className="h-4 w-4" />
                    Recent completed rotations
                    <span className="text-sm text-muted-foreground">
                      ({pastAssignments.length})
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y">
                    {pastAssignments.map((a) => (
                      <li key={a.id} className="py-2 text-xs text-muted-foreground">
                        Learner {a.learner_id.slice(0, 8)}… · {a.start_date} → {a.end_date}
                        {a.department ? ` · ${a.department}` : ''}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Audit trail</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-muted-foreground">
                <div>Created: {new Date(preceptor.created_at).toLocaleString()}</div>
                <div>Last updated: {new Date(preceptor.updated_at).toLocaleString()}</div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ContentLayout>
  );
}

function DetailRow({
  icon,
  label,
  value,
  secondary,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  secondary?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-sm break-words">{value}</div>
      {secondary && (
        <div className="text-xs text-muted-foreground">{secondary}</div>
      )}
    </div>
  );
}
