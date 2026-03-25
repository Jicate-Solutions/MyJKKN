// app/(routes)/profile/_components/avatar-upload.tsx
'use client';

import { CameraIcon, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'react-hot-toast';
import { StorageService } from '@/lib/storage/storage-service';
import { AuthService } from '@/lib/auth/auth-service';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

interface AvatarUploadProps {
  avatarUrl: string | null;
  initials: string;
  onUploadComplete?: () => void;
  userId: string;
}

export function AvatarUpload({
  avatarUrl,
  initials,
  onUploadComplete,
  userId
}: AvatarUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      try {
        setIsUploading(true);
        const { publicUrl, error } = await StorageService.uploadAvatar(file);

        if (error) throw error;
        if (!publicUrl) throw new Error('Failed to get public URL');

        // Update profile with new avatar URL
        await AuthService.updateUserProfile({
          avatar_url: publicUrl
        });

        toast.success('Avatar updated successfully');
        onUploadComplete?.();
      } catch (error) {
        console.error('Error uploading avatar:', error);
        toast.error(
          error instanceof Error ? error.message : 'Failed to upload avatar'
        );
      } finally {
        setIsUploading(false);
      }
    },
    [onUploadComplete]
  );

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      const { error } = await StorageService.deleteAvatar(userId);
      if (error) throw error;

      toast.success('Avatar removed successfully');
      onUploadComplete?.();
    } catch (error) {
      console.error('Error deleting avatar:', error);
      toast.error('Failed to remove avatar');
    } finally {
      setIsDeleting(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif']
    },
    maxFiles: 1,
    multiple: false,
    disabled: isUploading
  });

  return (
    <div className='flex flex-col items-center gap-4'>
      <div {...getRootProps()} className='relative group cursor-pointer'>
        <input {...getInputProps()} />
        <Avatar className='h-24 w-24'>
          <AvatarImage src={avatarUrl || undefined} alt='Profile' />
          <AvatarFallback className='text-2xl bg-primary/10'>
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className='absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity'>
          {isUploading ? (
            <div className='h-5 w-5 animate-spin rounded-full border-2 border-primary border-r-transparent' />
          ) : (
            <CameraIcon className='h-8 w-8 text-white' />
          )}
        </div>
        {isDragActive && (
          <div className='absolute inset-0 flex items-center justify-center bg-black/60 rounded-full'>
            <p className='text-white text-xs'>Drop image here</p>
          </div>
        )}
      </div>
      {avatarUrl && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant='outline'
              size='sm'
              className='text-destructive'
              disabled={isDeleting}
            >
              <Trash2 className='h-4 w-4 mr-2' />
              Remove Avatar
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Avatar?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove your current profile picture. Are you sure you
                want to continue?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
              >
                {isDeleting ? 'Removing...' : 'Remove Avatar'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
