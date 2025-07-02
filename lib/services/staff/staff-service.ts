// lib/services/staff/staff-service.ts

import {
  createClientSupabaseClient,
  createAdminClient
} from '@/lib/supabase/client';
import type {
  Staff,
  StaffFilters,
  StaffListResponse,
  StaffDashboardFilters,
  StaffDashboardStats,
  StaffOverviewStats,
  StaffRegistrationTrend,
  StaffInstitutionStats,
  StaffDepartmentStats,
  StaffCategoryStats,
  StaffGeographicStats,
  StaffDemographicStats,
  StaffTenureAnalytics,
  StaffProfileAnalytics
} from '@/types/staff';
import { CreateUserRequest } from '@/types/users';
import toast from 'react-hot-toast';

// Helper function to generate a random password
function generateTemporaryPassword(length = 12): string {
  const charset =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=';
  let password = '';
  for (let i = 0, n = charset.length; i < length; ++i) {
    password += charset.charAt(Math.floor(Math.random() * n));
  }
  // Ensure password meets basic complexity (example: at least one number and one uppercase)
  if (!/\d/.test(password)) {
    password += Math.floor(Math.random() * 10);
  }
  if (!/[A-Z]/.test(password)) {
    password += String.fromCharCode(65 + Math.floor(Math.random() * 26));
  }
  return password.slice(0, length);
}

interface CreateStaffDto {
  first_name: string;
  last_name: string;
  gender: 'male' | 'female' | 'bigender';
  date_of_birth: string;
  marital_status: 'single' | 'married' | 'divorced' | 'widow';
  blood_group?: string;
  email: string;
  phone: string;
  staff_id?: string;
  profile_picture?: string;
  address?: string;
  state?: string;
  district?: string;
  pincode?: string;
  date_of_joining: string;
  designation: string;
  institution_email: string;
  category_id: string;
  institution_id: string;
  department_id: string;
  is_active: boolean;
}

interface UpdateStaffDto extends Partial<CreateStaffDto> {
  updated_at?: string;
}

export class StaffService {
  private static supabase = createClientSupabaseClient();

