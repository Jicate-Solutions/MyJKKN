'use client';

import { useState, useRef } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';
import { StorageService } from '@/lib/storage/storage-service';
import { toast } from 'sonner';

interface PhotoUploadGridProps {
  label: string;
  photoType: 'stall' | 'event' | 'visitor';
  institutionId: string;
  eventId: string;
  reportDate: string;
  photos: string[];
  onChange: (photos: string[]) => void;
  maxPhotos?: number;
}

export function PhotoUploadGrid({
  label,
  photoType,
  institutionId,
  eventId,
  reportDate,
  photos,
  onChange,
  maxPhotos = 10,
}: PhotoUploadGridProps) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (photos.length + files.length > maxPhotos) {
      toast.error(`Maximum ${maxPhotos} photos allowed`);
      return;
    }

    setIsUploading(true);
    const newUrls: string[] = [];

    for (const file of files) {
      const { publicUrl, error } = await StorageService.uploadExpoPhoto(
        file,
        institutionId,
        eventId,
        reportDate,
        photoType
      );
      if (error) {
        toast.error(`Failed to upload ${file.name}: ${error.message}`);
      } else if (publicUrl) {
        newUrls.push(publicUrl);
      }
    }

    if (newUrls.length > 0) {
      onChange([...photos, ...newUrls]);
      toast.success(`${newUrls.length} photo(s) uploaded`);
    }
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemove = async (url: string) => {
    await StorageService.deleteExpoPhoto(url);
    onChange(photos.filter((p) => p !== url));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{label}</label>
        <span className="text-xs text-muted-foreground">
          {photos.length}/{maxPhotos}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {photos.map((url, idx) => (
          <div
            key={idx}
            className="relative group aspect-square rounded-md overflow-hidden border"
          >
            <img
              src={url}
              alt={`${photoType} ${idx + 1}`}
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={() => handleRemove(url)}
              className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}

        {photos.length < maxPhotos && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="aspect-square rounded-md border-2 border-dashed border-muted-foreground/25 flex flex-col items-center justify-center gap-1 hover:border-primary/50 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isUploading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <>
                <Upload className="h-6 w-6 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Upload</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple
        className="hidden"
        onChange={handleUpload}
      />
    </div>
  );
}
