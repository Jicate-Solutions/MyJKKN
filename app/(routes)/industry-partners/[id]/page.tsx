// Industry Partner — detail view.
//
// Read-only. Everything on this page comes from one `industry_partners` row,
// fetched on the cookie-scoped server client so RLS decides visibility.
//
// Rule of the house: a permission failure must be explicit, never a silent
// bounce. If the row is invisible (RLS) or absent (bad id), both come back as
// null and we say so in words on the page rather than redirecting.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  ExternalLink,
  FileText,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Star,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

import { createClient } from '@/lib/supabase/server';
import { getIndustryPartner } from '@/lib/services/cdc/industry-partner-service';
import {
  PARTNERSHIP_TYPE_LABELS,
  type IndustryPartner,
} from '@/types/cdc/industry-partners';

export const dynamic = 'force-dynamic';

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm mt-0.5 break-words">{value || '—'}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function PartnerDetail({ partner }: { partner: IndustryPartner }) {
  const address = [
    partner.address_line1,
    partner.address_line2,
    partner.city,
    partner.state,
    partner.pincode,
    partner.country,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Building2 className="h-6 w-6 shrink-0" />
            <span className="break-words">{partner.company_name}</span>
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Badge variant="outline">
              {PARTNERSHIP_TYPE_LABELS[partner.partnership_type] ??
                partner.partnership_type}
            </Badge>
            {partner.industry_sector && (
              <Badge variant="secondary">{partner.industry_sector}</Badge>
            )}
            {partner.is_verified ? (
              <Badge variant="outline" className="gap-1">
                <ShieldCheck className="h-3 w-3" />
                Verified {partner.verified_at ? formatDate(partner.verified_at) : ''}
              </Badge>
            ) : (
              <Badge variant="secondary">Not verified</Badge>
            )}
            {!partner.is_active && <Badge variant="secondary">Inactive</Badge>}
          </div>
        </div>

        <Button asChild variant="outline" size="sm">
          <Link href="/industry-partners">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to directory
          </Link>
        </Button>
      </div>

      {partner.company_description && (
        <p className="text-sm text-muted-foreground whitespace-pre-line">
          {partner.company_description}
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat
          label="Internships offered"
          value={partner.total_internships_offered ?? 0}
        />
        <Stat label="Placements" value={partner.total_placements ?? 0} />
        <Stat
          label="Projects offered"
          value={partner.total_projects_offered ?? 0}
        />
        <Stat
          label="Average rating"
          value={
            partner.average_rating != null ? (
              <span className="flex items-center gap-1">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                {partner.average_rating.toFixed(1)}
              </span>
            ) : (
              '—'
            )
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Primary contact</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Contact person" value={partner.contact_person} />
              <Field label="Designation" value={partner.contact_designation} />
              <Field
                label="Email"
                value={
                  partner.contact_email ? (
                    <a
                      href={`mailto:${partner.contact_email}`}
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      <Mail className="h-3 w-3" />
                      {partner.contact_email}
                    </a>
                  ) : null
                }
              />
              <Field
                label="Phone"
                value={
                  partner.contact_phone ? (
                    <a
                      href={`tel:${partner.contact_phone}`}
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      <Phone className="h-3 w-3" />
                      {partner.contact_phone}
                    </a>
                  ) : null
                }
              />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Company</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Sector" value={partner.industry_sector} />
              <Field label="Size" value={partner.company_size} />
              <Field
                label="Website"
                value={
                  partner.company_website ? (
                    <a
                      href={partner.company_website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 hover:underline break-all"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      {partner.company_website}
                    </a>
                  ) : null
                }
              />
              <Field
                label="Address"
                value={
                  address ? (
                    <span className="inline-flex items-start gap-1">
                      <MapPin className="h-3 w-3 mt-1 shrink-0" />
                      {address}
                    </span>
                  ) : null
                }
              />
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Partnership
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Field
                label="Type"
                value={
                  PARTNERSHIP_TYPE_LABELS[partner.partnership_type] ??
                  partner.partnership_type
                }
              />
              <Field
                label="Start date"
                value={formatDate(partner.partnership_start_date)}
              />
              <Field
                label="End date"
                value={formatDate(partner.partnership_end_date)}
              />
              <Field label="Value" value={partner.partnership_value} />
              <Field
                label="MoU document"
                value={
                  partner.mou_document_url ? (
                    <a
                      href={partner.mou_document_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      <FileText className="h-3 w-3" />
                      Open document
                    </a>
                  ) : null
                }
              />
              <Field label="Recorded on" value={formatDate(partner.created_at)} />
              <Field label="Last updated" value={formatDate(partner.updated_at)} />
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default async function IndustryPartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  const { id } = await params;

  let partner: IndustryPartner | null = null;
  let loadError: string | null = null;

  try {
    partner = await getIndustryPartner(id);
  } catch (e) {
    loadError = (e as Error).message;
  }

  return (
    <PermissionGuard
      module="cdc.industry_partners"
      action="view"
      fallback={
        <ContentLayout>
          <Alert variant="destructive">
            <AlertDescription>
              You do not have access to the Industry Partners directory. Ask an
              administrator to grant you the{' '}
              <code className="font-mono text-xs">
                cdc.industry_partners.view
              </code>{' '}
              permission in Role Management.
            </AlertDescription>
          </Alert>
        </ContentLayout>
      }
    >
      <ContentLayout>
        <div className="space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/dashboard">Dashboard</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/industry-partners">Industry Partners</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>
                  {partner?.company_name ?? 'Partner'}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <Separator />

          {loadError && (
            <Alert variant="destructive">
              <AlertDescription>
                Could not load this partner: {loadError}
              </AlertDescription>
            </Alert>
          )}

          {!loadError && !partner && (
            <Alert>
              <AlertDescription>
                This partner does not exist, or it belongs to an institution you
                cannot see. If you expected to find it here, ask an administrator
                to check your institution access.
              </AlertDescription>
            </Alert>
          )}

          {partner && <PartnerDetail partner={partner} />}
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
