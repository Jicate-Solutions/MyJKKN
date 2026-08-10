// Industry Partners — directory of the companies each institution partners with.
//
// Reads `public.industry_partners`. This is NOT `/cdc/industry-mentors`, which
// reads the separate `industry_mentors` table (individual people who mentor
// learners). Same word, different table, different module.
//
// Server component: the list is fetched on the cookie-scoped client so RLS does
// the institution scoping. Read-only — the business-card scanner is currently
// the only writer, so there is no "Add partner" affordance here.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Building2, Mail, MapPin, Phone, ShieldCheck } from 'lucide-react';

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
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

import { createClient } from '@/lib/supabase/server';
import { listIndustryPartners } from '@/lib/services/cdc/industry-partner-service';
import {
  PARTNERSHIP_TYPES,
  PARTNERSHIP_TYPE_LABELS,
  type IndustryPartner,
  type PartnershipType,
} from '@/types/cdc/industry-partners';
import {
  PartnerFilters,
  type PartnerStatusFilter,
} from './_components/partner-filters';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function parseStatus(raw: string): PartnerStatusFilter {
  return raw === 'inactive' || raw === 'all' ? raw : 'active';
}

function parseType(raw: string): PartnershipType | null {
  return (PARTNERSHIP_TYPES as readonly string[]).includes(raw)
    ? (raw as PartnershipType)
    : null;
}

function buildQuery(base: Record<string, string>, page: number): string {
  const params = new URLSearchParams(base);
  if (page > 1) params.set('page', String(page));
  else params.delete('page');
  const qs = params.toString();
  return qs ? `/industry-partners?${qs}` : '/industry-partners';
}

function PartnerCard({ partner }: { partner: IndustryPartner }) {
  const location = [partner.city, partner.state].filter(Boolean).join(', ');

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={`/industry-partners/${partner.id}`}
              className="font-medium text-sm hover:underline"
            >
              {partner.company_name}
            </Link>
            {partner.industry_sector && (
              <p className="text-xs text-muted-foreground truncate">
                {partner.industry_sector}
                {partner.company_size ? ` · ${partner.company_size}` : ''}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!partner.is_active && (
              <Badge variant="secondary" className="text-xs">
                Inactive
              </Badge>
            )}
            {partner.is_verified && (
              <Badge variant="outline" className="text-xs gap-1">
                <ShieldCheck className="h-3 w-3" />
                Verified
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">
              {PARTNERSHIP_TYPE_LABELS[partner.partnership_type] ??
                partner.partnership_type}
            </Badge>
          </div>
        </div>

        {partner.contact_person && (
          <p className="text-xs text-muted-foreground mt-2">
            {partner.contact_person}
            {partner.contact_designation
              ? ` — ${partner.contact_designation}`
              : ''}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
          {partner.contact_email && (
            <span className="flex items-center gap-1 truncate">
              <Mail className="h-3 w-3 shrink-0" />
              {partner.contact_email}
            </span>
          )}
          {partner.contact_phone && (
            <span className="flex items-center gap-1">
              <Phone className="h-3 w-3 shrink-0" />
              {partner.contact_phone}
            </span>
          )}
          {location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0" />
              {location}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function IndustryPartnersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  const sp = await searchParams;
  const search = first(sp.q);
  const status = parseStatus(first(sp.status));
  const partnershipType = parseType(first(sp.type));
  const pageRaw = Number.parseInt(first(sp.page), 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  let partners: IndustryPartner[] = [];
  let total = 0;
  let loadError: string | null = null;

  try {
    const result = await listIndustryPartners({
      search: search || undefined,
      status,
      partnershipType: partnershipType ?? undefined,
      page,
      limit: PAGE_SIZE,
    });
    partners = result.partners;
    total = result.total;
  } catch (e) {
    loadError = (e as Error).message;
  }

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  const baseQuery: Record<string, string> = {};
  if (search) baseQuery.q = search;
  if (status !== 'active') baseQuery.status = status;
  if (partnershipType) baseQuery.type = partnershipType;

  const hasFilters =
    Boolean(search) || status !== 'active' || Boolean(partnershipType);

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
                <BreadcrumbPage>Industry Partners</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Building2 className="h-6 w-6" />
              Industry Partners
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {total} partner{total !== 1 ? 's' : ''} visible to you. Records are
              created by the business-card scanner; this directory is read-only.
            </p>
          </div>

          <Separator />

          <PartnerFilters
            search={search}
            status={status}
            partnershipType={partnershipType}
          />

          {loadError && (
            <Alert variant="destructive">
              <AlertDescription>
                Could not load industry partners: {loadError}
              </AlertDescription>
            </Alert>
          )}

          {!loadError && partners.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              {hasFilters ? (
                <>
                  <p>No partners match these filters.</p>
                  <Button asChild variant="outline" className="mt-4">
                    <Link href="/industry-partners">Clear filters</Link>
                  </Button>
                </>
              ) : (
                <>
                  <p>No industry partners recorded yet.</p>
                  <p className="text-xs mt-1">
                    Partners appear here once a business card is scanned and
                    routed to &ldquo;Industry partner&rdquo;.
                  </p>
                </>
              )}
            </div>
          )}

          {partners.length > 0 && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {partners.map((p) => (
                  <PartnerCard key={p.id} partner={p} />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      asChild={page > 1}
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                    >
                      {page > 1 ? (
                        <Link href={buildQuery(baseQuery, page - 1)}>
                          Previous
                        </Link>
                      ) : (
                        <span>Previous</span>
                      )}
                    </Button>
                    <Button
                      asChild={page < totalPages}
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                    >
                      {page < totalPages ? (
                        <Link href={buildQuery(baseQuery, page + 1)}>Next</Link>
                      ) : (
                        <span>Next</span>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
