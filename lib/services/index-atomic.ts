// lib/services/index-atomic.ts
// ATOMIC SERVICE OPERATIONS - USE THESE TO PREVENT RACE CONDITIONS

/**
 * Atomic Services Overview
 * ========================
 *
 * These services use database-level locking and optimistic versioning to prevent race conditions.
 *
 * Key Features:
 * 1. SELECT FOR UPDATE - Locks rows during critical operations
 * 2. Version Checking - Detects concurrent modifications
 * 3. Atomic Transactions - All-or-nothing updates
 * 4. Retry Logic - Automatic retry on version conflicts
 *
 * Usage Example:
 * ```typescript
 * import { GrievanceServiceAtomic } from '@/lib/services/index-atomic';
 *
 * try {
 *   const ticket = await GrievanceServiceAtomic.resolveTicket(
 *     ticketId,
 *     resolution,
 *     userId,
 *     currentVersion // Optional: for optimistic locking
 *   );
 * } catch (error) {
 *   if (error.message.includes('Please refresh')) {
 *     // Handle concurrent update - show user friendly message
 *     toast.error('Someone else updated this ticket. Please refresh.');
 *   }
 * }
 * ```
 *
 * When to Use:
 * - ANY operation that resolves/closes records
 * - ANY operation that changes status
 * - ANY operation that updates critical state
 * - ANY multi-step operation that must be atomic
 *
 * When NOT Needed:
 * - Reading data (SELECTs)
 * - Creating new records (INSERTs without state dependencies)
 * - Updating non-critical fields (e.g., notes, descriptions)
 */

export { GrievanceServiceAtomic } from './grievance/grievance-service-atomic';
export { ProcessExcellenceServiceAtomic } from './process-excellence/process-excellence-service-atomic';
export { BillingCOPQServiceAtomic } from './billing/copq/billing-copq-service-atomic';
export { MaturityAssessmentServiceAtomic } from './maturity-assessment/maturity-assessment-service-atomic';
