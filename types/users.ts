import { Profile } from './auth';

export interface UserListResponse {
  data: Profile[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface UserFilters {
  role?: string;
  institution?: string;
  search?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface UserStats {
  total: number;
  active: number;
  inactive: number;
  byRole: {
    [key: string]: number;
  };
  byInstitution: {
    [key: string]: number;
  };
}

export interface RoleUpdateRequest {
  role: string;
}

export interface RoleUpdateResponse {
  success: boolean;
  user: Profile;
}
