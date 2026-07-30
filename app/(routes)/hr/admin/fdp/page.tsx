// ============================================================================
// HR — FDP Catalog (Admin) — T5.4
// Spec: specs/hr-module-decomposition-2026-05-09.md §T5.4
// Created: 2026-06-22
//
// HR officer + super_admin surface. Lists FDP catalog entries that faculty
// can apply to. Officers can publish/unpublish (toggle is_catalog),
// view applications, and approve/reject.
// ============================================================================

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
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
import { Plus, ChevronRight, GraduationCap } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  FdpService,
  type FdpCatalogEntry,
} from '@/lib/services/hr/fdp-service';

export default function AdminFdpCatalogPage() {
  const [entries, setEntries] = useState<FdpCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClientSupabaseClient();
        // Admin index: include unpublished so HR can manage drafts.
        const rows = await FdpService.getCatalog(supabase, {
          includeUnpublished: true,
        });
        if (!cancelled) setEntries(rows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SuperAdminOnly>
    <ContentLayout title="HR — FDP Catalog">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/hr">HR</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/hr/admin">HR</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>FDP Catalog</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">FDP Catalog</h1>
            <p className="text-sm text-muted-foreground">
              Faculty Development Programme entries with sponsoring body,
              funding, and HoD/Director approval workflow.
            </p>
          </div>
          <Button asChild className="shrink-0">
            <Link href="/hr/admin/training/new?category=fdp">
              <Plus className="h-4 w-4 mr-1" /> New FDP
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <GraduationCap className="h-4 w-4" /> Entries ({entries.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading && (
              <p className="text-sm text-muted-foreground">Loading…</p>
            )}
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">
                Failed to load: {error}
              </p>
            )}
            {!loading && !error && entries.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No FDP entries yet. Create a training program with
                category=fdp and set fdp_application_metadata.is_catalog=true to
                surface it here.
              </p>
            )}
            {entries.length > 0 && (
              <div className="space-y-2">
                {entries.map((e) => {
                  const isCatalog =
                    e.fdp_application_metadata?.is_catalog === true;
                  return (
                    <Link
                      key={e.id}
                      href={`/hr/admin/fdp/${e.id}`}
                      className="border rounded-md p-3 hover:bg-muted/40 flex items-center justify-between gap-3 transition"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{e.title}</span>
                          {!isCatalog && (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-normal"
                            >
                              Draft (not in staff catalog)
                            </Badge>
                          )}
                          {e.sponsoring_body && (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-normal"
                            >
                              {e.sponsoring_body}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {e.start_date} → {e.end_date}
                          {e.external_faculty_name
                            ? ` · ${e.external_faculty_name}`
                            : ''}
                          {e.external_faculty_org
                            ? ` (${e.external_faculty_org})`
                            : ''}
                          {e.funding_amount
                            ? ` · ₹${Number(e.funding_amount).toLocaleString('en-IN')}`
                            : ''}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
    </SuperAdminOnly>
  );
}
