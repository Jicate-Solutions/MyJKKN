import { useState, useEffect } from 'react';

interface FormResponse {
  id: string;
  form_id: string;
  source_id: string;
  respondent_id: string | null;
  data: any; // JSON object with form data
  status: string;
  follow_up_notes: string | null;
  follow_up_notes_history: any[]; // JSON array of note history
  next_follow_up_date: string | null;
  created_at: string;
  updated_at: string;
}

interface Pagination {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

interface UseFetchFormResponsesProps {
  apiKey: string;
  formId?: string;
  page?: number;
  perPage?: number;
  searchQuery?: string;
}

export function useFetchFormResponses({
  apiKey,
  formId,
  page = 1,
  perPage = 10,
  searchQuery = ''
}: UseFetchFormResponsesProps) {
  const [data, setData] = useState<FormResponse[] | null>(null);
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

        let url = `/api/proxy/crm?entity=form_responses&page=${page}&perPage=${perPage}`;
        if (formId) {
          url += `&form_id=${encodeURIComponent(formId)}`;
        }
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
        console.error('Error fetching form responses:', err);
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [apiKey, formId, page, perPage, searchQuery]);

  return { data, pagination, loading, error };
}
