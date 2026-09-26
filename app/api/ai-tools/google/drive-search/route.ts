export const dynamic = 'force-dynamic';

// app/api/ai-tools/google/drive-search/route.ts
//
// AI Assistant tool google_drive_search (catalog row in 20270303090000_ai_google_read.sql).
// Reads ONLY the caller's own Google account, read-only. Auth: the person's
// Supabase access token as "Authorization: Bearer <token>", or the cookie
// session. All checks live in the shared handler.

import { handleGoogleReadTool, DRIVE_SEARCH } from '@/lib/services/integrations/google-read/endpoint';

export async function POST(request: Request) {
  return handleGoogleReadTool(request, DRIVE_SEARCH);
}
