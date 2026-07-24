import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type { HostelRoomConditionPhoto } from '@/types/campus-living';

// Upload is intentionally not wrapped here — it needs server Drive
// credentials, so it goes through /api/campus-living/rooms/[roomId]/condition-photos
// directly from the client (matches the refund-attachments convention).
export class HostelRoomPhotoService {
  static async listPhotos(roomId: string): Promise<HostelRoomConditionPhoto[]> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_room_condition_photos')
        .select('*')
        .eq('room_id', roomId)
        .order('uploaded_at', { ascending: false });
      if (error) {
        logger.error('campus-living/room-photos', 'Failed to list room condition photos', error);
        throw error;
      }
      return (data ?? []) as HostelRoomConditionPhoto[];
    } catch (error) {
      logger.error('campus-living/room-photos', 'Unexpected error in listPhotos', error);
      throw error;
    }
  }

  static async deletePhoto(photoId: string): Promise<void> {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('hostel_room_condition_photos')
        .delete()
        .eq('id', photoId);
      if (error) {
        logger.error('campus-living/room-photos', 'Failed to delete room condition photo', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/room-photos', 'Unexpected error in deletePhoto', error);
      throw error;
    }
  }
}
