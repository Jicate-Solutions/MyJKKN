import { Profile } from './auth';
import { DateRange } from 'react-day-picker';

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

// Enhanced User Dashboard Types
export interface UserDashboardStats {
  overview: {
    totalUsers: number;
    activeUsers: number;
    inactiveUsers: number;
    newUsersThisMonth: number;
    newUsersLastMonth: number;
    growthRate: number;
    profileCompletionRate: number;
    completeProfiles: number;
    incompleteProfiles: number;
    lastLoginWithin7Days: number;
    lastLoginWithin30Days: number;
    neverLoggedIn: number;
  };

  roleDistribution: Array<{
    role: string;
    roleDisplayName: string;
    count: number;
    percentage: number;
    activeCount: number;
    inactiveCount: number;
  }>;

  institutionStats: Array<{
    id: string;
    name: string;
    counsellingCode: string;
    totalUsers: number;
    activeUsers: number;
    byRole: Record<string, number>;
    percentage: number;
    lastActivity?: string;
  }>;

  registrationTrends: Array<{
    date: string;
    count: number;
    cumulative: number;
    byRole: Record<string, number>;
  }>;

  activityMetrics: {
    dailyActiveUsers: number;
    weeklyActiveUsers: number;
    monthlyActiveUsers: number;
    averageSessionDuration: number;
    loginFrequency: {
      daily: number;
      weekly: number;
      monthly: number;
      rarely: number;
    };
  };

  geographicDistribution: Array<{
    state: string;
    district: string;
    userCount: number;
    percentage: number;
  }>;

  securityMetrics: {
    accountsWithRecentPasswordChanges: number;
    suspendedAccounts: number;
    accountsRequiringAttention: number;
    twoFactorEnabled: number;
  };

  statusTransitions: Array<{
    date: string;
    fromStatus: string;
    toStatus: string;
    count: number;
    reason?: string;
  }>;

  topUsers: {
    mostActiveUsers: Array<{
      id: string;
      name: string;
      email: string;
      role: string;
      institution?: string;
      loginCount?: number;
      lastLogin: string;
    }>;
    recentRegistrations: Array<{
      id: string;
      name: string;
      email: string;
      role: string;
      institution?: string;
      registeredAt: string;
    }>;
  };
}

export interface UserDashboardFilters {
  dateRange?: DateRange;
  institutionId?: string;
  roles?: string[];
  status?: 'active' | 'inactive' | 'all';
  activityPeriod?: 'day' | 'week' | 'month' | 'year';
}

export interface RoleUpdateRequest {
  role: string;
}

export interface RoleUpdateResponse {
  success: boolean;
  user: Profile;
}

// Legacy single-role create request (for backward compatibility)
export type CreateUserRequestLegacy = Pick<
  Profile,
  'email' | 'full_name' | 'role' | 'phone_number'
> & {
  institution_id?: string | null;
  department_id?: string | null;
};

// Multi-role create request
export type CreateUserRequest = Pick<
  Profile,
  'email' | 'full_name' | 'phone_number'
> & {
  institution_id?: string | null;
  department_id?: string | null;
  // Support both single role (legacy) and multi-role
  role?: string;                    // Legacy single role
  role_ids?: string[];              // Multi-role: array of role IDs (custom_roles.id)
  primary_role_id?: string;         // Which role_id should be primary
};

export type UpdateUserRequest = Partial<CreateUserRequest> & {
  is_active?: boolean;
  profile_complete?: boolean;
  designation?: string | null;
  bio?: string | null;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say' | null;
  department_id?: string | null;
  // Multi-role support
  role_ids?: string[];              // Array of role IDs to assign
  primary_role_id?: string;         // Which role_id should be primary
};
