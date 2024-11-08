// lib/services/application-service.ts

import type {
  ApiEndpoint,
  Application,
  CreateApplicationDTO,
  UpdateApplicationDTO
} from '@/types/applications';
import { toast } from 'react-hot-toast';

export interface ApplicationListResponse {
  data: Application[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ApplicationFilters {
  category?: string;
  search?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export class ApplicationService {
  static async getApplications(
    filters: ApplicationFilters = {}
  ): Promise<ApplicationListResponse> {
    try {
      // Build query parameters
      const params = new URLSearchParams();
      if (filters.category) params.append('category', filters.category);
      if (filters.search) params.append('search', filters.search);
      if (filters.isActive !== undefined)
        params.append('isActive', String(filters.isActive));
      if (filters.page) params.append('page', String(filters.page));
      if (filters.limit) params.append('limit', String(filters.limit));

      const response = await fetch(`/api/applications?${params.toString()}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch applications');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching applications:', error);
      throw error;
    }
  }

  static async getApplicationById(id: string): Promise<Application> {
    try {
      const response = await fetch(`/api/applications/${id}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch application');
      }
      return await response.json();
    } catch (error) {
      console.error(`Error fetching application ${id}:`, error);
      throw error;
    }
  }

  static async createApplication(data: CreateApplicationDTO): Promise<Application> {
    try {
      // Validate support contact if provided
      if (data.support_contact) {
        if (!data.support_contact.email || !data.support_contact.name) {
          throw new Error('Support contact name and email are required');
        }
      }
  
      // Validate API endpoints if provided
      if (data.api_endpoints && data.api_endpoints.length > 0) {
        data.api_endpoints.forEach((endpoint, index) => {
          if (!this.validateEndpointConfig(endpoint)) {
            throw new Error(`Invalid configuration for API endpoint ${index + 1}`);
          }
        });
      }
  
      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
  
      const responseData = await response.json();
  
      if (!response.ok) {
        if (
          responseData.code === '23505' &&
          responseData.message.includes('applications_name_key')
        ) {
          throw new Error('An application with this name already exists');
        }
        throw new Error(responseData.message || 'Failed to create application');
      }
  
      toast.success('Application created successfully');
      return responseData;
    } catch (error) {
      console.error('Error creating application:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to create application'
      );
      throw error;
    }
  }

  static async updateApplication(
    id: string,
    data: UpdateApplicationDTO
  ): Promise<Application> {
    try {
      // Validate support contact if provided
      if (data.support_contact) {
        if (!data.support_contact.email || !data.support_contact.name) {
          throw new Error('Support contact name and email are required');
        }
      }
  
      // Validate API endpoints if provided
      if (data.api_endpoints && data.api_endpoints.length > 0) {
        data.api_endpoints.forEach((endpoint, index) => {
          if (!this.validateEndpointConfig(endpoint)) {
            throw new Error(`Invalid configuration for API endpoint ${index + 1}`);
          }
        });
      }
  
      const response = await fetch(`/api/applications/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
  
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update application');
      }
  
      const result = await response.json();
      toast.success('Application updated successfully');
      return result;
    } catch (error) {
      console.error(`Error updating application ${id}:`, error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to update application'
      );
      throw error;
    }
  }

  static async deleteApplication(id: string): Promise<void> {
    try {
      const response = await fetch(`/api/applications/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete application');
      }

      toast.success('Application deleted successfully');
    } catch (error) {
      console.error(`Error deleting application ${id}:`, error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete application'
      );
      throw error;
    }
  }

  // Helper methods for data validation and transformation
  static async validateApplicationData(
    data: CreateApplicationDTO | UpdateApplicationDTO
  ): Promise<string[]> {
    const errors: string[] = [];

    if ('url' in data && data.url && !data.url.startsWith('https://')) {
      errors.push('URL must start with https://');
    }

    if ('name' in data && (!data.name || data.name.trim().length < 2)) {
      errors.push('Name must be at least 2 characters long');
    }

    return errors;
  }

  static getAvailableCategories(): string[] {
    return [
      'Core Systems',
      'Student Services',
      'Academic',
      'Administrative',
      'Healthcare',
      'Library',
      'Research',
      'Other'
    ];
  }

  static getAvailableRoles(): string[] {
    return ['student', 'faculty', 'staff', 'administrator', 'super_admin'];
  }

  static getIntegrationTypes(): string[] {
    return ['direct_link', 'embedded', 'api'];
  }

  static getAuthMethods(): string[] {
    return ['sso', 'separate_login', 'none'];
  }

  static getPlatformTypes(): string[] {
    return ['web', 'mobile', 'both'];
  }

  static getApplicationTypes(): string[] {
    return ['internal', 'external'];
  }

  static getSensitivityLevels(): string[] {
    return ['public', 'restricted', 'confidential'];
  }


  // Add this helper method in ApplicationService class
static validateEndpointConfig(endpoint: ApiEndpoint): boolean {
  return (
    endpoint.name.length >= 2 &&
    endpoint.url.startsWith('https://') &&
    ['GET', 'POST', 'PUT', 'DELETE'].includes(endpoint.method)
  );
}


}

