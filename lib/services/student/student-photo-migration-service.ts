import { createClientSupabaseClient } from '@/lib/supabase/client';

interface MigrationResult {
  success: Array<{
    student_id: string;
    student_name: string;
    roll_number: string;
    old_path: string;
    new_path: string;
    new_url: string;
  }>;
  failed: Array<{
    student_id: string;
    student_name: string;
    roll_number?: string;
    error: string;
  }>;
  skipped: Array<{
    student_id: string;
    student_name: string;
    reason: string;
  }>;
}

interface MigrationProgress {
  completed: number;
  total: number;
  current_student?: string;
  current_action?: string;
}

export class StudentPhotoMigrationService {
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

  // Get all students with existing photos that need migration
  static async getStudentsNeedingMigration(): Promise<{
    students: Array<{
      id: string;
      student_name: string;
      roll_number: string;
      student_photo_url: string;
      institution_name: string;
    }>;
    total: number;
  }> {
    try {
      const { data: students, error } = await this.supabase
        .from('students')
        .select(
          `
          id,
          student_name,
          roll_number,
          student_photo_url,
          institutions!inner(name)
        `
        )
        .not('student_photo_url', 'is', null)
        .not('roll_number', 'is', null)
        .not('institution', 'is', null);

      if (error) throw error;

      const validStudents =
        students
          ?.filter(
            (s) =>
              s.student_photo_url &&
              s.roll_number &&
              s.institutions?.[0]?.name &&
              // Check if photo URL uses old format (contains student ID)
              s.student_photo_url.includes(`/${s.id}/`)
          )
          .map((s) => ({
            id: s.id,
            student_name: s.student_name,
            roll_number: s.roll_number,
            student_photo_url: s.student_photo_url,
            institution_name: s.institutions[0].name
          })) || [];

      return {
        students: validStudents,
        total: validStudents.length
      };
    } catch (error) {
      console.error('Error getting students needing migration:', error);
      return { students: [], total: 0 };
    }
  }

