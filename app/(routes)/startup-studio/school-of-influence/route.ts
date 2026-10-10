import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SOI_EVENT_TYPE } from '@/lib/services/school-of-influence/constants';
import { logger } from '@/lib/utils/enhanced-logger';

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
 *
 * WHICH PROGRAMME, AND UNDER WHOSE EYES (#4339 review, 2026-10-10).
 *   The programme event is looked up through the VISITOR'S OWN SESSION, never
 *   the service role, so row-level security decides which events they may be
 *   sent to. A learner can read a live public event (events_auth_read_public,
 *   granted to authenticated) and any event of their own institution
 *   (events_auth_read); a draft or private event of another college is
 *   invisible to them and can never become their landing target.
 *   There is deliberately NO hard institution_id filter: the programme is
 *   campus-wide by a locked decision (see apply-service.ts header — any JKKN
 *   learner may apply to a programme hosted by another college), and the only
 *   live programme is hosted by one institution, so a filter would send every
 *   other college's learners to "not open". Their OWN college is PREFERRED.
 *   Draft and cancelled events are never picked — the same statuses the apply
 *   page refuses as 'programme_not_open' (apply-service.ts).
 *   Pick order among what they can see:
 *     own institution + intake open now → any + intake open now →
 *     own institution newest → any newest (its apply page explains "closed").
 *   Anonymous visitors are sent to sign in first (the proxy normally does this;
 *   the handler does not rely on it). A failed lookup is said as such
 *   (soi_unavailable), never dressed up as "not open".
 */
const SOI_SETTINGS_PATH = '/startup-studio/school-of-influence/admin/settings';
const SOI_CONFIGURE_PERMISSION = 'startup_studio.school_of_influence.configure';
const SOI_NO_PROGRAMME_PATH = '/unauthorized?reason=soi_no_programme';
const SOI_UNAVAILABLE_PATH = '/unauthorized?reason=soi_unavailable';
/** Candidate programmes considered when picking one whose intake is open. */
const MAX_CANDIDATES = 25;

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Statuses apply-service.ts refuses as 'programme_not_open'. */
const SOI_NOT_OPEN_STATUSES = ['draft', 'cancelled'];

interface ProgrammeRow {
  id?: unknown;
  status?: string | null;
  institution_id?: string | null;
  registration_open_date?: string | null;
  registration_close_date?: string | null;
}

async function canConfigureProgramme(supabase: Supabase): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('user_has_permission', {
      permission_name: SOI_CONFIGURE_PERMISSION,
    });
    if (error) {
      logger.warn('school-of-influence', '[soi-landing] configure permission check failed; treating as not an owner', {
        error: error.message,
      });
      return false;
    }
    return data === true;
  } catch (e) {
    logger.warn('school-of-influence', '[soi-landing] configure permission check threw; treating as not an owner', {
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

function intakeOpenAt(row: ProgrammeRow, at: number): boolean {
  if (row.registration_open_date && at < new Date(row.registration_open_date).getTime()) return false;
  if (row.registration_close_date && at > new Date(row.registration_close_date).getTime()) return false;
  return true;
}

/**
 * The programme to land on, as the visitor's own session sees it.
 * `{ ok: false }` = the lookup itself failed (logged); `id: null` = none exists.
 */
async function callerInstitutionId(supabase: Supabase, userId: string): Promise<string | null> {
  try {
    const { data, error } = await (supabase as any)
      .from('profiles')
      .select('institution_id')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      logger.warn('school-of-influence', '[soi-landing] profile institution read failed; no own-college preference', {
        error: error.message,
      });
      return null;
    }
    const id = (data as { institution_id?: unknown } | null)?.institution_id;
    return typeof id === 'string' && id.length > 0 ? id : null;
  } catch (e) {
    logger.warn('school-of-influence', '[soi-landing] profile institution read threw; no own-college preference', {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

async function findProgrammeEventId(
  supabase: Supabase,
  ownInstitutionId: string | null
): Promise<{ ok: true; id: string | null } | { ok: false }> {
  try {
    const { data, error } = await (supabase as any)
      .from('events')
      .select('id, status, institution_id, registration_open_date, registration_close_date')
      .eq('event_type', SOI_EVENT_TYPE)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(MAX_CANDIDATES);
    if (error) {
      logger.error('school-of-influence', '[soi-landing] programme event lookup failed', { error: error.message });
      return { ok: false };
    }
    const rows = ((data ?? []) as ProgrammeRow[]).filter(
      (r) =>
        typeof r.id === 'string' &&
        r.id.length > 0 &&
        !SOI_NOT_OPEN_STATUSES.includes(String(r.status))
    );
    const now = Date.now();
    const own = (r: ProgrammeRow) => !!ownInstitutionId && r.institution_id === ownInstitutionId;
    const pick =
      rows.find((r) => own(r) && intakeOpenAt(r, now)) ??
      rows.find((r) => intakeOpenAt(r, now)) ??
      rows.find(own) ??
      rows[0];
    return { ok: true, id: (pick?.id as string | undefined) ?? null };
  } catch (e) {
    logger.error('school-of-influence', '[soi-landing] programme event lookup threw', {
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false };
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    userId = data?.user?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) {
    // Same shape as the proxy's own sign-in redirect: /auth/login carrying the
    // destination in ?redirectedFrom= so the person comes straight back here.
    const login = new URL('/auth/login', request.url);
    login.searchParams.set('redirectedFrom', request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(login, 307);
  }
  if (await canConfigureProgramme(supabase)) {
    return NextResponse.redirect(new URL(SOI_SETTINGS_PATH, request.url), 307);
  }
  const found = await findProgrammeEventId(supabase, await callerInstitutionId(supabase, userId));
  const target = !found.ok
    ? SOI_UNAVAILABLE_PATH
    : found.id
      ? `/events/${encodeURIComponent(found.id)}/apply`
      : SOI_NO_PROGRAMME_PATH;
  return NextResponse.redirect(new URL(target, request.url), 307);
}
