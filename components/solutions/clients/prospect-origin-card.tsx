'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, GitBranch, Calendar, IndianRupee, User } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { Prospect } from '@/lib/services/solutions/types';

interface ProspectOriginCardProps {
  clientId: string;
}

/**
 * Local hook to fetch the prospect that was converted into this client.
 * Uses a direct Supabase query against sh_prospects.converted_client_id.
 * When the other agent adds useProspectByClientId to use-prospects.ts,
 * this can be swapped to import from there instead.
 */
function useProspectByClientId(clientId: string) {
  return useQuery<Prospect | null>({
    queryKey: ['solutions-hub', 'prospects', 'by-client', clientId],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      // sh_prospects is not in generated DB types yet, cast to any for the query
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('sh_prospects')
        .select('*, assigned_user:profiles!assigned_to(id, full_name, avatar_url)')
        .eq('converted_client_id', clientId)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as Prospect | null);
    },
    enabled: !!clientId,
  });
}

export function ProspectOriginCard({ clientId }: ProspectOriginCardProps) {
  const { data: prospect, isLoading } = useProspectByClientId(clientId);

  // Don't render anything for direct-created clients or while loading
  if (isLoading || !prospect) return null;

  const createdDate = new Date(prospect.created_at);
  const wonDate = new Date(prospect.updated_at || prospect.created_at);
  const daysInPipeline = Math.max(
    1,
    Math.floor((wonDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24))
  );

  return (
    <Card className="border-blue-200 bg-blue-50/50">
      <CardContent className="py-4">
        <div className="flex items-center gap-2 mb-3">
          <GitBranch className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium text-blue-800">Converted from Pipeline</span>
          <Badge variant="outline" className="text-blue-700 border-blue-300">
            <Link
              href={`/solutions/pipeline/${prospect.id}`}
              className="hover:underline flex items-center gap-1"
            >
              {prospect.prospect_code}
              <ArrowRight className="h-3 w-3" />
            </Link>
          </Badge>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Pipeline Entry
            </p>
            <p className="font-medium">
              {createdDate.toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Days in Pipeline</p>
            <p className="font-medium">{daysInPipeline} days</p>
          </div>
          {prospect.expected_deal_size && (
            <div>
              <p className="text-muted-foreground flex items-center gap-1">
                <IndianRupee className="h-3 w-3" /> Deal Size
              </p>
              <p className="font-medium">
                {'\u20B9'}
                {Number(prospect.expected_deal_size).toLocaleString('en-IN')}
              </p>
            </div>
          )}
          {prospect.assigned_user && (
            <div>
              <p className="text-muted-foreground flex items-center gap-1">
                <User className="h-3 w-3" /> Sales Owner
              </p>
              <p className="font-medium">{prospect.assigned_user.full_name}</p>
            </div>
          )}
        </div>
        {prospect.solution_type_interest && (
          <div className="mt-2">
            <Badge variant="secondary" className="capitalize">
              {prospect.solution_type_interest}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
