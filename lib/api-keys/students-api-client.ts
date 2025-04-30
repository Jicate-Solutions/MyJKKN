import { StudentFilters } from '@/types/student';

export interface StudentsApiClient {
  getStudents: (
    apiKey: string,
    filters?: StudentFilters
  ) => Promise<{
    data: any[];
    metadata: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  }>;
  getStudent: (apiKey: string, id: string) => Promise<{ data: any }>;
}

export class StudentsApiClientImpl implements StudentsApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async getStudents(apiKey: string, filters: StudentFilters = {}) {
    // Construct the URL with query parameters
    const url = new URL(`${this.baseUrl}/api/api-management/students`);

    // Add query parameters
    if (filters.search) url.searchParams.append('search', filters.search);
    if (filters.page) url.searchParams.append('page', filters.page.toString());
    if (filters.limit)
      url.searchParams.append('limit', filters.limit.toString());
    if (filters.institution)
      url.searchParams.append('institution_id', filters.institution);
    if (filters.department)
      url.searchParams.append('department_id', filters.department);
    if (filters.program) url.searchParams.append('program_id', filters.program);
    if (filters.is_profile_complete !== undefined)
      url.searchParams.append(
        'is_profile_complete',
        filters.is_profile_complete.toString()
      );

    // Make the request
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to fetch students: ${response.status} ${errorText}`
      );
    }

    return response.json();
  }

  async getStudent(apiKey: string, id: string) {
    const url = `${this.baseUrl}/api/api-management/students/${id}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to fetch student: ${response.status} ${errorText}`
      );
    }

    return response.json();
  }
}

// Factory function to create a new students API client
export function createStudentsApiClient(baseUrl: string): StudentsApiClient {
  return new StudentsApiClientImpl(baseUrl);
}
