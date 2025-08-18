/**
 * Child App Auth Codes Cleanup API Endpoint
 * Provides manual cleanup functionality for authorization codes
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuthCodesCleanupService } from '@/lib/services/child-app/auth-codes-cleanup-service';

// CORS headers for the cleanup endpoint
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

// Handle CORS preflight
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    }
  });
}

/**
 * GET - Get auth codes statistics
 */
export async function GET(request: NextRequest) {
  try {
    const stats = await AuthCodesCleanupService.getStats();
    const summary = await AuthCodesCleanupService.getSummary();

    return NextResponse.json(
      {
        stats,
        summary,
        recommendations: getRecommendations(stats)
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error getting auth codes stats:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * POST - Perform cleanup operations
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action = 'auto', olderThanMinutes, forceCleanup = false } = body;

    let result;

    switch (action) {
      case 'full':
        // Perform comprehensive cleanup
        result = await AuthCodesCleanupService.performFullCleanup();
        break;

      case 'old':
        // Clean up codes older than specified minutes
        const minutes = olderThanMinutes || 60;
        const deletedCount = await AuthCodesCleanupService.cleanupOldCodes(
          minutes
        );
        result = {
          type: 'old_codes_cleanup',
          deletedCount,
          olderThanMinutes: minutes
        };
        break;

      case 'force':
        // Force cleanup regardless of thresholds
        const cleanupResult = await AuthCodesCleanupService.cleanupCodes();
        result = {
          type: 'forced_cleanup',
          ...cleanupResult
        };
        break;

      case 'auto':
      default:
        // Auto cleanup if needed
        const autoResult = await AuthCodesCleanupService.autoCleanupIfNeeded();
        result = {
          type: 'auto_cleanup',
          ...autoResult
        };
        break;
    }

    // Get final stats after cleanup
    const finalStats = await AuthCodesCleanupService.getStats();
    const finalSummary = await AuthCodesCleanupService.getSummary();

    return NextResponse.json(
      {
        success: true,
        action,
        result,
        finalStats,
        finalSummary,
        timestamp: new Date().toISOString()
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error performing auth codes cleanup:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * Generate recommendations based on current stats
 */
function getRecommendations(stats: {
  totalCodes: number;
  activeCodes: number;
  usedCodes: number;
  expiredCodes: number;
  oldestActiveAgeMinutes: number;
}): string[] {
  const recommendations: string[] = [];

  if (stats.totalCodes === 0) {
    recommendations.push('Auth codes table is clean ✅');
    return recommendations;
  }

  if (stats.usedCodes > 20) {
    recommendations.push(
      `Consider cleanup: ${stats.usedCodes} used codes can be removed`
    );
  }

  if (stats.expiredCodes > 5) {
    recommendations.push(
      `Consider cleanup: ${stats.expiredCodes} expired codes should be removed`
    );
  }

  if (stats.oldestActiveAgeMinutes > 30) {
    recommendations.push(
      `Old active code detected: ${stats.oldestActiveAgeMinutes} minutes old (normal expiry is 5 minutes)`
    );
  }

  if (stats.totalCodes > 50) {
    recommendations.push(
      `High code count: ${stats.totalCodes} total codes - consider full cleanup`
    );
  }

  if (recommendations.length === 0) {
    recommendations.push('Auth codes table looks healthy 👍');
  }

  return recommendations;
}
