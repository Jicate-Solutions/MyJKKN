/**
 * SAML Identity Provider Core Service
 *
 * Handles SAML request parsing, response generation, and signing
 */

import * as samlify from 'samlify';
import * as zlib from 'zlib';
import {
  SamlIdpConfig,
  SamlSpConfig,
  ParsedSamlRequest,
  SamlError,
  SamlStatusCode,
  MathWorksUserAttributes,
  MYJKKN_TO_MATHWORKS_AFFILIATION,
  NameIdFormat,
} from '@/types/saml';
import { SamlServiceProviderService } from './saml-service-provider-service';

export class SamlIdpService {
  private static idpInstance: ReturnType<typeof samlify.IdentityProvider> | null = null;

  /**
   * Get or create SAML IdP instance
   */
  private static getIdP(): ReturnType<typeof samlify.IdentityProvider> {
    if (this.idpInstance) {
      return this.idpInstance;
    }

    const config: SamlIdpConfig = this.getIdPConfig();

    this.idpInstance = samlify.IdentityProvider({
      entityID: config.entityId,
      privateKey: this.formatPrivateKey(config.privateKey),
      privateKeyPass: undefined,
      isAssertionEncrypted: false,
      encPrivateKey: undefined,
      encPrivateKeyPass: undefined,
      singleSignOnService: [
        {
          Binding: samlify.Constants.namespace.binding.post,
          Location: config.ssoServiceUrl,
        },
        {
          Binding: samlify.Constants.namespace.binding.redirect,
          Location: config.ssoServiceUrl,
        },
      ],
      singleLogoutService: config.sloServiceUrl
        ? [
            {
              Binding: samlify.Constants.namespace.binding.post,
              Location: config.sloServiceUrl,
            },
          ]
        : [],
      nameIDFormat: [config.nameIdFormat || NameIdFormat.EMAIL],
      signingCert: this.formatCertificate(config.certificate),
    });

    return this.idpInstance;
  }

  /**
   * Get IdP configuration from environment variables
   */
  private static getIdPConfig(): SamlIdpConfig {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://jkkn.ai';
    const privateKey = process.env.SAML_PRIVATE_KEY;
    const certificate = process.env.SAML_PUBLIC_CERTIFICATE;

    if (!privateKey || !certificate) {
      throw new SamlError(
        'SAML private key or certificate not configured',
        SamlStatusCode.RESPONDER,
        'certificate_error'
      );
    }

    return {
      entityId: process.env.SAML_IDP_ENTITY_ID || `${baseUrl}/saml/metadata`,
      ssoServiceUrl: `${baseUrl}/api/saml/sso`,
      sloServiceUrl: `${baseUrl}/api/saml/slo`,
      certificate: certificate,
      privateKey: privateKey,
      nameIdFormat: NameIdFormat.EMAIL,
      signatureAlgorithm: 'sha256',
    };
  }

  /**
   * Format private key for samlify
   */
  private static formatPrivateKey(key: string): string {
    if (key.includes('BEGIN PRIVATE KEY')) {
      return key;
    }
    return `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----`;
  }

  /**
   * Format certificate for samlify
   */
  private static formatCertificate(cert: string): string {
    if (cert.includes('BEGIN CERTIFICATE')) {
      return cert;
    }
    return `-----BEGIN CERTIFICATE-----\n${cert}\n-----END CERTIFICATE-----`;
  }

  /**
   * Create Service Provider instance from database
   */
  private static async createSP(
    entityId: string
  ): Promise<ReturnType<typeof samlify.ServiceProvider>> {
    const sp = await SamlServiceProviderService.validateServiceProvider(entityId);

    return samlify.ServiceProvider({
      entityID: sp.entity_id,
      assertionConsumerService: [
        {
          Binding: samlify.Constants.namespace.binding.post,
          Location: sp.assertion_consumer_service_url,
        },
      ],
      singleLogoutService: sp.single_logout_service_url
        ? [
            {
              Binding: samlify.Constants.namespace.binding.post,
              Location: sp.single_logout_service_url,
            },
          ]
        : [],
      authnRequestsSigned: sp.want_authn_requests_signed,
      signingCert: sp.x509_certificate
        ? this.formatCertificate(sp.x509_certificate)
        : undefined,
    });
  }

