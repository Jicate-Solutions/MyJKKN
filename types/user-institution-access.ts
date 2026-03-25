// types/user-institution-access.ts

export interface UserInstitutionAccess {
  id: string;
  user_id: string;
  institution_id: string;
  access_type: 'full' | 'read_only' | 'billing_only';
  granted_by?: string;
  granted_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AccessibleInstitution {
  institution_id: string;
  institution_name: string;
  counselling_code: string;
  access_type: 'full' | 'read_only' | 'billing_only' | 'inherited';
  is_primary_institution: boolean;
}

export interface UserInstitutionFilters {
  user_id?: string;
  institution_id?: string;
  access_type?: 'full' | 'read_only' | 'billing_only';
  is_active?: boolean;
}

export interface InstitutionAccessStats {
  total_users: number;
  users_with_access: number;
  total_access_records: number;
  accounts_users: number;
  institutions_count: number;
}

export interface BulkAccessResult {
  success: string[];
  failed: {
    userId: string;
    institutionId: string;
    error: string;
  }[];
}

export interface InstitutionAccessHook {
  institutions: AccessibleInstitution[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  hasAccessToInstitution: (institutionId: string) => boolean;
  getAccessibleInstitutionIds: () => string[];
  canAccessAllInstitutions: boolean;
}

// Extended types for detailed access records with relations
export interface UserInstitutionAccessWithDetails
  extends UserInstitutionAccess {
  institution?: {
    id: string;
    name: string;
    counselling_code: string;
  };
  user?: {
    id: string;
    full_name: string;
    email: string;
  };
  granted_by_user?: {
    id: string;
    full_name: string;
    email: string;
  };
}

// Access type labels and descriptions
export const ACCESS_TYPE_LABELS = {
  full: 'Full Access',
  read_only: 'Read Only',
  billing_only: 'Billing Only',
  inherited: 'Inherited'
} as const;

export const ACCESS_TYPE_DESCRIPTIONS = {
  full: 'Complete access to all institution features',
  read_only: 'Can view data but cannot make changes',
  billing_only: 'Can manage billing and financial data only',
  inherited: 'Access inherited from role or primary institution assignment'
} as const;

// Access type permissions mapping
export const ACCESS_TYPE_PERMISSIONS = {
  full: {
    view: true,
    create: true,
    edit: true,
    delete: true,
    approve: true
  },
  read_only: {
    view: true,
    create: false,
    edit: false,
    delete: false,
    approve: false
  },
  billing_only: {
    view: true,
    create: true,
    edit: true,
    delete: false,
    approve: false
  },
  inherited: {
    view: true,
    create: true,
    edit: true,
    delete: true,
    approve: true
  }
} as const;

export type AccessType = keyof typeof ACCESS_TYPE_LABELS;
export type AccessPermission = keyof typeof ACCESS_TYPE_PERMISSIONS.full;
