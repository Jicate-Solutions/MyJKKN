import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface YuvaVertical {
  id: string;
  name: string;
  sort_order: number | null;
}

async function fetchYuvaVerticals(): Promise<YuvaVertical[]> {
  const supabase = createClientSupabaseClient();
  const { data, error } = await supabase
    .from('yuva_verticals')
    .select('id, name, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true, nullsFirst: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as YuvaVertical[];
}

export function useYuvaVerticals(enabled = true) {
  return useQuery({
    queryKey: ['yuva-verticals'],
    queryFn: fetchYuvaVerticals,
    enabled,
    staleTime: 5 * 60 * 1000, // 5 min — verticals rarely change
  });
}
