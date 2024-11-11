import { UserRole, Institution, Department } from './auth';

export interface UserListResponse {
  data: UserList[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface UserList {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  institution: Institution | null;
  department: Department | null;
  profile_completed: boolean;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
}

export interface UserFilters {
  search?: string;
  role?: UserRole;
  institution?: Institution;
  isActive?: boolean;
  page?: number;
  limit?: number;
}
