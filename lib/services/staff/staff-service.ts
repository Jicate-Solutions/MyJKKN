// lib/services/staff/staff-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { Staff, StaffFilters, StaffListResponse } from '@/types/staff';
import { CreateUserRequest } from '@/types/users';
import { toast } from 'sonner';

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
            phone_number: staff.phone || null
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
              toast.info(
                `User account for ${userPayload.email} already exists`
              );
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

      return staff;
    } catch (error) {
      console.error('Error updating staff:', error);
      throw error;
    }
  }

  static async deleteStaff(id: string): Promise<void> {
    try {
      const { error } = await this.supabase.from('staff').delete().eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting staff:', error);
      throw error;
    }
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
}
