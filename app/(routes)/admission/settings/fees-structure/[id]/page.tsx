'use client';

// app/(routes)/admission/settings/fees-structure/[id]/page.tsx
//
// Detail / edit page for an existing fee structure. Loads the structure
// with its items + joined display names. Top: read-only summary card showing
// the 8 dimensions. Body: the FeesStructureForm in edit mode (existing
// structure) — admin can edit name, status, and items inline.

import { use, useEffect, useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { AdmissionErrorBoundary } from '@/components/admission';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { FeesStructureForm } from '../_components/fees-structure-form';
import { FeeStructureService } from '@/lib/services/admission/fee-structure-service';
import type { AdmissionFeeStructureWithItems, FeeStructureMatrixDimensions } from '@/types/admission';

interface RouteProps {
  params: Promise<{ id: string }>;
}

function FeeStructureDetailPageContent({ id }: { id: string }) {
  const [structure, setStructure] = useState<AdmissionFeeStructureWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    FeeStructureService.getWithItems(id)
      .then((row) => {
        if (!row) {
          setError('Fee structure not found.');
        } else {
          setStructure(row);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id, refreshTick]);

  const handleChanged = () => setRefreshTick((t) => t + 1);

  // Build the dims object from the loaded structure for FeesStructureForm
  const dims: Partial<FeeStructureMatrixDimensions> | null = structure
    ? {
        institution_id: structure.institution_id,
        degree_id: structure.degree_id,
        department_id: structure.department_id,
        programme_id: structure.programme_id,
        quota_id: structure.quota_id,
        community_category_id: structure.community_category_id,
        accommodation_type_id: structure.accommodation_type_id,
        admission_year_id: structure.admission_year_id,
      }
    : null;

  return (
    <PermissionGuard module="admission.settings" action="view">
      <ContentLayout title={structure?.name ?? 'Fee Structure'}>
        <div className="space-y-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/">Dashboard</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/admission/dashboard">Admission</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/admission/settings">Settings</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/admission/settings/fees-structure">Fee Structures</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{structure?.name ?? 'Detail'}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold py-1">
                  {structure?.name ?? 'Fee Structure'}
                </h1>
                {structure && (
                  <Badge
                    variant={
                      structure.status === 'active'
                        ? 'default'
                        : structure.status === 'draft'
                        ? 'secondary'
                        : 'outline'
                    }
                  >
                    {structure.status}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                View dimensions, edit items + status, or activate/archive.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/admission/settings/fees-structure">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back to list
              </Link>
            </Button>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="border border-destructive/50 bg-destructive/5 rounded-md p-4">
              <p className="text-sm text-destructive">{error}</p>
              <Button asChild variant="outline" size="sm" className="mt-2">
                <Link href="/admission/settings/fees-structure">
                  <ArrowLeft className="h-4 w-4 mr-1" /> Back to list
                </Link>
              </Button>
            </div>
          )}

          {structure && !loading && !error && dims && (
            <>
              {/* Dimensions summary card (read-only — dims are immutable on
                  an existing structure; to change them, archive this and
                  create a new structure with the new combo) */}
              <div className="rounded-md border bg-muted/30 p-4">
                <h2 className="text-sm font-medium mb-3">Matrix Dimensions</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <DimRow label="Institution" value={structure.institution_id} />
                  <DimRow label="Degree" value={structure.degree_id} />
                  <DimRow label="Department" value={structure.department_id} />
                  <DimRow label="Programme" value={structure.programme_id} />
                  <DimRow label="Admission Year" value={structure.admission_year_id} />
                  <DimRow label="Quota" value={structure.quota_id} />
                  <DimRow label="Community" value={structure.community_category_id} />
                  <DimRow label="Accommodation" value={structure.accommodation_type_id} />
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  To change any dimension, archive this structure and create a new one with
                  the desired combination via the New Fee Structure page.
                </p>
              </div>

              {/* Edit form */}
              <div className="border rounded-md p-4 bg-card">
                <FeesStructureForm dims={dims} onChanged={handleChanged} />
              </div>
            </>
          )}
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

function DimRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-mono text-[10px] truncate" title={value ?? ''}>
        {value ?? '—'}
      </div>
    </div>
  );
}

export default function FeeStructureDetailPage({ params }: RouteProps) {
  // Next.js 15+ async params — unwrap with React `use()`.
  const { id } = use(params);
  return (
    <AdmissionErrorBoundary>
      <FeeStructureDetailPageContent id={id} />
    </AdmissionErrorBoundary>
  );
}
