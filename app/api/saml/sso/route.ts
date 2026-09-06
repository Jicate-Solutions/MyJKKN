export const dynamic = 'force-dynamic';

/**
 * SAML SSO Login Endpoint
 *
 * GET/POST /api/saml/sso
 *
 * Handles SAML AuthnRequest from Service Providers
 * Authenticates user and returns SAML Response
 */

import { NextRequest, NextResponse , connection } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { SamlIdpService } from '@/lib/services/saml/saml-idp-service';
import { SamlSessionService } from '@/lib/services/saml/saml-session-service';
import { SamlError, SamlStatusCode } from '@/types/saml';

export async function GET(request: NextRequest) {
  await connection();
  return handleSamlSso(request, 'redirect');
}

export async function POST(request: NextRequest) {
  await connection();
  return handleSamlSso(request, 'post');
}

async function handleSamlSso(
  request: NextRequest,
  binding: 'post' | 'redirect'
) {
  // Hoisted OUT of the try: the catch needs these to report a failure back to
  // the SP (see the error-Response path at the bottom) rather than rendering a
  // JSON 500 on our own domain and stranding the user there.
  // NOTE: For POST binding, formData() must be called only ONCE as
  // the request body stream is consumed on first read
  let samlRequest: string | null = null;
  let relayState: string | null = null;
  let effectiveBinding: 'post' | 'redirect' = binding;
  // Populated once the AuthnRequest is parsed — where a failure Response goes.
  let errorAcsUrl: string | null = null;
  let errorInResponseTo: string | undefined;

  try {

    // ── Resume path (Option B, 2026-04-09) ────────────────────────────────
    // When an unauthenticated user hits /api/saml/sso we persist the request
    // in `saml_pending_requests` and redirect to /auth/login?samlReqId=UUID.
    // The login page carries the UUID through the Google OAuth round-trip
    // (preserved inside the OAuth redirect_uri query string), and the auth
    // callback finally redirects to /api/saml/sso?samlReqId=UUID.
    //
    // If we see samlReqId here, rehydrate the request from the DB instead of
    // parsing request body/query params.
    const samlReqId =
      binding === 'redirect'
        ? request.nextUrl.searchParams.get('samlReqId')
        : null;

    if (samlReqId) {
      const adminClient = createServiceRoleClient();
      // ATOMIC SINGLE-USE CLAIM: stamp `consumed_at` and read the row in ONE
      // statement. `.is('consumed_at', null)` means the UPDATE matches at most
      // once, so exactly one caller ever receives the row — two concurrent
      // resumes (double-submit, browser prefetch) can no longer both read it
      // before either clears it.
      //
      // This replaces a SELECT followed by an immediate DELETE, which (a) had
      // that race, and (b) destroyed the audit trail on every login.
      const { data: pending, error: pendingError } = await adminClient
        .from('saml_pending_requests')
        .update({ consumed_at: new Date().toISOString() })
        .eq('id', samlReqId)
        .is('consumed_at', null)
        .select('saml_request, relay_state, binding, expires_at')
        .maybeSingle();

      if (pendingError || !pending) {
        console.error('[saml/sso] Pending request not found or already consumed:', samlReqId, pendingError);
        throw new SamlError(
          'SAML request session expired. Please retry sign-in from MathWorks.',
          SamlStatusCode.REQUESTER,
          'pending_request_missing'
        );
      }

      // Publish BEFORE the expiry check so that, on expiry, the catch can still
      // parse the request, recover the SP's ACS URL, and hand the browser back
      // to the SP with a failure Status instead of dead-ending on jkkn.ai.
      samlRequest = pending.saml_request as string;
      relayState = (pending.relay_state as string | null) ?? null;
      effectiveBinding = (pending.binding as 'post' | 'redirect') || 'redirect';

      if (new Date(pending.expires_at as string).getTime() < Date.now()) {
        throw new SamlError(
          'SAML request expired (10 min TTL). Please retry sign-in from MathWorks.',
          SamlStatusCode.REQUESTER,
          'pending_request_expired'
        );
      }

      console.log('[saml/sso] Resumed pending request from DB:', samlReqId, 'binding:', effectiveBinding);
    } else if (binding === 'redirect') {
      const searchParams = request.nextUrl.searchParams;
      samlRequest = searchParams.get('SAMLRequest');
      relayState = searchParams.get('RelayState');
    } else {
      const formData = await request.formData();
      samlRequest = formData.get('SAMLRequest') as string;
      relayState = formData.get('RelayState') as string;
    }

    if (!samlRequest) {
      throw new SamlError(
        'Missing SAMLRequest parameter',
        SamlStatusCode.REQUESTER,
        'invalid_request'
      );
    }

    // Parse SAML request (use effectiveBinding — may differ from transport
    // binding when resuming a persisted POST request via the redirect path)
    const { request: parsedRequest, spEntityId } =
      await SamlIdpService.parseAuthnRequest(samlRequest, effectiveBinding);

    // From here on, every failure can be reported to the SP itself.
    errorAcsUrl = parsedRequest.assertionConsumerServiceUrl;
    errorInResponseTo = parsedRequest.id;

    console.log('[saml/sso] Received AuthnRequest:', {
      id: parsedRequest.id,
      issuer: parsedRequest.issuer,
      destination: parsedRequest.destination,
    });

    // Check if user is authenticated
    const supabase = await createClient();
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !authUser) {
      // User not authenticated — persist the AuthnRequest in the DB so it
      // survives the OAuth round-trip, then redirect to login carrying only
      // the opaque pending-request ID. See Option B in
      // docs/features/mathswork/EMAIL_REPLY_TO_MATHWORKS_2026-04-09.md.
      //
      // Status 302 (not default 307): 302 lets the browser downgrade POST→GET
      // so the user lands on the login page with a GET, not a POST (405).
      const adminClient = createServiceRoleClient();
      const { data: inserted, error: insertError } = await adminClient
        .from('saml_pending_requests')
        .insert({
          saml_request: samlRequest,
          relay_state: relayState,
          binding: effectiveBinding,
          sp_entity_id: spEntityId,
          user_agent: request.headers.get('user-agent') || null,
          ip_address:
            request.headers.get('x-forwarded-for') ||
            request.headers.get('x-real-ip') ||
            null,
        })
        .select('id')
        .single();

      if (insertError || !inserted) {
        console.error('[saml/sso] Failed to persist pending request:', insertError);
        throw new SamlError(
          'Failed to initiate SAML login flow',
          SamlStatusCode.RESPONDER,
          'pending_request_insert_failed'
        );
      }

      const pendingId = (inserted as { id: string }).id;
      console.log('[saml/sso] Stored pending request:', pendingId, 'sp:', spEntityId);

      const loginUrl = new URL('/auth/login', request.url);
      loginUrl.searchParams.set('samlReqId', pendingId);
      return NextResponse.redirect(loginUrl, { status: 302 });
    }

    // Get user profile
    // NOTE: The real table is `profiles` (not `user_profiles`). It stores a
    // single `full_name` column — no separate first_name/last_name fields.
    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, is_active')
      .eq('id', authUser.id)
      .single();

    if (profileError || !userProfile) {
      throw new SamlError(
        'User profile not found',
        SamlStatusCode.AUTHN_FAILED,
        'user_not_found'
      );
    }

    // Deactivated accounts must not receive an assertion.
    //
    // This check cannot be inherited from /auth/callback: the SAML resume
    // short-circuits there (see the `if (samlReqId)` branch) BEFORE both the
    // invite-only gate and the is_active sign-out, precisely so role-based
    // routing is skipped. That made this route the only remaining gate on the
    // SAML path — and it wasn't gating, so a disabled MyJKKN account could
    // still sign in to MATLAB.
    if (userProfile.is_active === false) {
      throw new SamlError(
        'Account is inactive',
        SamlStatusCode.AUTHN_FAILED,
        'user_inactive'
      );
    }

    // Split full_name into first/last for MathWorks attribute mapping.
    // Titles are stored inline in `full_name` ("Mr. Ranjith K"), so a naive
    // split on the first space sends MathWorks givenName="Mr." — which is what
    // MATLAB then provisions the account under. Drop a leading title token,
    // unless it is the only token.
    const TITLE_PREFIX = /^(mr|mrs|ms|miss|dr|prof|shri|smt|er|capt|rev)\.?$/i;
    const nameParts = (userProfile.full_name || '').trim().split(/\s+/).filter(Boolean);
    if (nameParts.length > 1 && TITLE_PREFIX.test(nameParts[0])) {
      nameParts.shift();
    }
    const profileWithNames = {
      ...userProfile,
      first_name: nameParts[0] || '',
      last_name: nameParts.slice(1).join(' ') || '',
    };

    // Map user attributes
    const userAttributes = SamlIdpService.mapUserToMathWorksAttributes(profileWithNames);

    // Create SAML session
    const session = await SamlSessionService.createSession({
      user_id: userProfile.id,
      service_provider_entity_id: spEntityId,
      name_id: userAttributes.email,
      name_id_format: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
      ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      user_agent: request.headers.get('user-agent') || 'unknown',
    });

    console.log('[saml/sso] Created session:', session.session_index);

    // Generate SAML response
    const samlResponse = await SamlIdpService.generateSamlResponse(
      parsedRequest,
      userAttributes,
      session.session_index,
      spEntityId
    );

    // Return auto-submit form
    const html = generateAutoSubmitForm(
      parsedRequest.assertionConsumerServiceUrl,
      samlResponse,
      relayState
    );

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('[saml/sso] Error:', error);

    // Never leak a non-SamlError's message: it may carry internal detail and
    // `errorAcsUrl` is a value taken from the (unsigned) AuthnRequest.
    const samlError =
      error instanceof SamlError
        ? error
        : new SamlError(
            'Internal server error',
            SamlStatusCode.RESPONDER,
            'internal_error'
          );

    // If we failed before parsing (e.g. an expired resume), make one best-effort
    // attempt to recover the SP's ACS URL from the raw AuthnRequest.
    if (!errorAcsUrl && samlRequest) {
      try {
        const { request: recovered } = await SamlIdpService.parseAuthnRequest(
          samlRequest,
          effectiveBinding
        );
        errorAcsUrl = recovered.assertionConsumerServiceUrl;
        errorInResponseTo = recovered.id;
      } catch (recoveryError) {
        console.error(
          '[saml/sso] Could not recover ACS URL for error Response:',
          recoveryError
        );
      }
    }

    // SAML 2.0 Core §3.2.2: report the failure to the SP. This is also
    // MathWorks' stated acceptance criterion — the browser must return to a
    // MathWorks page even when the outcome is an error.
    if (errorAcsUrl) {
      console.log('[saml/sso] Returning SAML error Response to SP ACS:', {
        acsUrl: errorAcsUrl,
        statusCode: samlError.statusCode,
        statusDetail: samlError.statusDetail,
      });
      const samlResponse = SamlIdpService.generateErrorResponse({
        destination: errorAcsUrl,
        statusCode: samlError.statusCode,
        statusMessage: samlError.message,
        inResponseTo: errorInResponseTo,
      });
      return new NextResponse(
        generateAutoSubmitForm(
          errorAcsUrl,
          samlResponse,
          relayState,
          'Returning you to the application...',
          'Sign-in could not be completed. Redirecting you back.'
        ),
        {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }
      );
    }

    // No SP to report to (unparseable or unknown AuthnRequest) — the JSON 500
    // is the only remaining option.
    return NextResponse.json(
      {
        error: samlError.message,
        statusCode: samlError.statusCode,
        statusDetail: samlError.statusDetail,
      },
      { status: 500 }
    );
  }
}

