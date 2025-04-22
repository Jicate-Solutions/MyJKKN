import type { Application } from '@/types/applications';

export interface ApplicationApiFilters {
  category?: string;
  search?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface ApplicationApiResponse {
  data: Application[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export class ApplicationApiService {
  /**
   * Fetch applications using an API key with role-based access control
   * @param apiKey - The API key to use for authentication
   * @param filters - Optional filters to apply to the application list
   * @param baseUrl - Optional base URL for the API (defaults to current origin)
   */
  static async getApplications(
    apiKey: string,
    filters: ApplicationApiFilters = {},
    baseUrl?: string
  ): Promise<ApplicationApiResponse> {
    try {
      // Build query parameters
      const params = new URLSearchParams();

      if (filters.category) params.append('category', filters.category);
      if (filters.search) params.append('search', filters.search);
      if (filters.isActive !== undefined)
        params.append('isActive', String(filters.isActive));
      if (filters.page) params.append('page', String(filters.page));
      if (filters.limit) params.append('limit', String(filters.limit));

      // Determine the base URL (use provided or current origin)
      const apiBase =
        baseUrl ||
        (typeof window !== 'undefined' ? window.location.origin : '');
      const url = `${apiBase}/api/api-management/applications?${params.toString()}`;

      // Make the request with the API key in the Authorization header
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || errorData.message || 'Failed to fetch applications'
        );
      }

      const data = await response.json();

      // Validate response structure
      if (!data || !Array.isArray(data.data)) {
        throw new Error('Invalid response format from the server');
      }

      return data;
    } catch (error) {
      console.error('Error fetching applications with API key:', error);
      throw error instanceof Error
        ? error
        : new Error('Unknown error occurred');
    }
  }

  /**
   * Fetch a specific application by ID using an API key with role-based access control
   * @param apiKey - The API key to use for authentication
   * @param id - The ID of the application to fetch
   * @param baseUrl - Optional base URL for the API (defaults to current origin)
   */
  static async getApplicationById(
    apiKey: string,
    id: string,
    baseUrl?: string
  ): Promise<Application> {
    try {
      // Determine the base URL (use provided or current origin)
      const apiBase =
        baseUrl ||
        (typeof window !== 'undefined' ? window.location.origin : '');
      const url = `${apiBase}/api/api-management/applications/${id}`;

      // Make the request with the API key in the Authorization header
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || errorData.message || 'Failed to fetch application'
        );
      }

      // Parse the response data
      const data = await response.json();

      // Handle both possible response formats (direct object or wrapper)
      return data;
    } catch (error) {
      console.error(`Error fetching application ${id} with API key:`, error);
      throw error instanceof Error
        ? error
        : new Error('Unknown error occurred');
    }
  }
}
