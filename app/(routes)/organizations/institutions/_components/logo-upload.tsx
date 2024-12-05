// app/(routes)/organizations/institutions/_components/logo-upload.tsx

'use client';

import { useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Image from 'next/image';
import { StorageService } from '@/lib/storage/storage-service';
import toast from 'react-hot-toast';

interface LogoUploadProps {
  value?: string;
  onChange: (value: string) => void;
  onRemove: () => void;
  institutionId: string; // Add this new prop
}

export function LogoUpload({
  value,
  onChange,
  onRemove,
  institutionId
}: LogoUploadProps) {
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;

    try {
      setIsUploading(true);
      const file = e.target.files[0];

      const { publicUrl, error } = await StorageService.uploadInstitutionLogo(
        file,
        institutionId // Pass this as a prop to the LogoUpload component
      );

      if (error) throw error;
      if (!publicUrl) throw new Error('Failed to get uploaded file URL');

      onChange(publicUrl);
      toast.success('Logo uploaded successfully');
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to upload logo'
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className='flex items-center gap-4'>
      {value ? (
        <div className='relative w-24 h-24'>
          <Image
            src={value}
            alt='Institution logo'
            fill
            className='object-contain'
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
            id='logo-upload'
          />
          <label
            htmlFor='logo-upload'
            className='flex flex-col items-center gap-2 cursor-pointer'
          >
            <div className='w-24 h-24 border-2 border-dashed rounded-lg flex items-center justify-center'>
              <ImagePlus className='h-8 w-8 text-muted-foreground' />
            </div>
            <span className='text-sm text-muted-foreground'>
              {isUploading ? 'Uploading...' : 'Upload Logo'}
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
