import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { SOI_EVENT_TYPE } from '@/lib/services/school-of-influence/constants';

/**
 * /startup-studio/school-of-influence — answers with a REAL HTTP 307 (to settings
 * for programme owners, to the application page for everyone else; see below).
 *
 * Was a page.tsx calling `redirect('/startup-studio/school-of-influence/admin/settings')`. Because
 * app/(routes)/loading.tsx wraps every page in a Suspense boundary, the
 * root shell streams before the page renders and Next cannot turn that
 * `redirect()` into an HTTP redirect — it degrades to a ~363 KB shell
 * document carrying `<meta http-equiv="refresh" content="1;url=/startup-studio/school-of-influence/admin/settings">`:
 * a blank shell, a forced ~1 s wait, THEN the target loads as a second
 * full document. A Route Handler responds before any rendering, so the
 * browser gets a tiny 307 immediately. The proxy (auth + route permission
 * gate) still runs in front of this handler, and Next's client router
 * follows fetch redirects transparently, so sidebar
 * `<Link href="/startup-studio/school-of-influence">` navigation keeps working.
 *
 * 307 (not 308): matches the semantics of the old `redirect()` and stays
 * un-cacheable, so the landing target can change in a future deploy
 * without browsers pinning the old one. Full rationale + measurements:
 * app/(routes)/staff/route.ts (the first conversion of this class).
 *
 * Original page.tsx rationale (preserved):
 *   School of Influence module landing. Without a page.tsx here the URL 404s —
 *   the hub-page-404 class the "Hub Page Reachability" CI gate exists to catch.
 *
 *   The programme's participant-facing surfaces (apply, roster, attendance) ship
 *   in later sections of specs/school-of-influence-batches-2026-07-30.md.
 *
 * TWO LANDING TARGETS, chosen by permission (BUG-005850, 2026-10-10).
 *   This address is the one people share ("open School of Influencer to enrol"),
 *   so learners reach it too. It used to send EVERYONE to the settings screen,
 *   and a learner who came to enrol met that screen's "you do not have access"
 *   block instead of the application form. Now:
 *   • whoever holds startup_studio.school_of_influence.configure (the settings
 *     screen's own key, checked with the same user_has_permission authority,
 *     which already lets super admins through) still lands on settings;
 *   • everyone else lands on the programme's application page,
 *     /events/<programme event>/apply. That page explains every "no" in words
 *     (intake closed, not eligible, already a member), so a closed intake is a
 *     sentence on screen, never a denial;
 *   • if no programme event exists at all, the person gets a page that says
 *     exactly that (/unauthorized?reason=soi_no_programme, the existing explicit
 *     notice page), rather than a settings screen that refuses them.
 *   The programme event is looked up with the service-role client (ids only),
 *   the same way apply-service.ts reads it: a learner's own session may not be
 *   able to read the events row, and the apply page re-checks everything under
 *   the caller's own session anyway.
 */
const SOI_SETTINGS_PATH = '/startup-studio/school-of-influence/admin/settings';
const SOI_CONFIGURE_PERMISSION = 'startup_studio.school_of_influence.configure';
const SOI_NO_PROGRAMME_PATH = '/unauthorized?reason=soi_no_programme';

async function canConfigureProgramme(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('user_has_permission', {
      permission_name: SOI_CONFIGURE_PERMISSION,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

async function findProgrammeEventId(): Promise<string | null> {
  try {
    const svc = createServiceRoleClient();
    const { data } = await (svc as any)
      .from('events')
      .select('id')
      .eq('event_type', SOI_EVENT_TYPE)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const id = (data as { id?: unknown } | null)?.id;
    return typeof id === 'string' && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  if (await canConfigureProgramme()) {
    return NextResponse.redirect(new URL(SOI_SETTINGS_PATH, request.url), 307);
  }
  const eventId = await findProgrammeEventId();
  const target = eventId ? `/events/${encodeURIComponent(eventId)}/apply` : SOI_NO_PROGRAMME_PATH;
  return NextResponse.redirect(new URL(target, request.url), 307);
}
