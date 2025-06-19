// lib/services/staff/staff-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { Staff, StaffFilters, StaffListResponse } from '@/types/staff';
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

          const userResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
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
}
