'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useCampaign } from '@/hooks/admission/use-campaigns';
import { AttributionModeToggle } from '@/components/admission/marketing/attribution-mode-toggle';
import { PermissionGuard } from '@/components/auth/permission-guard';
import type { AttributionMode } from '@/types/admission/campaign';

interface AttributedLeadRow {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string;
  stage: string;
  created_at: string;
  first_campaign_link_id: string | null;
  last_campaign_link_id: string | null;
}

function useAttributedLeads(campaignId: string, mode: AttributionMode) {
  return useQuery({
    queryKey: ['campaigns', 'attributed-leads', campaignId, mode] as const,
    queryFn: async (): Promise<AttributedLeadRow[]> => {
      const client = createClientSupabaseClient();
      // Find every link belonging to this campaign, then leads whose
      // first/last/any link sits in that set.
      const { data: linkRows } = await client
        .from('admission_campaign_links')
        .select('id')
        .eq('campaign_id', campaignId);
      const linkIds = (linkRows ?? []).map((l) => l.id);
      if (linkIds.length === 0) return [];

      let q = client
        .from('admission_leads')
        .select(
          'id, first_name, last_name, phone, stage, created_at, first_campaign_link_id, last_campaign_link_id',
        );
      if (mode === 'first') {
        q = q.in('first_campaign_link_id', linkIds);
      } else if (mode === 'last') {
        q = q.in('last_campaign_link_id', linkIds);
      } else {
        // 'any' — leads whose first OR last touched a link in this campaign
        q = q.or(
          `first_campaign_link_id.in.(${linkIds.join(',')}),last_campaign_link_id.in.(${linkIds.join(',')})`,
        );
      }
      const { data, error } = await q
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as AttributedLeadRow[];
    },
    enabled: !!campaignId,
    staleTime: 30_000,
  });
}

export default function CampaignLeadsPage() {
  const { id } = useParams<{ id: string }>();
  // 'any' default keeps this view consistent with the campaign detail page
  // and the per-link capture_count — every lead a campaign has touched
  // counts (including re-captures merged into existing leads).
  const [mode, setMode] = useState<AttributionMode>('any');
  const { data: campaign } = useCampaign(id);
  const { data: leads, isLoading } = useAttributedLeads(id, mode);

  if (!campaign) return <div className="p-6">Loading…</div>;

  return (
    <PermissionGuard module="admission.marketing" action="view">
      <div className="space-y-4 p-6">
        <Link
          href={`/admission/marketing/campaigns/${id}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {campaign.name}
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-semibold">Attributed leads</h1>
          <AttributionModeToggle value={mode} onChange={setMode} />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>
              {leads?.length ?? 0} lead{leads?.length === 1 ? '' : 's'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-32 animate-pulse rounded bg-muted" />
            ) : !leads || leads.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No leads attributed to this campaign yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Captured</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <Link
                          href={`/admission/leads/${l.id}`}
                          className="font-medium hover:underline"
                        >
                          {l.first_name} {l.last_name ?? ''}
                        </Link>
                      </TableCell>
                      <TableCell>{l.phone}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{l.stage}</Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(l.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </PermissionGuard>
  );
}
