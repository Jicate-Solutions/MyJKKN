export const dynamic = 'force-dynamic';

// app/api/admission/counselors/status/route.ts
// GET /api/admission/counselors/status — Counselor availability from Exotel User Management API

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/server';
import { ExotelClient, type ExotelUser } from '@/lib/services/telephony/exotel-client';
import { logger } from '@/lib/utils/enhanced-logger';

// Agent map gives us names, departments, and isAdmissionCounselor flag
// keyed by phone number with leading 0
const ADMISSION_COUNSELOR_EMAILS = new Set([
  'shanmugaprabhu@jkkn.org',
  'gowrisankar@jkkn.ac.in',
  'ratheshraj@jkkn.ac.in',
  'murugan.s@jkkn.org',
  'rajendiran.km@jkkn.ac.in',
  'saranyadevi.pm@jkkn.ac.in',
  'gandhimathi.v@jkkn.ac.in',
]);

export type CounselorStatus = 'online' | 'on_call' | 'offline';

export interface CounselorInfo {
  user_id: string;
  name: string;
  email: string;
  role: string;
  status: CounselorStatus;
  /** Active call SID if on a call */
  active_call_sid: string | null;
  /** Active call start time if on a call */
  active_call_start: string | null;
  /** ISO timestamp of last login */
  last_login: string | null;
  /** Whether any device is active */
  has_active_device: boolean;
  /** Device types registered */
  device_types: string[];
}

export interface CounselorStatusResponse {
  counselors: CounselorInfo[];
  summary: {
    total: number;
    online: number;
    on_call: number;
    offline: number;
  };
  fetched_at: string;
}

function determineCounselorStatus(user: ExotelUser): CounselorStatus {
  const hasActiveDevice = user.devices.some(d => d.is_active);
  if (!hasActiveDevice) return 'offline';
  if (user.active_call) return 'on_call';
  return 'online';
}

export async function GET(_request: NextRequest) {
  try {
    // Authenticate
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check if Exotel is configured
    if (!ExotelClient.isConfigured()) {
      return NextResponse.json(
        { error: 'NOT_CONFIGURED', message: 'Exotel is not configured' },
        { status: 503 }
      );
    }

    // Fetch all users from Exotel CCM API
    let allUsers: ExotelUser[];
    try {
      allUsers = await ExotelClient.getUsers();
    } catch (err) {
      logger.error('admission/counselors/status', 'Failed to fetch Exotel users', err);
      return NextResponse.json(
        {
          error: 'EXOTEL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to fetch users from Exotel',
        },
        { status: 502 }
      );
    }

    // Filter to admission counselors by matching email
    const counselors: CounselorInfo[] = allUsers
      .filter(u => ADMISSION_COUNSELOR_EMAILS.has(u.email.toLowerCase()))
      .map(u => {
        const status = determineCounselorStatus(u);
        return {
          user_id: u.user_id,
          name: `${u.first_name} ${u.last_name}`.trim() || u.email,
          email: u.email,
          role: u.role,
          status,
          active_call_sid: u.active_call?.call_sid || null,
          active_call_start: u.active_call?.start_time || null,
          last_login: u.last_login,
          has_active_device: u.devices.some(d => d.is_active),
          device_types: u.devices.map(d => d.type),
        };
      });

    // Sort: on_call first, then online, then offline
    const statusOrder: Record<CounselorStatus, number> = { on_call: 0, online: 1, offline: 2 };
    counselors.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

    const summary = {
      total: counselors.length,
      online: counselors.filter(c => c.status === 'online').length,
      on_call: counselors.filter(c => c.status === 'on_call').length,
      offline: counselors.filter(c => c.status === 'offline').length,
    };

    const response: CounselorStatusResponse = {
      counselors,
      summary,
      fetched_at: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error('admission/counselors/status', 'Unexpected error', error);
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
