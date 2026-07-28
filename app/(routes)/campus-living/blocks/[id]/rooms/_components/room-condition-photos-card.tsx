'use client';

import { useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Camera, Loader2, X, ImageOff } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useRoomConditionPhotos,
  useUploadRoomConditionPhoto,
  useDeleteRoomConditionPhoto,
} from '@/hooks/campus-living/use-hostel-room-photos';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_RAW_BYTES = 25 * 1024 * 1024; // reject absurdly large files before compressing
const MAX_PHOTOS = 20;

interface Props {
  roomId: string;
}

export function RoomConditionPhotosCard({ roomId }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { isSuperAdmin, permissions } = usePermissions();
  const canEdit = isSuperAdmin || !!permissions?.['campus_living.rooms.edit'];

  const { data: photos = [], isLoading } = useRoomConditionPhotos(roomId);
  const uploadMutation = useUploadRoomConditionPhoto(roomId);
  const deleteMutation = useDeleteRoomConditionPhoto(roomId);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    if (photos.length + files.length > MAX_PHOTOS) {
      toast.error(`A room can have at most ${MAX_PHOTOS} condition photos.`);
      return;
    }
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!ALLOWED_TYPES.has(file.type)) {
          toast.error(`${file.name}: only JPEG, PNG, and WebP images are supported.`);
          continue;
        }
        if (file.size > MAX_RAW_BYTES) {
          toast.error(`${file.name}: file is too large.`);
          continue;
        }
        try {
          const compressed = await imageCompression(file, {
            maxSizeMB: 1.5,
            maxWidthOrHeight: 1600,
            useWebWorker: true,
          });
          await uploadMutation.mutateAsync(compressed);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : `Upload failed: ${file.name}`);
        }
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Room Condition Photos</CardTitle>
          <CardDescription>{photos.length} photo{photos.length === 1 ? '' : 's'}</CardDescription>
        </div>
        {canEdit && (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Camera className="mr-2 h-4 w-4" />
              )}
              {uploading ? 'Uploading…' : 'Add photos'}
            </Button>
          </>
        )}
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Loading photos…</p>}
        {!isLoading && photos.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <ImageOff className="h-8 w-8 mb-2" />
            <p className="text-sm">No condition photos uploaded yet.</p>
          </div>
        )}
        {photos.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {photos.map((photo) => (
              <div key={photo.id} className="relative group aspect-square rounded-lg overflow-hidden border bg-muted">
                <img
                  src={`/api/campus-living/rooms/${roomId}/condition-photos/${photo.id}/image`}
                  alt={photo.file_name}
                  className="h-full w-full object-cover"
                />
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => deleteMutation.mutate(photo.id)}
                    disabled={deleteMutation.isPending}
                    className="absolute top-1.5 right-1.5 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
