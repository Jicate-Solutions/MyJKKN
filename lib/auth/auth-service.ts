// lib/auth/auth-service.ts
import { Profile, ProfileUpdate } from '@/types/auth';
import { toast } from 'react-hot-toast';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { RoleService } from '../services/roles/role-service';

const supabase = createClientSupabaseClient();

export class AuthService {
  static async signInWithGoogle() {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent'
          }
        }
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Google Sign-In Error:', error);
      throw error;
    }
  }

  static async signOut() {
    try {
      // Log logout activity via API before signing out
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        });
      } catch (activityError) {
        console.error('Failed to log logout activity:', activityError);
        // Continue with logout even if activity logging fails
      }

      // Clear any user-related data from local storage
      if (typeof window !== 'undefined') {
        localStorage.clear();
      }

      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      toast.success('Signed out successfully');
      window.location.href = '/auth/login';

      return true;
    } catch (error) {
      console.error('Sign out error:', error);
      toast.error('Failed to sign out. Please try again.');
      throw error;
    }
  }

  static async getCurrentUser() {
    try {
      const { data, error } = await supabase.auth.getUser();

      if (error) {
        console.error('Auth error:', error);
        return null;
      }

      if (!data.user) {
        return null;
      }

      return data.user;
    } catch (error) {
      console.error('Get current user error:', error);
      return null;
    }
  }

  static async getUserProfile(): Promise<Profile | null> {
    try {
      const user = await this.getCurrentUser();
      if (!user) return null;

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw error;
      }

      return profile;
    } catch (error) {
      console.error('Error getting user profile:', error);
      return null;
    }
  }

  static async updateUserProfile(
    profileData: Partial<ProfileUpdate>
  ): Promise<Profile | null> {
    try {
      const user = await this.getCurrentUser();
      if (!user) {
        toast.error('No authenticated user');
        throw new Error('No authenticated user');
      }

      const { data, error } = await (supabase as any)
        .from('profiles')
        .update({
          ...profileData,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Update profile error:', error);
      throw error;
    }
  }

  static async checkProfileCompletion(): Promise<boolean> {
    const profile = await this.getUserProfile();
    return Boolean(profile?.profile_completed);
  }

  static async refreshSession() {
    try {
      const { data, error } = await supabase.auth.getUser();

      if (error) throw error;

      if (!data.user) {
        window.location.href = '/auth/login';
        return null;
      }

      // Update last login
      await (supabase as any)
        .from('profiles')
        .update({ last_login: new Date().toISOString() })
        .eq('id', data.user.id);

      return data.user;
    } catch (error) {
      console.error('Session refresh error:', error);
      toast.error('Session expired. Please sign in again.');
      window.location.href = '/auth/login';
      return null;
    }
  }

  static async uploadAvatar(file: File): Promise<{
    path: string | null;
    error: Error | null;
  }> {
    try {
      const user = await this.getCurrentUser();
      if (!user) {
        throw new Error('No authenticated user');
      }

      // Create a unique file name
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Math.random()
        .toString(36)
        .slice(2)}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      // Upload the file to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get the public URL
      const { data: urlData } = await supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // Update the user's profile with the new avatar URL
      const { error: updateError } = await (supabase as any)
        .from('profiles')
        .update({ avatar_url: urlData.publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      return { path: urlData.publicUrl, error: null };
    } catch (error) {
      console.error('Error uploading avatar:', error);
      return {
        path: null,
        error: error instanceof Error ? error : new Error('Unknown error')
      };
    }
  }

  static async deleteAvatar(): Promise<{ error: Error | null }> {
    try {
      const user = await this.getCurrentUser();
      if (!user) {
        throw new Error('No authenticated user');
      }

      // Get current profile to get avatar URL
      const { data: profile } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', user.id)
        .single();

      // Type cast to fix TypeScript inference after React 19 upgrade
      const profileData = profile as { avatar_url: string | null } | null;

      if (profileData?.avatar_url) {
        // Extract file name from URL
        const fileName = profileData.avatar_url.split('/').pop();

        // Delete the file from storage
        const { error: deleteError } = await supabase.storage
          .from('avatars')
          .remove([`avatars/${fileName}`]);

        if (deleteError) throw deleteError;
      }

      // Remove avatar_url from profile
      const { error: updateError } = await (supabase as any)
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', user.id);

      if (updateError) throw updateError;

      return { error: null };
    } catch (error) {
      console.error('Error deleting avatar:', error);
      return {
        error: error instanceof Error ? error : new Error('Unknown error')
      };
    }
  }

  static async hasPermission(permission: string): Promise<boolean> {
    const profile = await this.getUserProfile();
    if (!profile) return false;

    if (profile.role === 'super_admin') return true;

    const role = await RoleService.getRoleByKey(profile.role);
    if (!role || !role.permissions) return false;

    return role.permissions[permission] === true;
  }
}