/**
 * Escape a value for interpolation into an HTML attribute.
 *
 * `relayState` is copied verbatim from the SP's query string and `acsUrl` comes
 * out of the (unsigned) AuthnRequest — both are attacker-controlled, and both
 * were previously interpolated raw, so a `"` broke out of the attribute and
 * injected script into a page served from jkkn.ai.
 */
function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generate auto-submit HTML form for SAML Response
 */
function generateAutoSubmitForm(
  acsUrl: string,
  samlResponse: string,
  relayState: string | null,
  // The same form carries failure Responses back to the SP, where "Signing you
  // in…" would be a lie for the ~200ms it is visible.
  heading = 'Signing you in...',
  subtext = 'Please wait while we redirect you to the application.'
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>SAML SSO - Redirecting...</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .container {
      text-align: center;
      background: white;
      padding: 3rem;
      border-radius: 1rem;
      box-shadow: 0 10px 40px rgba(0,0,0,0.1);
    }
    .spinner {
      width: 50px;
      height: 50px;
      margin: 0 auto 1.5rem;
      border: 4px solid #f3f3f3;
      border-top: 4px solid #667eea;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    h2 {
      color: #333;
      margin: 0 0 0.5rem;
    }
    p {
      color: #666;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <h2>${heading}</h2>
    <p>${subtext}</p>
  </div>
  <form id="samlForm" method="POST" action="${escapeHtmlAttribute(acsUrl)}">
    <input type="hidden" name="SAMLResponse" value="${escapeHtmlAttribute(samlResponse)}" />
    ${relayState ? `<input type="hidden" name="RelayState" value="${escapeHtmlAttribute(relayState)}" />` : ''}
  </form>
  <script>
    window.onload = function() {
      document.getElementById('samlForm').submit();
    };
  </script>
</body>
</html>
  `;
}
