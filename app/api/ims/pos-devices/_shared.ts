// Shared plumbing for /api/ims/pos-devices/** (not a route: no route.ts here).

import { NextResponse } from 'next/server';
import type { AuthContext } from '@/lib/auth/with-auth';
import { PosDeviceAdminError, type PosDeviceAdminCaller } from '@/lib/services/ims/pos-device-admin-service';
import { errorMessage } from '@/lib/utils/supabase-error';
import { logger } from '@/lib/utils/enhanced-logger';

export const POS_DEVICE_PERMISSION = 'ims.settings.pos_devices.manage';

/** Session-only: terminal credentials are never managed with an API key. */
export const readOpts = {
  requiredPermission: 'read' as const,
  requirePermission: POS_DEVICE_PERMISSION,
  allowApiKey: false,
};
export const writeOpts = {
  requiredPermission: 'write' as const,
  requirePermission: POS_DEVICE_PERMISSION,
  allowApiKey: false,
};

export function callerOf(auth: AuthContext): PosDeviceAdminCaller {
  return { userId: auth.user.id, supabase: auth.supabase };
}

export async function deviceIdOf(context?: { params?: Promise<Record<string, string>> }): Promise<string> {
  const params = context?.params ? await context.params : undefined;
  const id = params?.id ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new PosDeviceAdminError(400, 'Invalid terminal id');
  return id;
}

export function errorResponse(e: unknown, action: string): NextResponse {
  if (e instanceof PosDeviceAdminError) {
    return NextResponse.json(
      { success: false, error: e.code ?? 'pos_device_error', message: e.message },
      { status: e.status },
    );
  }
  logger.error('ims/pos-devices', `${action} failed`, e);
  return NextResponse.json(
    { success: false, error: 'internal_error', message: errorMessage(e, `${action} failed`) },
    { status: 500 },
  );
}
