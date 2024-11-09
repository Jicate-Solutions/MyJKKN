// lib/auth/auth-service.ts
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database, Profile, ProfileUpdate } from '@/types/auth';
import { toast } from 'react-hot-toast';

const supabase = createClientComponentClient<Database>();

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
      // Clear any user-related data from local storage
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith('sb-') || key.includes('supabase')) {
          localStorage.removeItem(key);
        }
      });
      localStorage.removeItem('sidebarOpen');

      // Sign out from Supabase
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      // Show success message
      toast.success('Signed out successfully');

      // Redirect to login page
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
      const {
        data: { session },
        error
      } = await supabase.auth.getSession();

      if (error) {
        console.error('Session error:', error);
        return null;
      }

      if (!session) {
        return null;
      }

      return session.user;
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

      if (error) throw error;
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

      const { data, error } = await supabase
        .from('profiles')
        .update({
          ...profileData,
          profile_completed: true,
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
      const { error: updateError } = await supabase
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

      if (profile?.avatar_url) {
        // Extract file name from URL
        const fileName = profile.avatar_url.split('/').pop();

        // Delete the file from storage
        const { error: deleteError } = await supabase.storage
          .from('avatars')
          .remove([`avatars/${fileName}`]);

        if (deleteError) throw deleteError;
      }

      // Remove avatar_url from profile
      const { error: updateError } = await supabase
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

  static async checkProfileCompletion(): Promise<boolean> {
    const profile = await this.getUserProfile();
    return Boolean(profile?.profile_completed);
  }

  static async refreshSession() {
    try {
      const {
        data: { session },
        error
      } = await supabase.auth.getSession();

      if (error) throw error;

      if (!session) {
        window.location.href = '/auth/login';
        return null;
      }

      // Update last login
      await supabase
        .from('profiles')
        .update({ last_login: new Date().toISOString() })
        .eq('id', session.user.id);

      return session;
    } catch (error) {
      console.error('Session refresh error:', error);
      toast.error('Session expired. Please sign in again.');
      window.location.href = '/auth/login';
      return null;
    }
  }
}
