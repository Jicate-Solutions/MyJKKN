// lib/auth/auth-service.ts
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database, Profile } from '@/types/auth';
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
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  }

  static async getCurrentUser() {
    try {
      const {
        data: { session },
        error
      } = await supabase.auth.getSession();
      if (error || !session) return null;
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
    profileData: Partial<Profile>
  ): Promise<Profile | null> {
    try {
      const user = await this.getCurrentUser();
      if (!user) throw new Error('No authenticated user');

      const allowedFields: (keyof Profile)[] = [
        'full_name',
        'department',
        'phone_number',
        'student_id',
        'faculty_id',
        'bio',
        'profile_completed'
      ];

      const updateData = Object.fromEntries(
        Object.entries(profileData).filter(([key]) =>
          allowedFields.includes(key as keyof Profile)
        )
      );

      const { data, error } = await supabase
        .from('profiles')
        .update({ ...updateData, profile_completed: true })
        .eq('id', user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Update profile error:', error);
      return null;
    }
  }

  static async checkProfileCompletion(): Promise<boolean> {
    const profile = await this.getUserProfile();
    return Boolean(profile?.profile_completed);
  }
}
