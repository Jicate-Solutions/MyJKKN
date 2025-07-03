import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Database } from '@/types/auth';
import { createClient } from '@supabase/supabase-js';

const BUCKETS = {
  AVATARS: 'avatars',
  LOGOS: 'institution-logos',
  STUDENT_PHOTOS: 'student-photos'
} as const;

const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/gif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Supabase client initialization (assuming it's already done elsewhere)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export class StorageService {
  private static supabase = createClientSupabaseClient();

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
        data: { user },
        error: userError
      } = await this.supabase.auth.getUser();

      if (userError || !user) {
        throw new Error('Authentication required');
      }

      await this.deleteOldAvatar(user.id);

      const fileExt = file.name.split('.').pop()?.toLowerCase();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

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
        .eq('id', user.id);

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
        data: { user },
        error: userError
      } = await this.supabase.auth.getUser();

      if (userError || !user) {
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

  // Student photo upload functionality with institution-based path structure
  static async uploadStudentPhoto(
    file: File,
    studentId: string
  ): Promise<{
    publicUrl: string | null;
    error: Error | null;
  }> {
    try {
      await this.validateFile(file);

      const {
        data: { user },
        error: userError
      } = await this.supabase.auth.getUser();

      if (userError || !user) {
        throw new Error('Authentication required');
      }

      // Get student details with institution name and roll number
      const { data: student, error: studentError } = await this.supabase
        .from('students')
        .select(
          `
          roll_number,
          institutions!inner(name)
        `
        )
        .eq('id', studentId)
        .single();

      if (studentError || !student) {
        throw new Error('Student not found or missing institution details');
      }

      if (!student.roll_number) {
        throw new Error('Student roll number is required for photo upload');
      }

      if (!student.institutions?.[0]?.name) {
        throw new Error('Student institution is required for photo upload');
      }

      // Delete old photo using both old and new path structures
      await this.deleteOldStudentPhoto(
        studentId,
        student.institutions[0].name,
        student.roll_number
      );

      const fileExt = file.name.split('.').pop()?.toLowerCase();
      // Create institution-based path: institution-name/roll-number.extension
      const institutionName = this.sanitizePathName(
        student.institutions[0].name
      );
      const filePath = `${institutionName}/${student.roll_number}.${fileExt}`;

      const { error: uploadError } = await this.supabase.storage
        .from(BUCKETS.STUDENT_PHOTOS)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = this.supabase.storage
        .from(BUCKETS.STUDENT_PHOTOS)
        .getPublicUrl(filePath);

      return {
        publicUrl: urlData.publicUrl,
        error: null
      };
    } catch (error) {
      console.error('Error uploading student photo:', error);
      return {
        publicUrl: null,
        error: error instanceof Error ? error : new Error('Upload failed')
      };
    }
  }

  // Bulk upload student photos with institution-based paths
  static async bulkUploadStudentPhotos(
    files: File[],
    onProgress?: (progress: {
      completed: number;
      total: number;
      current?: string;
    }) => void
  ): Promise<{
    success: Array<{
      roll_number: string;
      student_name: string;
      image_url: string;
    }>;
    failed: Array<{ filename: string; roll_number?: string; error: string }>;
  }> {
    const results = {
      success: [] as Array<{
        roll_number: string;
        student_name: string;
        image_url: string;
      }>,
      failed: [] as Array<{
        filename: string;
        roll_number?: string;
        error: string;
      }>
    };

    try {
      const {
        data: { user },
        error: userError
      } = await this.supabase.auth.getUser();

      if (userError || !user) {
        throw new Error('Authentication required');
      }

      // Extract roll numbers from filenames and get student data
      const rollNumbers = files.map((file) => {
        const rollNumber = this.extractRollNumberFromFilename(file.name);
        return { file, rollNumber };
      });

      // Get all students with their institution details
      const validRollNumbers = rollNumbers
        .filter((item) => item.rollNumber)
        .map((item) => item.rollNumber!);

      const { data: students, error: studentsError } = await this.supabase
        .from('students')
        .select(
          `
          id,
          student_name,
          roll_number,
          institutions!inner(name)
        `
        )
        .in('roll_number', validRollNumbers);

      if (studentsError) {
        throw new Error(
          `Failed to fetch student data: ${studentsError.message}`
        );
      }

      // Create lookup map for students
      const studentMap = new Map(
        students?.map((s) => [s.roll_number, s]) || []
      );

      // Process files in batches
      const batchSize = 10;
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (file, batchIndex) => {
            const overallIndex = i + batchIndex;

            try {
              const rollNumber = this.extractRollNumberFromFilename(file.name);

              if (!rollNumber) {
                results.failed.push({
                  filename: file.name,
                  error:
                    'Could not extract roll number from filename. Expected format: ROLLNUMBER.extension'
                });
                return;
              }

              const student = studentMap.get(rollNumber);
              if (!student) {
                results.failed.push({
                  filename: file.name,
                  roll_number: rollNumber,
                  error: 'No student found with this roll number'
                });
                return;
              }

              if (!student.institutions?.[0]?.name) {
                results.failed.push({
                  filename: file.name,
                  roll_number: rollNumber,
                  error: 'Student institution not found'
                });
                return;
              }

              // Validate file
              await this.validateFile(file);

              // Delete old photos
              await this.deleteOldStudentPhoto(
                student.id,
                student.institutions[0].name,
                rollNumber
              );

              // Upload new photo
              const fileExt = file.name.split('.').pop()?.toLowerCase();
              const institutionName = this.sanitizePathName(
                student.institutions[0].name
              );
              const filePath = `${institutionName}/${rollNumber}.${fileExt}`;

              const { error: uploadError } = await this.supabase.storage
                .from(BUCKETS.STUDENT_PHOTOS)
                .upload(filePath, file, {
                  cacheControl: '3600',
                  upsert: true
                });

              if (uploadError) throw uploadError;

              const { data: urlData } = this.supabase.storage
                .from(BUCKETS.STUDENT_PHOTOS)
                .getPublicUrl(filePath);

              // Update student record with new photo URL
              const { error: updateError } = await this.supabase
                .from('students')
                .update({ student_photo_url: urlData.publicUrl })
                .eq('id', student.id);

              if (updateError) {
                console.warn(
                  `Failed to update student photo URL: ${updateError.message}`
                );
              }

              results.success.push({
                roll_number: rollNumber,
                student_name: student.student_name,
                image_url: urlData.publicUrl
              });
            } catch (error) {
              const rollNumber = this.extractRollNumberFromFilename(file.name);
              results.failed.push({
                filename: file.name,
                roll_number: rollNumber || undefined,
                error: error instanceof Error ? error.message : 'Unknown error'
              });
            }

            // Update progress
            if (onProgress) {
              onProgress({
                completed: overallIndex + 1,
                total: files.length,
                current: file.name
              });
            }
          })
        );
      }

      return results;
    } catch (error) {
      console.error('Error in bulk upload:', error);
      // If there's a general error, mark all remaining files as failed
      files.forEach((file) => {
        const rollNumber = this.extractRollNumberFromFilename(file.name);
        if (
          !results.success.some((s) => s.roll_number === rollNumber) &&
          !results.failed.some((f) => f.roll_number === rollNumber)
        ) {
          results.failed.push({
            filename: file.name,
            roll_number: rollNumber || undefined,
            error: error instanceof Error ? error.message : 'Bulk upload failed'
          });
        }
      });

      return results;
    }
  }

  // Helper method to sanitize institution names for file paths
  private static sanitizePathName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .toLowerCase()
      .trim();
  }

  // Helper method to extract roll number from filename
  private static extractRollNumberFromFilename(
    filename: string
  ): string | null {
    // Remove file extension and extract roll number
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');

    // Look for patterns like DB22092, CS21001, etc.
    const rollNumberMatch = nameWithoutExt.match(/^([A-Z]{2,4}\d{2,6})$/i);

    if (rollNumberMatch) {
      return rollNumberMatch[1].toUpperCase();
    }

    return null;
  }

  // Updated delete method to handle both old and new path structures
  private static async deleteOldStudentPhoto(
    studentId: string,
    institutionName?: string,
    rollNumber?: string
  ): Promise<void> {
    try {
      // Delete from old path structure (student-id based)
      const { data: oldFiles } = await this.supabase.storage
        .from(BUCKETS.STUDENT_PHOTOS)
        .list(`${studentId}`);

      if (oldFiles && oldFiles.length > 0) {
        const oldFilesToRemove = oldFiles.map((f) => `${studentId}/${f.name}`);
        await this.supabase.storage
          .from(BUCKETS.STUDENT_PHOTOS)
          .remove(oldFilesToRemove);
      }

      // Delete from new path structure (institution/roll-number based)
      if (institutionName && rollNumber) {
        const sanitizedInstitutionName = this.sanitizePathName(institutionName);

        // List files that start with the roll number in the institution folder
        const { data: newFiles } = await this.supabase.storage
          .from(BUCKETS.STUDENT_PHOTOS)
          .list(sanitizedInstitutionName);

        if (newFiles && newFiles.length > 0) {
          const rollNumberFiles = newFiles.filter((f) =>
            f.name.startsWith(`${rollNumber}.`)
          );

          if (rollNumberFiles.length > 0) {
            const newFilesToRemove = rollNumberFiles.map(
              (f) => `${sanitizedInstitutionName}/${f.name}`
            );
            await this.supabase.storage
              .from(BUCKETS.STUDENT_PHOTOS)
              .remove(newFilesToRemove);
          }
        }
      }
    } catch (error) {
      console.error('Error deleting old student photo:', error);
    }
  }

  static async deleteStudentPhoto(
    studentId: string
  ): Promise<{ error: Error | null }> {
    try {
      // Get student details to delete from new path structure
      const { data: student } = await this.supabase
        .from('students')
        .select(
          `
          roll_number,
          institutions!inner(name)
        `
        )
        .eq('id', studentId)
        .single();

      await this.deleteOldStudentPhoto(
        studentId,
        student?.institutions?.[0]?.name,
        student?.roll_number
      );

      return { error: null };
    } catch (error) {
      console.error('Error deleting student photo:', error);
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
        data: { user },
        error: userError
      } = await this.supabase.auth.getUser();

      if (userError || !user) {
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
