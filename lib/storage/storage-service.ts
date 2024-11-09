import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '@/types/auth';

const AVATAR_BUCKET = 'avatars';
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/gif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export class StorageService {
  private static supabase = createClientComponentClient<Database>();

  static async uploadAvatar(file: File): Promise<{
    publicUrl: string | null;
    error: Error | null;
  }> {
    try {
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

      const {
        data: { session },
        error: sessionError
      } = await this.supabase.auth.getSession();

      if (sessionError || !session) {
        throw new Error('Authentication required');
      }

      // Delete existing avatar first
      await this.deleteOldAvatar(session.user.id);

      // Create unique filename
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${session.user.id}/${fileName}`;

      // Upload the file
      const { error: uploadError } = await this.supabase.storage
        .from(AVATAR_BUCKET)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true // Changed to true to handle existing files
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = this.supabase.storage
        .from(AVATAR_BUCKET)
        .getPublicUrl(filePath);

      // Update profile with new avatar URL
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
      // List existing files
      const { data: existingFiles } = await this.supabase.storage
        .from(AVATAR_BUCKET)
        .list(`${userId}`);

      if (existingFiles && existingFiles.length > 0) {
        // Delete all existing files in user's folder
        const filesToRemove = existingFiles.map((f) => `${userId}/${f.name}`);
        await this.supabase.storage.from(AVATAR_BUCKET).remove(filesToRemove);
      }
    } catch (error) {
      console.error('Error deleting old avatar:', error);
    }
  }

  static async deleteAvatar(userId: string): Promise<{ error: Error | null }> {
    try {
      await this.deleteOldAvatar(userId);

      // Update profile
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
}
