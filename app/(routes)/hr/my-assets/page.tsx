'use client';

/**
 * /hr/my-assets — staff-facing filtered view of resources currently assigned
 * to the logged-in user.
 *
 * Wave 1.5 PR-3. Reads the assignee_type + assignee_id columns added to the
 * `resources` table by PR-1 (commit c3b123be2 / PR #893). Filter is:
 *   resources.assignee_type = 'staff'
 *   AND resources.assignee_id = (staff.id where staff.profile_id = auth.uid())
 *   AND resources.returned_at IS NULL
 *
 * Page is read-only — return-flow lives in /resource-management/* until a
 * later PR adds self-service "Mark as returned" here.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Laptop } from 'lucide-react';
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
import { useAuth } from '@/hooks/use-auth';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { Resource } from '@/types/resource-management';

const STATUS_LABELS: Record<string, string> = {
  available: 'Available',
  occupied: 'In Use',
  maintenance: 'Maintenance',
  out_of_order: 'Out of Order',
  retired: 'Retired',
};

const STATUS_COLORS: Record<string, string> = {
  available: 'bg-green-100 text-green-900 dark:bg-green-900/20 dark:text-green-200',
  occupied: 'bg-blue-100 text-blue-900 dark:bg-blue-900/20 dark:text-blue-200',
  maintenance: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-200',
  out_of_order: 'bg-red-100 text-red-900 dark:bg-red-900/20 dark:text-red-200',
  retired: 'bg-gray-100 text-gray-900 dark:bg-gray-900/20 dark:text-gray-200',
};

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function MyAssetsPage() {
  const { profile, isLoading: authLoading } = useAuth();
  const [staffId, setStaffId] = useState<string | null>(null);
  const [staffLookupError, setStaffLookupError] = useState<string | null>(null);
  const [assets, setAssets] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detect HR officer role so we can show the institution-wide overview link.
  const isHrOfficer = useMemo(() => {
    const roles = profile?.user_roles ?? [];
    return (
      profile?.is_super_admin === true ||
      roles.some((r) => r.role_key === 'hr_officer' || r.role_key === 'hr_head')
    );
  }, [profile]);

  // Step 1: resolve staff.id from the authenticated profile.id.
  useEffect(() => {
    if (!profile?.id) return;

    const supabase = createClientSupabaseClient();
    (async () => {
      const { data, error } = await (supabase as any)
        .from('staff')
        .select('id')
        .eq('profile_id', profile.id)
        .maybeSingle();

      if (error) {
        setStaffLookupError(error.message);
        return;
      }
      setStaffId((data as { id: string } | null)?.id ?? null);
    })();
  }, [profile?.id]);

  // Step 2: fetch resources assigned to this staff member.
  useEffect(() => {
    if (!staffId) return;

    const supabase = createClientSupabaseClient();
    setLoading(true);
    setError(null);

    (async () => {
      const { data, error } = await (supabase as any)
        .from('resources')
        .select(
          `
          *,
          parent_category:resource_parent_categories(id, name),
          subcategory:resource_sub_categories(id, name)
        `
        )
        .eq('assignee_type', 'staff')
        .eq('assignee_id', staffId)
        .is('returned_at', null)
        .order('assigned_at', { ascending: false });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      setAssets((data as Resource[]) ?? []);
      setLoading(false);
    })();
  }, [staffId]);

  return (
    <ContentLayout title="My Assets">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/hr">HR</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>My Assets</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Laptop className="h-4 w-4" />
                  Equipment currently assigned to you
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Read-only list scoped to your staff record. Speak to your HR
                  officer to request new equipment or to mark items as returned.
                </p>
              </div>
              {isHrOfficer && (
                <Button asChild variant="outline" size="sm" className="shrink-0">
                  <Link href="/resource-management/resources">
                    View all institution assets →
                  </Link>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {authLoading && (
              <p className="text-sm text-muted-foreground">Loading…</p>
            )}

            {!authLoading && !profile?.id && (
              <p className="text-sm text-muted-foreground">
                You need to be signed in to view your assets.
              </p>
            )}

            {staffLookupError && (
              <p className="text-sm text-red-700 dark:text-red-400">
                Could not resolve your staff record: {staffLookupError}
              </p>
            )}

            {!authLoading && profile?.id && !staffId && !staffLookupError && (
              <p className="text-sm text-muted-foreground">
                No staff record linked to your profile yet. Ask HR to complete
                your onboarding.
              </p>
            )}

            {loading && (
              <p className="text-sm text-muted-foreground">Loading assets…</p>
            )}

            {error && (
              <p className="text-sm text-red-700 dark:text-red-400">
                Failed to load assets: {error}
              </p>
            )}

            {!loading && !error && staffId && assets.length === 0 && (
              <div className="rounded-md border border-dashed p-6 text-center">
                <p className="text-sm font-medium">No assets assigned.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Speak to your HR officer to request equipment.
                </p>
                <div className="mt-3">
                  <Button asChild variant="outline" size="sm">
                    <Link href="/hr/onboarding">Go to onboarding →</Link>
                  </Button>
                </div>
              </div>
            )}

            {!loading && assets.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground border-b">
                    <tr>
                      <th className="py-2 pr-4 font-medium">Asset</th>
                      <th className="py-2 pr-4 font-medium">Category</th>
                      <th className="py-2 pr-4 font-medium">Asset Code</th>
                      <th className="py-2 pr-4 font-medium">Assigned</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assets.map((a) => {
                      const cat = (a as any).parent_category?.name ?? '—';
                      const sub = (a as any).subcategory?.name;
                      return (
                        <tr key={a.id} className="border-b last:border-0">
                          <td className="py-3 pr-4">
                            <div className="font-medium">{a.name}</div>
                            {a.description && (
                              <div className="text-xs text-muted-foreground line-clamp-1">
                                {a.description}
                              </div>
                            )}
                          </td>
                          <td className="py-3 pr-4 text-xs">
                            <div>{cat}</div>
                            {sub && (
                              <div className="text-muted-foreground">{sub}</div>
                            )}
                          </td>
                          <td className="py-3 pr-4 font-mono text-xs">
                            {a.resource_code ?? '—'}
                          </td>
                          <td className="py-3 pr-4 text-xs">
                            {formatDate(a.assigned_at)}
                          </td>
                          <td className="py-3 pr-4">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-medium ${
                                STATUS_COLORS[a.status] ??
                                STATUS_COLORS.available
                              }`}
                            >
                              {STATUS_LABELS[a.status] ?? a.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
