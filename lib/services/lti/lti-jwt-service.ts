/**
 * LTI JWT Service
 *
 * Generates and signs LTI 1.3 JWT tokens for tool launches
 * Uses RS256 (RSA + SHA256) asymmetric signing
 *
 * Created: 2026-01-12
 */

import { SignJWT, importPKCS8 } from 'jose';
import { v4 as uuidv4 } from 'uuid';
import {
  LtiJwtPayload,
  LtiTool,
  LtiError,
  LTI_ERROR_CODES,
  LTI_ROLE_URIS
} from '@/types/lti';

export class LtiJwtService {
  /**
   * Import private key from environment variable
   */
  private static async getPrivateKey(): Promise<CryptoKey> {
    const privateKeyPem = process.env.LTI_PRIVATE_KEY;

    if (!privateKeyPem) {
      throw new LtiError(
        'LTI_PRIVATE_KEY environment variable not set',
        LTI_ERROR_CODES.INVALID_TOKEN,
        500
      );
    }

    try {
      // Convert escaped newlines to actual newlines
      const formattedKey = privateKeyPem.replace(/\\n/g, '\n');

      // Import the private key
      const privateKey = await importPKCS8(formattedKey, 'RS256');
      return privateKey;
    } catch (error) {
      throw new LtiError(
        'Failed to import private key',
        LTI_ERROR_CODES.INVALID_TOKEN,
        500,
        error
      );
    }
  }

  /**
   * Generate LTI 1.3 JWT token for tool launch
   */
  static async generateLaunchToken(params: {
    tool: LtiTool;
    user: {
      id: string;
      email: string;
      name: string;
      givenName?: string;
      familyName?: string;
    };
    roles: string[]; // LTI role URIs
    context?: {
      id: string;
      label?: string;
      title?: string;
      type?: string[];
    };
    resourceLink?: {
      id: string;
      title?: string;
      description?: string;
    };
    customClaims?: {
      institution?: any;
      learner?: any;
      academic?: any;
    };
  }): Promise<string> {
    const privateKey = await this.getPrivateKey();
    const now = Math.floor(Date.now() / 1000);

    // Get configuration from environment
    const issuer = process.env.LTI_ISSUER || 'https://jkkn.ai';
    const keyId = process.env.LTI_KEY_ID || 'myjkkn-2026-key-001';

    // Build LTI 1.3 claims
    const payload: LtiJwtPayload = {
      // Standard JWT claims
      iss: issuer,
      sub: params.user.id,
      aud: params.tool.launch_url,
      exp: now + 300, // 5 minutes expiration
      iat: now,
      nonce: uuidv4(),

      // LTI 1.3 required claims
      'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiResourceLinkRequest',
      'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
      'https://purl.imsglobal.org/spec/lti/claim/deployment_id': params.tool.deployment_id,
      'https://purl.imsglobal.org/spec/lti/claim/target_link_uri': params.tool.launch_url,
      'https://purl.imsglobal.org/spec/lti/claim/roles': params.roles,

      // User information
      name: params.user.name,
      email: params.user.email
    };

    // Add optional claims
    if (params.user.givenName) {
      payload.given_name = params.user.givenName;
    }

    if (params.user.familyName) {
      payload.family_name = params.user.familyName;
    }

    // Add context claim if provided
    if (params.context) {
      payload['https://purl.imsglobal.org/spec/lti/claim/context'] = params.context;
    }

    // Add resource link claim if provided
    if (params.resourceLink) {
      payload['https://purl.imsglobal.org/spec/lti/claim/resource_link'] = params.resourceLink;
    }

    // Add custom MyJKKN claims if provided
    if (params.customClaims?.institution) {
      payload['https://jkkn.ai/claims/institution'] = params.customClaims.institution;
    }

    if (params.customClaims?.learner) {
      payload['https://jkkn.ai/claims/learner'] = params.customClaims.learner;
    }

    if (params.customClaims?.academic) {
      payload['https://jkkn.ai/claims/academic'] = params.customClaims.academic;
    }

    try {
      // Sign the JWT with RS256
      const jwt = await new SignJWT(payload as any)
        .setProtectedHeader({
          alg: 'RS256',
          typ: 'JWT',
          kid: keyId
        })
        .sign(privateKey);

      return jwt;
    } catch (error) {
      throw new LtiError(
        'Failed to sign JWT',
        LTI_ERROR_CODES.INVALID_TOKEN,
        500,
        error
      );
    }
  }

