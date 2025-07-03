import { createClientSupabaseClient } from '@/lib/supabase/client';

export class PhotoMigrationService {
  private static supabase = createClientSupabaseClient();
  private static readonly BUCKET_NAME = 'student-photos';

  // Helper method to sanitize institution names for file paths
  private static sanitizePathName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .toLowerCase()
      .trim();
  }

  // Check if migration is needed
  static async isMigrationNeeded(): Promise<{
    needed: boolean;
    total_photos: number;
    photos_needing_migration: number;
  }> {
    try {
      const { data: totalPhotos, error: totalError } = await this.supabase
        .from('students')
        .select('id', { count: 'exact' })
        .not('student_photo_url', 'is', null);

      if (totalError) throw totalError;

      // Get students with photos using old format
      const { data: oldFormatPhotos, error: oldError } = await this.supabase
        .from('students')
        .select('id, student_photo_url')
        .not('student_photo_url', 'is', null);

      if (oldError) throw oldError;

      const needingMigration =
        oldFormatPhotos?.filter(
          (s) =>
            s.student_photo_url && s.student_photo_url.includes(`/${s.id}/`)
        ).length || 0;

      return {
        needed: needingMigration > 0,
        total_photos: totalPhotos?.length || 0,
        photos_needing_migration: needingMigration
      };
    } catch (error) {
      console.error('Error checking migration status:', error);
      return {
        needed: false,
        total_photos: 0,
        photos_needing_migration: 0
      };
    }
  }
}
