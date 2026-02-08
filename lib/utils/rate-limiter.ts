// lib/utils/rate-limiter.ts
// Simple in-memory rate limiter for API endpoints

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

class RateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  /**
   * Check if a request should be rate limited
   * @param identifier - Unique identifier (IP, phone, etc.)
   * @param maxRequests - Maximum requests allowed in the window
   * @param windowMs - Time window in milliseconds
   * @returns Object with allowed status and remaining requests
   */
  check(
    identifier: string,
    maxRequests: number,
    windowMs: number
  ): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const entry = this.store.get(identifier);

    // No entry or expired entry
    if (!entry || now >= entry.resetAt) {
      const resetAt = now + windowMs;
      this.store.set(identifier, { count: 1, resetAt });
      return { allowed: true, remaining: maxRequests - 1, resetAt };
    }

    // Entry exists and not expired
    if (entry.count >= maxRequests) {
      return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    // Increment count
    entry.count++;
    this.store.set(identifier, entry);
    return {
      allowed: true,
      remaining: maxRequests - entry.count,
      resetAt: entry.resetAt,
    };
  }

  /**
   * Remove a rate limit entry (e.g., after successful verification)
   * @param identifier - Unique identifier to clear
   */
  clear(identifier: string): void {
    this.store.delete(identifier);
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now >= entry.resetAt) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Stop the cleanup interval (for cleanup)
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Singleton instance
const rateLimiter = new RateLimiter();

// Export helper functions
export function checkRateLimit(
  identifier: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  return rateLimiter.check(identifier, maxRequests, windowMs);
}

export function clearRateLimit(identifier: string): void {
  rateLimiter.clear(identifier);
}

// Preset configurations
export const RateLimitConfig = {
  OTP_REQUEST: {
    maxRequests: 3, // 3 OTP requests
    windowMs: 15 * 60 * 1000, // per 15 minutes
  },
  OTP_VERIFY: {
    maxRequests: 5, // 5 verification attempts
    windowMs: 15 * 60 * 1000, // per 15 minutes
  },
  API_GENERAL: {
    maxRequests: 100, // 100 requests
    windowMs: 60 * 1000, // per minute
  },
};

export default rateLimiter;
