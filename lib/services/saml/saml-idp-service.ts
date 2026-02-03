/**
 * SAML Identity Provider Core Service
 *
 * Handles SAML request parsing, response generation, and signing
 */

import * as samlify from 'samlify';
import {
  SamlIdpConfig,
  SamlSpConfig,
  ParsedSamlRequest,
  SamlError,
  SAML_ERROR_CODES,
  MathWorksUserAttributes,
  MYJKKN_TO_MATHWORKS_AFFILIATION,
} from '@/types/saml';
import { SamlServiceProviderService } from './saml-service-provider-service';

export class SamlIdpService {
  private static idpInstance: samlify.IdentityProvider | null = null;

  /**
   * Get or create SAML IdP instance
   */
  private static getIdP(): samlify.IdentityProvider {
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
      assertionEndpoint: config.singleSignOnServiceUrl,
      singleSignOnService: [
        {
          Binding: samlify.Constants.namespace.binding.post,
          Location: config.singleSignOnServiceUrl,
        },
        {
          Binding: samlify.Constants.namespace.binding.redirect,
          Location: config.singleSignOnServiceUrl,
        },
      ],
      singleLogoutService: config.singleLogoutServiceUrl
        ? [
            {
              Binding: samlify.Constants.namespace.binding.post,
              Location: config.singleLogoutServiceUrl,
            },
          ]
        : [],
      nameIDFormat: [config.nameIdFormat || 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'],
      signingCert: this.formatCertificate(config.x509Certificate),
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
        SAML_ERROR_CODES.CERTIFICATE_ERROR,
        500
      );
    }

    return {
      entityId: process.env.SAML_IDP_ENTITY_ID || `${baseUrl}/saml/metadata`,
      singleSignOnServiceUrl: `${baseUrl}/api/saml/sso`,
      singleLogoutServiceUrl: `${baseUrl}/api/saml/slo`,
      x509Certificate: certificate,
      privateKey: privateKey,
      responseExpiryMinutes: parseInt(
        process.env.SAML_RESPONSE_EXPIRY_MINUTES || '5'
      ),
      assertionExpiryMinutes: parseInt(
        process.env.SAML_ASSERTION_EXPIRY_MINUTES || '5'
      ),
      nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
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
  ): Promise<samlify.ServiceProvider> {
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
      wantAssertionsSigned: sp.want_assertions_signed,
      wantAuthnRequestsSigned: sp.want_authn_requests_signed,
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
      const decoded =
        binding === 'redirect'
          ? Buffer.from(samlRequest, 'base64').toString('utf-8')
          : Buffer.from(samlRequest, 'base64').toString('utf-8');

      // Parse XML to extract issuer
      const issuerMatch = decoded.match(/<saml:Issuer[^>]*>([^<]+)<\/saml:Issuer>/i);
      if (!issuerMatch) {
        throw new SamlError(
          'Missing Issuer in SAML request',
          SAML_ERROR_CODES.INVALID_REQUEST,
          400,
          'urn:oasis:names:tc:SAML:2.0:status:Requester'
        );
      }

      const spEntityId = issuerMatch[1];

      // Get SP configuration
      const sp = await this.createSP(spEntityId);
      const idp = this.getIdP();

      // Parse request using samlify
      const { extract } = await idp.parseLoginRequest(sp, binding, { body: { SAMLRequest: samlRequest } });

      return {
        request: {
          id: extract.request.id,
          issuer: extract.issuer,
          assertionConsumerServiceUrl: extract.request.assertionConsumerServiceURL || '',
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
      throw new SamlError(
        'Failed to parse SAML request',
        SAML_ERROR_CODES.INVALID_REQUEST,
        400,
        'urn:oasis:names:tc:SAML:2.0:status:Requester',
        error
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
      const attributes = {
        email: userAttributes.email,
        eduPersonScopedAffiliation: userAttributes.affiliation,
        displayName: userAttributes.displayName || userAttributes.identifier,
        givenName: userAttributes.givenName || '',
        sn: userAttributes.surname || '',
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
        {
          email: userAttributes.email,
        },
        undefined,
        undefined,
        {
          sessionIndex,
          attributes,
        }
      );

      return samlResponse;
    } catch (error) {
      throw new SamlError(
        'Failed to generate SAML response',
        SAML_ERROR_CODES.RESPONSE_GENERATION_FAILED,
        500,
        'urn:oasis:names:tc:SAML:2.0:status:Responder',
        error
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
      identifier: user.email,
      affiliation,
      email: user.email,
      givenName: user.first_name,
      surname: user.last_name,
      displayName: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
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
