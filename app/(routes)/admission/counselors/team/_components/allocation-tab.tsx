'use client';

// allocation-tab.tsx
// Tab 3: Institution + source mapping per counselor.
// Reads admission_counselor_institutions + admission_counselor_sources.
// Both junction tables may be empty pre-Phase-7 — empty state handled gracefully.

import {
  useCounselorMembers,
  useCounselorInstitutions,
  useCounselorSources,
} from '@/hooks/admission/use-counselor-team-data';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Building2, Globe, AlertCircle } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

interface AllocationTabProps {
  institutionId: string | undefined;
}

export function AllocationTab({ institutionId }: AllocationTabProps) {
  const { data: members = [], isLoading: loadingMembers } = useCounselorMembers(institutionId);
  const { data: instRows = [], isLoading: loadingInst, error: instError } = useCounselorInstitutions(institutionId);
  const { data: srcRows = [], isLoading: loadingSrc, error: srcError } = useCounselorSources(institutionId);

  const isLoading = loadingMembers || loadingInst || loadingSrc;
  const error = instError || srcError;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-36 rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        <AlertCircle className="h-5 w-5 flex-shrink-0" />
        <p className="text-sm">{(error as Error).message}</p>
      </div>
    );
  }

  // Build per-counselor maps
  const instByCounselor = new Map<string, string[]>();
  for (const row of instRows) {
    const arr = instByCounselor.get(row.counselor_id) ?? [];
    arr.push(row.institution_id);
    instByCounselor.set(row.counselor_id, arr);
  }

  const srcByCounselor = new Map<string, string[]>();
  for (const row of srcRows) {
    const arr = srcByCounselor.get(row.counselor_id) ?? [];
    arr.push(row.source);
    srcByCounselor.set(row.counselor_id, arr);
  }

  const hasAnyAllocation = instRows.length > 0 || srcRows.length > 0;

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center text-muted-foreground">
        <Building2 className="mb-4 h-12 w-12 opacity-40" />
        <p className="font-medium">No counselors found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!hasAnyAllocation && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          No allocation data yet — institution and source mappings will appear after Phase 7 seeding.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {members.map((m) => {
          const institutions = instByCounselor.get(m.id) ?? [];
          const sources = srcByCounselor.get(m.id) ?? [];

          return (
            <Card key={m.id}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-xs">{initials(m.name)}</AvatarFallback>
                  </Avatar>
                  {m.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Institutions */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5 text-xs text-muted-foreground font-medium">
                    <Building2 className="h-3.5 w-3.5" />
                    Institutions
                  </div>
                  {institutions.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {institutions.map((id) => (
                        <Badge key={id} variant="outline" className="text-xs font-mono">
                          {id.slice(0, 8)}…
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">None assigned</p>
                  )}
                </div>

                {/* Sources */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5 text-xs text-muted-foreground font-medium">
                    <Globe className="h-3.5 w-3.5" />
                    Lead Sources
                  </div>
                  {sources.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {sources.map((src) => (
                        <Badge key={src} variant="secondary" className="text-xs capitalize">
                          {src.replace(/_/g, ' ')}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">All sources</p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
