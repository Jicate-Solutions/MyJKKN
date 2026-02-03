/**
 * SAML 2.0 Identity Provider Type Definitions
 *
 * Comprehensive type definitions for SAML IdP implementation
 * including MathWorks-specific attribute mappings
 */

// ============================================================================
// SAML Configuration Types
// ============================================================================

/**
 * Main SAML IdP Configuration
 */
export interface SamlIdpConfig {
  /** IdP Entity ID (unique identifier for this IdP) */
  entityId: string;

  /** Single Sign-On service URL */
  ssoServiceUrl: string;

  /** Single Logout service URL */
  sloServiceUrl?: string;

  /** IdP certificate for signing (PEM format) */
  certificate: string;

  /** IdP private key for signing (PEM format) */
  privateKey: string;

  /** Signature algorithm */
  signatureAlgorithm?: 'sha256' | 'sha512';

  /** Digest algorithm */
  digestAlgorithm?: 'sha256' | 'sha512';

  /** NameID format to use */
  nameIdFormat?: NameIdFormat;

  /** Session timeout in milliseconds */
  sessionTimeout?: number;

  /** Whether to encrypt assertions */
  wantAssertionsEncrypted?: boolean;

  /** Whether to sign assertions */
  signAssertions?: boolean;

  /** Whether to sign responses */
  signResponses?: boolean;
}

/**
 * Service Provider Configuration
 */
export interface ServiceProviderConfig {
  id: string;
  entityId: string;
  institutionId: string;
  displayName: string;
  description?: string;

  /** Assertion Consumer Service URL */
  acsUrl: string;

  /** Single Logout Service URL */
  sloUrl?: string;

  /** SP Certificate for encryption (PEM format) */
  certificate?: string;

  /** Attribute mapping configuration */
  attributeMapping?: AttributeMapping;

  /** Whether to encrypt assertions for this SP */
  encryptAssertions?: boolean;

  /** Whether SP is active */
  isActive: boolean;

  /** Allowed NameID formats */
  allowedNameIdFormats?: NameIdFormat[];

  /** Custom attributes to include */
  customAttributes?: Record<string, string>;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Attribute Mapping Configuration
 */
export interface AttributeMapping {
  /** Map internal user attributes to SAML attributes */
  mappings: Record<string, string>;

  /** Static attributes to always include */
  staticAttributes?: Record<string, string>;

