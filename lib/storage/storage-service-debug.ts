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

// Supabase client initialization
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface DiagnosticInfo {
  timestamp: string;
  step: string;
  status: 'success' | 'error' | 'warning';
  message: string;
  data?: any;
  error?: any;
}

interface EnhancedUploadResult {
  success: Array<{
    roll_number: string;
    student_name: string;
    image_url: string;
    diagnostics: DiagnosticInfo[];
  }>;
  failed: Array<{
    filename: string;
    roll_number?: string;
    error: string;
    detailed_error?: string;
    diagnostics: DiagnosticInfo[];
  }>;
  system_diagnostics: DiagnosticInfo[];
}

export class StorageServiceDebug {
  private static supabase = createClientSupabaseClient();
  private static diagnostics: DiagnosticInfo[] = [];

  private static addDiagnostic(
    step: string,
    status: 'success' | 'error' | 'warning',
    message: string,
    data?: any,
    error?: any
  ) {
    const diagnostic: DiagnosticInfo = {
      timestamp: new Date().toISOString(),
      step,
      status,
      message,
      data,
      error
    };
    this.diagnostics.push(diagnostic);
    console.log(`[${status.toUpperCase()}] ${step}: ${message}`, {
      data,
      error
    });
  }

  private static async validateFileEnhanced(file: File): Promise<{
    valid: boolean;
    errors: string[];
    diagnostics: DiagnosticInfo[];
  }> {
    const fileDiagnostics: DiagnosticInfo[] = [];
    const errors: string[] = [];

    // Log file details
    fileDiagnostics.push({
      timestamp: new Date().toISOString(),
      step: 'file_info',
      status: 'success',
      message: 'File information captured',
      data: {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified
      }
    });

    // Validate file type
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      const error = `Invalid file type: ${
        file.type
      }. Allowed types: ${ALLOWED_FILE_TYPES.join(', ')}`;
      errors.push(error);
      fileDiagnostics.push({
        timestamp: new Date().toISOString(),
        step: 'file_type_validation',
        status: 'error',
        message: error,
        data: { provided_type: file.type, allowed_types: ALLOWED_FILE_TYPES }
      });
    } else {
      fileDiagnostics.push({
        timestamp: new Date().toISOString(),
        step: 'file_type_validation',
        status: 'success',
        message: 'File type validation passed',
        data: { file_type: file.type }
      });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      const error = `File size too large: ${(file.size / 1024 / 1024).toFixed(
        2
      )}MB. Maximum allowed: ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(2)}MB`;
      errors.push(error);
      fileDiagnostics.push({
        timestamp: new Date().toISOString(),
        step: 'file_size_validation',
        status: 'error',
        message: error,
        data: {
          file_size_bytes: file.size,
          file_size_mb: (file.size / 1024 / 1024).toFixed(2),
          max_size_mb: (MAX_FILE_SIZE / 1024 / 1024).toFixed(2)
        }
      });
    } else {
      fileDiagnostics.push({
        timestamp: new Date().toISOString(),
        step: 'file_size_validation',
        status: 'success',
        message: 'File size validation passed',
        data: {
          file_size_mb: (file.size / 1024 / 1024).toFixed(2),
          max_size_mb: (MAX_FILE_SIZE / 1024 / 1024).toFixed(2)
        }
      });
    }

