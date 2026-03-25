// ============================================
// PROFILE IMAGE UPLOAD COMPONENT
// ============================================
// Created: 2025-01-19
// Purpose: Upload learner profile images to Supabase storage
// ============================================

'use client';

import { useState, useRef, useEffect } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Camera, Loader2, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

/**
 * Helper function to upload a file to Supabase storage
 * Use this in EnquiryForm to upload the file on submit
 */
export async function uploadProfileImage(file: File): Promise<string> {
  const supabase = createClientSupabaseClient();

  // Generate unique filename
  const timestamp = Date.now();
  const fileName = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

  // Upload to Supabase storage
  const { data, error } = await supabase.storage
    .from('student-photos')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    console.error('[profile-image-upload] Upload error:', error);
    throw new Error('Failed to upload image');
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('student-photos')
    .getPublicUrl(fileName);

  return publicUrl;
}

interface ProfileImageUploadProps {
  value?: string;
  onChange: (url: string) => void;
  className?: string;
  delayUpload?: boolean; // If true, only preview - don't upload until parent triggers
  onFileChange?: (file: File | null) => void; // Callback for delayed upload mode
}

/**
 * ProfileImageUpload Component
 *
 * Features:
 * - Upload profile images to Supabase storage (student-photos bucket)
 * - Preview uploaded image
 * - Remove existing image
 * - Validates file size (max 5MB) and type (images only)
 * - Generates unique filenames using timestamp
 * - Delayed upload mode: Only preview image, upload on form submit
 */
export function ProfileImageUpload({ value, onChange, className, delayUpload = false, onFileChange }: ProfileImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(value);
  const [pendingFile, setPendingFile] = useState<File | null>(null); // For delayed upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClientSupabaseClient();

  // Cleanup: Revoke object URL on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (pendingFile && previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [pendingFile, previewUrl]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      toast.error('Image size must be less than 5MB');
      return;
    }

    // DELAYED UPLOAD MODE: Only create preview, don't upload yet
    if (delayUpload) {
      // Create local preview URL
      const localPreviewUrl = URL.createObjectURL(file);
      setPreviewUrl(localPreviewUrl);
      setPendingFile(file);

      // Notify parent component
      if (onFileChange) {
        onFileChange(file);
      }

      toast.success('Image selected - will upload on submit');
      return;
    }

    // IMMEDIATE UPLOAD MODE: Upload to storage right away
    setUploading(true);
    try {
      // Generate unique filename: student-photos/timestamp-filename
      const timestamp = Date.now();
      const fileExt = file.name.split('.').pop();
      const fileName = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const filePath = `${fileName}`;

      // Upload to Supabase storage
      const { data, error } = await supabase.storage
        .from('student-photos')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) {
        console.error('[profile-image-upload] Upload error:', error);
        toast.error('Failed to upload image');
        return;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('student-photos')
        .getPublicUrl(filePath);

      // Update preview and form value
      setPreviewUrl(publicUrl);
      onChange(publicUrl);
      toast.success('Image uploaded successfully');
    } catch (error) {
      console.error('[profile-image-upload] Unexpected error:', error);
      toast.error('Failed to upload image');
    } finally {
      setUploading(false);
      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveImage = async () => {
    if (!previewUrl) return;

    try {
      // DELAYED UPLOAD MODE: Only remove local preview
      if (delayUpload && pendingFile) {
        // Revoke local preview URL to free memory
        URL.revokeObjectURL(previewUrl);
        setPendingFile(null);
        setPreviewUrl(undefined);
        onChange('');

        // Notify parent
        if (onFileChange) {
          onFileChange(null);
        }

        toast.success('Image removed');
        return;
      }

      // IMMEDIATE UPLOAD MODE: Delete from storage
      // Extract file path from public URL
      const urlParts = previewUrl.split('/student-photos/');
      if (urlParts.length === 2) {
        const filePath = urlParts[1];

        // Delete from storage
        const { error } = await supabase.storage
          .from('student-photos')
          .remove([filePath]);

        if (error) {
          console.error('[profile-image-upload] Delete error:', error);
          // Continue even if delete fails - user may not have permission
        }
      }

      // Clear preview and form value
      setPreviewUrl(undefined);
      onChange('');
      toast.success('Image removed');
    } catch (error) {
      console.error('[profile-image-upload] Unexpected error:', error);
      toast.error('Failed to remove image');
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      {/* Avatar Preview */}
      <div className="relative">
        <Avatar className="h-32 w-32">
          <AvatarImage src={previewUrl} alt="Profile" />
          <AvatarFallback className="bg-muted">
            <Camera className="h-12 w-12 text-muted-foreground" />
          </AvatarFallback>
        </Avatar>

        {/* Remove button - shown when image exists */}
        {previewUrl && !uploading && (
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute -top-2 -right-2 h-8 w-8 rounded-full"
            onClick={handleRemoveImage}
          >
            <X className="h-4 w-4" />
          </Button>
        )}

        {/* Upload overlay - shown when uploading */}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
            <Loader2 className="h-8 w-8 text-white animate-spin" />
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
        disabled={uploading}
      />

      {/* Upload button */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={triggerFileInput}
        disabled={uploading}
        className="gap-2"
      >
        {uploading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading...
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" />
            {previewUrl ? 'Change Photo' : 'Upload Photo'}
          </>
        )}
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        Max file size: 5MB
        <br />
        Supported formats: JPG, PNG, GIF, WebP
      </p>
    </div>
  );
}