  /**
   * Parse SAML AuthnRequest
   */
  static async parseAuthnRequest(
    samlRequest: string,
    binding: 'post' | 'redirect' = 'redirect'
  ): Promise<{ request: ParsedSamlRequest; spEntityId: string }> {
    try {
      // Decode the SAML request
      // HTTP-Redirect binding: SAMLRequest is DEFLATE-compressed then base64-encoded
      // HTTP-POST binding: SAMLRequest is only base64-encoded
      let decoded: string;
      if (binding === 'redirect') {
        const buffer = Buffer.from(samlRequest, 'base64');
        try {
          // SAML HTTP-Redirect binding uses DEFLATE (raw) compression
          decoded = zlib.inflateRawSync(buffer).toString('utf-8');
        } catch {
          // Fallback: some SPs may not compress (non-standard but handle gracefully)
          decoded = buffer.toString('utf-8');
        }
      } else {
        decoded = Buffer.from(samlRequest, 'base64').toString('utf-8');
      }

      // Parse XML to extract issuer (handle saml:, saml2:, or no namespace prefix)
      const issuerMatch = decoded.match(/<(?:saml2?:)?Issuer[^>]*>([^<]+)<\/(?:saml2?:)?Issuer>/i);
      if (!issuerMatch) {
        throw new SamlError(
          'Missing Issuer in SAML request',
          SamlStatusCode.REQUESTER,
          'invalid_request'
        );
      }

      const spEntityId = issuerMatch[1];

      // Get SP configuration — also provides the registered ACS URL as fallback
      // when the AuthnRequest doesn't include AssertionConsumerServiceURL (valid per SAML spec)
      const [sp, spConfig] = await Promise.all([
        this.createSP(spEntityId),
        SamlServiceProviderService.validateServiceProvider(spEntityId),
      ]);
      const idp = this.getIdP();

      // Parse request using samlify
      // samlify expects { query: ... } for redirect binding, { body: ... } for post binding
      const requestData =
        binding === 'redirect'
          ? { query: { SAMLRequest: samlRequest } }
          : { body: { SAMLRequest: samlRequest } };
      const { extract } = await idp.parseLoginRequest(sp, binding, requestData);

      // Fall back to the registered ACS URL if the request omits it (SAML 2.0 §3.4.1.2)
      const acsUrl =
        extract.request.assertionConsumerServiceURL ||
        spConfig.assertion_consumer_service_url;

      return {
        request: {
          id: extract.request.id,
          issuer: extract.issuer,
          assertionConsumerServiceUrl: acsUrl,
          destination: extract.request.destination,
          issueInstant: new Date(extract.request.issueInstant),
          forceAuthn: extract.request.forceAuthn === 'true',
          isPassive: extract.request.isPassive === 'true',
        },
        spEntityId,
      };
    } catch (error) {
      if (error instanceof SamlError) {
        throw error;
      }
      console.error('[saml-idp] Failed to parse SAML request:', error);
      throw new SamlError(
        'Failed to parse SAML request',
        SamlStatusCode.REQUESTER,
        'invalid_request'
      );
    }
  }

  /**
   * Generate SAML Response
   */
  static async generateSamlResponse(
    request: ParsedSamlRequest,
    userAttributes: MathWorksUserAttributes,
    sessionIndex: string,
    spEntityId: string
  ): Promise<string> {
    try {
      const sp = await this.createSP(spEntityId);
      const idp = this.getIdP();
      const config = this.getIdPConfig();

      const now = new Date();
      const notBefore = new Date(now.getTime() - 60000); // 1 minute before
      const notOnOrAfter = new Date(
        now.getTime() + (config.assertionExpiryMinutes || 5) * 60000
      );

      // Build attribute statement
      // For direct SSO (JKKN → MathWorks), use "Affiliation" attribute name
      // Note: "eduPersonScopedAffiliation" is for federated SSO (JKKN → InFED → eduGAIN → MathWorks)
      const attributes = {
        email: userAttributes.email,
        Affiliation: userAttributes.affiliation,
        displayName: `${userAttributes.firstName} ${userAttributes.lastName}`.trim() || userAttributes.userId,
        givenName: userAttributes.firstName || '',
        sn: userAttributes.lastName || '',
      };

      const { context: samlResponse } = await idp.createLoginResponse(
        sp,
        {
          extract: {
            request: {
              id: request.id,
              assertionConsumerServiceURL: request.assertionConsumerServiceUrl,
            },
            issuer: request.issuer,
          },
        },
        'post',
        attributes,
        undefined,
        undefined,
        sessionIndex
      );

      return samlResponse;
    } catch (error) {
      console.error('[saml-idp] Failed to generate SAML response:', error);
      throw new SamlError(
        'Failed to generate SAML response',
        SamlStatusCode.RESPONDER,
        'response_generation_failed'
      );
    }
  }

  /**
   * Map MyJKKN user to MathWorks attributes
   */
  static mapUserToMathWorksAttributes(user: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
    role: string;
  }): MathWorksUserAttributes {
    const affiliation =
      MYJKKN_TO_MATHWORKS_AFFILIATION[user.role] ||
      MYJKKN_TO_MATHWORKS_AFFILIATION.student;

    return {
      userId: user.id,
      affiliation,
      email: user.email,
      firstName: user.first_name || '',
      lastName: user.last_name || '',
    };
  }

  /**
   * Generate IdP metadata XML
   */
  static generateMetadata(): string {
    const idp = this.getIdP();
    return idp.getMetadata();
  }
}
