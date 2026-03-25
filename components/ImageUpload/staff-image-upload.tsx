// components/staff/staff-image-upload.tsx

'use client';

import { useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StorageService } from '@/lib/storage/storage-service';
import { toast } from 'react-hot-toast';

interface StaffImageUploadProps {
  value?: string;
  onChange: (value: string) => void;
  onRemove: () => void;
  staffId: string;
}

export function StaffImageUpload({
  value,
  onChange,
  onRemove,
  staffId
}: StaffImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;

    try {
      setIsUploading(true);
      const file = e.target.files[0];

      const { publicUrl, error } = await StorageService.uploadStaffImage(
        file,
        staffId
      );

      if (error) throw error;
      if (!publicUrl) throw new Error('Failed to get uploaded file URL');

      onChange(publicUrl);
      toast.success('Profile picture uploaded successfully');
    } catch (error) {
      console.error('Error uploading profile picture:', error);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to upload profile picture'
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className='flex items-center gap-4'>
      {value ? (
        <div className='relative w-[200px] h-[200px]'>
          <Image
            src={value}
            alt='Staff profile'
            fill
            className='object-cover rounded-md'
          />
          <Button
            type='button'
            variant='destructive'
            size='icon'
            className='absolute -top-2 -right-2 h-6 w-6'
            onClick={onRemove}
          >
            <X className='h-4 w-4' />
          </Button>
        </div>
      ) : (
        <div className='flex flex-col items-center'>
          <Input
            type='file'
            accept='image/*'
            onChange={handleUpload}
            disabled={isUploading}
            className='hidden'
            id='staff-image-upload'
          />
          <label
            htmlFor='staff-image-upload'
            className='flex flex-col items-center gap-2 cursor-pointer'
          >
            <div className='w-[200px] h-[200px] border-2 border-dashed rounded-md flex items-center justify-center'>
              <ImagePlus className='h-10 w-10 text-muted-foreground' />
            </div>
            <span className='text-sm text-muted-foreground'>
              {isUploading ? 'Uploading...' : 'Upload Profile Picture'}
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
