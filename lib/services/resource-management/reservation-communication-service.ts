// lib/services/resource-management/reservation-communication-service.ts
//
// Read side of reservation_communications — the immutable log of ad-hoc
// messages an approver/admin sent to a reservation's booker. RLS
// (fn_can_read_reservation_comments) is the authority: a viewer with no read
// grant gets [] rather than an error, same as ReservationCommentService.
//
// There is deliberately no browser-callable "send" method here. Sending a
// message also has to write a `notifications` row via fanoutNotification(),
// which requires the service-role client (the notifications INSERT policy
// admits only super admins/admins — see BUG-004009 in
// reservation-notification-service.ts). That happens server-side in
// POST /api/resource-management/reservations/communicate.
//
// See supabase/migrations/20261224100000_reservation_communicate_users.sql.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type { ReservationCommunication } from '@/types/reservation';

const MOD = 'resource-management/reservation-communications';
const TABLE = 'reservation_communications';
const SELECT_COLUMNS = `
  id, reservation_id, sender_id, recipient_id, subject, message, created_at,
  sender:profiles!reservation_communications_sender_id_fkey(id, full_name)
`;

export class ReservationCommunicationService {
  private static supabase = createClientSupabaseClient();

  /** Every message sent about this booking, oldest first. */
  static async list(reservationId: string): Promise<ReservationCommunication[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from(TABLE)
        .select(SELECT_COLUMNS)
        .eq('reservation_id', reservationId)
        .order('created_at', { ascending: true });

      if (error) {
        logger.error(MOD, 'Failed to list reservation communications', { reservationId, error });
        throw error;
      }

      return (data ?? []) as ReservationCommunication[];
    } catch (error) {
      logger.error(MOD, 'Unexpected error in list', error);
      throw error;
    }
  }
}
