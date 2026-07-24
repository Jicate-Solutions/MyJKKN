/**
 * MBA Associates roster (browser client) — the assign picker's people list.
 * ============================================================================
 *
 * Owned solely by the UI PR (feat/mba-analyst-ui). The backend service
 * (`./mba-analyst-service`, PR #2339) deliberately has no "list associates"
 * method, so this list is resolved here instead — keeping it out of the file
 * the backend replaces on merge. Reads the current membership of the
 * `mba_associate` role (kept in sync daily by `fn_mba_associate_sync`) through
 * the existing Role/UserRoles services — no raw table calls of its own.
 */

import { RoleService } from '@/lib/services/roles/role-service';
import { UserRolesService } from '@/lib/services/users/user-roles-service';
import { logger } from '@/lib/utils/enhanced-logger';

const MODULE = 'improvement/mba-analyst';

/** The role_key whose members are the MBA Associates. */
const MBA_ASSOCIATE_ROLE_KEY = 'mba_associate';

/** A single MBA Associate for the assign picker. */
export interface MbaAssociateLite {
  user_id: string;
  name: string | null;
  email: string | null;
}

/** The MBA Associates (members of the `mba_associate` role), sorted by name
 *  for a stable picker. Returns [] on any failure — the picker degrades to an
 *  empty state rather than throwing. */
export async function listMbaAssociates(): Promise<MbaAssociateLite[]> {
  try {
    const role = await RoleService.getRoleByKey(MBA_ASSOCIATE_ROLE_KEY);
    if (!role?.id) {
      logger.warn(MODULE, `Role "${MBA_ASSOCIATE_ROLE_KEY}" not found`);
      return [];
    }
    const members = await UserRolesService.getUsersByRole(role.id);
    return members
      .map((m) => ({
        user_id: m.userId,
        name: m.userName || null,
        email: m.email || null
      }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  } catch (error) {
    logger.error(MODULE, 'Error fetching MBA Associates', error);
    return [];
  }
}