    // Check if file can be read as image
    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer.slice(0, 4));
      const fileSignature = Array.from(uint8Array)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');

      fileDiagnostics.push({
        timestamp: new Date().toISOString(),
        step: 'file_signature_check',
        status: 'success',
        message: 'File signature captured',
        data: {
          signature: fileSignature,
          signature_bytes: Array.from(uint8Array)
        }
      });

      // Validate common image signatures
      const imageSignatures: { [key: string]: string } = {
        ffd8ffe0: 'JPEG',
        ffd8ffe1: 'JPEG',
        ffd8ffe2: 'JPEG',
        '89504e47': 'PNG',
        '47494638': 'GIF'
      };

      const detectedFormat = imageSignatures[fileSignature.slice(0, 8)];
      if (detectedFormat) {
        fileDiagnostics.push({
          timestamp: new Date().toISOString(),
          step: 'image_format_detection',
          status: 'success',
          message: `Valid image format detected: ${detectedFormat}`,
          data: { detected_format: detectedFormat, signature: fileSignature }
        });
      } else {
        fileDiagnostics.push({
          timestamp: new Date().toISOString(),
          step: 'image_format_detection',
          status: 'warning',
          message: 'Could not detect standard image format from file signature',
          data: { signature: fileSignature }
        });
      }
    } catch (error) {
      fileDiagnostics.push({
        timestamp: new Date().toISOString(),
        step: 'file_read_test',
        status: 'error',
        message: 'Failed to read file contents',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      errors.push('File appears to be corrupted or unreadable');
    }

    return {
      valid: errors.length === 0,
      errors,
      diagnostics: fileDiagnostics
    };
  }

  // Enhanced bulk upload with comprehensive diagnostics
  static async bulkUploadStudentPhotosDebug(
    files: File[],
    onProgress?: (progress: {
      completed: number;
      total: number;
      current?: string;
    }) => void
  ): Promise<EnhancedUploadResult> {
    this.diagnostics = [];
    this.addDiagnostic(
      'bulk_upload_start',
      'success',
      `Starting bulk upload of ${files.length} files`
    );

    const results: EnhancedUploadResult = {
      success: [],
      failed: [],
      system_diagnostics: []
    };

    try {
      // Test authentication first
      this.addDiagnostic(
        'authentication_check',
        'success',
        'Checking user authentication'
      );
      const {
        data: { user },
        error: userError
      } = await this.supabase.auth.getUser();

      if (userError || !user) {
        this.addDiagnostic(
          'authentication_check',
          'error',
          'Authentication failed',
          { user_error: userError }
        );
        throw new Error('Authentication required');
      }
      this.addDiagnostic(
        'authentication_check',
        'success',
        'User authentication successful',
        { user_id: user.id }
      );

      // Extract roll numbers and validate files
      this.addDiagnostic(
        'roll_number_extraction',
        'success',
        'Extracting roll numbers from filenames'
      );
      const rollNumbers = files.map((file) => {
        const rollNumber = this.extractRollNumberFromFilename(file.name);
        this.addDiagnostic(
          'roll_number_extraction',
          rollNumber ? 'success' : 'warning',
          `File: ${file.name} -> Roll Number: ${rollNumber || 'NO MATCH'}`,
          { filename: file.name, roll_number: rollNumber }
        );
        return { file, rollNumber };
      });

      // Get valid roll numbers for database query
      const validRollNumbers = rollNumbers
        .filter((item) => item.rollNumber)
        .map((item) => item.rollNumber!);

      this.addDiagnostic(
        'database_query_prep',
        'success',
        `Preparing to query ${validRollNumbers.length} students`,
        { roll_numbers: validRollNumbers }
      );

      // Fetch students with institution details
      const { data: students, error: studentsError } = await this.supabase
        .from('learners_profiles')
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
        this.addDiagnostic(
          'database_query',
          'error',
          'Failed to fetch student data',
          { error: studentsError }
        );
        throw new Error(
          `Failed to fetch student data: ${studentsError.message}`
        );
      }

      this.addDiagnostic(
        'database_query',
        'success',
        `Successfully fetched ${students?.length || 0} students from database`,
        {
          students_found: students?.length || 0,
          queried_roll_numbers: validRollNumbers.length,
          students: students?.map((s) => ({
            roll_number: (s as any).roll_number,
            name: (s as any).student_name,
            institution: (s as any).institutions?.[0]?.name
          }))
        }
      );

      // Create lookup map for students
      const studentMap = new Map(
        students?.map((s) => [(s as any).roll_number, s]) || []
      );

      this.addDiagnostic(
        'student_mapping',
        'success',
        'Created student lookup map',
        {
          mapped_students: Array.from(studentMap.keys()),
          missing_students: validRollNumbers.filter((rn) => !studentMap.has(rn))
        }
      );

      // Process files in batches
      const batchSize = 10;
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        this.addDiagnostic(
          'batch_processing',
          'success',
          `Processing batch ${Math.floor(i / batchSize) + 1}: files ${
            i + 1
          }-${Math.min(i + batchSize, files.length)}`
        );

        await Promise.all(
          batch.map(async (file, batchIndex) => {
            const overallIndex = i + batchIndex;
            const fileDiagnostics: DiagnosticInfo[] = [];

            try {
              fileDiagnostics.push({
                timestamp: new Date().toISOString(),
                step: 'file_processing_start',
                status: 'success',
                message: `Starting processing of file: ${file.name}`,
                data: {
                  filename: file.name,
                  batch_index: batchIndex,
                  overall_index: overallIndex
                }
              });

              // Extract roll number
              const rollNumber = this.extractRollNumberFromFilename(file.name);

              if (!rollNumber) {
                fileDiagnostics.push({
                  timestamp: new Date().toISOString(),
                  step: 'roll_number_extraction',
                  status: 'error',
                  message: 'Could not extract roll number from filename',
                  data: {
                    filename: file.name,
                    expected_format: 'ROLLNUMBER.extension'
                  }
                });

                results.failed.push({
                  filename: file.name,
                  error:
                    'Could not extract roll number from filename. Expected format: ROLLNUMBER.extension',
                  diagnostics: fileDiagnostics
                });
                return;
              }

              fileDiagnostics.push({
                timestamp: new Date().toISOString(),
                step: 'roll_number_extraction',
                status: 'success',
                message: `Successfully extracted roll number: ${rollNumber}`,
                data: { filename: file.name, roll_number: rollNumber }
              });

              // Find student
              const student = studentMap.get(rollNumber);
              if (!student) {
                fileDiagnostics.push({
                  timestamp: new Date().toISOString(),
                  step: 'student_lookup',
                  status: 'error',
                  message: `No student found with roll number: ${rollNumber}`,
                  data: {
                    roll_number: rollNumber,
                    available_students: Array.from(studentMap.keys())
                  }
                });

                results.failed.push({
                  filename: file.name,
                  roll_number: rollNumber,
                  error: 'No student found with this roll number',
                  diagnostics: fileDiagnostics
                });
                return;
              }

              fileDiagnostics.push({
                timestamp: new Date().toISOString(),
                step: 'student_lookup',
                status: 'success',
                message: `Found student: ${(student as any).student_name}`,
                data: {
                  roll_number: rollNumber,
                  student_name: (student as any).student_name,
                  student_id: (student as any).id,
                  institution: (student as any).institutions?.[0]?.name
                }
              });

              // Validate institution
              if (!((student as any).institutions?.[0]?.name)) {
                fileDiagnostics.push({
                  timestamp: new Date().toISOString(),
                  step: 'institution_validation',
                  status: 'error',
                  message: 'Student institution not found',
                  data: {
                    student_id: (student as any).id,
                    student_name: (student as any).student_name
                  }
                });

                results.failed.push({
                  filename: file.name,
                  roll_number: rollNumber,
                  error: 'Student institution not found',
                  diagnostics: fileDiagnostics
                });
                return;
              }

              fileDiagnostics.push({
                timestamp: new Date().toISOString(),
                step: 'institution_validation',
                status: 'success',
                message: `Institution validated: ${(student as any).institutions[0].name}`,
                data: { institution_name: (student as any).institutions[0].name }
              });

              // Enhanced file validation
              const fileValidation = await this.validateFileEnhanced(file);
              fileDiagnostics.push(...fileValidation.diagnostics);

              if (!fileValidation.valid) {
                fileDiagnostics.push({
                  timestamp: new Date().toISOString(),
                  step: 'file_validation',
                  status: 'error',
                  message: 'File validation failed',
                  data: { errors: fileValidation.errors }
                });

                results.failed.push({
                  filename: file.name,
                  roll_number: rollNumber,
                  error: fileValidation.errors.join('; '),
                  detailed_error: `File validation failed: ${fileValidation.errors.join(
                    ', '
                  )}`,
                  diagnostics: fileDiagnostics
                });
                return;
              }

              fileDiagnostics.push({
                timestamp: new Date().toISOString(),
                step: 'file_validation',
                status: 'success',
                message: 'File validation passed',
                data: { filename: file.name }
              });

              // Delete old photos
              fileDiagnostics.push({
                timestamp: new Date().toISOString(),
                step: 'delete_old_photos',
                status: 'success',
                message: 'Attempting to delete old photos',
                data: {
                  student_id: (student as any).id,
                  institution_name: (student as any).institutions[0].name,
                  roll_number: rollNumber
                }
              });

              await this.deleteOldStudentPhoto(
                (student as any).id,
                (student as any).institutions[0].name,
                rollNumber
              );

              fileDiagnostics.push({
                timestamp: new Date().toISOString(),
                step: 'delete_old_photos',
                status: 'success',
                message: 'Old photos deletion completed',
                data: { student_id: (student as any).id }
              });

              // Upload new photo
              const fileExt = file.name.split('.').pop()?.toLowerCase();
              const institutionName = this.sanitizePathName(
                (student as any).institutions[0].name
              );
              const filePath = `${institutionName}/${rollNumber}.${fileExt}`;

              fileDiagnostics.push({
                timestamp: new Date().toISOString(),
                step: 'upload_preparation',
                status: 'success',
                message: 'Prepared upload path',
                data: {
                  file_path: filePath,
                  original_institution_name: (student as any).institutions[0].name,
                  sanitized_institution_name: institutionName,
                  file_extension: fileExt
                }
              });

              const { error: uploadError } = await this.supabase.storage
                .from(BUCKETS.STUDENT_PHOTOS)
                .upload(filePath, file, {
                  cacheControl: '3600',
                  upsert: true
                });

              if (uploadError) {
                fileDiagnostics.push({
                  timestamp: new Date().toISOString(),
                  step: 'storage_upload',
                  status: 'error',
                  message: 'Supabase storage upload failed',
                  data: { file_path: filePath },
                  error: uploadError
                });

                throw uploadError;
              }

              fileDiagnostics.push({
                timestamp: new Date().toISOString(),
                step: 'storage_upload',
                status: 'success',
                message: 'File uploaded to Supabase storage successfully',
                data: { file_path: filePath }
              });

              // Get public URL
              const { data: urlData } = this.supabase.storage
                .from(BUCKETS.STUDENT_PHOTOS)
                .getPublicUrl(filePath);

              fileDiagnostics.push({
                timestamp: new Date().toISOString(),
                step: 'public_url_generation',
                status: 'success',
                message: 'Generated public URL',
                data: { public_url: urlData.publicUrl, file_path: filePath }
              });

              // Update student record
              const { error: updateError } = await (this.supabase as any)
                .from('learners_profiles')
                .update({ student_photo_url: urlData.publicUrl })
                .eq('id', (student as any).id);

              if (updateError) {
                fileDiagnostics.push({
                  timestamp: new Date().toISOString(),
                  step: 'database_update',
                  status: 'warning',
                  message: 'Failed to update student photo URL in database',
                  data: {
                    student_id: (student as any).id,
                    photo_url: urlData.publicUrl
                  },
                  error: updateError
                });
                console.warn(
                  `Failed to update student photo URL: ${updateError.message}`
                );
              } else {
                fileDiagnostics.push({
                  timestamp: new Date().toISOString(),
                  step: 'database_update',
                  status: 'success',
                  message: 'Successfully updated student photo URL in database',
                  data: { student_id: (student as any).id, photo_url: urlData.publicUrl }
                });
              }

              results.success.push({
                roll_number: rollNumber,
                student_name: (student as any).student_name,
                image_url: urlData.publicUrl,
                diagnostics: fileDiagnostics
              });
            } catch (error) {
              const rollNumber = this.extractRollNumberFromFilename(file.name);

              fileDiagnostics.push({
                timestamp: new Date().toISOString(),
                step: 'processing_error',
                status: 'error',
                message: 'File processing failed with exception',
                data: { filename: file.name },
                error: error instanceof Error ? error.message : 'Unknown error'
              });

              results.failed.push({
                filename: file.name,
                roll_number: rollNumber || undefined,
                error: error instanceof Error ? error.message : 'Unknown error',
                detailed_error: `Processing failed: ${
                  error instanceof Error ? error.message : 'Unknown error'
                }`,
                diagnostics: fileDiagnostics
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

      this.addDiagnostic(
        'bulk_upload_complete',
        'success',
        `Bulk upload completed. Success: ${results.success.length}, Failed: ${results.failed.length}`
      );
      results.system_diagnostics = this.diagnostics;
      return results;
    } catch (error) {
      this.addDiagnostic(
        'bulk_upload_error',
        'error',
        'Bulk upload failed with system error',
        {},
        error
      );

      // Mark all remaining files as failed if there's a system error
      files.forEach((file) => {
        const rollNumber = this.extractRollNumberFromFilename(file.name);
        if (
          !results.success.some((s) => s.roll_number === rollNumber) &&
          !results.failed.some((f) => f.roll_number === rollNumber)
        ) {
          results.failed.push({
            filename: file.name,
            roll_number: rollNumber || undefined,
            error:
              error instanceof Error ? error.message : 'Bulk upload failed',
            detailed_error: `System error: ${
              error instanceof Error ? error.message : 'Unknown system error'
            }`,
            diagnostics: [
              {
                timestamp: new Date().toISOString(),
                step: 'system_error',
                status: 'error',
                message: 'File marked as failed due to system error',
                data: { filename: file.name },
                error: error instanceof Error ? error.message : 'Unknown error'
              }
            ]
          });
        }
      });

      results.system_diagnostics = this.diagnostics;
      return results;
    }
  }

  // Helper method to sanitize institution names for file paths
  private static sanitizePathName(name: string): string {
    const sanitized = name
      .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .toLowerCase()
      .trim();

    this.addDiagnostic(
      'path_sanitization',
      'success',
      'Sanitized institution name for storage path',
      {
        original: name,
        sanitized: sanitized
      }
    );

    return sanitized;
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

        this.addDiagnostic(
          'delete_old_photos',
          'success',
          `Deleted ${oldFiles.length} old files from student-id path`,
          {
            student_id: studentId,
            deleted_files: oldFilesToRemove
          }
        );
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

            this.addDiagnostic(
              'delete_old_photos',
              'success',
              `Deleted ${rollNumberFiles.length} old files from institution path`,
              {
                institution_path: sanitizedInstitutionName,
                roll_number: rollNumber,
                deleted_files: newFilesToRemove
              }
            );
          }
        }
      }
    } catch (error) {
      this.addDiagnostic(
        'delete_old_photos',
        'error',
        'Failed to delete old photos',
        {
          student_id: studentId,
          institution_name: institutionName,
          roll_number: rollNumber
        },
        error
      );
      console.error('Error deleting old student photo:', error);
    }
  }
}
