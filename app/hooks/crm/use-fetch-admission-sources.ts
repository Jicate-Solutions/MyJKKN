import { useState, useEffect } from 'react';

interface AdmissionSource {
  id: string;
  name: string;
  type: string;
  description: string | null;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  commission_rate: number | null;
  shareable_link: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface Pagination {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

interface UseFetchAdmissionSourcesProps {
  apiKey: string;
  page?: number;
  perPage?: number;
  searchQuery?: string;
}

export function useFetchAdmissionSources({
  apiKey,
  page = 1,
  perPage = 10,
  searchQuery = ''
}: UseFetchAdmissionSourcesProps) {
  const [data, setData] = useState<AdmissionSource[] | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!apiKey) {
        setError(new Error('API key is required'));
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Use the proxy API endpoint
        let url = `/api/proxy/crm?entity=admission_sources&page=${page}&perPage=${perPage}`;
        if (searchQuery) {
          url += `&search=${encodeURIComponent(searchQuery)}`;
        }

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error(`Error: ${response.status}`);
        }

        const result = await response.json();

        // Check the response structure and handle it appropriately
        if (Array.isArray(result.data)) {
          // If data is directly an array
          setData(result.data);
          setPagination(result.pagination);
        } else if (
          result.data &&
          result.data.data &&
          Array.isArray(result.data.data)
        ) {
          // If data is nested (data.data structure)
          setData(result.data.data);
          setPagination(result.data.pagination);
        } else {
          console.error('Unexpected response structure:', result);
          throw new Error('Invalid response format from API');
        }
      } catch (err) {
        console.error('Error fetching admission sources:', err);
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [apiKey, page, perPage, searchQuery]);

  return { data, pagination, loading, error };
}