  /** Required attributes that must be present */
  requiredAttributes?: string[];
}

// ============================================================================
// SAML Protocol Types
// ============================================================================

/**
 * SAML NameID Formats
 */
export enum NameIdFormat {
  UNSPECIFIED = 'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified',
  EMAIL = 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  PERSISTENT = 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
  TRANSIENT = 'urn:oasis:names:tc:SAML:2.0:nameid-format:transient',
  ENTITY = 'urn:oasis:names:tc:SAML:2.0:nameid-format:entity',
}

/**
 * SAML Authentication Request (from SP to IdP)
 */
export interface SamlAuthnRequest {
  id: string;
  issueInstant: string;
  destination: string;
  assertionConsumerServiceURL: string;
  issuer: string;
  nameIdFormat?: NameIdFormat;
  forceAuthn?: boolean;
  isPassive?: boolean;
  protocolBinding?: string;
  requestedAuthnContext?: {
    comparison: 'exact' | 'minimum' | 'maximum' | 'better';
    classRefs: string[];
  };
}

/**
 * SAML Response (from IdP to SP)
 */
export interface SamlResponse {
  id: string;
  issueInstant: string;
  destination: string;
  inResponseTo: string;
  issuer: string;
  status: SamlStatus;
  assertion?: SamlAssertion;
}

/**
 * SAML Assertion
 */
export interface SamlAssertion {
  id: string;
  issueInstant: string;
  version: '2.0';
  issuer: string;
  subject: SamlSubject;
  conditions: SamlConditions;
  authnStatement: SamlAuthnStatement;
  attributeStatement?: SamlAttributeStatement;
}

/**
 * SAML Subject
 */
export interface SamlSubject {
  nameId: SamlNameId;
  subjectConfirmation: SamlSubjectConfirmation;
}

/**
 * SAML NameID
 */
export interface SamlNameId {
  format: NameIdFormat;
  value: string;
  nameQualifier?: string;
  spNameQualifier?: string;
}

/**
 * SAML Subject Confirmation
 */
export interface SamlSubjectConfirmation {
  method: 'urn:oasis:names:tc:SAML:2.0:cm:bearer';
  subjectConfirmationData: {
    notOnOrAfter: string;
    recipient: string;
    inResponseTo: string;
  };
}

/**
 * SAML Conditions
 */
export interface SamlConditions {
  notBefore: string;
  notOnOrAfter: string;
  audienceRestriction: {
    audience: string[];
  };
}

/**
 * SAML Authentication Statement
 */
export interface SamlAuthnStatement {
  authnInstant: string;
  sessionIndex: string;
  authnContext: {
    authnContextClassRef: string;
  };
}

/**
 * SAML Attribute Statement
 */
export interface SamlAttributeStatement {
  attributes: SamlAttribute[];
}

/**
 * SAML Attribute
 */
export interface SamlAttribute {
  name: string;
  nameFormat?: string;
  friendlyName?: string;
  attributeValue: string | string[];
}

/**
 * SAML Status
 */
export interface SamlStatus {
  statusCode: SamlStatusCode;
  statusMessage?: string;
  statusDetail?: string;
}

/**
 * SAML Status Codes
 */
export enum SamlStatusCode {
  SUCCESS = 'urn:oasis:names:tc:SAML:2.0:status:Success',
  REQUESTER = 'urn:oasis:names:tc:SAML:2.0:status:Requester',
  RESPONDER = 'urn:oasis:names:tc:SAML:2.0:status:Responder',
  VERSION_MISMATCH = 'urn:oasis:names:tc:SAML:2.0:status:VersionMismatch',
  AUTHN_FAILED = 'urn:oasis:names:tc:SAML:2.0:status:AuthnFailed',
  INVALID_ATTR_NAME_OR_VALUE = 'urn:oasis:names:tc:SAML:2.0:status:InvalidAttrNameOrValue',
  INVALID_NAMEID_POLICY = 'urn:oasis:names:tc:SAML:2.0:status:InvalidNameIDPolicy',
  NO_AUTHN_CONTEXT = 'urn:oasis:names:tc:SAML:2.0:status:NoAuthnContext',
  NO_AVAILABLE_IDP = 'urn:oasis:names:tc:SAML:2.0:status:NoAvailableIDP',
  NO_PASSIVE = 'urn:oasis:names:tc:SAML:2.0:status:NoPassive',
  NO_SUPPORTED_IDP = 'urn:oasis:names:tc:SAML:2.0:status:NoSupportedIDP',
  PARTIAL_LOGOUT = 'urn:oasis:names:tc:SAML:2.0:status:PartialLogout',
  PROXY_COUNT_EXCEEDED = 'urn:oasis:names:tc:SAML:2.0:status:ProxyCountExceeded',
  REQUEST_DENIED = 'urn:oasis:names:tc:SAML:2.0:status:RequestDenied',
  REQUEST_UNSUPPORTED = 'urn:oasis:names:tc:SAML:2.0:status:RequestUnsupported',
  REQUEST_VERSION_DEPRECATED = 'urn:oasis:names:tc:SAML:2.0:status:RequestVersionDeprecated',
  REQUEST_VERSION_TOO_HIGH = 'urn:oasis:names:tc:SAML:2.0:status:RequestVersionTooHigh',
  REQUEST_VERSION_TOO_LOW = 'urn:oasis:names:tc:SAML:2.0:status:RequestVersionTooLow',
  RESOURCE_NOT_RECOGNIZED = 'urn:oasis:names:tc:SAML:2.0:status:ResourceNotRecognized',
  TOO_MANY_RESPONSES = 'urn:oasis:names:tc:SAML:2.0:status:TooManyResponses',
  UNKNOWN_ATTR_PROFILE = 'urn:oasis:names:tc:SAML:2.0:status:UnknownAttrProfile',
  UNKNOWN_PRINCIPAL = 'urn:oasis:names:tc:SAML:2.0:status:UnknownPrincipal',
  UNSUPPORTED_BINDING = 'urn:oasis:names:tc:SAML:2.0:status:UnsupportedBinding',
}

/**
 * SAML Logout Request
 */
export interface SamlLogoutRequest {
  id: string;
  issueInstant: string;
  destination: string;
  issuer: string;
  nameId: SamlNameId;
  sessionIndex?: string;
  notOnOrAfter?: string;
}

/**
 * SAML Logout Response
 */
export interface SamlLogoutResponse {
  id: string;
  issueInstant: string;
  destination: string;
  inResponseTo: string;
  issuer: string;
  status: SamlStatus;
}

// ============================================================================
// MathWorks-Specific Types
// ============================================================================

/**
 * MathWorks User Attributes
 * Based on MathWorks SAML documentation
 */
export interface MathWorksUserAttributes {
  /** User's email address (required) */
  email: string;

