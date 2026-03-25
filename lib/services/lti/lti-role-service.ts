/**
 * LTI Role Service
 *
 * Maps MyJKKN roles to LTI 1.3 role URIs
 * Handles multi-role users and role validation
 *
 * Created: 2026-01-12
 */

import {
  LtiRoleUri,
  LTI_ROLE_URIS,
  MYJKKN_TO_LTI_ROLE_MAP,
  LtiError,
  LTI_ERROR_CODES
} from '@/types/lti';

export class LtiRoleService {
  /**
   * Map a single MyJKKN role to LTI role URIs
   */
  static mapRoleToLti(myjkknRole: string): LtiRoleUri[] {
    const role = myjkknRole.toLowerCase().trim();
    const ltiRoles = MYJKKN_TO_LTI_ROLE_MAP[role];

    if (!ltiRoles || ltiRoles.length === 0) {
      throw new LtiError(
        `Unknown MyJKKN role: ${myjkknRole}`,
        LTI_ERROR_CODES.UNAUTHORIZED,
        400
      );
    }

    return ltiRoles;
  }

  /**
   * Map multiple MyJKKN roles to LTI role URIs (merge and deduplicate)
   * Useful for users with multiple roles (e.g., faculty who is also HOD)
   */
  static mapRolesToLti(myjkknRoles: string[]): LtiRoleUri[] {
    if (!myjkknRoles || myjkknRoles.length === 0) {
      throw new LtiError(
        'No roles provided for LTI mapping',
        LTI_ERROR_CODES.UNAUTHORIZED,
        400
      );
    }

    // Map each role and flatten the array
    const allLtiRoles = myjkknRoles.flatMap((role) => {
      try {
        return this.mapRoleToLti(role);
      } catch (error) {
        // Skip unknown roles and continue with others
        console.warn(`[LTI Role Service] Skipping unknown role: ${role}`);
        return [];
      }
    });

    // Remove duplicates using Set
    const uniqueLtiRoles = Array.from(new Set(allLtiRoles));

    if (uniqueLtiRoles.length === 0) {
      throw new LtiError(
        'No valid roles could be mapped to LTI',
        LTI_ERROR_CODES.UNAUTHORIZED,
        400
      );
    }

    return uniqueLtiRoles;
  }

  /**
   * Get the primary LTI role for a user (used for display/logging)
   * Priority: Administrator > Instructor > Learner
   */
  static getPrimaryRole(ltiRoles: LtiRoleUri[]): LtiRoleUri {
    if (!ltiRoles || ltiRoles.length === 0) {
      throw new LtiError(
        'No LTI roles provided',
        LTI_ERROR_CODES.UNAUTHORIZED,
        400
      );
    }

    // Priority order
    const priorityOrder = [
      LTI_ROLE_URIS.ADMINISTRATOR,
      LTI_ROLE_URIS.INSTRUCTOR,
      LTI_ROLE_URIS.CONTENT_DEVELOPER,
      LTI_ROLE_URIS.LEARNER,
      LTI_ROLE_URIS.STUDENT,
      LTI_ROLE_URIS.MENTOR,
      LTI_ROLE_URIS.TEACHING_ASSISTANT
    ];

    for (const role of priorityOrder) {
      if (ltiRoles.includes(role)) {
        return role;
      }
    }

    // Fallback to first role if none match priority
    return ltiRoles[0];
  }

  /**
   * Check if user has administrator privileges in LTI
   */
  static hasAdminRole(ltiRoles: LtiRoleUri[]): boolean {
    return ltiRoles.includes(LTI_ROLE_URIS.ADMINISTRATOR);
  }

  /**
   * Check if user has instructor privileges in LTI
   */
  static hasInstructorRole(ltiRoles: LtiRoleUri[]): boolean {
    return (
      ltiRoles.includes(LTI_ROLE_URIS.INSTRUCTOR) ||
      ltiRoles.includes(LTI_ROLE_URIS.CONTENT_DEVELOPER)
    );
  }

  /**
   * Check if user is a learner in LTI
   */
  static isLearner(ltiRoles: LtiRoleUri[]): boolean {
    return (
      ltiRoles.includes(LTI_ROLE_URIS.LEARNER) ||
      ltiRoles.includes(LTI_ROLE_URIS.STUDENT)
    );
  }

  /**
   * Validate that roles are valid LTI role URIs
   */
  static validateLtiRoles(roles: string[]): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!roles || roles.length === 0) {
      errors.push('Roles array is empty');
      return { valid: false, errors };
    }

    const validRoleValues = Object.values(LTI_ROLE_URIS);

    roles.forEach((role) => {
      if (!validRoleValues.includes(role as LtiRoleUri)) {
        errors.push(`Invalid LTI role URI: ${role}`);
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get all supported MyJKKN roles
   */
  static getSupportedMyJKKNRoles(): string[] {
    return Object.keys(MYJKKN_TO_LTI_ROLE_MAP);
  }

  /**
   * Get all LTI roles that can be mapped to a MyJKKN role
   */
  static getLtiRolesForMyJKKNRole(myjkknRole: string): LtiRoleUri[] {
    return MYJKKN_TO_LTI_ROLE_MAP[myjkknRole.toLowerCase().trim()] || [];
  }

  /**
   * Get human-readable role name from LTI role URI
   */
  static getLtiRoleName(ltiRole: LtiRoleUri): string {
    const roleNames: Record<LtiRoleUri, string> = {
      [LTI_ROLE_URIS.ADMINISTRATOR]: 'Administrator',
      [LTI_ROLE_URIS.INSTRUCTOR]: 'Instructor',
      [LTI_ROLE_URIS.LEARNER]: 'Learner',
      [LTI_ROLE_URIS.CONTENT_DEVELOPER]: 'Content Developer',
      [LTI_ROLE_URIS.TEACHING_ASSISTANT]: 'Teaching Assistant',
      [LTI_ROLE_URIS.MENTOR]: 'Mentor',
      [LTI_ROLE_URIS.STUDENT]: 'Student',
      [LTI_ROLE_URIS.MANAGER]: 'Manager'
    };

    return roleNames[ltiRole] || 'Unknown Role';
  }

  /**
   * Build role summary for logging/debugging
   */
  static buildRoleSummary(myjkknRoles: string[], ltiRoles: LtiRoleUri[]): {
    myjkknRoles: string[];
    ltiRoles: string[];
    primaryRole: string;
    hasAdminRole: boolean;
    hasInstructorRole: boolean;
    isLearner: boolean;
  } {
    return {
      myjkknRoles,
      ltiRoles,
      primaryRole: this.getLtiRoleName(this.getPrimaryRole(ltiRoles)),
      hasAdminRole: this.hasAdminRole(ltiRoles),
      hasInstructorRole: this.hasInstructorRole(ltiRoles),
      isLearner: this.isLearner(ltiRoles)
    };
  }

  /**
   * Map user role from database to LTI roles
   * Handles both single role string and role arrays
   */
  static mapUserRoleToLti(userRole: string | string[]): LtiRoleUri[] {
    if (Array.isArray(userRole)) {
      return this.mapRolesToLti(userRole);
    }

    return this.mapRoleToLti(userRole);
  }
}
