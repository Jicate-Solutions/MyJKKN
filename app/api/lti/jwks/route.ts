/**
 * LTI JWKS (JSON Web Key Set) Endpoint
 * GET /api/lti/jwks - Public key for JWT verification
 *
 * This endpoint provides the RSA public key in JWK format
 * that MATLAB uses to verify JWT signatures from MyJKKN
 *
 * Created: 2026-01-12
 */

import { NextRequest, NextResponse } from 'next/server';
import { LtiJwtService } from '@/lib/services/lti/lti-jwt-service';
import { LtiError } from '@/types/lti';

/**
 * GET /api/lti/jwks
 * Return public key in JWKS format
 *
 * Response format (LTI 1.3 standard):
 * {
 *   "keys": [
 *     {
 *       "kty": "RSA",
 *       "use": "sig",
 *       "alg": "RS256",
 *       "kid": "myjkkn-2026-key-001",
 *       "n": "...(base64url encoded modulus)",
 *       "e": "AQAB"
 *     }
 *   ]
 * }
 */
export async function GET(request: NextRequest) {
  try {
    // Generate JWKS
    const jwks = await LtiJwtService.buildJWKS();

    // Return JWKS with appropriate headers
    return NextResponse.json(jwks, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        'Access-Control-Allow-Origin': '*', // Allow CORS (MATLAB needs to fetch this)
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  } catch (error) {
    console.error('[LTI JWKS API] Error:', error);

    if (error instanceof LtiError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      {
        error: 'JWKS_ERROR',
        message: 'Failed to generate JWKS. Please check server configuration.'
      },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/lti/jwks
 * Handle CORS preflight requests
 */
export async function OPTIONS(request: NextRequest) {
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400' // 24 hours
      }
    }
  );
}
