// lib/services/pde-coach-errors.ts
// ============================================================================
// Typed error class for PDE Clinical Reasoning coach.
//
// The student UI (Agent C) inspects `code` to decide between toast messages:
//   - CAP_REACHED  → "You've used all 5 attempts. Ask faculty to grant more."
//   - AI_FAILURE   → "AI is temporarily unavailable. Retry?"
//   - INVALID_INPUT → "Answer cannot be empty / question not in this case."
//   - NOT_FOUND    → "Case or session not found."
//
// `retryable` lets the UI auto-offer a Retry button for transient failures.
// HTTP status is the value the API route returns to the browser.
// ============================================================================

export type FeedbackErrorCode =
  | 'CAP_REACHED'
  | 'AI_FAILURE'
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'INTERNAL';

export interface FeedbackErrorOptions {
  code: FeedbackErrorCode;
  message: string;
  status?: number;
  retryable?: boolean;
  cause?: unknown;
}

export class FeedbackError extends Error {
  code: FeedbackErrorCode;
  status: number;
  retryable: boolean;
  causeValue?: unknown;

  constructor(opts: FeedbackErrorOptions) {
    super(opts.message);
    this.name = 'FeedbackError';
    this.code = opts.code;
    this.status = opts.status ?? defaultStatusForCode(opts.code);
    this.retryable = opts.retryable ?? defaultRetryableForCode(opts.code);
    if (opts.cause !== undefined) this.causeValue = opts.cause;
  }

  toJSON(): {
    error: string;
    code: FeedbackErrorCode;
    retryable: boolean;
  } {
    return {
      error: this.message,
      code: this.code,
      retryable: this.retryable,
    };
  }
}

function defaultStatusForCode(code: FeedbackErrorCode): number {
  switch (code) {
    case 'CAP_REACHED':
      return 429;
    case 'AI_FAILURE':
      return 502;
    case 'INVALID_INPUT':
      return 400;
    case 'NOT_FOUND':
      return 404;
    case 'INTERNAL':
    default:
      return 500;
  }
}

function defaultRetryableForCode(code: FeedbackErrorCode): boolean {
  switch (code) {
    case 'AI_FAILURE':
      return true;
    case 'CAP_REACHED':
    case 'INVALID_INPUT':
    case 'NOT_FOUND':
      return false;
    case 'INTERNAL':
    default:
      return false;
  }
}
