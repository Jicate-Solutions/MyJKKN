import { useState, useEffect } from 'react';

interface UseApiKeyResult {
  apiKey: string | null;
  loading: boolean;
  error: Error | null;
}

export function useApiKey(): UseApiKeyResult {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchApiKey = async () => {
      try {
        setLoading(true);

        const response = await fetch('/api/crm/api-key');

        if (!response.ok) {
          throw new Error(`Failed to fetch API key: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.apiKey) {
          throw new Error('API key not found in server response');
        }

        setApiKey(data.apiKey);
      } catch (err) {
        console.error('Error fetching API key:', err);
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setLoading(false);
      }
    };

    fetchApiKey();
  }, []);

  return { apiKey, loading, error };
}