  /**
   * Validate JWT expiration time
   */
  static isTokenExpired(exp: number): boolean {
    const now = Math.floor(Date.now() / 1000);
    return now > exp;
  }

  /**
   * Generate a unique nonce for JWT
   */
  static generateNonce(): string {
    return uuidv4();
  }

  /**
   * Calculate JWT expiration timestamp (default: 5 minutes)
   */
  static calculateExpiration(minutes: number = 5): number {
    const now = Math.floor(Date.now() / 1000);
    return now + (minutes * 60);
  }

  /**
   * Validate JWT claims for LTI 1.3 compliance
   */
  static validateLtiClaims(payload: Partial<LtiJwtPayload>): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Required standard claims
    if (!payload.iss) errors.push('Missing issuer (iss)');
    if (!payload.sub) errors.push('Missing subject (sub)');
    if (!payload.aud) errors.push('Missing audience (aud)');
    if (!payload.exp) errors.push('Missing expiration (exp)');
    if (!payload.iat) errors.push('Missing issued at (iat)');
    if (!payload.nonce) errors.push('Missing nonce');

    // Required LTI 1.3 claims
    const messageType = payload['https://purl.imsglobal.org/spec/lti/claim/message_type'];
    if (!messageType) {
      errors.push('Missing LTI message_type claim');
    }

    const version = payload['https://purl.imsglobal.org/spec/lti/claim/version'];
    if (!version || version !== '1.3.0') {
      errors.push('Missing or invalid LTI version claim (must be 1.3.0)');
    }

    const deploymentId = payload['https://purl.imsglobal.org/spec/lti/claim/deployment_id'];
    if (!deploymentId) {
      errors.push('Missing LTI deployment_id claim');
    }

    const targetLinkUri = payload['https://purl.imsglobal.org/spec/lti/claim/target_link_uri'];
    if (!targetLinkUri) {
      errors.push('Missing LTI target_link_uri claim');
    }

    const roles = payload['https://purl.imsglobal.org/spec/lti/claim/roles'];
    if (!roles || !Array.isArray(roles) || roles.length === 0) {
      errors.push('Missing or invalid LTI roles claim');
    }

    // Validate expiration
    if (payload.exp && this.isTokenExpired(payload.exp)) {
      errors.push('Token is expired');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get public key in JWK format for JWKS endpoint
   */
  static async getPublicKeyJWK(): Promise<any> {
    const publicKeyPem = process.env.LTI_PUBLIC_KEY;

    if (!publicKeyPem) {
      throw new LtiError(
        'LTI_PUBLIC_KEY environment variable not set',
        LTI_ERROR_CODES.INVALID_TOKEN,
        500
      );
    }

    const keyId = process.env.LTI_KEY_ID || 'myjkkn-2026-key-001';

    try {
      // Convert escaped newlines to actual newlines
      const formattedKey = publicKeyPem.replace(/\\n/g, '\n');

      // Import public key
      const { createPublicKey } = await import('crypto');
      const keyObject = createPublicKey(formattedKey);

      // Export as JWK
      const jwk = keyObject.export({ format: 'jwk' });

      // Add LTI-specific fields
      return {
        kty: jwk.kty,
        use: 'sig',
        alg: 'RS256',
        kid: keyId,
        n: jwk.n,
        e: jwk.e
      };
    } catch (error) {
      throw new LtiError(
        'Failed to export public key as JWK',
        LTI_ERROR_CODES.INVALID_TOKEN,
        500,
        error
      );
    }
  }

  /**
   * Build JWKS (JSON Web Key Set) response
   */
  static async buildJWKS(): Promise<{ keys: any[] }> {
    const jwk = await this.getPublicKeyJWK();

    return {
      keys: [jwk]
    };
  }
}
