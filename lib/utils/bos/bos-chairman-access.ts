import { createClient } from '@/lib/supabase/server';
import { isBosChairmanRow } from '@/types/bos';

/**
 * Server-side check: is userId the chairman of any active BoS composition
 * for a board that governs programmeCode at institutionsId?
 *
 * Mirrors the DB function is_board_chairman_for_programme used in RLS policies.
 * Use this in API routes to compute the `can_edit` flag returned to the client.
 * The RLS layer independently enforces the constraint at the DB level.
 *
 * Chain:
 *   profiles.id (userId)
 *   → staff.profile_id → staff.id
 *   → bos_members.staff_id (member_type = 'chairman')
 *   → bos_compositions.id (is_active = true)
 *   → bos_board_programmes.board_id (programme_code match)
 */
export async function isChairmanForProgramme(
  userId: string,
  programmeCode: string,
  institutionsId: string
): Promise<boolean> {
  const supabase = await createClient();

  // Step 1: Resolve user → staff record
  const { data: staffRecord } = await supabase
    .from('staff')
    .select('id')
    .eq('profile_id', userId)
    .maybeSingle();

  if (!staffRecord) return false;

  // Step 2: Boards governing this programme at this institution
  const { data: boardProgs } = await supabase
    .from('bos_board_programmes')
    .select('board_id')
    .eq('institutions_id', institutionsId)
    .eq('programme_code', programmeCode)
    .eq('is_active', true);

  const boardIds = (boardProgs ?? []).map((b: { board_id: string }) => b.board_id);
  if (boardIds.length === 0) return false;

  // Step 3: Active compositions for those boards
  const { data: compositions } = await supabase
    .from('bos_compositions')
    .select('id')
    .in('board_id', boardIds)
    .eq('is_active', true);

  const compositionIds = (compositions ?? []).map((c: { id: string }) => c.id);
  if (compositionIds.length === 0) return false;

  // Step 4: Chairman check. member_type stores the catalog type NAME since
  // 20260710150000, so chairman-ness is derived from the linked catalog row's
  // base_type (with a literal fallback for legacy rows) rather than filtered
  // in SQL.
  const { data: memberships } = await supabase
    .from('bos_members')
    .select('id, member_type, member_type_rec:bos_member_types(base_type)')
    .in('composition_id', compositionIds)
    .eq('staff_id', staffRecord.id);

  return (memberships ?? []).some((m) => isBosChairmanRow(m as never));
}

/**
 * Single check: is userId ANY board member (not just chairman) for this programme?
 * Used in POST pos/psos routes — all members can now write outcomes.
 */
export async function isMemberForProgramme(
  userId: string,
  programmeCode: string,
  institutionsId: string
): Promise<boolean> {
  const supabase = await createClient();

  const { data: staffRecord } = await supabase
    .from('staff')
    .select('id')
    .eq('profile_id', userId)
    .maybeSingle();

  if (!staffRecord) return false;

  const { data: boardProgs } = await supabase
    .from('bos_board_programmes')
    .select('board_id')
    .eq('institutions_id', institutionsId)
    .eq('programme_code', programmeCode)
    .eq('is_active', true);

  const boardIds = (boardProgs ?? []).map((b: { board_id: string }) => b.board_id);
  if (boardIds.length === 0) return false;

  const { data: compositions } = await supabase
    .from('bos_compositions')
    .select('id')
    .in('board_id', boardIds)
    .eq('is_active', true);

  const compositionIds = (compositions ?? []).map((c: { id: string }) => c.id);
  if (compositionIds.length === 0) return false;

  // Any member type — not restricted to 'chairman'
  const { data: membership } = await supabase
    .from('bos_members')
    .select('id')
    .in('composition_id', compositionIds)
    .eq('staff_id', staffRecord.id)
    .limit(1);

  return (membership ?? []).length > 0;
}

/**
 * Batch check: returns Set of programme codes where userId is ANY board member.
 * Used in GET /api/bos/taxonomy/[regulationId]/programmes to set can_edit.
 */
