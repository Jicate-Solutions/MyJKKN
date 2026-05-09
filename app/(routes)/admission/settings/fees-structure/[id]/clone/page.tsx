'use client';

// app/(routes)/admission/settings/fees-structure/[id]/clone/page.tsx
//
// Full-edit clone flow. Mirrors the /new page layout but pre-fills every
// field from the source structure: matrix dimensions, name, status, notes,
// effective dates, communities, and line items. The operator can edit any
// field before saving — useful when "the same fees apply to a different
// programme/quota/community" but a few amounts or a date need tweaking.
//
// On save, calls FeeStructureService.create (the same path as /new). The
// source structure is left untouched.

import { Suspense, use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { ArrowLeft, Loader2, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { AdmissionErrorBoundary } from '@/components/admission';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { FeesStructureDimensionSelector } from '../../_components/fees-structure-dimension-selector';
import { NewStructureForm } from '../../_components/fees-structure-form';
import { FeeStructureService } from '@/lib/services/admission/fee-structure-service';
import { BillingCategoryService } from '@/lib/services/billing/categories/billing-category-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { FeeStructureMatrixDimensions } from '@/types/admission';
import type { BillingCategory } from '@/types/billing';

interface RouteProps {
  params: Promise<{ id: string }>;
}

interface Community {
  id: string;
  name: string;
}

// Items as the form expects them (the schema only stores billing_category_id,
// amount, is_optional — sort_order is computed at submit time from index).
interface FormItem {
  billing_category_id: string;
  amount: number;
  is_optional: boolean;
}

// Local prefill shape — matches the optional `initialValues` prop on
// NewStructureForm. Kept loose here so we can populate it from the source
// detail row without having to import its zod-inferred type.
interface Prefill {
  name: string;
  status: 'draft' | 'active';
  notes: string;
  effective_from: string;
  effective_to: string;
  community_category_ids: string[];
  items: FormItem[];
}

function CloneFeeStructurePageContent({ id }: { id: string }) {
  const router = useRouter();

  const [sourceName, setSourceName] = useState<string>('');
  const [categories, setCategories] = useState<BillingCategory[]>([]);
  const [communityOptions, setCommunityOptions] = useState<Community[]>([]);
  const [selectedDims, setSelectedDims] = useState<Partial<FeeStructureMatrixDimensions>>({});
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const supabase = createClientSupabaseClient();

    Promise.all([
      FeeStructureService.getDetailById(id),
      BillingCategoryService.getActiveBillingCategories(),
      // Communities are pulled directly because the LookupService variant
      // filters by institution and clone needs the global list (the source
      // structure may carry communities from a different institution scope).
      (supabase as any)
        .from('community_categories')
        .select('id, name')
        .order('name')
        .then(({ data, error: e }: { data: Community[] | null; error: any }) => {
          if (e) throw e;
          return data ?? [];
        }),
    ])
      .then(([source, cats, comms]) => {
        if (cancelled) return;
        if (!source) {
          setError('Source fee structure not found.');
          setLoading(false);
          return;
        }
        setCategories(cats);
        setCommunityOptions(comms);
        setSourceName(source.name);

        // Pre-fill all 7 matrix dims from source.
        setSelectedDims({
          institution_id: source.institution_id,
          degree_id: source.degree_id,
          department_id: source.department_id,
          programme_id: source.programme_id,
          quota_id: source.quota_id,
          accommodation_type_id: source.accommodation_type_id,
          admission_year_id: source.admission_year_id,
        });

        // Pre-fill the form values. Adding "(cloned)" to the name avoids
        // accidental duplicate-name conflicts when a structure has a unique
        // name index, and signals the operator should rename it.
        setPrefill({
          name: `${source.name} (cloned)`,
          status: 'draft',
          notes: source.notes ?? '',
          effective_from: source.effective_from ?? '',
          effective_to: source.effective_to ?? '',
          community_category_ids: source.community_category_ids ?? [],
          items: source.items
            .slice()
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((it) => ({
              billing_category_id: it.billing_category_id,
              amount: Number(it.amount),
              is_optional: it.is_optional,
            })),
        });
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load source structure');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleCloned = () => {
    // After the new structure is created the source is untouched; head back
    // to the list page so the operator sees the new row at the top
    // (list orders by updated_at desc).
    router.push('/admission/settings/fees-structure');
  };

  const allDimsSelected = !!(
    selectedDims.institution_id &&
    selectedDims.degree_id &&
    selectedDims.department_id &&
    selectedDims.programme_id &&
    selectedDims.admission_year_id &&
    selectedDims.quota_id &&
    selectedDims.accommodation_type_id
  );

  return (
    <PermissionGuard module="admission.settings" action="view">
      <ContentLayout title={sourceName ? `Clone: ${sourceName}` : 'Clone Fee Structure'}>
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
                <BreadcrumbLink asChild>
                  <Link href={`/admission/settings/fees-structure/${id}`}>
                    {sourceName || 'Source'}
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Clone</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold py-1 flex items-center gap-2">
                <Copy className="h-5 w-5" />
                Clone Fee Structure
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground">
                Pre-filled from{' '}
                <strong className="text-foreground">{sourceName || 'source'}</strong>. Edit
                any field — matrix dimensions, communities, line items, dates, status — then
                save. The source structure stays untouched.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={`/admission/settings/fees-structure/${id}`}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back to source
              </Link>
            </Button>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-16">
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

          {!loading && !error && prefill && (
            <>
              <FeesStructureDimensionSelector
                selectedDims={selectedDims}
                onChange={setSelectedDims}
              />

              {allDimsSelected ? (
                <div className="border rounded-md p-4 bg-card">
                  {/* The dimension selector above already covers all 7 matrix
                      dims, so we don't pass a leafCommunityId — the form's
                      community multi-select is fully editable from the prefilled
                      list. heading/description/primaryActionLabel are themed to
                      match the clone semantics so users don't think they're
                      editing the source. */}
                  <NewStructureForm
                    dims={selectedDims as FeeStructureMatrixDimensions}
                    leafCommunityId={null}
                    categories={categories}
                    communityOptions={communityOptions}
                    onCreated={() => {
                      toast.success('Cloned fee structure created');
                      handleCloned();
                    }}
                    onCancel={() =>
                      router.push(`/admission/settings/fees-structure/${id}`)
                    }
                    initialValues={prefill}
                    heading="Clone — review & customize"
                    description="Every field below is pre-filled from the source. Adjust any subset — line items, communities, dates — then save the new structure."
                    primaryActionLabel="Create Clone & Activate"
                  />
                </div>
              ) : (
                <div className="border rounded-md p-8 bg-muted/30 text-center text-sm text-muted-foreground">
                  All 7 dimensions are pre-filled from the source — clear or change any
                  dimension to retarget the clone.
                </div>
              )}
            </>
          )}
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function CloneFeeStructurePage({ params }: RouteProps) {
  const { id } = use(params);
  return (
    <AdmissionErrorBoundary>
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <CloneFeeStructurePageContent id={id} />
      </Suspense>
    </AdmissionErrorBoundary>
  );
}
