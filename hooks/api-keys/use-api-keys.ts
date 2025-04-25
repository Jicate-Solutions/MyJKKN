import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';

interface ApiKey {
  id: string;
  key: string;
  name: string;
  expiresAt?: string;
  createdAt: string;
  isActive: boolean;
}

export function useApiKeys() {
  const [data, setData] = useState<ApiKey[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchApiKeys = async () => {
      try {
        setIsLoading(true);
        const supabase = getSupabaseClient();

        const { data: apiKeys, error } = await supabase
          .from('api_keys')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: false });

        if (error) {
          throw new Error(error.message);
        }

        setData(apiKeys);
      } catch (err) {
        setError(
          err instanceof Error ? err : new Error('Failed to fetch API keys')
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchApiKeys();
  }, []);

  return { data, isLoading, error };
}
