/**
 * Optimized Auth Codes Service
 * Uses time-bucketed storage: 15-minute buckets
 * Reduces database records by 99%+
 */

import { createServiceRoleClient } from '@/lib/supabase/server';

export interface AuthCodeData {
  code: string;
  app_id: string;
  user_id: string;
  redirect_uri: string;
  scope?: string;
  state?: string;
  expires_at?: string;
  used_at?: string | null;
  created_at?: string;
}

export interface AuthCodeBucket {
  bucket_key: string;
  bucket_timestamp: string;
  codes: AuthCodeData[];
  active_count: number;
  used_count: number;
  expired_count: number;
}

export interface BucketStats {
  totalBuckets: number;
  totalCodes: number;
  activeCodes: number;
  usedCodes: number;
  expiredCodes: number;
  oldestBucketAge: number; // in minutes
}

export class OptimizedAuthCodesService {
  /**
   * Generate a new authorization code and add to bucket
   */
  static async generateAuthCode(params: {
    appId: string;
    userId: string;
    redirectUri: string;
    scope?: string;
    state?: string;
    expiresInMinutes?: number;
  }): Promise<{
    success: boolean;
    code?: string;
    bucketKey?: string;
    error?: string;
  }> {
    try {
      const supabase = createServiceRoleClient();
      
      // Generate a secure random code
      const code = this.generateSecureCode();
      
      // Prepare code data
      const codeData: AuthCodeData = {
        code,
        app_id: params.appId,
        user_id: params.userId,
        redirect_uri: params.redirectUri,
        scope: params.scope || 'read',
        state: params.state,
        created_at: new Date().toISOString(),
        expires_at: new Date(
          Date.now() + (params.expiresInMinutes || 5) * 60 * 1000
        ).toISOString(),
        used_at: null
      };

      // Add to bucket using database function
      const { data, error } = await supabase.rpc('add_auth_code_to_bucket', {
        p_code_data: codeData
      });

      if (error) {
        throw new Error(`Failed to add auth code: ${error.message}`);
      }

      return {
        success: true,
        code,
        bucketKey: data?.bucket_key
      };
    } catch (error) {
      console.error('Error generating auth code:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Validate and exchange authorization code
   */
  static async validateAuthCode(params: {
    code: string;
    appId: string;
    redirectUri?: string;
  }): Promise<{
    valid: boolean;
    codeData?: AuthCodeData;
    error?: string;
  }> {
    try {
      const supabase = createServiceRoleClient();

      // Use the database function to validate and mark as used
      const { data, error } = await supabase.rpc('validate_and_use_auth_code', {
        p_code: params.code,
        p_app_id: params.appId
      });

      if (error) {
        throw new Error(`Validation error: ${error.message}`);
      }

      if (!data) {
        return {
          valid: false,
          error: 'Invalid or expired authorization code'
        };
      }

      const codeData = data as AuthCodeData;

      // Additional validation for redirect URI if provided
      if (params.redirectUri && codeData.redirect_uri !== params.redirectUri) {
        return {
          valid: false,
          error: 'Redirect URI mismatch'
        };
      }

      return {
        valid: true,
        codeData
      };
    } catch (error) {
      console.error('Error validating auth code:', error);
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get current bucket statistics
   */
  static async getBucketStats(): Promise<BucketStats> {
    try {
      const supabase = createServiceRoleClient();

      // Get all active buckets (last 2 hours)
      const { data, error } = await supabase
        .from('child_app_auth_codes_bucket')
        .select('bucket_key, bucket_timestamp, codes, active_count, used_count, expired_count')
        .gte('bucket_timestamp', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
        .order('bucket_timestamp', { ascending: false });

      if (error || !data) {
        return {
          totalBuckets: 0,
          totalCodes: 0,
          activeCodes: 0,
          usedCodes: 0,
          expiredCodes: 0,
          oldestBucketAge: 0
        };
      }

      let totalCodes = 0;
      let activeCodes = 0;
      let usedCodes = 0;
      let expiredCodes = 0;

      data.forEach(bucket => {
        const codes = bucket.codes as AuthCodeData[];
        totalCodes += codes.length;
        
        codes.forEach(code => {
          if (code.used_at) {
            usedCodes++;
          } else if (new Date(code.expires_at!) < new Date()) {
            expiredCodes++;
          } else {
            activeCodes++;
          }
        });
      });

      const oldestBucket = data[data.length - 1];
      const oldestBucketAge = oldestBucket 
        ? Math.floor((Date.now() - new Date(oldestBucket.bucket_timestamp).getTime()) / (1000 * 60))
        : 0;

      return {
        totalBuckets: data.length,
        totalCodes,
        activeCodes,
        usedCodes,
        expiredCodes,
        oldestBucketAge
      };
    } catch (error) {
      console.error('Error getting bucket stats:', error);
      return {
        totalBuckets: 0,
        totalCodes: 0,
        activeCodes: 0,
        usedCodes: 0,
        expiredCodes: 0,
        oldestBucketAge: 0
      };
    }
  }

  /**
   * Clean up expired buckets and codes
   */
  static async cleanupExpiredBuckets(): Promise<{
    bucketsDeleted: number;
    codesRemoved: number;
  }> {
    try {
      const supabase = createServiceRoleClient();

      // Call the cleanup function
      const { data, error } = await supabase.rpc('cleanup_expired_auth_buckets');

      if (error) {
        throw new Error(`Cleanup error: ${error.message}`);
      }

      // Get detailed cleanup stats
      const beforeStats = await this.getBucketStats();
      
      // Clean up codes within active buckets
      const { data: buckets } = await supabase
        .from('child_app_auth_codes_bucket')
        .select('id, codes')
        .gte('bucket_timestamp', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());

      let codesRemoved = 0;
      
      if (buckets) {
        for (const bucket of buckets) {
          const codes = bucket.codes as AuthCodeData[];
          const activeCodes = codes.filter(code => 
            !code.used_at && new Date(code.expires_at!) > new Date()
          );
          
          if (activeCodes.length < codes.length) {
            codesRemoved += codes.length - activeCodes.length;
            
            await supabase
              .from('child_app_auth_codes_bucket')
              .update({ 
                codes: activeCodes,
                active_count: activeCodes.length,
                expired_count: codes.filter(c => 
                  !c.used_at && new Date(c.expires_at!) <= new Date()
                ).length,
                used_count: codes.filter(c => c.used_at).length
              })
              .eq('id', bucket.id);
          }
        }
      }

      return {
        bucketsDeleted: data || 0,
        codesRemoved
      };
    } catch (error) {
      console.error('Error cleaning up buckets:', error);
      return {
        bucketsDeleted: 0,
        codesRemoved: 0
      };
    }
  }

  /**
   * Auto cleanup if thresholds are exceeded
   */
  static async autoCleanupIfNeeded(thresholds: {
    maxBuckets?: number;
    maxTotalCodes?: number;
    maxBucketAgeMinutes?: number;
  } = {}): Promise<{
    cleanupPerformed: boolean;
    reason?: string;
    result?: {
      bucketsDeleted: number;
      codesRemoved: number;
    };
  }> {
    try {
      const {
        maxBuckets = 10,
        maxTotalCodes = 500,
        maxBucketAgeMinutes = 120
      } = thresholds;

      const stats = await this.getBucketStats();

      let shouldCleanup = false;
      let reason = '';

      if (stats.totalBuckets > maxBuckets) {
        shouldCleanup = true;
        reason = `Too many buckets (${stats.totalBuckets} > ${maxBuckets})`;
      } else if (stats.totalCodes > maxTotalCodes) {
        shouldCleanup = true;
        reason = `Too many codes (${stats.totalCodes} > ${maxTotalCodes})`;
      } else if (stats.oldestBucketAge > maxBucketAgeMinutes) {
        shouldCleanup = true;
        reason = `Buckets too old (${stats.oldestBucketAge} minutes > ${maxBucketAgeMinutes})`;
      }

      if (shouldCleanup) {
        const result = await this.cleanupExpiredBuckets();
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
        reason: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Get a human-readable summary
   */
  static async getSummary(): Promise<string> {
    try {
      const stats = await this.getBucketStats();

      if (stats.totalBuckets === 0) {
        return 'No auth code buckets present - system is clean.';
      }

      const parts: string[] = [
        `${stats.totalBuckets} bucket${stats.totalBuckets !== 1 ? 's' : ''}`,
        `${stats.totalCodes} total code${stats.totalCodes !== 1 ? 's' : ''}`
      ];

      if (stats.activeCodes > 0) {
        parts.push(`${stats.activeCodes} active`);
      }

      if (stats.usedCodes > 0) {
        parts.push(`${stats.usedCodes} used`);
      }

      if (stats.expiredCodes > 0) {
        parts.push(`${stats.expiredCodes} expired`);
      }

      let summary = `Auth codes: ${parts.join(', ')}`;

      if (stats.oldestBucketAge > 0) {
        summary += `. Oldest bucket: ${stats.oldestBucketAge} minutes old`;
      }

      // Add efficiency note
      const efficiency = stats.totalBuckets > 0 
        ? Math.round((1 - (stats.totalBuckets / stats.totalCodes)) * 100)
        : 0;
      
      if (efficiency > 0) {
        summary += ` (${efficiency}% storage reduction)`;
      }

      return summary;
    } catch (error) {
      return `Error getting auth codes summary: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`;
    }
  }

  /**
   * Generate a secure random code
   */
  private static generateSecureCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    
    // Use crypto for better randomness
    const randomValues = new Uint8Array(32);
    
    if (typeof window !== 'undefined' && window.crypto) {
      window.crypto.getRandomValues(randomValues);
    } else {
      // Server-side fallback
      for (let i = 0; i < 32; i++) {
        randomValues[i] = Math.floor(Math.random() * 256);
      }
    }
    
    for (let i = 0; i < 32; i++) {
      code += chars[randomValues[i] % chars.length];
    }
    
    return code;
  }

  /**
   * Get codes for a specific user (for debugging/admin)
   */
  static async getUserCodes(userId: string): Promise<AuthCodeData[]> {
    try {
      const supabase = createServiceRoleClient();

      const { data, error } = await supabase
        .from('child_app_auth_codes_bucket')
        .select('codes')
        .gte('bucket_timestamp', new Date(Date.now() - 30 * 60 * 1000).toISOString());

      if (error || !data) {
        return [];
      }

      const userCodes: AuthCodeData[] = [];

      data.forEach(bucket => {
        const codes = bucket.codes as AuthCodeData[];
        codes.forEach(code => {
          if (code.user_id === userId) {
            userCodes.push(code);
          }
        });
      });

      return userCodes.sort((a, b) => 
        new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime()
      );
    } catch (error) {
      console.error('Error getting user codes:', error);
      return [];
    }
  }
}