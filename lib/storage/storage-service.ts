import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '@/types/auth';

const BUCKETS = {
  AVATARS: 'avatars',
  LOGOS: 'institution-logos'
} as const;

const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/gif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export class StorageService {
  private static supabase = createClientComponentClient<Database>();

  private static async validateFile(file: File): Promise<void> {
    // Validate file type
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      throw new Error(
        'Invalid file type. Please upload a JPEG, PNG or GIF image.'
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      throw new Error('File size must be less than 5MB');
    }
  }

  // Avatar methods remain the same
  static async uploadAvatar(file: File): Promise<{
    publicUrl: string | null;
    error: Error | null;
  }> {
    try {
      await this.validateFile(file);

      const {
        data: { session },
        error: sessionError
      } = await this.supabase.auth.getSession();

      if (sessionError || !session) {
        throw new Error('Authentication required');
      }

      await this.deleteOldAvatar(session.user.id);

      const fileExt = file.name.split('.').pop()?.toLowerCase();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${session.user.id}/${fileName}`;

      const { error: uploadError } = await this.supabase.storage
        .from(BUCKETS.AVATARS)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = this.supabase.storage
        .from(BUCKETS.AVATARS)
        .getPublicUrl(filePath);

      const { error: updateError } = await this.supabase
        .from('profiles')
        .update({
          avatar_url: urlData.publicUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', session.user.id);

      if (updateError) throw updateError;

      return {
        publicUrl: urlData.publicUrl,
        error: null
      };
    } catch (error) {
      console.error('Error uploading avatar:', error);
      return {
        publicUrl: null,
        error: error instanceof Error ? error : new Error('Upload failed')
      };
    }
  }

  private static async deleteOldAvatar(userId: string): Promise<void> {
    try {
      const { data: existingFiles } = await this.supabase.storage
        .from(BUCKETS.AVATARS)
        .list(`${userId}`);

      if (existingFiles && existingFiles.length > 0) {
        const filesToRemove = existingFiles.map((f) => `${userId}/${f.name}`);
        await this.supabase.storage.from(BUCKETS.AVATARS).remove(filesToRemove);
      }
    } catch (error) {
      console.error('Error deleting old avatar:', error);
    }
  }

  static async deleteAvatar(userId: string): Promise<{ error: Error | null }> {
    try {
      await this.deleteOldAvatar(userId);

      const { error: updateError } = await this.supabase
        .from('profiles')
        .update({
          avatar_url: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (updateError) throw updateError;

      return { error: null };
    } catch (error) {
      console.error('Error deleting avatar:', error);
      return {
        error: error instanceof Error ? error : new Error('Delete failed')
      };
    }
  }

  // New methods for institution logos
  static async uploadInstitutionLogo(
    file: File,
    institutionId: string
  ): Promise<{
    publicUrl: string | null;
    error: Error | null;
  }> {
    try {
      await this.validateFile(file);

      const {
        data: { session },
        error: sessionError
      } = await this.supabase.auth.getSession();

      if (sessionError || !session) {
        throw new Error('Authentication required');
      }

      await this.deleteOldInstitutionLogo(institutionId);

      const fileExt = file.name.split('.').pop()?.toLowerCase();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${institutionId}/${fileName}`;

      const { error: uploadError } = await this.supabase.storage
        .from(BUCKETS.LOGOS)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = this.supabase.storage
        .from(BUCKETS.LOGOS)
        .getPublicUrl(filePath);

      return {
        publicUrl: urlData.publicUrl,
        error: null
      };
    } catch (error) {
      console.error('Error uploading institution logo:', error);
      return {
        publicUrl: null,
        error: error instanceof Error ? error : new Error('Upload failed')
      };
    }
  }

  private static async deleteOldInstitutionLogo(
    institutionId: string
  ): Promise<void> {
    try {
      const { data: existingFiles } = await this.supabase.storage
        .from(BUCKETS.LOGOS)
        .list(`${institutionId}`);

      if (existingFiles && existingFiles.length > 0) {
        const filesToRemove = existingFiles.map(
          (f) => `${institutionId}/${f.name}`
        );
        await this.supabase.storage.from(BUCKETS.LOGOS).remove(filesToRemove);
      }
    } catch (error) {
      console.error('Error deleting old institution logo:', error);
    }
  }

  static async deleteInstitutionLogo(
    institutionId: string
  ): Promise<{ error: Error | null }> {
    try {
      await this.deleteOldInstitutionLogo(institutionId);
      return { error: null };
    } catch (error) {
      console.error('Error deleting institution logo:', error);
      return {
        error: error instanceof Error ? error : new Error('Delete failed')
      };
    }
  }

  static async uploadStaffImage(
    file: File,
    staffId: string
  ): Promise<{ publicUrl: string | null; error: Error | null }> {
    try {
      await this.validateFile(file);

      const {
        data: { session },
        error: sessionError
      } = await this.supabase.auth.getSession();

      if (sessionError || !session) {
        throw new Error('Authentication required');
      }

      // Remove existing staff image if any
      await this.deleteExistingStaffImage(staffId);

      // Create a unique filename
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${staffId}/${fileName}`;

      // Upload the new file
      const { error: uploadError } = await this.supabase.storage
        .from('staff-images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = this.supabase.storage
        .from('staff-images')
        .getPublicUrl(filePath);

      return {
        publicUrl: urlData.publicUrl,
        error: null
      };
    } catch (error) {
      console.error('Error uploading staff image:', error);
      return {
        publicUrl: null,
        error: error instanceof Error ? error : new Error('Upload failed')
      };
    }
  }

  private static async deleteExistingStaffImage(
    staffId: string
  ): Promise<void> {
    try {
      const { data: existingFiles } = await this.supabase.storage
        .from('staff-images')
        .list(staffId);

      if (existingFiles && existingFiles.length > 0) {
        const filesToRemove = existingFiles.map((f) => `${staffId}/${f.name}`);
        await this.supabase.storage.from('staff-images').remove(filesToRemove);
      }
    } catch (error) {
      console.error('Error deleting existing staff image:', error);
    }
  }

  static async deleteStaffImage(
    staffId: string
  ): Promise<{ error: Error | null }> {
    try {
      await this.deleteExistingStaffImage(staffId);
      return { error: null };
    } catch (error) {
      console.error('Error deleting staff image:', error);
      return {
        error: error instanceof Error ? error : new Error('Delete failed')
      };
    }
  }
}
