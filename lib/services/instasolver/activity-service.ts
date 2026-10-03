// lib/services/instasolver/activity-service.ts
//
// The timeline and notes of an issue or requirement. The audit trail is written
// only by database triggers; this service only reads it. Which rows come back —
// including whether internal notes are visible — is decided by RLS.

import type { ActivityEntry, EntityType, Note } from '@/types/instasolver';
import { currentUserId, db, PERSON_COLUMNS, unwrap } from './shared';

export class InstaSolverActivityService {
  static async forEntity(type: EntityType, id: number): Promise<ActivityEntry[]> {
    return (unwrap(
      await db()
        .from('instasolver_activity_log')
        .select(`*, actor:profiles!instasolver_activity_log_actor_id_fkey(${PERSON_COLUMNS})`)
        .eq('entity_type', type)
        .eq('entity_id', id)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
    ) ?? []) as ActivityEntry[];
  }

  static async notes(type: EntityType, id: number): Promise<Note[]> {
    return (unwrap(
      await db()
        .from('instasolver_admin_notes')
        .select(`*, author:profiles!instasolver_admin_notes_author_id_fkey(${PERSON_COLUMNS})`)
        .eq('entity_type', type)
        .eq('entity_id', id)
        .order('created_at', { ascending: true })
    ) ?? []) as Note[];
  }

  static async addNote(type: EntityType, id: number, note: string, isInternal: boolean): Promise<void> {
    const client = db();
    const uid = await currentUserId(client);
    unwrap(
      await client.from('instasolver_admin_notes').insert({
        entity_type: type,
        entity_id: id,
        author_id: uid,
        note: note.trim(),
        is_internal: isInternal
      })
    );
  }
}
