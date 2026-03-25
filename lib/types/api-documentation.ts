/**
 * API Documentation Type Definitions
 * Comprehensive type system for MyJKKN API documentation
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
export type ParameterType = 'path' | 'query' | 'body' | 'header';
export type ResponseFormat = 'json' | 'xml' | 'text';
export type CodeLanguage = 'javascript' | 'typescript' | 'python' | 'curl' | 'php' | 'bash' | 'json';
export type ApiModule = 'organizations' | 'learners' | 'academic' | 'staff' | 'applications';
export type AiPromptCategory = 'data-retrieval' | 'analysis' | 'automation' | 'integration';
export type AiPromptComplexity = 'beginner' | 'intermediate' | 'advanced';
export type AuthenticationType = 'bearer' | 'api-key' | 'oauth2' | 'basic';

/**
 * Represents a single parameter (path, query, or body)
 */
export interface ApiParameter {
  name: string;
  type: string; // 'string', 'number', 'boolean', 'uuid', 'array', 'object'
  required: boolean;
  description: string;
  example?: string | number | boolean;
  enum?: string[]; // Predefined values
  default?: string | number | boolean;
  pattern?: string; // Regex pattern for validation
  min?: number; // For numbers/arrays
  max?: number;
}

/**
 * Represents the request body structure
 */
export interface ApiRequestBody {
  contentType: string; // 'application/json', 'multipart/form-data'
  schema: ApiParameter[];
  example: Record<string, any>;
  description?: string;
}

/**
 * Represents a success response
 */
export interface ApiResponse {
  statusCode: number;
  description: string;
  contentType: ResponseFormat;
  schema?: ApiParameter[]; // Structure of response
  example: Record<string, any> | any[];
  headers?: Record<string, string>;
}

/**
 * Represents an error response
 */
export interface ApiErrorResponse {
  statusCode: number;
  errorCode: string; // 'UNAUTHORIZED', 'VALIDATION_ERROR', etc.
  message: string;
  example: Record<string, any>;
}

/**
 * Represents a code example in a specific language
 */
export interface ApiCodeExample {
  language: CodeLanguage;
  label: string; // Display name: "JavaScript (Fetch)", "cURL", etc.
  code: string;
  description?: string;
}

/**
 * Represents an AI usage prompt/template
 */
export interface ApiAiPrompt {
  title: string;
  prompt: string;
  category: AiPromptCategory;
  complexity: AiPromptComplexity;
  expectedOutput?: string;
  tags?: string[];
}

/**
 * Represents rate limiting configuration
 */
export interface ApiRateLimit {
  requestsPerMinute?: number;
  requestsPerHour?: number;
  requestsPerDay?: number;
  burstLimit?: number;
  description: string;
}

/**
 * Represents authentication requirements
 */
export interface ApiAuthentication {
  type: AuthenticationType;
  description: string;
  headerName?: string; // e.g., 'Authorization'
  example: string;
  scopes?: string[]; // For OAuth2
}

/**
 * Core interface representing a complete API endpoint
 */
export interface ApiEndpoint {
  // Identification
  id: string; // Unique identifier: 'organizations-institutions-list'
  module: ApiModule;
  category?: string; // Sub-grouping: 'institutions', 'degrees', etc.

  // Basic Info
  title: string;
  description: string;
  method: HttpMethod;
  path: string; // '/api/organizations/institutions'
  version?: string; // 'v1', 'v2' for versioned APIs

  // Request Configuration
  authentication?: ApiAuthentication;
  pathParameters?: ApiParameter[];
  queryParameters?: ApiParameter[];
  requestBody?: ApiRequestBody;

  // Response Configuration
  successResponses: ApiResponse[];
  errorResponses: ApiErrorResponse[];

  // Code Examples
  codeExamples: ApiCodeExample[];

  // AI Integration
  aiPrompts?: ApiAiPrompt[];

  // Additional Metadata
  rateLimit?: ApiRateLimit;
  tags?: string[]; // For search/filtering: ['pagination', 'filtering', 'admin-only']
  deprecated?: boolean;
  deprecationMessage?: string;
  relatedEndpoints?: string[]; // IDs of related endpoints
  notes?: string[]; // Important notes/warnings
  changelog?: {
    version: string;
    date: string;
    changes: string[];
  }[];
}

/**
 * Represents module-level configuration
 */
export interface ApiModuleConfig {
  moduleName: string;
  moduleDescription: string;
  baseUrl: string;
  endpoints: ApiEndpoint[];
  generalNotes?: string[];
  commonErrors?: ApiErrorResponse[];
  authenticationOverview?: string;
}

/**
 * Type guard to validate ApiEndpoint at runtime
 */
export function isValidApiEndpoint(obj: any): obj is ApiEndpoint {
  return (
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    typeof obj.title === 'string' &&
    typeof obj.method === 'string' &&
    typeof obj.path === 'string' &&
    typeof obj.module === 'string' &&
    typeof obj.description === 'string' &&
    Array.isArray(obj.codeExamples) &&
    Array.isArray(obj.successResponses) &&
    Array.isArray(obj.errorResponses)
  );
}

/**
 * Type guard to validate ApiModuleConfig at runtime
 */
export function isValidApiModuleConfig(obj: any): obj is ApiModuleConfig {
  return (
    typeof obj === 'object' &&
    typeof obj.moduleName === 'string' &&
    typeof obj.moduleDescription === 'string' &&
    typeof obj.baseUrl === 'string' &&
    Array.isArray(obj.endpoints) &&
    obj.endpoints.every(isValidApiEndpoint)
  );
}