  // Migrate a single student's photo
  static async migrateSingleStudentPhoto(student: {
    id: string;
    student_name: string;
    roll_number: string;
    student_photo_url: string;
    institution_name: string;
  }): Promise<{
    success: boolean;
    new_url?: string;
    new_path?: string;
    old_path?: string;
    error?: string;
  }> {
    try {
      // Extract old file path from URL
      const urlParts = student.student_photo_url.split('/');
      const bucketIndex = urlParts.findIndex(
        (part) => part === this.BUCKET_NAME
      );

      if (bucketIndex === -1 || bucketIndex >= urlParts.length - 2) {
        throw new Error('Invalid photo URL format');
      }

      const oldPath = urlParts.slice(bucketIndex + 1).join('/');

      // Download the existing file
      const { data: fileData, error: downloadError } =
        await this.supabase.storage.from(this.BUCKET_NAME).download(oldPath);

      if (downloadError) {
        throw new Error(
          `Failed to download existing photo: ${downloadError.message}`
        );
      }

      // Determine file extension from old path
      const fileExt = oldPath.split('.').pop()?.toLowerCase() || 'jpg';

      // Create new path: institution-name/roll-number.extension
      const institutionName = this.sanitizePathName(student.institution_name);
      const newPath = `${institutionName}/${student.roll_number}.${fileExt}`;

      // Upload to new location
      const { error: uploadError } = await this.supabase.storage
        .from(this.BUCKET_NAME)
        .upload(newPath, fileData, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        throw new Error(
          `Failed to upload to new location: ${uploadError.message}`
        );
      }

      // Get new public URL
      const { data: urlData } = this.supabase.storage
        .from(this.BUCKET_NAME)
        .getPublicUrl(newPath);

      // Update student record with new URL
      const { error: updateError } = await this.supabase
        .from('students')
        .update({ student_photo_url: urlData.publicUrl })
        .eq('id', student.id);

      if (updateError) {
        // Try to clean up the uploaded file
        await this.supabase.storage.from(this.BUCKET_NAME).remove([newPath]);
        throw new Error(
          `Failed to update student record: ${updateError.message}`
        );
      }

      // Delete old file
      const { error: deleteError } = await this.supabase.storage
        .from(this.BUCKET_NAME)
        .remove([oldPath]);

      if (deleteError) {
        console.warn(
          `Failed to delete old photo at ${oldPath}:`,
          deleteError.message
        );
      }

      return {
        success: true,
        new_url: urlData.publicUrl,
        new_path: newPath,
        old_path: oldPath
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Migrate all student photos in batches
  static async migrateAllStudentPhotos(
    onProgress?: (progress: MigrationProgress) => void
  ): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: [],
      failed: [],
      skipped: []
    };

    try {
      // Get all students needing migration
      const { students, total } = await this.getStudentsNeedingMigration();

      if (total === 0) {
        return result;
      }

      // Process in batches of 5 to avoid overwhelming the storage system
      const batchSize = 5;

      for (let i = 0; i < students.length; i += batchSize) {
        const batch = students.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (student, batchIndex) => {
            const overallIndex = i + batchIndex;

            if (onProgress) {
              onProgress({
                completed: overallIndex,
                total,
                current_student: student.student_name,
                current_action: 'Migrating photo...'
              });
            }

            // Check if student has required data
            if (!student.roll_number) {
              result.skipped.push({
                student_id: student.id,
                student_name: student.student_name,
                reason: 'Missing roll number'
              });
              return;
            }

            if (!student.institution_name) {
              result.skipped.push({
                student_id: student.id,
                student_name: student.student_name,
                reason: 'Missing institution name'
              });
              return;
            }

            // Migrate the photo
            const migrationResult = await this.migrateSingleStudentPhoto(
              student
            );

            if (migrationResult.success) {
              result.success.push({
                student_id: student.id,
                student_name: student.student_name,
                roll_number: student.roll_number,
                old_path: migrationResult.old_path!,
                new_path: migrationResult.new_path!,
                new_url: migrationResult.new_url!
              });
            } else {
              result.failed.push({
                student_id: student.id,
                student_name: student.student_name,
                roll_number: student.roll_number,
                error: migrationResult.error!
              });
            }

            if (onProgress) {
              onProgress({
                completed: overallIndex + 1,
                total,
                current_student: student.student_name,
                current_action: 'Completed'
              });
            }
          })
        );
      }

      return result;
    } catch (error) {
      console.error('Error during migration:', error);
      throw error;
    }
  }

  // Preview migration - check what would be migrated without actually doing it
  static async previewMigration(): Promise<{
    will_migrate: number;
    will_skip: number;
    issues: Array<{
      student_name: string;
      roll_number?: string;
      issue: string;
    }>;
  }> {
    try {
      const { students } = await this.getStudentsNeedingMigration();

      let willMigrate = 0;
      let willSkip = 0;
      const issues: Array<{
        student_name: string;
        roll_number?: string;
        issue: string;
      }> = [];

      students.forEach((student) => {
        if (!student.roll_number) {
          willSkip++;
          issues.push({
            student_name: student.student_name,
            roll_number: student.roll_number,
            issue: 'Missing roll number'
          });
          return;
        }

        if (!student.institution_name) {
          willSkip++;
          issues.push({
            student_name: student.student_name,
            roll_number: student.roll_number,
            issue: 'Missing institution name'
          });
          return;
        }

        // Check for potential path conflicts
        const institutionName = this.sanitizePathName(student.institution_name);
        const duplicateRollNumber = students.filter(
          (s) =>
            s.roll_number === student.roll_number &&
            this.sanitizePathName(s.institution_name) === institutionName
        );

        if (duplicateRollNumber.length > 1) {
          willSkip++;
          issues.push({
            student_name: student.student_name,
            roll_number: student.roll_number,
            issue: `Duplicate roll number in same institution: ${student.institution_name}`
          });
          return;
        }

        willMigrate++;
      });

      return {
        will_migrate: willMigrate,
        will_skip: willSkip,
        issues
      };
    } catch (error) {
      console.error('Error previewing migration:', error);
      throw error;
    }
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

      const { total: needingMigration } =
        await this.getStudentsNeedingMigration();

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
