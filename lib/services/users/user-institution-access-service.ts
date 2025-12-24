import { createClientSupabaseClient } from '@/lib/supabase/client';

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
  access_type: string;
  is_primary_institution: boolean;
}

export interface UserInstitutionFilters {
  user_id?: string;
  institution_id?: string;
  access_type?: string;
  is_active?: boolean;
}

export class UserInstitutionAccessService {
  private static supabase = createClientSupabaseClient();

  /**
   * Get all accessible institutions for a user
   */
  static async getUserAccessibleInstitutions(
    userId: string
  ): Promise<AccessibleInstitution[]> {
    try {
      const { data, error } = await (this.supabase as any).rpc(
        'get_user_accessible_institutions',
        {
          target_user_id: userId
        }
      );

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching user accessible institutions:', error);
      throw error;
    }
  }

  /**
   * Check if user has access to specific institution
   */
  static async userHasInstitutionAccess(
    userId: string,
    institutionId: string
  ): Promise<boolean> {
    try {
      const { data, error } = await (this.supabase as any).rpc(
        'user_has_institution_access',
        {
          target_user_id: userId,
          target_institution_id: institutionId
        }
      );

      if (error) throw error;
      return data || false;
    } catch (error) {
      console.error('Error checking institution access:', error);
      return false;
    }
  }

  /**
   * Grant institution access to user
   */
  static async grantInstitutionAccess(
    userId: string,
    institutionId: string,
    accessType: 'full' | 'read_only' | 'billing_only' = 'full',
    grantedBy?: string
  ): Promise<void> {
    try {
      const { error } = await (this.supabase as any).rpc(
        'grant_user_institution_access',
        {
          target_user_id: userId,
          target_institution_id: institutionId,
          access_type_param: accessType,
          granted_by_param: grantedBy
        }
      );

      if (error) throw error;
    } catch (error) {
      console.error('Error granting institution access:', error);
      throw error;
    }
  }

  /**
   * Revoke institution access from user
   */
  static async revokeInstitutionAccess(
    userId: string,
    institutionId: string
  ): Promise<void> {
    try {
      const { error } = await (this.supabase as any).rpc(
        'revoke_user_institution_access',
        {
          target_user_id: userId,
          target_institution_id: institutionId
        }
      );

      if (error) throw error;
    } catch (error) {
      console.error('Error revoking institution access:', error);
      throw error;
    }
  }

  /**
   * Get user institution access records with details
   */
  static async getUserInstitutionAccessRecords(
    filters: UserInstitutionFilters = {}
  ): Promise<
    (UserInstitutionAccess & {
      institution?: { id: string; name: string; counselling_code: string };
      user?: { id: string; full_name: string; email: string };
      granted_by_user?: { id: string; full_name: string; email: string };
    })[]
  > {
    try {
      let query = (this.supabase as any).from('user_institution_access').select(`
          *,
          institution:institutions(
            id,
            name,
            counselling_code
          ),
          user:profiles!user_institution_access_user_id_fkey(
            id,
            full_name,
            email
          ),
          granted_by_user:profiles!user_institution_access_granted_by_fkey(
            id,
            full_name,
            email
          )
        `);

      if (filters.user_id) {
        query = query.eq('user_id', filters.user_id);
      }

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.access_type) {
        query = query.eq('access_type', filters.access_type);
      }

      if (filters.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
      }

      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching user institution access records:', error);
      throw error;
    }
  }

  /**
   * Bulk grant institution access to multiple users
   */
  static async bulkGrantInstitutionAccess(
    userIds: string[],
    institutionIds: string[],
    accessType: 'full' | 'read_only' | 'billing_only' = 'full',
    grantedBy?: string
  ): Promise<{
    success: string[];
    failed: { userId: string; institutionId: string; error: string }[];
  }> {
    const success: string[] = [];
    const failed: { userId: string; institutionId: string; error: string }[] =
      [];

    for (const userId of userIds) {
      for (const institutionId of institutionIds) {
        try {
          await this.grantInstitutionAccess(
            userId,
            institutionId,
            accessType,
            grantedBy
          );
          success.push(`${userId}-${institutionId}`);
        } catch (error) {
          failed.push({
            userId,
            institutionId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    }

    return { success, failed };
  }

  /**
   * Get institution IDs that user has access to (for filtering)
   */
  static async getUserAccessibleInstitutionIds(
    userId: string
  ): Promise<string[]> {
    try {
      const institutions = await this.getUserAccessibleInstitutions(userId);
      return institutions.map((inst) => inst.institution_id);
    } catch (error) {
      console.error('Error fetching user accessible institution IDs:', error);
      return [];
    }
  }

  /**
   * Create SQL filter condition for institution access
   */
  static async createInstitutionAccessFilter(
    userId: string,
    institutionColumnName: string = 'institution_id'
  ): Promise<string> {
    try {
      const accessibleInstitutionIds =
        await this.getUserAccessibleInstitutionIds(userId);

      if (accessibleInstitutionIds.length === 0) {
        return '1=0'; // No access to any institution
      }

      const quotedIds = accessibleInstitutionIds
        .map((id) => `'${id}'`)
        .join(',');
      return `${institutionColumnName} IN (${quotedIds})`;
    } catch (error) {
      console.error('Error creating institution access filter:', error);
      return '1=0'; // Fail-safe: no access
    }
  }
}
