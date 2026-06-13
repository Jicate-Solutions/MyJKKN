'use client';

/**
 * Site detail / edit — read-only by default, becomes editable on toggle.
 *
 * Also lists preceptors attached to this site (via internship_preceptors.site_id —
 * the shipped substrate models the relationship there, not in a separate junction
 * table).
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
  Building2,
  Edit,
  X,
  MapPin,
  Phone,
  Mail,
  CalendarClock,
  UserCircle,
  Plus,
  Radar,
  Ambulance,
  IndianRupee,
} from 'lucide-react';
import { useSite, useUpdateSite, useSiteTypes } from '@/hooks/internships/useSites';
import { usePreceptors } from '@/hooks/internships/usePreceptors';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import {
  SiteForm,
  siteToFormValues,
  formValuesToCreatePayload,
  type SiteFormValues,
} from '../../_components/sites/site-form';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { NoAccessAlert } from '../../_components/no-access-alert';

const OWNERSHIP_LABELS: Record<string, string> = {
  private: 'Private',
  government: 'Government',
  university_affiliated: 'University-affiliated',
  trust: 'Trust',
  corporate: 'Corporate',
  ngo: 'NGO',
};

export default function SiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PermissionGuard module="internship.sites" action="view" fallback={<NoAccessAlert />}>
      <SiteDetailPageInner params={params} />
    </PermissionGuard>
  );
}

function SiteDetailPageInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: site, isLoading, error } = useSite(id);
  const update = useUpdateSite();
  const { data: preceptors = [], isLoading: preceptorsLoading } = usePreceptors(id);
  const { data: siteTypes = [] } = useSiteTypes();
  const { institutions } = useUserInstitutionAccess();
  const [isEditing, setIsEditing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const institutionLookup = useMemo(() => {
    const m = new Map<string, string>();
    institutions.forEach((i) => m.set(i.institution_id, i.institution_name));
    return m;
  }, [institutions]);

  const siteTypeLookup = useMemo(() => {
    const m = new Map<string, string>();
    siteTypes.forEach((t) => m.set(t.id, t.display_name));
    return m;
  }, [siteTypes]);

  const handleSubmit = async (values: SiteFormValues) => {
    setSubmitError(null);
    try {
      await update.mutateAsync({ id, updates: formValuesToCreatePayload(values) });
      setIsEditing(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to update site');
    }
  };

  return (
    <ContentLayout title={site ? `Sites — ${site.site_name}` : 'Site'}>
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
            <BreadcrumbLink asChild><Link href="/internships/sites">Sites</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{site?.site_name ?? '…'}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4 max-w-4xl">
        <div className="flex items-center justify-between gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/internships/sites">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to sites
            </Link>
          </Button>
          {site && !isEditing && (
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
            <span>{error instanceof Error ? error.message : 'Failed to load site'}</span>
          </div>
        )}

        {site && submitError && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        {site && isEditing && (
          <SiteForm
            initialValues={siteToFormValues(site)}
            onSubmit={handleSubmit}
            onCancel={() => setIsEditing(false)}
            submitLabel="Save changes"
            submitting={update.isPending}
          />
        )}

        {site && !isEditing && (
          <>
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <CardTitle className="text-xl flex items-center gap-2">
                      <Building2 className="h-5 w-5" />
                      {site.site_name}
                    </CardTitle>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="font-mono text-xs">
                        {site.hospital_code}
                      </Badge>
                      {site.site_type_id && (
                        <Badge variant="secondary">
                          {siteTypeLookup.get(site.site_type_id) ?? 'Unknown type'}
                        </Badge>
                      )}
                      <Badge variant="outline">
                        {OWNERSHIP_LABELS[site.ownership_type] ?? site.ownership_type}
                      </Badge>
                      {site.is_active ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-gray-50 text-gray-600">
                          Inactive
                        </Badge>
                      )}
                      {site.operates_weekends && (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
                          Weekend rotations
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2 text-sm">
                <DetailRow
                  icon={<UserCircle className="h-4 w-4" />}
                  label="College"
                  value={institutionLookup.get(site.institution_id) ?? site.institution_id}
                />
                <DetailRow
                  icon={<Building2 className="h-4 w-4" />}
                  label="Max learners per cycle"
                  value={site.max_learners_per_cycle != null ? `${site.max_learners_per_cycle}` : '—'}
                />
                <DetailRow
                  icon={<MapPin className="h-4 w-4" />}
                  label="Address"
                  value={[site.address_line1, site.address_line2, site.city, site.district, site.state, site.pincode]
                    .filter(Boolean)
                    .join(', ')}
                  className="md:col-span-2"
                />
                <DetailRow
                  icon={<Radar className="h-4 w-4" />}
                  label="Geofence"
                  value={`${site.latitude}, ${site.longitude} · ${site.geofence_radius_meters}m radius`}
                  className="md:col-span-2"
                />
                {site.departments_available?.length > 0 && (
                  <DetailRow
                    icon={<Building2 className="h-4 w-4" />}
                    label="Departments available"
                    value={site.departments_available.join(', ')}
                    className="md:col-span-2"
                  />
                )}
                {site.posting_fee_per_learner != null && (
                  <DetailRow
                    icon={<IndianRupee className="h-4 w-4" />}
                    label="Posting fee per learner"
                    value={`₹${Number(site.posting_fee_per_learner).toLocaleString('en-IN')}`}
                  />
                )}
                {(site.contract_start_date || site.contract_end_date) && (
                  <DetailRow
                    icon={<CalendarClock className="h-4 w-4" />}
                    label="Contract window"
                    value={`${site.contract_start_date ?? '—'} → ${site.contract_end_date ?? '—'}`}
                  />
                )}
                {site.notes && (
                  <DetailRow
                    icon={<CalendarClock className="h-4 w-4" />}
                    label="Notes"
                    value={site.notes}
                    className="md:col-span-2"
                  />
                )}
                <DetailRow
                  icon={<CalendarClock className="h-4 w-4" />}
                  label="Created"
                  value={new Date(site.created_at).toLocaleString()}
                />
                <DetailRow
                  icon={<CalendarClock className="h-4 w-4" />}
                  label="Last updated"
                  value={new Date(site.updated_at).toLocaleString()}
                />
              </CardContent>
            </Card>

            {(site.emergency_contact_name
              || site.emergency_contact_phone
              || site.ambulance_number
              || site.nearest_emergency_ward) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Ambulance className="h-4 w-4 text-red-600" />
                    Emergency contact
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2 text-sm">
                  {site.emergency_contact_name && (
                    <DetailRow
                      icon={<UserCircle className="h-4 w-4" />}
                      label="Contact name"
                      value={`${site.emergency_contact_name}${site.emergency_contact_role ? ` (${site.emergency_contact_role})` : ''}`}
                    />
                  )}
                  {site.emergency_contact_phone && (
                    <DetailRow
                      icon={<Phone className="h-4 w-4" />}
                      label="Phone"
                      value={site.emergency_contact_phone}
                    />
                  )}
                  {site.ambulance_number && (
                    <DetailRow
                      icon={<Ambulance className="h-4 w-4" />}
                      label="Ambulance"
                      value={site.ambulance_number}
                    />
                  )}
                  {site.nearest_emergency_ward && (
                    <DetailRow
                      icon={<MapPin className="h-4 w-4" />}
                      label="Nearest emergency ward"
                      value={site.nearest_emergency_ward}
                      className="md:col-span-2"
                    />
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    Preceptors at this site
                    {!preceptorsLoading && (
                      <span className="ml-2 text-sm text-muted-foreground">
                        ({preceptors.length})
                      </span>
                    )}
                  </CardTitle>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/internships/preceptors/new?site_id=${site.id}`}>
                      <Plus className="mr-2 h-3 w-3" />
                      Add preceptor
                    </Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {preceptorsLoading && (
                  <div className="flex justify-center py-6">
                    <BeatLoader color="#3b82f6" size={8} />
                  </div>
                )}
                {!preceptorsLoading && preceptors.length === 0 && (
                  <div className="text-center py-6 text-sm text-muted-foreground">
                    No preceptors assigned to this site yet.
                  </div>
                )}
                {!preceptorsLoading && preceptors.length > 0 && (
                  <ul className="divide-y">
                    {preceptors.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                        <div className="space-y-0.5">
                          <Link
                            href={`/internships/preceptors/${p.id}`}
                            className="font-medium hover:underline"
                          >
                            {p.full_name}
                          </Link>
                          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5">
                            {p.designation && <span>{p.designation}</span>}
                            {p.specialization && <span>{p.specialization}</span>}
                            {p.qualification && <span>{p.qualification}</span>}
                            {p.mobile && (
                              <span className="inline-flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {p.mobile}
                              </span>
                            )}
                            {p.email && (
                              <span className="inline-flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {p.email}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs capitalize">
                            {p.scope_type}
                          </Badge>
                          {p.is_active ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">Active</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-gray-50 text-gray-600">Inactive</Badge>
                          )}
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/internships/preceptors/${p.id}`}>View</Link>
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
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
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-sm break-words">{value}</div>
    </div>
  );
}
