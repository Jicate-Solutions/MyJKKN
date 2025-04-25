import { useState, useEffect } from 'react';

interface Form {
  id: string;
  source_id: string;
  title: string;
  description: string | null;
  fields: any[]; // JSON array of field definitions
  status_options: any[]; // JSON array of status options
  is_published: boolean;
  published_url: string | null;
  banner_url: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  template_id: string | null;
  has_changes: boolean;
}

interface Pagination {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

interface UseFetchFormsProps {
  apiKey: string;
  page?: number;
  perPage?: number;
  searchQuery?: string;
}

export function useFetchForms({
  apiKey,
  page = 1,
  perPage = 10,
  searchQuery = ''
}: UseFetchFormsProps) {
  const [data, setData] = useState<Form[] | null>(null);
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
        let url = `/api/proxy/crm?entity=forms&page=${page}&perPage=${perPage}`;
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
        console.error('Error fetching forms:', err);
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [apiKey, page, perPage, searchQuery]);

  return { data, pagination, loading, error };
}
