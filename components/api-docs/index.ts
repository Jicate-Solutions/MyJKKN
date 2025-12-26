/**
 * API Documentation Components
 * Barrel export file for easy importing
 */

// Shared Components
export { MethodBadge } from './shared/method-badge';
export { StatusBadge } from './shared/status-badge';
export { CodeBlock } from './shared/code-block';
export { ParameterTable } from './shared/parameter-table';
export { AuthenticationInfo } from './shared/authentication-info';
export { ErrorResponsesTable } from './shared/error-responses-table';
export { ResponseExamples } from './shared/response-examples';
export { CodeExampleTabs } from './shared/code-example-tabs';
export { AiPromptSection } from './shared/ai-prompt-section';
export { EndpointCard } from './shared/endpoint-card';

// Module Layout
export { ApiModuleLayout } from './module-docs/api-module-layout';

// Re-export types for convenience
export type {
  HttpMethod,
  ParameterType,
  ResponseFormat,
  CodeLanguage,
  ApiModule,
  AiPromptCategory,
  AiPromptComplexity,
  AuthenticationType,
  ApiParameter,
  ApiRequestBody,
  ApiResponse,
  ApiErrorResponse,
  ApiCodeExample,
  ApiAiPrompt,
  ApiRateLimit,
  ApiAuthentication,
  ApiEndpoint,
  ApiModuleConfig,
} from '@/lib/types/api-documentation';