export async function getBoardMemberProgrammes(
  userId: string,
  programmeCodes: string[],
  institutionsId: string
): Promise<Set<string>> {
  if (programmeCodes.length === 0) return new Set();

  const supabase = await createClient();

  const { data: staffRecord } = await supabase
    .from('staff')
    .select('id')
    .eq('profile_id', userId)
    .maybeSingle();

  if (!staffRecord) return new Set();

  const { data: boardProgs } = await supabase
    .from('bos_board_programmes')
    .select('board_id, programme_code')
    .eq('institutions_id', institutionsId)
    .in('programme_code', programmeCodes)
    .eq('is_active', true);

  if (!boardProgs || boardProgs.length === 0) return new Set();

  const boardIds = [...new Set(boardProgs.map((b: { board_id: string }) => b.board_id))];

  const { data: compositions } = await supabase
    .from('bos_compositions')
    .select('id, board_id')
    .in('board_id', boardIds)
    .eq('is_active', true);

  const compositionIds = (compositions ?? []).map((c: { id: string }) => c.id);
  if (compositionIds.length === 0) return new Set();

  // Any member type
  const { data: memberships } = await supabase
    .from('bos_members')
    .select('composition_id')
    .in('composition_id', compositionIds)
    .eq('staff_id', staffRecord.id);

  const memberCompositionIds = new Set(
    (memberships ?? []).map((m: { composition_id: string }) => m.composition_id)
  );

  const memberBoardIds = new Set(
    (compositions ?? [])
      .filter((c: { id: string; board_id: string }) => memberCompositionIds.has(c.id))
      .map((c: { board_id: string }) => c.board_id)
  );

  return new Set(
    boardProgs
      .filter((bp: { board_id: string }) => memberBoardIds.has(bp.board_id))
      .map((bp: { programme_code: string }) => bp.programme_code)
  );
}

/**
 * Batch check for multiple programme codes at once.
 * Returns a Set of programme codes for which userId is chairman.
 * Used in GET /api/bos/taxonomy/[regulationId]/programmes to annotate
 * each programme with can_edit without N separate DB calls.
 */
export async function getChairmanProgrammes(
  userId: string,
  programmeCodes: string[],
  institutionsId: string
): Promise<Set<string>> {
  if (programmeCodes.length === 0) return new Set();

  const supabase = await createClient();

  // Step 1: Resolve user → staff record
  const { data: staffRecord } = await supabase
    .from('staff')
    .select('id')
    .eq('profile_id', userId)
    .maybeSingle();

  if (!staffRecord) return new Set();

  // Step 2: Boards governing any of the target programmes
  const { data: boardProgs } = await supabase
    .from('bos_board_programmes')
    .select('board_id, programme_code')
    .eq('institutions_id', institutionsId)
    .in('programme_code', programmeCodes)
    .eq('is_active', true);

  if (!boardProgs || boardProgs.length === 0) return new Set();

  const boardIds = [...new Set(boardProgs.map((b: { board_id: string }) => b.board_id))];

  // Step 3: Active compositions for those boards
  const { data: compositions } = await supabase
    .from('bos_compositions')
    .select('id, board_id')
    .in('board_id', boardIds)
    .eq('is_active', true);

  const compositionIds = (compositions ?? []).map((c: { id: string }) => c.id);
  if (compositionIds.length === 0) return new Set();

  // Step 4: Which compositions is userId chairman of? Chairman-ness derives
  // from the catalog base_type (see isChairmanForProgramme above).
  const { data: chairmanships } = await supabase
    .from('bos_members')
    .select('composition_id, member_type, member_type_rec:bos_member_types(base_type)')
    .in('composition_id', compositionIds)
    .eq('staff_id', staffRecord.id);

  const chairCompositionIds = new Set(
    (chairmanships ?? [])
      .filter((m) => isBosChairmanRow(m as never))
      .map((m: { composition_id: string }) => m.composition_id)
  );

  // Step 5: Map back composition → board → programme_code
  const chairBoardIds = new Set(
    (compositions ?? [])
      .filter((c: { id: string; board_id: string }) => chairCompositionIds.has(c.id))
      .map((c: { board_id: string }) => c.board_id)
  );

  const chairProgrammes = new Set(
    boardProgs
      .filter((bp: { board_id: string }) => chairBoardIds.has(bp.board_id))
      .map((bp: { programme_code: string }) => bp.programme_code)
  );

  return chairProgrammes;
}
