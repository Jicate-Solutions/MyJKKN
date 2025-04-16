import { createClientSupabaseClient } from '@/lib/supabase/client';
import { v4 as uuidv4 } from 'uuid';

export class StorageUtils {
  private static supabase = createClientSupabaseClient();

  /**
   * Upload a file to Supabase storage
   * @param bucket The storage bucket name
   * @param file The file to upload
   * @param path Optional path prefix
   * @returns The public URL of the uploaded file
   */
  static async uploadFile(
    bucket: string,
    file: File,
    path?: string
  ): Promise<string> {
    try {
      // Generate a unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${uuidv4()}.${fileExt}`;

      // Prepend path if provided
      const filePath = path ? `${path}/${fileName}` : fileName;

      // Upload file
      const { data, error } = await this.supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;

      // Get public URL
      const {
        data: { publicUrl }
      } = this.supabase.storage.from(bucket).getPublicUrl(data.path);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading file:', error);
      throw error;
    }
  }

  /**
   * Upload multiple files to Supabase storage
   * @param bucket The storage bucket name
   * @param files Array of files to upload
   * @param path Optional path prefix
   * @returns Array of public URLs for the uploaded files
   */
  static async uploadMultipleFiles(
    bucket: string,
    files: File[],
    path?: string
  ): Promise<string[]> {
    try {
      const uploadPromises = files.map((file) =>
        this.uploadFile(bucket, file, path)
      );
      return await Promise.all(uploadPromises);
    } catch (error) {
      console.error('Error uploading multiple files:', error);
      throw error;
    }
  }

  /**
   * Delete a file from Supabase storage
   * @param bucket The storage bucket name
   * @param path The path of the file to delete
   */
  static async deleteFile(bucket: string, path: string): Promise<void> {
    try {
      const { error } = await this.supabase.storage.from(bucket).remove([path]);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting file:', error);
      throw error;
    }
  }

  /**
   * Extract path from a public URL
   * @param publicUrl The public URL of the file
   * @returns The path of the file in the bucket
   */
  static getPathFromUrl(publicUrl: string): string {
    try {
      const url = new URL(publicUrl);
      // Parse the pathname to extract the relevant part
      const pathParts = url.pathname.split('/');
      // Skip 'storage/v1/object/public/' part to get the bucket/path
      const relevantPath = pathParts.slice(5).join('/');
      return relevantPath;
    } catch (error) {
      console.error('Error extracting path from URL:', error);
      throw error;
    }
  }
}
