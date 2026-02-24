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

// samlify v2.x requires an explicit schema validator to be registered before
// any parseLoginRequest / createLoginResponse calls, or it throws
// "no validation function found". Since wantAuthnRequestsSigned=false we never
// verify SP signatures on incoming AuthnRequests, so a permissive passthrough
// is the correct and safe choice here.
samlify.setSchemaValidator({
  validate: (_response: string) => Promise.resolve(''),
});

export class SamlIdpService {
  private static idpInstance: ReturnType<typeof samlify.IdentityProvider> | null = null;
  // Bump this string whenever getIdPConfig() logic changes so the cached
  // idpInstance is invalidated on the next request without requiring a cold start.
  private static readonly IDP_CACHE_VERSION = 'v3-universal-pem-detect';
  private static idpCacheKey: string | null = null;

  /**
   * Get or create SAML IdP instance
   */
  private static getIdP(): ReturnType<typeof samlify.IdentityProvider> {
    if (this.idpInstance && this.idpCacheKey === SamlIdpService.IDP_CACHE_VERSION) {
      return this.idpInstance;
    }
    // Cache miss — build a fresh instance (first call, or version bump after a fix)
    this.idpInstance = null;

    const config: SamlIdpConfig = this.getIdPConfig();

    // Collect all valid SSO locations so samlify's Destination check accepts both
    // www.jkkn.ai and jkkn.ai variants (MathWorks may have registered either form).
    const ssoLocations: { Binding: string; Location: string }[] = [
      { Binding: samlify.Constants.namespace.binding.post, Location: config.ssoServiceUrl },
      { Binding: samlify.Constants.namespace.binding.redirect, Location: config.ssoServiceUrl },
    ];
    // If the base URL uses www, also register the bare-domain variant (and vice-versa)
    // so that MathWorks AuthnRequests with either Destination value pass validation.
    const wwwVariant = config.ssoServiceUrl.includes('://www.')
      ? config.ssoServiceUrl.replace('://www.', '://')
      : config.ssoServiceUrl.replace('://', '://www.');
    ssoLocations.push(
      { Binding: samlify.Constants.namespace.binding.post, Location: wwwVariant },
      { Binding: samlify.Constants.namespace.binding.redirect, Location: wwwVariant },
    );

    this.idpInstance = samlify.IdentityProvider({
      entityID: config.entityId,
      privateKey: this.formatPrivateKey(config.privateKey),
      privateKeyPass: undefined,
      isAssertionEncrypted: false,
      encPrivateKey: undefined,
      encPrivateKeyPass: undefined,
      // Our IdP does NOT require SPs to sign their AuthnRequests.
      // Setting this to false prevents samlify from attempting signature
      // validation when the SP cert is absent — which would throw and be
      // swallowed as "Failed to parse SAML request".
      wantAuthnRequestsSigned: false,
      singleSignOnService: ssoLocations,
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
    this.idpCacheKey = SamlIdpService.IDP_CACHE_VERSION;

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

    // Env vars are stored as base64-encoded PEM files (i.e. the value is
    // base64("-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n")).
    // Without decoding first, formatPrivateKey wraps the encoded blob inside a
    // SECOND set of PEM headers — an invalid double-wrapped key that node-forge
    // rejects during samlify's IdentityProvider() construction, which surfaces
    // as the generic "Failed to parse SAML request" error on every SSO attempt.
    const decodePemIfNeeded = (val: string): string => {
      if (val.trimStart().startsWith('-----BEGIN ')) return val; // already raw PEM
      try {
        const decoded = Buffer.from(val, 'base64').toString('utf-8');
        if (decoded.trimStart().startsWith('-----BEGIN ')) return decoded;
      } catch { /* not valid base64 — use as-is and let samlify surface the error */ }
      return val;
    };

    return {
      entityId: process.env.SAML_IDP_ENTITY_ID || `${baseUrl}/saml/metadata`,
      ssoServiceUrl: `${baseUrl}/api/saml/sso`,
      sloServiceUrl: `${baseUrl}/api/saml/slo`,
      certificate: decodePemIfNeeded(certificate),
      privateKey: decodePemIfNeeded(privateKey),
      nameIdFormat: NameIdFormat.EMAIL,
      signatureAlgorithm: 'sha256',
    };
  }

  /**
   * Format private key for samlify
   *
   * If the key already contains any PEM block (-----BEGIN ... / -----END ...)
   * return it untouched — this covers PKCS#8 ("BEGIN PRIVATE KEY"), PKCS#1
   * ("BEGIN RSA PRIVATE KEY"), EC ("BEGIN EC PRIVATE KEY"), and any other
   * standard PEM type without needing to enumerate them all.
   *
   * Only when the value has no PEM headers (raw base64 DER body) do we wrap
   * it — and only with PKCS#8 headers, which is what Node.js crypto expects
   * for an unwrapped key body.
   *
   * IMPORTANT: do NOT check for a specific type name (e.g. "BEGIN PRIVATE KEY"
   * alone). That substring is absent from "BEGIN RSA PRIVATE KEY", so PKCS#1
   * keys would be double-wrapped and OpenSSL would throw
   * "DECODER routines::unsupported".
   */
  private static formatPrivateKey(key: string): string {
    if (key.includes('-----BEGIN ') && key.includes('-----END ')) {
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
      // Always false: our IdP has wantAuthnRequestsSigned=false, meaning we do
      // not validate incoming AuthnRequest signatures regardless of what the SP
      // metadata advertises. Setting this to true when signingCert is absent
      // causes samlify to throw a certificate error that surfaces as the
      // generic "Failed to parse SAML request" 500 response.
      authnRequestsSigned: false,
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

      // Detect the Destination URL in the incoming XML and compare to our canonical SSO URL.
      // samlify's parseLoginRequest validates Destination against getSingleSignOnService(binding)
      // which returns only the FIRST configured location per binding — the alias entries we
      // register for www/non-www variants are ignored. We therefore normalise the Destination
      // in the decoded XML to our canonical URL before re-encoding and passing to samlify.
      const configuredSsoUrl = this.getIdPConfig().ssoServiceUrl;
      const destinationMatch = decoded.match(/Destination="([^"]+)"/);
      const destination = destinationMatch?.[1];

      let xmlToProcess = decoded;
      if (destination && destination !== configuredSsoUrl) {
        console.warn('[saml-idp] Destination URL mismatch — normalising to canonical SSO URL:', {
          received: destination,
          canonical: configuredSsoUrl,
        });
        // Replace only the exact Destination value so we don't accidentally mutate other XML.
        // This is safe because: (a) wantAuthnRequestsSigned=false so we don't check the
        // signature over the XML bytes, and (b) the full URL string is unique in the document.
        xmlToProcess = decoded.replace(destination, configuredSsoUrl);
      }

      // Re-encode the (possibly normalised) XML for samlify.
      // POST binding:     samlify expects base64(xml)
      // Redirect binding: samlify expects base64(deflateRaw(xml))
      let processedSamlRequest: string;
      if (binding === 'redirect') {
        processedSamlRequest = zlib.deflateRawSync(Buffer.from(xmlToProcess, 'utf-8')).toString('base64');
      } else {
        processedSamlRequest = Buffer.from(xmlToProcess, 'utf-8').toString('base64');
      }

      // Parse request using samlify
      // samlify expects { query: ... } for redirect binding, { body: ... } for post binding
      const requestData =
        binding === 'redirect'
          ? { query: { SAMLRequest: processedSamlRequest } }
          : { body: { SAMLRequest: processedSamlRequest } };
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
      // Propagate the raw samlify error message so it reaches the 500 JSON response
      // and is visible in both server logs AND the API caller — no more silent failures.
      const rawMessage = error instanceof Error ? error.message : String(error);
      console.error('[saml-idp] parseLoginRequest threw (raw samlify error):', {
        message: rawMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new SamlError(
        `Failed to parse SAML request: ${rawMessage}`,
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
      // Propagate raw samlify error so it surfaces in the API response and logs
      // (mirrors the same pattern used in parseAuthnRequest)
      const rawMessage = error instanceof Error ? error.message : String(error);
      console.error('[saml-idp] createLoginResponse threw (raw samlify error):', {
        message: rawMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new SamlError(
        `Failed to generate SAML response: ${rawMessage}`,
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
