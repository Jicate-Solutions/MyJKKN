/**
 * LTI OIDC Callback/Redirect Endpoint
 * POST /api/lti/callback - Handle authentication response from LTI tool
 *
 * This endpoint receives the authentication response after the tool
 * has processed the OIDC authentication request.
 *
 * Flow:
 * 1. User authenticates with MyJKKN
 * 2. MyJKKN redirects to tool's OIDC endpoint
 * 3. Tool processes authentication
 * 4. Tool redirects back here with id_token
 * 5. MyJKKN validates and completes launch
 *
 * Created: 2026-01-12
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { LtiError } from '@/types/lti';

/**
 * POST /api/lti/callback
 * Handle OIDC authentication response (form_post)
 */
export async function POST(request: NextRequest) {
  try {
    // Parse form data (response_mode=form_post)
    const formData = await request.formData();
    const params = Object.fromEntries(formData);

    const id_token = params.id_token as string;
    const state = params.state as string;
    const error = params.error as string;
    const error_description = params.error_description as string;

    // Check for error response
    if (error) {
      console.error('[LTI Callback] Error from tool:', error, error_description);

      return new NextResponse(
        `
<!DOCTYPE html>
<html>
<head>
  <title>Authentication Error</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: #f5f5f5;
    }
    .error-container {
      background: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      max-width: 500px;
      text-align: center;
    }
    h1 {
      color: #dc2626;
      margin: 0 0 20px;
    }
    p {
      color: #666;
      margin: 0 0 10px;
    }
    .error-code {
      font-family: monospace;
      background: #f5f5f5;
      padding: 10px;
      border-radius: 4px;
      margin: 20px 0;
    }
    button {
      background: #2563eb;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      margin-top: 20px;
    }
    button:hover {
      background: #1d4ed8;
    }
  </style>
</head>
<body>
  <div class="error-container">
    <h1>Authentication Failed</h1>
    <p>The tool was unable to complete the authentication process.</p>
    <div class="error-code">
      <strong>Error:</strong> ${error}<br>
      ${error_description ? `<strong>Description:</strong> ${error_description}` : ''}
    </div>
    <button onclick="window.close()">Close Window</button>
  </div>
</body>
</html>
        `,
        {
          status: 400,
          headers: { 'Content-Type': 'text/html' }
        }
      );
    }

    // Validate required parameters
    if (!id_token || !state) {
      return NextResponse.json(
        {
          error: 'INVALID_RESPONSE',
          message: 'Missing required parameters: id_token or state'
        },
        { status: 400 }
      );
    }

    // TODO: Validate state parameter (CSRF protection)
    // In production, retrieve the stored state from session/database
    // and compare with received state

    // TODO: Validate id_token JWT
    // 1. Decode JWT
    // 2. Verify signature with our public key
    // 3. Validate claims (iss, aud, exp, nonce)
    // 4. Extract user information

    // For now, decode the id_token to get basic info
    const jwtParts = id_token.split('.');
    if (jwtParts.length !== 3) {
      return NextResponse.json(
        {
          error: 'INVALID_TOKEN',
          message: 'Invalid id_token format'
        },
        { status: 400 }
      );
    }

    const payload = JSON.parse(
      Buffer.from(jwtParts[1], 'base64url').toString()
    );

    console.log('[LTI Callback] Received id_token:', {
      sub: payload.sub,
      iss: payload.iss,
      aud: payload.aud,
      exp: payload.exp,
      state
    });

    // Success response - show success page
    return new NextResponse(
      `
<!DOCTYPE html>
<html>
<head>
  <title>Authentication Successful</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .success-container {
      background: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      max-width: 500px;
      text-align: center;
    }
    .checkmark {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      display: inline-block;
      background: #10b981;
      margin-bottom: 20px;
      position: relative;
    }
    .checkmark::after {
      content: '✓';
      color: white;
      font-size: 40px;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    }
    h1 {
      color: #10b981;
      margin: 0 0 20px;
      font-size: 24px;
    }
    p {
      color: #666;
      margin: 0 0 10px;
      line-height: 1.6;
    }
    .info {
      background: #f5f5f5;
      padding: 15px;
      border-radius: 4px;
      margin: 20px 0;
      font-size: 14px;
    }
    button {
      background: #2563eb;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      margin-top: 20px;
    }
    button:hover {
      background: #1d4ed8;
    }
  </style>
</head>
<body>
  <div class="success-container">
    <div class="checkmark"></div>
    <h1>Authentication Successful</h1>
    <p>You have been successfully authenticated with the LTI tool.</p>
    <div class="info">
      <strong>Session Information:</strong><br>
      State: ${state.substring(0, 8)}...<br>
      Status: Active
    </div>
    <p>You can now close this window and return to the application.</p>
    <button onclick="window.close()">Close Window</button>
  </div>
</body>
</html>
      `,
      {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      }
    );
  } catch (error) {
    console.error('[LTI Callback] Error:', error);

    if (error instanceof LtiError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      {
        error: 'CALLBACK_ERROR',
        message: 'Failed to process authentication response'
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/lti/callback
 * Handle redirect with query parameters (alternative to form_post)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Convert query parameters to FormData and use POST handler
  const formData = new FormData();
  searchParams.forEach((value, key) => {
    formData.append(key, value);
  });

  // Create a new request with form data
  const postRequest = new Request(request.url, {
    method: 'POST',
    body: formData
  });

  return POST(postRequest as NextRequest);
}
