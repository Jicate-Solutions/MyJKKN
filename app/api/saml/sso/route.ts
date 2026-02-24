/**
 * SAML SSO Login Endpoint
 *
 * GET/POST /api/saml/sso
 *
 * Handles SAML AuthnRequest from Service Providers
 * Authenticates user and returns SAML Response
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SamlIdpService } from '@/lib/services/saml/saml-idp-service';
import { SamlSessionService } from '@/lib/services/saml/saml-session-service';
import { SamlError, SamlStatusCode } from '@/types/saml';

export async function GET(request: NextRequest) {
  return handleSamlSso(request, 'redirect');
}

export async function POST(request: NextRequest) {
  return handleSamlSso(request, 'post');
}

async function handleSamlSso(
  request: NextRequest,
  binding: 'post' | 'redirect'
) {
  try {
    // Extract SAML request from query params or body
    // NOTE: For POST binding, formData() must be called only ONCE as
    // the request body stream is consumed on first read
    let samlRequest: string | null = null;
    let relayState: string | null = null;

    if (binding === 'redirect') {
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

    // Parse SAML request
    const { request: parsedRequest, spEntityId } =
      await SamlIdpService.parseAuthnRequest(samlRequest, binding);

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
      // User not authenticated - redirect to login with return URL
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', request.url);
      return NextResponse.redirect(loginUrl);
    }

    // Get user profile
    // NOTE: The real table is `profiles` (not `user_profiles`). It stores a
    // single `full_name` column — no separate first_name/last_name fields.
    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, full_name, role')
      .eq('id', authUser.id)
      .single();

    if (profileError || !userProfile) {
      throw new SamlError(
        'User profile not found',
        SamlStatusCode.AUTHN_FAILED,
        'user_not_found'
      );
    }

    // Split full_name into first/last for MathWorks attribute mapping
    const nameParts = (userProfile.full_name || '').trim().split(/\s+/);
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

    if (error instanceof SamlError) {
      return NextResponse.json(
        {
          error: error.message,
          statusCode: error.statusCode,
          statusDetail: error.statusDetail,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

/**
 * Generate auto-submit HTML form for SAML Response
 */
function generateAutoSubmitForm(
  acsUrl: string,
  samlResponse: string,
  relayState: string | null
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
    <h2>Signing you in...</h2>
    <p>Please wait while we redirect you to the application.</p>
  </div>
  <form id="samlForm" method="POST" action="${acsUrl}">
    <input type="hidden" name="SAMLResponse" value="${samlResponse}" />
    ${relayState ? `<input type="hidden" name="RelayState" value="${relayState}" />` : ''}
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
