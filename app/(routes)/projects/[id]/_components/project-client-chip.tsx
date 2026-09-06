'use client';

/**
 * Header chips linking a project back to the Solutions Hub client / solution
 * it delivers for. Renders nothing for internal (unlinked) projects, and
 * degrades to nothing if the viewer cannot read sh_clients / sh_solutions.
 */

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Building2, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { TAP_TARGET } from '@/app/(routes)/projects/_lib/tap-targets';

interface ProjectClientChipProps {
  clientId: string | null;
  solutionId: string | null;
}

export function ProjectClientChip({ clientId, solutionId }: ProjectClientChipProps) {
  const { data } = useQuery({
    queryKey: ['projects', 'client-chip', clientId ?? '', solutionId ?? ''],
    enabled: !!clientId || !!solutionId,
    staleTime: 60_000,
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const [clientRes, solutionRes] = await Promise.all([
        clientId
          ? supabase.from('sh_clients').select('id, name').eq('id', clientId).maybeSingle()
          : Promise.resolve({ data: null, error: null } as const),
        solutionId
          ? supabase.from('sh_solutions').select('id, title').eq('id', solutionId).maybeSingle()
          : Promise.resolve({ data: null, error: null } as const),
      ]);
      return {
        client: clientRes.error ? null : clientRes.data,
        solution: solutionRes.error ? null : solutionRes.data,
      };
    },
  });

  if (!clientId && !solutionId) return null;

  return (
    <>
      {data?.client && (
        <Link href={`/solutions/clients/${data.client.id}`} className={`inline-flex items-center ${TAP_TARGET}`}>
          <Badge variant="outline" className="gap-1 hover:bg-accent">
            <Building2 className="h-3 w-3" />
            {data.client.name}
          </Badge>
        </Link>
      )}
      {data?.solution && (
        <Link href={`/solutions/${data.solution.id}`} className={`inline-flex items-center ${TAP_TARGET}`}>
          <Badge variant="outline" className="gap-1 hover:bg-accent">
            <FileText className="h-3 w-3" />
            {data.solution.title}
          </Badge>
        </Link>
      )}
    </>
  );
}