  static async createStaff(data: CreateStaffDto): Promise<Staff> {
    try {
      const { data: userData, error: userError } =
        await this.supabase.auth.getUser();

      if (userError) throw userError;
      if (!userData.user) throw new Error('No authenticated user');

      // Check if staff_id already exists
      if (data.staff_id) {
        const { data: existing } = await this.supabase
          .from('staff')
          .select('id')
          .eq('staff_id', data.staff_id)
          .single();

        if (existing) {
          throw new Error('staff_staff_id_key');
        }
      }

      const { data: staff, error } = await this.supabase
        .from('staff')
        .insert([
          {
            ...data,
            created_by: userData.user.id,
            updated_by: userData.user.id
          }
        ])
        .select()
        .single();

      if (error) throw error;

      // Auto create user account if institution_email exists
      if (staff.institution_email) {
        try {
          console.log(
            `Creating user account for staff ${staff.id} with email ${staff.institution_email}`
          );
          const tempPassword = generateTemporaryPassword();
          const userPayload: CreateUserRequest = {
            email: staff.institution_email,
            full_name: `${staff.first_name} ${staff.last_name}`,
            password: tempPassword,
            role: 'faculty', // Faculty role
            phone_number: staff.phone || null,
            institution_id: staff.institution_id
          };

          console.log('User payload:', JSON.stringify(userPayload, null, 2));

          // Use absolute URL to ensure it works in all environments
          const apiUrl =
            typeof window !== 'undefined'
              ? '/api/users'
              : `${
                  process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
                }/api/users`;

          console.log('API URL for user creation:', apiUrl);

          // Get current user session for authorization headers
          const { data: sessionData } = await this.supabase.auth.getSession();
          const headers: Record<string, string> = {
            'Content-Type': 'application/json'
          };

          // Add session cookies if available
          if (sessionData?.session) {
            console.log('Adding session authorization for user creation');
          }

          const userResponse = await fetch(apiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(userPayload),
            cache: 'no-store',
            credentials: 'include'
          });

          console.log('User creation response status:', userResponse.status);
          const userData = await userResponse.json();
          console.log(
            'User creation response:',
            JSON.stringify(userData, null, 2)
          );

          if (!userResponse.ok) {
            // Check for 409 Conflict (User already exists)
            if (userResponse.status === 409) {
              console.warn(
                `User with email ${userPayload.email} already exists. Skipping automatic creation.`
              );
              toast(`User account for ${userPayload.email} already exists`);
            } else {
              // Handle other errors
              console.error(
                'Failed to automatically create user:',
                userData.error ||
                  userData.details ||
                  userData.message ||
                  'Unknown API error',
                'Status:',
                userResponse.status
              );
              toast.error(
                `Staff created, but failed to create user account: ${
                  userData.error ||
                  userData.details ||
                  userData.message ||
                  'Unknown error'
                }`
              );
            }
          } else {
            console.log(
              `Successfully created user for staff ${staff.id} with email ${staff.institution_email}`
            );
            toast.success(
              `Staff user account created with email ${staff.institution_email}`
            );
          }
        } catch (apiError) {
          console.error('Error calling user creation API:', apiError);
          toast.error(
            `Staff created, but encountered an error creating user account: ${
              apiError instanceof Error ? apiError.message : 'Unknown error'
            }`
          );
        }
      } else {
        console.log('No institution_email provided, skipping user creation');
      }

      return staff;
    } catch (error) {
      console.error('Error creating staff:', error);
      throw error;
    }
  }

  static async updateStaff(id: string, data: UpdateStaffDto): Promise<Staff> {
    try {
      const { data: userData, error: userError } =
        await this.supabase.auth.getUser();

      if (userError) throw userError;
      if (!userData.user) throw new Error('No authenticated user');

      // Get the current staff data before update
      const { data: currentStaff, error: fetchError } = await this.supabase
        .from('staff')
        .select('institution_email, institution_id')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      const { data: staff, error } = await this.supabase
        .from('staff')
        .update({
          ...data,
          updated_by: userData.user.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // If institution_id was updated and staff has an institution_email, update the profile
      if (data.institution_id && currentStaff.institution_email) {
        try {
          const { error: profileUpdateError } = await this.supabase
            .from('profiles')
            .update({ institution_id: data.institution_id })
            .eq('email', currentStaff.institution_email);

          if (profileUpdateError) {
            console.warn(
              'Failed to update profile institution_id:',
              profileUpdateError
            );
            toast.error(
              'Staff updated but failed to sync user profile institution'
            );
          } else {
            console.log(
              `Updated institution_id in profile for ${currentStaff.institution_email}`
            );
          }
        } catch (profileError) {
          console.warn('Error updating profile institution_id:', profileError);
        }
      }

      return staff;
    } catch (error) {
      console.error('Error updating staff:', error);
      throw error;
    }
  }

  static async deleteStaff(id: string): Promise<void> {
    try {
      // First, get the staff member to find out if they have an institution_email
      const { data: staff, error: fetchError } = await this.supabase
        .from('staff')
        .select('institution_email')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      // If there is an institution_email, try to delete the associated profile
      if (staff?.institution_email) {
        try {
          // Find the profile associated with the institution_email
          const { data: profile, error: profileError } = await this.supabase
            .from('profiles')
            .select('id')
            .eq('email', staff.institution_email)
            .single();

          if (!profileError && profile) {
            // Delete the profile using the API endpoint (which handles auth table deletion too)
            const response = await fetch(`/api/users/${profile.id}`, {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json'
              }
            });

            if (!response.ok) {
              console.warn(
                `Failed to delete user profile for staff ${id}:`,
                await response.text()
              );
            }
          }
        } catch (profileError) {
          console.warn(
            'Error finding or deleting staff user profile:',
            profileError
          );
          // Continue with staff deletion even if profile deletion fails
        }
      }

      // Delete the staff record
      const { error } = await this.supabase.from('staff').delete().eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting staff:', error);
      throw error;
    }
  }

  static async bulkDeleteStaff(ids: string[]): Promise<{
    success: string[];
    failed: { id: string; error: string }[];
  }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];

    // Process deletions sequentially
    for (const id of ids) {
      try {
        await this.deleteStaff(id);
        success.push(id);
      } catch (error) {
        console.error(`Error deleting staff ${id}:`, error);
        failed.push({
          id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return { success, failed };
  }

  static async getStaff(
    filters: StaffFilters = {}
  ): Promise<StaffListResponse> {
    try {
      let query = this.supabase.from('staff').select(
        `
          *,
          category:employment_categories(
            id,
            category_name
          ),
          institution:institutions(
            id,
            name,
            counselling_code
          ),
          department:departments(
            id,
            department_name
          )
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (filters.search) {
        query = query.or(
          `first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,staff_id.ilike.%${filters.search}%`
        );
      }

      if (filters.category_id) {
        query = query.eq('category_id', filters.category_id);
      }

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.department_id) {
        query = query.eq('department_id', filters.department_id);
      }

      if (filters.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive);
      }

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.range(from, to).order('created_at', { ascending: false });

      const { data: staff, error, count } = await query;

      if (error) throw error;

      return {
        data: staff || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('Error fetching staff:', error);
      throw error;
    }
  }

  static async getStaffById(id: string): Promise<Staff> {
    try {
      const { data: staff, error } = await this.supabase
        .from('staff')
        .select(
          `
          *,
          category:employment_categories(
            id,
            category_name
          ),
          institution:institutions(
            id,
            name,
            counselling_code
          ),
          department:departments(
            id,
            department_name
          )
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;

      return staff;
    } catch (error) {
      console.error('Error fetching staff:', error);
      throw error;
    }
  }

  /**
   * Utility function to sync institution_id for existing staff profiles
   * This should be called to fix profiles that were created without institution_id
   */
  static async syncStaffProfileInstitutions(): Promise<{
    success: number;
    failed: { staff_id: string; email: string; error: string }[];
  }> {
    try {
      const success: string[] = [];
      const failed: { staff_id: string; email: string; error: string }[] = [];

      // Get all staff with institution_email
      const { data: staffList, error: staffError } = await this.supabase
        .from('staff')
        .select('id, institution_email, institution_id')
        .not('institution_email', 'is', null);

      if (staffError) throw staffError;

      // Process each staff member
      for (const staff of staffList || []) {
        try {
          // Check if profile exists and has null institution_id
          const { data: profile, error: profileError } = await this.supabase
            .from('profiles')
            .select('id, institution_id')
            .eq('email', staff.institution_email)
            .single();

          if (profileError) {
            failed.push({
              staff_id: staff.id,
              email: staff.institution_email,
              error: `Profile not found: ${profileError.message}`
            });
            continue;
          }

          // Update profile if institution_id is null
          if (!profile.institution_id && staff.institution_id) {
            const { error: updateError } = await this.supabase
              .from('profiles')
              .update({ institution_id: staff.institution_id })
              .eq('email', staff.institution_email);

            if (updateError) {
              failed.push({
                staff_id: staff.id,
                email: staff.institution_email,
                error: `Update failed: ${updateError.message}`
              });
            } else {
              success.push(staff.id);
            }
          }
        } catch (error) {
          failed.push({
            staff_id: staff.id,
            email: staff.institution_email,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      return { success: success.length, failed };
    } catch (error) {
      console.error('Error syncing staff profile institutions:', error);
      throw error;
    }
  }

  // Dashboard Analytics Methods

  static async getDashboardStats(
    filters: StaffDashboardFilters = {}
  ): Promise<StaffDashboardStats> {
    try {
      // Use admin client for dashboard stats (read-only operations)
      const supabase = createAdminClient();

      // Execute all queries in parallel for better performance
      const [
        overview,
        registrationTrends,
        institutionStats,
        departmentStats,
        categoryStats,
        geographicStats,
        demographicStats,
        tenureAnalytics,
        profileAnalytics
      ] = await Promise.all([
        this.getOverviewStats(filters, supabase),
        this.getRegistrationTrends(filters, supabase),
        this.getInstitutionStats(filters, supabase),
        this.getDepartmentStats(filters, supabase),
        this.getCategoryStats(filters, supabase),
        this.getGeographicStats(filters, supabase),
        this.getDemographicStats(filters, supabase),
        this.getTenureAnalytics(filters, supabase),
        this.getProfileAnalytics(filters, supabase)
      ]);

      return {
        overview,
        registrationTrends,
        institutionStats,
        departmentStats,
        categoryStats,
        geographicStats,
        demographicStats,
        tenureAnalytics,
        profileAnalytics
      };
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      throw error;
    }
  }

  private static async getOverviewStats(
    filters: StaffDashboardFilters,
    supabase: ReturnType<typeof createAdminClient>
  ): Promise<StaffOverviewStats> {
    let query = supabase.from('staff').select('*');

    // Apply filters
    if (filters.institutionId) {
      query = query.eq('institution_id', filters.institutionId);
    }
    if (filters.departmentId) {
      query = query.eq('department_id', filters.departmentId);
    }
    if (filters.categoryId) {
      query = query.eq('category_id', filters.categoryId);
    }
    if (filters.status && filters.status.length > 0) {
      query = query.in(
        'is_active',
        filters.status.map((s) => s === 'active')
      );
    }

    const { data: staff, error } = await query;
    if (error) throw error;

    const currentDate = new Date();
    const currentMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1
    );

    const totalStaff = staff?.length || 0;
    const activeStaff = staff?.filter((s) => s.is_active).length || 0;
    const inactiveStaff = totalStaff - activeStaff;

    const newHires =
      staff?.filter((s) => {
        const joiningDate = new Date(s.date_of_joining);
        return joiningDate >= currentMonth;
      }).length || 0;

    // Calculate profile completion rate
    const requiredFields = [
      'first_name',
      'last_name',
      'email',
      'phone',
      'designation',
      'date_of_birth',
      'date_of_joining'
    ];
    const optionalFields = [
      'staff_id',
      'profile_picture',
      'address',
      'state',
      'district',
      'pincode',
      'institution_email'
    ];

    let totalFieldsExpected = 0;
    let totalFieldsCompleted = 0;

    staff?.forEach((s) => {
      requiredFields.forEach((field) => {
        totalFieldsExpected++;
        if (s[field as keyof Staff]) totalFieldsCompleted++;
      });
      optionalFields.forEach((field) => {
        totalFieldsExpected++;
        if (s[field as keyof Staff]) totalFieldsCompleted++;
      });
    });

    const profileCompletionRate =
      totalStaff > 0 ? (totalFieldsCompleted / totalFieldsExpected) * 100 : 0;

    // Calculate average tenure
    const totalTenure =
      staff?.reduce((sum, s) => {
        const joiningDate = new Date(s.date_of_joining);
        const tenure =
          (currentDate.getTime() - joiningDate.getTime()) /
          (1000 * 60 * 60 * 24 * 365.25);
        return sum + tenure;
      }, 0) || 0;

    const averageTenure = totalStaff > 0 ? totalTenure / totalStaff : 0;

    // Get staff with/without profiles
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('email');

    if (profileError) throw profileError;

    const profileEmails = new Set(profiles?.map((p) => p.email) || []);
    const staffWithProfiles =
      staff?.filter(
        (s) => s.institution_email && profileEmails.has(s.institution_email)
      ).length || 0;
    const staffWithoutProfiles = totalStaff - staffWithProfiles;

    return {
      totalStaff,
      activeStaff,
      inactiveStaff,
      newHires,
      profileCompletionRate,
      averageTenure,
      staffWithProfiles,
      staffWithoutProfiles
    };
  }

  private static async getRegistrationTrends(
    filters: StaffDashboardFilters,
    supabase: ReturnType<typeof createAdminClient>
  ): Promise<StaffRegistrationTrend[]> {
    let query = supabase.from('staff').select('date_of_joining');

    // Apply filters
    if (filters.institutionId) {
      query = query.eq('institution_id', filters.institutionId);
    }
    if (filters.departmentId) {
      query = query.eq('department_id', filters.departmentId);
    }
    if (filters.categoryId) {
      query = query.eq('category_id', filters.categoryId);
    }

    const { data: staff, error } = await query;
    if (error) throw error;

    // Group by date and calculate trends for the last 30 days
    const trends: { [key: string]: number } = {};
    const endDate = filters.dateRange?.to || new Date();
    const startDate =
      filters.dateRange?.from ||
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Initialize all dates in range with 0
    for (
      let d = new Date(startDate);
      d <= endDate;
      d.setDate(d.getDate() + 1)
    ) {
      const dateStr = d.toISOString().split('T')[0];
      trends[dateStr] = 0;
    }

    // Count staff joined on each date
    staff?.forEach((s) => {
      const joiningDate = new Date(s.date_of_joining);
      if (joiningDate >= startDate && joiningDate <= endDate) {
        const dateStr = joiningDate.toISOString().split('T')[0];
        trends[dateStr] = (trends[dateStr] || 0) + 1;
      }
    });

    // Convert to array and calculate cumulative
    let cumulative = 0;
    return Object.entries(trends)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => {
        cumulative += count;
        return { date, count, cumulative };
      });
  }

  private static async getInstitutionStats(
    filters: StaffDashboardFilters,
    supabase: ReturnType<typeof createAdminClient>
  ): Promise<StaffInstitutionStats[]> {
    let query = supabase.from('staff').select(`
        institution_id,
        is_active,
        institution:institutions(id, name)
      `);

    // Apply filters
    if (filters.departmentId) {
      query = query.eq('department_id', filters.departmentId);
    }
    if (filters.categoryId) {
      query = query.eq('category_id', filters.categoryId);
    }

    const { data: staff, error } = await query;
    if (error) throw error;

    return this.calculateDistribution(
      staff || [],
      'institution_id',
      (item: any) => ({
        id: item.institution?.id || item.institution_id,
        name: item.institution?.name || 'Unknown Institution'
      })
    ).map((stat: any) => ({
      ...stat,
      staffCount: stat.count, // Map count to staffCount
      activeCount:
        staff?.filter((s) => s.institution_id === stat.id && s.is_active)
          .length || 0,
      inactiveCount:
        staff?.filter((s) => s.institution_id === stat.id && !s.is_active)
          .length || 0
    }));
  }

  private static async getDepartmentStats(
    filters: StaffDashboardFilters,
    supabase: ReturnType<typeof createAdminClient>
  ): Promise<StaffDepartmentStats[]> {
    let query = supabase.from('staff').select(`
        department_id,
        institution_id,
        is_active,
        department:departments(id, department_name),
        institution:institutions(id, name)
      `);

    // Apply filters
    if (filters.institutionId) {
      query = query.eq('institution_id', filters.institutionId);
    }
    if (filters.categoryId) {
      query = query.eq('category_id', filters.categoryId);
    }

    const { data: staff, error } = await query;
    if (error) throw error;

    return this.calculateDistribution(
      staff || [],
      'department_id',
      (item: any) => ({
        id: item.department?.id || item.department_id,
        name: item.department?.department_name || 'Unknown Department',
        institutionId: item.institution_id,
        institutionName: item.institution?.name || 'Unknown Institution'
      })
    ).map((stat: any) => ({
      ...stat,
      staffCount: stat.count, // Map count to staffCount
      activeCount:
        staff?.filter((s) => s.department_id === stat.id && s.is_active)
          .length || 0,
      inactiveCount:
        staff?.filter((s) => s.department_id === stat.id && !s.is_active)
          .length || 0
    }));
  }

  private static async getCategoryStats(
    filters: StaffDashboardFilters,
    supabase: ReturnType<typeof createAdminClient>
  ): Promise<StaffCategoryStats[]> {
    let query = supabase.from('staff').select(`
        category_id,
        is_active,
        date_of_joining,
        category:employment_categories(id, category_name)
      `);

    // Apply filters
    if (filters.institutionId) {
      query = query.eq('institution_id', filters.institutionId);
    }
    if (filters.departmentId) {
      query = query.eq('department_id', filters.departmentId);
    }

    const { data: staff, error } = await query;
    if (error) throw error;

    const currentDate = new Date();

    return this.calculateDistribution(
      staff || [],
      'category_id',
      (item: any) => ({
        id: item.category?.id || item.category_id,
        name: item.category?.category_name || 'Unknown Category'
      })
    ).map((stat: any) => {
      const categoryStaff =
        staff?.filter((s) => s.category_id === stat.id) || [];
      const totalTenure = categoryStaff.reduce((sum, s) => {
        const joiningDate = new Date(s.date_of_joining);
        const tenure =
          (currentDate.getTime() - joiningDate.getTime()) /
          (1000 * 60 * 60 * 24 * 365.25);
        return sum + tenure;
      }, 0);

      return {
        ...stat,
        staffCount: stat.count, // Map count to staffCount
        activeCount: categoryStaff.filter((s) => s.is_active).length,
        inactiveCount: categoryStaff.filter((s) => !s.is_active).length,
        averageTenure:
          categoryStaff.length > 0 ? totalTenure / categoryStaff.length : 0
      };
    });
  }

  private static async getGeographicStats(
    filters: StaffDashboardFilters,
    supabase: ReturnType<typeof createAdminClient>
  ): Promise<StaffGeographicStats> {
    let query = supabase.from('staff').select('state, district');

    // Apply filters
    if (filters.institutionId) {
      query = query.eq('institution_id', filters.institutionId);
    }
    if (filters.departmentId) {
      query = query.eq('department_id', filters.departmentId);
    }
    if (filters.categoryId) {
      query = query.eq('category_id', filters.categoryId);
    }

    const { data: staff, error } = await query;
    if (error) throw error;

    return this.calculateGeographicStats(staff || []);
  }

  private static async getDemographicStats(
    filters: StaffDashboardFilters,
    supabase: ReturnType<typeof createAdminClient>
  ): Promise<StaffDemographicStats> {
    let query = supabase
      .from('staff')
      .select(
        'gender, marital_status, blood_group, date_of_birth, designation'
      );

    // Apply filters
    if (filters.institutionId) {
      query = query.eq('institution_id', filters.institutionId);
    }
    if (filters.departmentId) {
      query = query.eq('department_id', filters.departmentId);
    }
    if (filters.categoryId) {
      query = query.eq('category_id', filters.categoryId);
    }

    const { data: staff, error } = await query;
    if (error) throw error;

    const currentDate = new Date();

    return {
      genderDistribution: this.calculateDistribution(staff || [], 'gender'),
      maritalStatusDistribution: this.calculateDistribution(
        staff || [],
        'marital_status',
        (item: any) => ({
          name: item.marital_status || 'Not Specified'
        })
      ),
      ageGroups: this.calculateAgeGroups(staff || [], currentDate)
    };
  }

  private static async getTenureAnalytics(
    filters: StaffDashboardFilters,
    supabase: ReturnType<typeof createAdminClient>
  ): Promise<StaffTenureAnalytics> {
    let query = supabase.from('staff').select(`
        date_of_joining,
        category:employment_categories(category_name),
        department:departments(department_name),
        institution:institutions(name)
      `);

    // Apply filters
    if (filters.institutionId) {
      query = query.eq('institution_id', filters.institutionId);
    }
    if (filters.departmentId) {
      query = query.eq('department_id', filters.departmentId);
    }
    if (filters.categoryId) {
      query = query.eq('category_id', filters.categoryId);
    }

    const { data: staff, error } = await query;
    if (error) throw error;

    const currentDate = new Date();

    // Calculate tenure distribution
    const tenureRanges = [
      '0-1 years',
      '1-3 years',
      '3-5 years',
      '5-10 years',
      '10+ years'
    ];
    const tenureDistribution = tenureRanges.map((range) => ({
      range,
      count: 0,
      percentage: 0
    }));

    staff?.forEach((s) => {
      const joiningDate = new Date(s.date_of_joining);
      const tenure =
        (currentDate.getTime() - joiningDate.getTime()) /
        (1000 * 60 * 60 * 24 * 365.25);

      if (tenure < 1) tenureDistribution[0].count++;
      else if (tenure < 3) tenureDistribution[1].count++;
      else if (tenure < 5) tenureDistribution[2].count++;
      else if (tenure < 10) tenureDistribution[3].count++;
      else tenureDistribution[4].count++;
    });

    const totalStaff = staff?.length || 0;
    tenureDistribution.forEach((item) => {
      item.percentage = totalStaff > 0 ? (item.count / totalStaff) * 100 : 0;
    });

    // Calculate average tenure by category
    const categoryTenure: { [key: string]: { total: number; count: number } } =
      {};
    staff?.forEach((s) => {
      const categoryName = (s.category as any)?.category_name || 'Unknown';
      const joiningDate = new Date(s.date_of_joining);
      const tenure =
        (currentDate.getTime() - joiningDate.getTime()) /
        (1000 * 60 * 60 * 24 * 365.25);

      if (!categoryTenure[categoryName]) {
        categoryTenure[categoryName] = { total: 0, count: 0 };
      }
      categoryTenure[categoryName].total += tenure;
      categoryTenure[categoryName].count++;
    });

    const averageTenureByCategory = Object.entries(categoryTenure).map(
      ([categoryName, data]) => ({
        categoryName,
        averageTenure: data.count > 0 ? data.total / data.count : 0
      })
    );

    // Calculate average tenure by department
    const departmentTenure: {
      [key: string]: { total: number; count: number; institutionName: string };
    } = {};
    staff?.forEach((s) => {
      const departmentName =
        (s.department as any)?.department_name || 'Unknown';
      const institutionName = (s.institution as any)?.name || 'Unknown';
      const joiningDate = new Date(s.date_of_joining);
      const tenure =
        (currentDate.getTime() - joiningDate.getTime()) /
        (1000 * 60 * 60 * 24 * 365.25);

      if (!departmentTenure[departmentName]) {
        departmentTenure[departmentName] = {
          total: 0,
          count: 0,
          institutionName
        };
      }
      departmentTenure[departmentName].total += tenure;
      departmentTenure[departmentName].count++;
    });

    const averageTenureByDepartment = Object.entries(departmentTenure).map(
      ([departmentName, data]) => ({
        departmentName,
        institutionName: data.institutionName,
        averageTenure: data.count > 0 ? data.total / data.count : 0
      })
    );

    // Calculate new hires trend for last 12 months
    const newHiresTrend = [];
    for (let i = 11; i >= 0; i--) {
      const month = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() - i,
        1
      );
      const nextMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() - i + 1,
        1
      );

      const count =
        staff?.filter((s) => {
          const joiningDate = new Date(s.date_of_joining);
          return joiningDate >= month && joiningDate < nextMonth;
        }).length || 0;

      newHiresTrend.push({
        month: month.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short'
        }),
        count
      });
    }

    return {
      tenureDistribution,
      averageTenureByCategory,
      averageTenureByDepartment,
      newHiresTrend
    };
  }

  private static async getProfileAnalytics(
    filters: StaffDashboardFilters,
    supabase: ReturnType<typeof createAdminClient>
  ): Promise<StaffProfileAnalytics> {
    let query = supabase.from('staff').select(`
        *,
        category:employment_categories(category_name)
      `);

    // Apply filters
    if (filters.institutionId) {
      query = query.eq('institution_id', filters.institutionId);
    }
    if (filters.departmentId) {
      query = query.eq('department_id', filters.departmentId);
    }
    if (filters.categoryId) {
      query = query.eq('category_id', filters.categoryId);
    }

    const { data: staff, error } = await query;
    if (error) throw error;

    const requiredFields = [
      'first_name',
      'last_name',
      'email',
      'phone',
      'designation',
      'date_of_birth',
      'date_of_joining'
    ];
    const optionalFields = [
      'staff_id',
      'profile_picture',
      'address',
      'state',
      'district',
      'pincode',
      'institution_email',
      'blood_group'
    ];
    const allFields = [...requiredFields, ...optionalFields];

    // Profile completion breakdown
    const profileCompletionBreakdown = allFields.map((field) => {
      const completedCount =
        staff?.filter((s) => s[field as keyof Staff]).length || 0;
      const totalCount = staff?.length || 0;
      return {
        field,
        completedCount,
        totalCount,
        percentage: totalCount > 0 ? (completedCount / totalCount) * 100 : 0
      };
    });

    // Profile completion by category
    const categoryCompletion: {
      [key: string]: { completed: number; total: number };
    } = {};
    staff?.forEach((s) => {
      const categoryName = s.category?.category_name || 'Unknown';
      if (!categoryCompletion[categoryName]) {
        categoryCompletion[categoryName] = { completed: 0, total: 0 };
      }
      categoryCompletion[categoryName].total++;

      const completedFields = allFields.filter(
        (field) => s[field as keyof Staff]
      ).length;
      if (completedFields >= allFields.length * 0.8) {
        // 80% completion threshold
        categoryCompletion[categoryName].completed++;
      }
    });

    const profileCompletionByCategory = Object.entries(categoryCompletion).map(
      ([categoryName, data]) => ({
        categoryName,
        completedCount: data.completed,
        totalCount: data.total,
        percentage: data.total > 0 ? (data.completed / data.total) * 100 : 0
      })
    );

    // Missing fields analysis
    const missingFields = allFields
      .map((field) => {
        const missingCount =
          staff?.filter((s) => !s[field as keyof Staff]).length || 0;
        const totalCount = staff?.length || 0;
        return {
          field,
          missingCount,
          percentage: totalCount > 0 ? (missingCount / totalCount) * 100 : 0
        };
      })
      .filter((item) => item.missingCount > 0)
      .sort((a, b) => b.missingCount - a.missingCount);

    return {
      profileCompletionBreakdown,
      profileCompletionByCategory,
      missingFields
    };
  }

  // Helper methods
  private static calculateDistribution<T>(
    data: T[],
    key: keyof T,
    transform?: (item: T) => any
  ): Array<{
    name: string;
    count: number;
    percentage: number;
  }> {
    const distribution: { [key: string]: any } = {};

    data.forEach((item) => {
      const value = String(item[key] || 'Not Specified');
      if (!distribution[value]) {
        const transformed = transform ? transform(item) : { name: value };
        distribution[value] = {
          name: value,
          ...transformed,
          count: 0
        };
      }
      distribution[value].count++;
    });

    const total = data.length;
    return Object.values(distribution).map((item: any) => ({
      name: item.name || 'Not Specified',
      count: item.count,
      percentage: total > 0 ? (item.count / total) * 100 : 0
    }));
  }

  private static calculateAgeGroups(staff: any[], currentDate: Date) {
    const ageGroups = ['18-25', '26-35', '36-45', '46-55', '56-65', '65+'];
    const distribution = ageGroups.map((group) => ({
      name: group,
      count: 0,
      percentage: 0
    }));

    staff.forEach((s) => {
      if (s.date_of_birth) {
        const birthDate = new Date(s.date_of_birth);
        const age = currentDate.getFullYear() - birthDate.getFullYear();

        if (age <= 25) distribution[0].count++;
        else if (age <= 35) distribution[1].count++;
        else if (age <= 45) distribution[2].count++;
        else if (age <= 55) distribution[3].count++;
        else if (age <= 65) distribution[4].count++;
        else distribution[5].count++;
      }
    });

    const total = staff.length;
    distribution.forEach((item) => {
      item.percentage = total > 0 ? (item.count / total) * 100 : 0;
    });

    return distribution;
  }

  private static calculateGeographicStats(staff: any[]): StaffGeographicStats {
    const stateDistribution: { [key: string]: number } = {};
    const districtDistribution: {
      [key: string]: { state: string; count: number };
    } = {};

    staff.forEach((s) => {
      const state = s.state || 'Not Specified';
      const district = s.district || 'Not Specified';

      stateDistribution[state] = (stateDistribution[state] || 0) + 1;

      const districtKey = `${state}-${district}`;
      if (!districtDistribution[districtKey]) {
        districtDistribution[districtKey] = { state, count: 0 };
      }
      districtDistribution[districtKey].count++;
    });

    const total = staff.length;

    const states = Object.entries(stateDistribution).map(([state, count]) => ({
      name: state,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0
    }));

    const districts = Object.entries(districtDistribution).map(
      ([key, data]) => {
        const district = key.split('-')[1];
        return {
          name: district,
          count: data.count,
          percentage: total > 0 ? (data.count / total) * 100 : 0
        };
      }
    );

    return {
      stateDistribution: states,
      districtDistribution: districts
    };
  }
}
