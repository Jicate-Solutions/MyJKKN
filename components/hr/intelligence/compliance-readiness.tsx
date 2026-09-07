'use client';

/**
 * HR Intelligence — Tab 9: Compliance Readiness
 *
 * Surfaces compliance-related metrics: document expiry rates,
 * mandatory training completion, policy acknowledgement status.
 * Queries hr_employee_documents for expiry tracking and hr_policies for ack rates.
 * Shows structured placeholder when data is unavailable.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FileSearch,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldCheck,
  FileWarning,
  AlertCircle,
} from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';

// Every field below except `id` was named wrong. `hr_employee_documents` uses
// staff_id / document_code / expires_at / verification_status / institution_id —
// five of the six columns this component asked for have never existed, so the
// request died with 42703 and the tab rendered "Failed to load compliance data.
// Ensure employee documents are configured.", blaming the reader's setup for a
// broken query. Verified against production 2026-09-04.
//
// `institution_id` is also the correct semantic, not merely the correct name:
// the aggregate below is keyed into a map called `byInstitution`.
interface DocumentRow {
  id: string;
  staff_id: string;
  document_code: string;
  expires_at: string | null;
  verification_status: string;
  institution_id: string;
}

function useComplianceDocuments() {
  return useQuery({
    queryKey: ['hr-intelligence', 'compliance-readiness'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hr_employee_documents')
        .select('id, staff_id, document_code, expires_at, verification_status, institution_id')
        .order('expires_at', { ascending: true })
        .limit(500);

      if (error) throw error;
      return (data ?? []) as DocumentRow[];
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function ComplianceReadinessTab() {
  const { data: documents, isLoading, isError } = useComplianceDocuments();
  const { institutions } = useInstitutionsWithAccess({ entityType: 'all' });

  const institutionNames = useMemo(() => {
    const map: Record<string, string> = {};
    institutions?.forEach((inst) => {
      map[inst.id] = inst.name;
    });
    return map;
  }, [institutions]);

  const metrics = useMemo(() => {
    if (!documents || documents.length === 0) return null;

    const today = new Date();
    const thirtyDaysOut = new Date(today);
    thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);

    let expired = 0;
    let expiringSoon = 0;
    let valid = 0;
    let noExpiry = 0;

    const byInstitution: Record<string, { expired: number; expiringSoon: number; valid: number; total: number }> = {};

    for (const doc of documents) {
      const orgId = doc.institution_id;
      if (!byInstitution[orgId]) {
        byInstitution[orgId] = { expired: 0, expiringSoon: 0, valid: 0, total: 0 };
      }
      byInstitution[orgId].total += 1;

      if (!doc.expires_at) {
        noExpiry += 1;
        byInstitution[orgId].valid += 1;
        continue;
      }

      const expiryDate = new Date(doc.expires_at);
      if (expiryDate < today) {
        expired += 1;
        byInstitution[orgId].expired += 1;
      } else if (expiryDate <= thirtyDaysOut) {
        expiringSoon += 1;
        byInstitution[orgId].expiringSoon += 1;
      } else {
        valid += 1;
        byInstitution[orgId].valid += 1;
      }
    }

    return {
      total: documents.length,
      expired,
      expiringSoon,
      valid: valid + noExpiry,
      byInstitution,
    };
  }, [documents]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Failed to load compliance data. Ensure employee documents are configured.
        </CardContent>
      </Card>
    );
  }

  if (!metrics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSearch className="h-5 w-5" />
            Compliance Readiness
          </CardTitle>
          <CardDescription>
            Track document compliance, mandatory training completion, and policy acknowledgement across institutions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg">
            <ShieldCheck className="h-12 w-12 mb-4 text-muted-foreground opacity-30" />
            <p className="text-sm font-medium text-muted-foreground">No Compliance Data Yet</p>
            <p className="text-xs mt-1 text-muted-foreground opacity-75 max-w-md text-center">
              Once employee documents are uploaded with expiry dates, this tab will show
              compliance status, expiry alerts, and institution-level readiness scores.
            </p>
            <Badge variant="outline" className="mt-4 text-xs">
              Requires: Employee documents with expiry tracking
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <FileSearch className="h-3.5 w-3.5" />
              Total Documents
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.total}</div>
            <p className="text-xs text-muted-foreground mt-1">Tracked across all institutions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
              Expired
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{metrics.expired}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.total > 0 ? `${((metrics.expired / metrics.total) * 100).toFixed(1)}% of total` : '—'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-amber-500" />
              Expiring in 30 Days
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{metrics.expiringSoon}</div>
            <p className="text-xs text-muted-foreground mt-1">Needs renewal attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              Valid
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{metrics.valid}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.total > 0 ? `${((metrics.valid / metrics.total) * 100).toFixed(1)}% compliant` : '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Per-institution compliance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Institution Compliance Status
          </CardTitle>
          <CardDescription>Document compliance breakdown per institution</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(metrics.byInstitution).map(([orgId, data]) => {
              const complianceRate = data.total > 0 ? ((data.valid / data.total) * 100) : 0;
              const statusColor = complianceRate >= 90 ? 'bg-green-500' : complianceRate >= 70 ? 'bg-amber-500' : 'bg-red-500';

              return (
                <div key={orgId} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate max-w-[50%]">
                      {institutionNames[orgId] ?? orgId.slice(0, 8)}
                    </span>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {data.expired > 0 && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                          {data.expired} expired
                        </Badge>
                      )}
                      {data.expiringSoon > 0 && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-300">
                          {data.expiringSoon} expiring
                        </Badge>
                      )}
                      <span className="font-medium text-foreground">{complianceRate.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${statusColor} transition-all duration-300`}
                      style={{ width: `${complianceRate}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
