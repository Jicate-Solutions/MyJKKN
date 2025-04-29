'use client';

import { useState, useEffect } from 'react';
import { Loader2, X, Upload, User } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { StorageService } from '@/lib/storage/storage-service';
import { useToast } from '@/hooks/use-toast';

interface PhotoUploadProps {
  value: string | undefined;
  onChange: (url: string) => void;
  onRemove: () => void;
  studentId: string;
}

export function PhotoUpload({
  value,
  onChange,
  onRemove,
  studentId
}: PhotoUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(value || null);
  const { toast } = useToast();

  // Update preview when value changes
  useEffect(() => {
    setPreview(value || null);
  }, [value]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);

      const result = await StorageService.uploadStudentPhoto(file, studentId);

      if (result.error) {
        throw result.error;
      }

      if (result.publicUrl) {
        onChange(result.publicUrl);
        setPreview(result.publicUrl);
        toast({
          title: 'Photo uploaded',
          description: 'Student photo has been uploaded successfully.'
        });
      }
    } catch (error) {
      console.error('Error uploading photo:', error);
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description:
          error instanceof Error ? error.message : 'Failed to upload photo'
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = async () => {
    try {
      setIsUploading(true);
      await StorageService.deleteStudentPhoto(studentId);
      setPreview(null);
      onRemove();
      toast({
        title: 'Photo removed',
        description: 'Student photo has been removed successfully.'
      });
    } catch (error) {
      console.error('Error removing photo:', error);
      toast({
        variant: 'destructive',
        title: 'Remove failed',
        description: 'Failed to remove student photo'
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className='space-y-4'>
      {preview ? (
        <div className='relative w-32 h-32 mx-auto'>
          <Image
            src={preview}
            alt='Student photo'
            fill
            className='object-cover rounded-md'
            onError={() => setPreview(null)}
          />
          <Button
            type='button'
            variant='destructive'
            size='icon'
            className='absolute -top-2 -right-2 h-6 w-6'
            onClick={handleRemove}
            disabled={isUploading}
          >
            <X className='h-3 w-3' />
          </Button>
        </div>
      ) : (
        <div className='flex items-center justify-center w-32 h-32 border-2 border-dashed rounded-md mx-auto bg-muted'>
          <User className='h-12 w-12 text-muted-foreground' />
        </div>
      )}

      <div className='flex justify-center'>
        <Button
          type='button'
          variant='outline'
          onClick={() => document.getElementById('photo-upload')?.click()}
          disabled={isUploading}
          className='w-full'
        >
          {isUploading ? (
            <>
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              Uploading...
            </>
          ) : (
            <>
              <Upload className='mr-2 h-4 w-4' />
              {preview ? 'Change Photo' : 'Upload Photo'}
            </>
          )}
        </Button>
        <input
          id='photo-upload'
          type='file'
          accept='image/jpeg,image/png,image/gif'
          className='hidden'
          onChange={handleFileChange}
          disabled={isUploading}
        />
      </div>
      <p className='text-xs text-muted-foreground text-center'>
        Upload a passport-size photograph (JPG, PNG or GIF, max 5MB)
      </p>
    </div>
  );
}
