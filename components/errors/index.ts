/**
 * Error Components - Central Exports
 *
 * Provides a centralized import point for all error boundary components.
 *
 * @example
 * ```typescript
 * import { PageError, DataError } from '@/components/errors';
 * ```
 */

export { PageError, CompactPageError } from './page-error';
export { DataError, InlineDataError } from './data-error';
export { PermissionError, InlinePermissionError } from './permission-error';
