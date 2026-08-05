/**
 * SAML Identity Provider Core Service
 *
 * Handles SAML request parsing, response generation, and signing
 */

import * as samlify from 'samlify';
import * as zlib from 'zlib';
import { createPrivateKey, randomUUID } from 'crypto';
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
  private static readonly IDP_CACHE_VERSION = 'v4-pkcs1-convert';
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

    // ── Key format diagnostic (no key material logged) ──────────────────────
    const rawEnvKey = process.env.SAML_PRIVATE_KEY ?? '';
    const decodedKey = config.privateKey; // after decodePemIfNeeded
    const finalKey   = this.formatPrivateKey(decodedKey);
    console.log('[saml-idp] key-diagnostic', {
      envLength:        rawEnvKey.length,
      envFirst30:       rawEnvKey.substring(0, 30),
      decodedFirst30:   decodedKey.substring(0, 30),
      finalFirstLine:   finalKey.split('\n')[0],
      finalLastLine:    finalKey.split('\n').filter(Boolean).at(-1),
      finalKeyLength:   finalKey.length,
    });
    // ────────────────────────────────────────────────────────────────────────

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
   * Format private key for samlify — always returns PKCS#1 PEM.
   *
   * xml-crypto (used internally by samlify for XML signing) strips PEM headers
   * and reconstructs them as "-----BEGIN RSA PRIVATE KEY-----" (PKCS#1).
   * When the DER body is actually PKCS#8, OpenSSL 3.x throws
   * "DECODER routines::unsupported" because the headers claim PKCS#1 but the
   * DER body is PKCS#8.
   *
   * Fix: always export as PKCS#1 via Node.js crypto so samlify receives the
   * format it expects, regardless of what format the env var was generated in.
   */
  private static formatPrivateKey(key: string): string {
    // Ensure raw DER base64 gets wrapped so crypto.createPrivateKey can parse it
    const pemKey = (key.includes('-----BEGIN ') && key.includes('-----END '))
      ? key
      : `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----`;

    console.log('[saml-idp] formatPrivateKey input:', {
      inputFirstLine: pemKey.split('\n')[0],
      inputLength: pemKey.length,
    });

    // Convert to PKCS#1 (RSA PRIVATE KEY) which xml-crypto handles correctly
    try {
      const keyObj = createPrivateKey(pemKey);
      const pkcs1Key = keyObj.export({ type: 'pkcs1', format: 'pem' }) as string;
      console.log('[saml-idp] formatPrivateKey PKCS#1 conversion SUCCESS:', {
        outputFirstLine: pkcs1Key.split('\n')[0],
        outputLength: pkcs1Key.length,
        asymmetricKeyType: keyObj.asymmetricKeyType,
      });
      return pkcs1Key;
    } catch (err) {
      // Conversion failed — return as-is and let samlify surface the error
      console.error('[saml-idp] PKCS#1 conversion FAILED, using key as-is:', err);
      return pemKey;
    }
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
   * Bare base64 DER body of the certificate — no PEM header/footer, no newlines.
   *
   * This is the INVERSE of formatCertificate() and is what samlify's getKeyInfo()
   * requires when constructSAMLSignature() is called directly (as
   * generateErrorResponse does): it feeds the value straight into forge's base64
   * decoder AND embeds it verbatim inside <ds:X509Certificate>, where XML-DSig
   * mandates the bare body. Passing full PEM throws
   * "Unparsed DER bytes remain after ASN.1 parsing".
   *
   * The generateSamlResponse() path does NOT need this — it goes through
   * samlify's IdentityProvider, which normalises the cert itself.
   */
  private static stripCertificate(cert: string): string {
    return cert
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\s+/g, '');
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
   * Compare two ACS URLs for equality.
   *
   * Scheme and host are case-insensitive per RFC 3986; the path is not. A lone
   * trailing slash is ignored so ".../SSO" and ".../SSO/" count as the same
   * endpoint. Anything unparseable falls back to an exact string compare —
   * fail-closed, since a URL we cannot parse must not be treated as a match.
   */
  private static isSameAcsUrl(a: string, b: string): boolean {
    const normalise = (value: string): string => {
      try {
        const parsed = new URL(value.trim());
        const path = parsed.pathname.replace(/\/$/, '');
        return `${parsed.protocol.toLowerCase()}//${parsed.host.toLowerCase()}${path}${parsed.search}`;
      } catch {
        return value.trim();
      }
    };
    return normalise(a) === normalise(b);
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

      // An AuthnRequest MAY name its own AssertionConsumerServiceURL, but it
      // must match the one registered for this SP.
      //
      // This is load-bearing, not defence in depth: wantAuthnRequestsSigned is
      // false (see getIdP), so nothing authenticates the request and EVERY
      // field here is untrusted input. Without this check an attacker could
      // craft a request naming MathWorks as Issuer but their own ACS URL, lure
      // a signed-in JKKN user to it, and receive a valid signed assertion for
      // that user's identity.
      //
      // Omitting the URL entirely is legal (SAML 2.0 §3.4.1.2) — the registered
      // value is then used. We always emit the registered value, never the
      // requested one, so a match modulo trailing slash still resolves to our
      // canonical endpoint.
      const registeredAcsUrl = spConfig.assertion_consumer_service_url;
      const requestedAcsUrl = extract.request.assertionConsumerServiceURL as
        | string
        | undefined;

      if (requestedAcsUrl && !this.isSameAcsUrl(requestedAcsUrl, registeredAcsUrl)) {
        console.error(
          '[saml-idp] AssertionConsumerServiceURL does not match the registered SP ACS:',
          { spEntityId, requested: requestedAcsUrl, registered: registeredAcsUrl }
        );
        throw new SamlError(
          'AssertionConsumerServiceURL does not match the registered Service Provider',
          SamlStatusCode.REQUESTER,
          'acs_url_mismatch'
        );
      }

      const acsUrl = registeredAcsUrl;

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
   * Top-level SAML status codes permitted by SAML 2.0 Core §3.2.2.2.
   * Everything else (AuthnFailed, InvalidAttrNameOrValue, …) is a SECOND-level
   * code and MUST be nested inside one of these — SPs reject a Response whose
   * top-level StatusCode is e.g. AuthnFailed.
   */
  private static readonly TOP_LEVEL_STATUS_CODES: ReadonlySet<string> = new Set([
    SamlStatusCode.SUCCESS,
    SamlStatusCode.REQUESTER,
    SamlStatusCode.RESPONDER,
    SamlStatusCode.VERSION_MISMATCH,
  ]);

  private static escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Generate a signed SAML error Response (a Response with a failure Status and
   * NO Assertion), base64-encoded ready for HTTP-POST to the SP's ACS.
   *
   * Why this exists: previously every failure inside /api/saml/sso returned a
   * JSON 500 served from jkkn.ai, which strands the user on our domain. SAML
   * 2.0 Core §3.2.2 requires the IdP to report protocol/authentication failures
   * back to the requesting SP, and MathWorks' explicit acceptance criterion for
   * this integration is that the browser returns to a MathWorks page "even if
   * an error is shown".
   *
   * The Response carries no Assertion, so there is no identity to forge; if
   * signing fails we still emit it unsigned rather than strand the user.
   */
  static generateErrorResponse(params: {
    destination: string;
    statusCode?: SamlStatusCode;
    statusMessage?: string;
    inResponseTo?: string;
  }): string {
    const config = this.getIdPConfig();
    const { destination, inResponseTo } = params;
    const requested = params.statusCode || SamlStatusCode.RESPONDER;

    const isTopLevel = this.TOP_LEVEL_STATUS_CODES.has(requested);
    const topLevelCode = isTopLevel
      ? requested
      : requested === SamlStatusCode.AUTHN_FAILED
        ? SamlStatusCode.RESPONDER
        : SamlStatusCode.REQUESTER;
    const secondLevelCode = isTopLevel ? null : requested;

    // Truncated deliberately: `destination` comes from the AuthnRequest, so a
    // full internal error string must never be shipped verbatim to it.
    const statusMessage = (params.statusMessage || '').slice(0, 200);

    // SAML IDs are xsd:ID (an NCName) — must not start with a digit.
    const responseId = `_${randomUUID().replace(/-/g, '')}`;

    const xml =
      `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"` +
      ` xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"` +
      ` ID="${responseId}" Version="2.0" IssueInstant="${new Date().toISOString()}"` +
      ` Destination="${this.escapeXml(destination)}"` +
      (inResponseTo ? ` InResponseTo="${this.escapeXml(inResponseTo)}"` : '') +
      `>` +
      `<saml:Issuer>${this.escapeXml(config.entityId)}</saml:Issuer>` +
      `<samlp:Status>` +
      `<samlp:StatusCode Value="${topLevelCode}">` +
      (secondLevelCode ? `<samlp:StatusCode Value="${secondLevelCode}"/>` : '') +
      `</samlp:StatusCode>` +
      (statusMessage
        ? `<samlp:StatusMessage>${this.escapeXml(statusMessage)}</samlp:StatusMessage>`
        : '') +
      `</samlp:Status>` +
      `</samlp:Response>`;

    try {
      return samlify.SamlLib.constructSAMLSignature({
        rawSamlMessage: xml,
        // Sign the whole Response: there is no Assertion to sign here.
        isMessageSigned: true,
        privateKey: this.formatPrivateKey(config.privateKey),
        signingCert: this.stripCertificate(config.certificate),
        signatureAlgorithm: samlify.Constants.algorithms.signature.RSA_SHA256,
        signatureConfig: {
          prefix: 'ds',
          location: {
            reference: "/*[local-name(.)='Response']/*[local-name(.)='Issuer']",
            action: 'after',
          },
        },
        isBase64Output: true,
      });
    } catch (error) {
      // Signing is best-effort. An unsigned error Response still lets the SP
      // end the flow on its own domain, which beats a 500 on ours.
      console.error('[saml-idp] Failed to sign error Response — sending unsigned:', error);
      return Buffer.from(xml, 'utf-8').toString('base64');
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
