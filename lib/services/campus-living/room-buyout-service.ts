import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  MySettleWindow,
  RoomBuyoutActionResult,
  RoomBuyoutConsent,
  RoomBuyoutQuote,
  RoomBuyoutWithConsents,
} from '@/types/campus-living/room-buyout';

/**
 * Room buyout — pay for the empty beds and hold the room.
 *
 * Same loose-RPC shape as RoomChangeService: these functions are not in the
 * generated Database type, and registering four RPCs by hand in a 40k-line
 * generated file is not worth the drift.
 *
 * NO ARITHMETIC LIVES HERE. Amounts come from fn_room_buyout_quote, which reads
 * fn_settle_room_annual_cost and deducts the bed the resident already pays for.
 * The commit path re-derives the figure server-side and refuses if occupancy
 * moved, so a stale quote in a browser tab can never bill the wrong number.
 */
export class RoomBuyoutService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  private static rpc(fn: string, args: Record<string, unknown>) {
    return (this.supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => unknown;
    }).rpc(fn, args) as Promise<{
      data: unknown;
      error: { message?: string } | null;
    }>;
  }

  /** What the empty beds would cost, and whether they can be bought at all. */
  static async quote(roomId: string): Promise<RoomBuyoutQuote> {
    const { data, error } = await this.rpc('fn_room_buyout_quote', { p_room_id: roomId });
    if (error) throw new Error(error.message || 'Could not price the empty beds');
    return data as RoomBuyoutQuote;
  }

  /**
   * Ask to take the room. A sole occupant is billed and the room locked at once;
   * with roommates this only opens the request and waits for them.
   */
  static async request(roomId: string): Promise<RoomBuyoutActionResult> {
    const { data, error } = await this.rpc('fn_room_buyout_request', { p_room_id: roomId });
    if (error) throw new Error(error.message || 'Could not request the room buyout');
    return data as RoomBuyoutActionResult;
  }

  /** Agree to, or refuse, a roommate's request. One refusal ends it for everyone. */
  static async respond(buyoutId: string, agree: boolean): Promise<RoomBuyoutActionResult> {
    const { data, error } = await this.rpc('fn_room_buyout_respond', {
      p_buyout_id: buyoutId,
      p_agree: agree,
    });
    if (error) throw new Error(error.message || 'Could not record your answer');
    return data as RoomBuyoutActionResult;
  }

  /** Staff only — give the beds back. Deliberately does not reverse the bill. */
  static async release(buyoutId: string, reason?: string): Promise<RoomBuyoutActionResult> {
    const { data, error } = await this.rpc('fn_room_buyout_release', {
      p_buyout_id: buyoutId,
      p_reason: reason ?? null,
    });
    if (error) throw new Error(error.message || 'Could not release the room');
    return data as RoomBuyoutActionResult;
  }

  /**
   * The live buyout on a room, with everyone's answer. Returns null when there
   * is none — RLS already limits this to the room's own residents and to staff
   * holding campus_living.fees.view.
   */
  static async getLive(roomId: string): Promise<RoomBuyoutWithConsents | null> {
    const { data, error } = await this.supabase
      .from('hostel_room_buyouts')
      .select('*')
      .eq('room_id', roomId)
      .in('status', ['pending_consent', 'active'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message || 'Could not load the room buyout');
    if (!data) return null;

    const { data: consents, error: consentError } = await this.supabase
      .from('hostel_room_buyout_consents')
      .select('*')
      .eq('buyout_id', (data as { id: string }).id);
    if (consentError) throw new Error(consentError.message || 'Could not load the answers');

    return {
      ...(data as unknown as RoomBuyoutWithConsents),
      consents: (consents ?? []) as unknown as RoomBuyoutConsent[],
    };
  }

  /**
   * The resident's own deadline. Null when no window is open on her room —
   * which is the normal state while the mechanism is off, so the caller must
   * render no countdown rather than a guess.
   */
  static async mySettleWindow(): Promise<MySettleWindow | null> {
    const { data, error } = await this.rpc('fn_my_room_settle_window', {});
    if (error) throw new Error(error.message || 'Could not load your deadline');
    return (data as MySettleWindow | null) ?? null;
  }
}
