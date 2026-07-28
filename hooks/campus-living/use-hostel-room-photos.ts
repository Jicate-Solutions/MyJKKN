'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HostelRoomPhotoService } from '@/lib/services/campus-living/hostel-room-photo-service';
import type { HostelRoomConditionPhoto } from '@/types/campus-living';

export const roomPhotoKeys = {
  all: ['hostel-room-photos'] as const,
  byRoom: (roomId: string) => ['hostel-room-photos', 'by-room', roomId] as const,
};

export function useRoomConditionPhotos(roomId: string) {
  return useQuery({
    queryKey: roomPhotoKeys.byRoom(roomId),
    queryFn: () => HostelRoomPhotoService.listPhotos(roomId),
    enabled: !!roomId,
  });
}

export function useUploadRoomConditionPhoto(roomId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<HostelRoomConditionPhoto> => {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/campus-living/rooms/${roomId}/condition-photos`, {
        method: 'POST',
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Upload failed: ${file.name}`);
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roomPhotoKeys.byRoom(roomId) });
    },
  });
}

export function useDeleteRoomConditionPhoto(roomId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (photoId: string) => HostelRoomPhotoService.deletePhoto(photoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roomPhotoKeys.byRoom(roomId) });
      toast.success('Photo deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete photo: ${error.message}`);
    },
  });
}