  /** User's first name */
  firstName: string;

  /** User's last name */
  lastName: string;

  /** User's affiliation/role (required) */
  affiliation: MathWorksAffiliation;

  /** Unique user identifier */
  userId: string;

  /** Organization/Institution name */
  organization?: string;

  /** Department within organization */
  department?: string;

  /** Country code (ISO 3166-1 alpha-2) */
  country?: string;
}

/**
 * MathWorks Affiliation Types
 * Maps to their accepted role values
 */
export enum MathWorksAffiliation {
  STUDENT = 'student',
  FACULTY = 'faculty',
  STAFF = 'staff',
  EMPLOYEE = 'employee',
  MEMBER = 'member',
  AFFILIATE = 'affiliate',
  ALUM = 'alum',
  LIBRARY_WALK_IN = 'library-walk-in',
}

/**
 * MyJKKN to MathWorks Role Mapping
 */
export const MYJKKN_TO_MATHWORKS_AFFILIATION: Record<string, MathWorksAffiliation> = {
  student: MathWorksAffiliation.STUDENT,
  faculty: MathWorksAffiliation.FACULTY,
  staff: MathWorksAffiliation.STAFF,
  admin: MathWorksAffiliation.EMPLOYEE,
  super_admin: MathWorksAffiliation.EMPLOYEE,
  hod: MathWorksAffiliation.FACULTY,
  principal: MathWorksAffiliation.FACULTY,
  librarian: MathWorksAffiliation.STAFF,
  accountant: MathWorksAffiliation.STAFF,
};

/**
 * MathWorks SAML Attribute Names
 */
export const MATHWORKS_SAML_ATTRIBUTES = {
  EMAIL: 'urn:oid:0.9.2342.19200300.100.1.3',
  FIRST_NAME: 'urn:oid:2.5.4.42',
  LAST_NAME: 'urn:oid:2.5.4.4',
  AFFILIATION: 'urn:oid:1.3.6.1.4.1.5923.1.1.1.1',
  USER_ID: 'urn:oid:0.9.2342.19200300.100.1.1',
  ORGANIZATION: 'urn:oid:2.5.4.10',
  DEPARTMENT: 'urn:oid:2.5.4.11',
  COUNTRY: 'urn:oid:2.5.4.6',
} as const;

// ============================================================================
// Session and State Management Types
// ============================================================================

/**
 * SAML Session
 */
export interface SamlSession {
  id: string;
  userId: string;
  serviceProviderId: string;
  sessionIndex: string;
  nameId: string;
  nameIdFormat: NameIdFormat;
  institutionId: string;
  createdAt: Date;
  expiresAt: Date;
  lastAccessedAt: Date;
  attributes?: Record<string, string | string[]>;
}

/**
 * SAML Request State (stored temporarily during authentication flow)
 */
export interface SamlRequestState {
  id: string;
  requestId: string;
  serviceProviderId: string;
  relayState?: string;
  acsUrl: string;
  createdAt: Date;
  expiresAt: Date;
}

// ============================================================================
// Service Provider Registry Types
// ============================================================================

/**
 * Service Provider Registry Entry (for database)
 */
export interface ServiceProviderRegistryEntry {
  id: string;
  entity_id: string;
  institution_id: string;
  display_name: string;
  description?: string;
  acs_url: string;
  slo_url?: string;
  certificate?: string;
  attribute_mapping?: Record<string, unknown>;
  encrypt_assertions: boolean;
  is_active: boolean;
  allowed_name_id_formats?: NameIdFormat[];
  custom_attributes?: Record<string, string>;
  created_at: string;
  updated_at: string;
}

/**
 * Service Provider Metadata (for discovery)
 */
export interface ServiceProviderMetadata {
  entityId: string;
  displayName: string;
  description?: string;
  organizationName?: string;
  organizationDisplayName?: string;
  organizationURL?: string;
  contactPersons?: ContactPerson[];
  assertionConsumerServices: AssertionConsumerService[];
  singleLogoutServices?: SingleLogoutService[];
  nameIdFormats: NameIdFormat[];
  certificate?: string;
}

/**
 * Contact Person
 */
export interface ContactPerson {
  contactType: 'technical' | 'support' | 'administrative' | 'billing' | 'other';
  givenName?: string;
  surname?: string;
  emailAddress?: string;
  telephoneNumber?: string;
}

/**
 * Assertion Consumer Service
 */
export interface AssertionConsumerService {
  binding: string;
  location: string;
  index: number;
  isDefault?: boolean;
}

/**
 * Single Logout Service
 */
export interface SingleLogoutService {
  binding: string;
  location: string;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * SAML Error Class
 */
export class SamlError extends Error {
  constructor(
    message: string,
    public statusCode: SamlStatusCode = SamlStatusCode.RESPONDER,
    public statusDetail?: string
  ) {
    super(message);
    this.name = 'SamlError';
    Object.setPrototypeOf(this, SamlError.prototype);
  }
}

/**
 * SAML Validation Error
 */
export class SamlValidationError extends SamlError {
  constructor(message: string, statusDetail?: string) {
    super(message, SamlStatusCode.REQUESTER, statusDetail);
    this.name = 'SamlValidationError';
  }
}

/**
 * SAML Authentication Error
 */
export class SamlAuthenticationError extends SamlError {
  constructor(message: string, statusDetail?: string) {
    super(message, SamlStatusCode.AUTHN_FAILED, statusDetail);
    this.name = 'SamlAuthenticationError';
  }
}

/**
 * SAML Configuration Error
 */
export class SamlConfigurationError extends SamlError {
  constructor(message: string, statusDetail?: string) {
    super(message, SamlStatusCode.RESPONDER, statusDetail);
    this.name = 'SamlConfigurationError';
  }
}

// ============================================================================
// Additional Types for SAML IdP Implementation
// ============================================================================

/**
 * SAML IdP Configuration (Extended)
 */
export interface SamlIdpConfig {
  entityId: string;
  singleSignOnServiceUrl: string;
  singleLogoutServiceUrl?: string;
  x509Certificate: string;
  privateKey: string;
  responseExpiryMinutes?: number;
  assertionExpiryMinutes?: number;
  nameIdFormat?: SamlNameIdFormat;
  signatureAlgorithm?: 'sha256' | 'sha512';
}

/**
 * SAML Service Provider Configuration (for samlify)
 */
export interface SamlSpConfig {
  entityId: string;
  assertionConsumerServiceUrl: string;
  singleLogoutServiceUrl?: string;
  x509Certificate?: string;
  wantAssertionsSigned?: boolean;
  wantAuthnRequestsSigned?: boolean;
}

/**
 * SAML NameID Format Types
 */
export type SamlNameIdFormat =
  | 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'
  | 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent'
  | 'urn:oasis:names:tc:SAML:2.0:nameid-format:transient'
  | 'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified';

/**
 * Parsed SAML Request (from samlify)
 */
export interface ParsedSamlRequest {
  id: string;
  issuer: string;
  assertionConsumerServiceUrl: string;
  destination?: string;
  issueInstant: Date;
  forceAuthn?: boolean;
  isPassive?: boolean;
}

/**
 * SAML Error Codes
 */
export const SAML_ERROR_CODES = {
  INVALID_REQUEST: 'invalid_request',
  INVALID_SIGNATURE: 'invalid_signature',
  EXPIRED_REQUEST: 'expired_request',
  UNKNOWN_SERVICE_PROVIDER: 'unknown_service_provider',
  SERVICE_PROVIDER_INACTIVE: 'service_provider_inactive',
  USER_NOT_AUTHENTICATED: 'user_not_authenticated',
  USER_NOT_FOUND: 'user_not_found',
  ATTRIBUTE_MAPPING_FAILED: 'attribute_mapping_failed',
  RESPONSE_GENERATION_FAILED: 'response_generation_failed',
  SESSION_CREATION_FAILED: 'session_creation_failed',
  INVALID_METADATA: 'invalid_metadata',
  CERTIFICATE_ERROR: 'certificate_error',
  UNAUTHORIZED: 'unauthorized',
  DATABASE_ERROR: 'database_error',
} as const;

/**
 * SAML Session Types
 */
export interface SamlSession {
  id: string;
  session_index: string;
  user_id: string;
  service_provider_entity_id: string;
  name_id: string;
  name_id_format: SamlNameIdFormat;
  created_at: string;
  expires_at: string;
  ip_address?: string;
  user_agent?: string;
}

export interface SamlSessionInsert {
  session_index: string;
  user_id: string;
  service_provider_entity_id: string;
  name_id: string;
  name_id_format: SamlNameIdFormat;
  expires_at: string;
  ip_address?: string;
  user_agent?: string;
}

/**
 * SAML Service Provider Registry Types
 */
export interface SamlServiceProvider {
  id: string;
  entity_id: string;
  name: string;
  description?: string;
  metadata_url?: string;
  assertion_consumer_service_url: string;
  single_logout_service_url?: string;
  x509_certificate?: string;
  want_assertions_signed: boolean;
  want_authn_requests_signed: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

export interface SamlServiceProviderInsert {
  entity_id: string;
  name: string;
  description?: string;
  metadata_url?: string;
  assertion_consumer_service_url: string;
  single_logout_service_url?: string;
  x509_certificate?: string;
  want_assertions_signed?: boolean;
  want_authn_requests_signed?: boolean;
  is_active?: boolean;
}

export interface SamlServiceProviderUpdate {
  entity_id?: string;
  name?: string;
  description?: string;
  metadata_url?: string;
  assertion_consumer_service_url?: string;
  single_logout_service_url?: string;
  x509_certificate?: string;
  want_assertions_signed?: boolean;
  want_authn_requests_signed?: boolean;
  is_active?: boolean;
  updated_by?: string;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * SAML Binding Types
 */
export enum SamlBinding {
  HTTP_POST = 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST',
  HTTP_REDIRECT = 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect',
  HTTP_ARTIFACT = 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Artifact',
  SOAP = 'urn:oasis:names:tc:SAML:2.0:bindings:SOAP',
}

/**
 * Authentication Context Class References
 */
export enum AuthnContextClassRef {
  PASSWORD = 'urn:oasis:names:tc:SAML:2.0:ac:classes:Password',
  PASSWORD_PROTECTED_TRANSPORT = 'urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport',
  PREVIOUS_SESSION = 'urn:oasis:names:tc:SAML:2.0:ac:classes:PreviousSession',
  X509 = 'urn:oasis:names:tc:SAML:2.0:ac:classes:X509',
  SMARTCARD = 'urn:oasis:names:tc:SAML:2.0:ac:classes:Smartcard',
  KERBEROS = 'urn:oasis:names:tc:SAML:2.0:ac:classes:Kerberos',
  UNSPECIFIED = 'urn:oasis:names:tc:SAML:2.0:ac:classes:unspecified',
}

/**
 * SAML Version
 */
export const SAML_VERSION = '2.0' as const;

/**
 * SAML Namespaces
 */
export const SAML_NAMESPACES = {
  SAML: 'urn:oasis:names:tc:SAML:2.0:assertion',
  SAMLP: 'urn:oasis:names:tc:SAML:2.0:protocol',
  DS: 'http://www.w3.org/2000/09/xmldsig#',
  XENC: 'http://www.w3.org/2001/04/xmlenc#',
  XS: 'http://www.w3.org/2001/XMLSchema',
  XSI: 'http://www.w3.org/2001/XMLSchema-instance',
  MD: 'urn:oasis:names:tc:SAML:2.0:metadata',
} as const;
