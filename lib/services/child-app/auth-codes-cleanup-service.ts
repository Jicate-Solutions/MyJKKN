/**
 * Child App Auth Codes Cleanup Service
 * Manages cleanup of expired and used authorization codes
 */

import { createAdminClient } from '@/lib/supabase/client';

export interface AuthCodesStats {
  totalCodes: number;
  activeCodes: number;
  usedCodes: number;
  expiredCodes: number;
  oldestActiveAgeMinutes: number;
}

export interface CleanupResult {
  deletedUsed: number;
  deletedExpired: number;
  totalDeleted: number;
}

export class AuthCodesCleanupService {
  /**
   * Get current statistics about auth codes in the system
   */
  static async getStats(): Promise<AuthCodesStats> {
    try {
      const supabase = createAdminClient();

      const { data, error } = await supabase.rpc('get_auth_codes_stats');

      if (error) {
        throw new Error(`Failed to get auth codes stats: ${error.message}`);
      }

      const stats = data?.[0] || {
        total_codes: 0,
        active_codes: 0,
        used_codes: 0,
        expired_codes: 0,
        oldest_active_age_minutes: 0
      };

      return {
        totalCodes: stats.total_codes,
        activeCodes: stats.active_codes,
        usedCodes: stats.used_codes,
        expiredCodes: stats.expired_codes,
        oldestActiveAgeMinutes: stats.oldest_active_age_minutes
      };
    } catch (error) {
      console.error('Error getting auth codes stats:', error);
      return {
        totalCodes: 0,
        activeCodes: 0,
        usedCodes: 0,
        expiredCodes: 0,
        oldestActiveAgeMinutes: 0
      };
    }
  }

  /**
   * Clean up used and expired authorization codes
   */
  static async cleanupCodes(): Promise<CleanupResult> {
    try {
      const supabase = createAdminClient();

      const { data, error } = await supabase.rpc('cleanup_auth_codes');

      if (error) {
        throw new Error(`Failed to cleanup auth codes: ${error.message}`);
      }

      const result = data?.[0] || {
        deleted_used: 0,
        deleted_expired: 0,
        total_deleted: 0
      };

      return {
        deletedUsed: result.deleted_used,
        deletedExpired: result.deleted_expired,
        totalDeleted: result.total_deleted
      };
    } catch (error) {
      console.error('Error cleaning up auth codes:', error);
      return {
        deletedUsed: 0,
        deletedExpired: 0,
        totalDeleted: 0
      };
    }
  }

  /**
   * Clean up codes older than specified minutes (safety net)
   */
  static async cleanupOldCodes(olderThanMinutes: number = 60): Promise<number> {
    try {
      const supabase = createAdminClient();

      const { data, error } = await supabase.rpc('cleanup_old_auth_codes', {
        cleanup_after_minutes: olderThanMinutes
      });

      if (error) {
        throw new Error(`Failed to cleanup old auth codes: ${error.message}`);
      }

      return data || 0;
    } catch (error) {
      console.error('Error cleaning up old auth codes:', error);
      return 0;
    }
  }

  /**
   * Comprehensive cleanup that handles both normal and old codes
   */
  static async performFullCleanup(): Promise<{
    normalCleanup: CleanupResult;
    oldCodesDeleted: number;
    finalStats: AuthCodesStats;
  }> {
    try {
      // First, clean up used and expired codes
      const normalCleanup = await this.cleanupCodes();

      // Then, clean up any codes older than 2 hours as a safety net
      const oldCodesDeleted = await this.cleanupOldCodes(120);

      // Get final statistics
      const finalStats = await this.getStats();

      return {
        normalCleanup,
        oldCodesDeleted,
        finalStats
      };
    } catch (error) {
      console.error('Error performing full cleanup:', error);
      throw error;
    }
  }

  /**
   * Check if cleanup is needed and perform it automatically
   */
  static async autoCleanupIfNeeded(
    thresholds: {
      maxUsedCodes?: number;
      maxExpiredCodes?: number;
      maxTotalCodes?: number;
      maxAgeMinutes?: number;
    } = {}
  ): Promise<{
    cleanupPerformed: boolean;
    reason?: string;
    result?: CleanupResult;
  }> {
    try {
      const {
        maxUsedCodes = 50,
        maxExpiredCodes = 10,
        maxTotalCodes = 100,
        maxAgeMinutes = 60
      } = thresholds;

      const stats = await this.getStats();

      // Check if cleanup is needed
      let shouldCleanup = false;
      let reason = '';

      if (stats.usedCodes >= maxUsedCodes) {
        shouldCleanup = true;
        reason = `Too many used codes (${stats.usedCodes} >= ${maxUsedCodes})`;
      } else if (stats.expiredCodes >= maxExpiredCodes) {
        shouldCleanup = true;
        reason = `Too many expired codes (${stats.expiredCodes} >= ${maxExpiredCodes})`;
      } else if (stats.totalCodes >= maxTotalCodes) {
        shouldCleanup = true;
        reason = `Too many total codes (${stats.totalCodes} >= ${maxTotalCodes})`;
      } else if (stats.oldestActiveAgeMinutes >= maxAgeMinutes) {
        shouldCleanup = true;
        reason = `Active codes too old (${stats.oldestActiveAgeMinutes} minutes >= ${maxAgeMinutes})`;
      }

      if (shouldCleanup) {
        const result = await this.cleanupCodes();
        return {
          cleanupPerformed: true,
          reason,
          result
        };
      }

      return {
        cleanupPerformed: false
      };
    } catch (error) {
      console.error('Error in auto cleanup:', error);
      return {
        cleanupPerformed: false,
        reason: `Error: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      };
    }
  }

  /**
   * Get a human-readable summary of the auth codes state
   */
  static async getSummary(): Promise<string> {
    try {
      const stats = await this.getStats();

      if (stats.totalCodes === 0) {
        return 'Auth codes table is clean - no codes present.';
      }

      const parts: string[] = [];

      if (stats.activeCodes > 0) {
        parts.push(
          `${stats.activeCodes} active code${
            stats.activeCodes !== 1 ? 's' : ''
          }`
        );
      }

      if (stats.usedCodes > 0) {
        parts.push(
          `${stats.usedCodes} used code${stats.usedCodes !== 1 ? 's' : ''}`
        );
      }

      if (stats.expiredCodes > 0) {
        parts.push(
          `${stats.expiredCodes} expired code${
            stats.expiredCodes !== 1 ? 's' : ''
          }`
        );
      }

      let summary = `Auth codes: ${parts.join(', ')} (${
        stats.totalCodes
      } total)`;

      if (stats.oldestActiveAgeMinutes > 0) {
        summary += `. Oldest active code: ${stats.oldestActiveAgeMinutes} minutes old`;
      }

      return summary;
    } catch (error) {
      return `Error getting auth codes summary: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`;
    }
  }
}
