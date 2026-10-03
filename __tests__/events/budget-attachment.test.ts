// __tests__/events/budget-attachment.test.ts — BUG-004627.
import { describe, it, expect } from 'vitest';
import {
  BUDGET_ATTACHMENT_MAX_BYTES,
  budgetAttachmentError,
} from '@/lib/utils/events/budget-attachment';

describe('budgetAttachmentError', () => {
  it('accepts a PDF bill', () => {
    expect(budgetAttachmentError({ size: 2048, type: 'application/pdf' })).toBeNull();
  });

  it('accepts a photo of a receipt and an Excel quotation', () => {
    expect(budgetAttachmentError({ size: 2048, type: 'image/jpeg' })).toBeNull();
    expect(
      budgetAttachmentError({
        size: 2048,
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
    ).toBeNull();
  });

  it('rejects empty and oversized files', () => {
    expect(budgetAttachmentError({ size: 0, type: 'application/pdf' })).toMatch(/empty/);
    expect(
      budgetAttachmentError({ size: BUDGET_ATTACHMENT_MAX_BYTES + 1, type: 'application/pdf' })
    ).toMatch(/10 MB/);
  });

  it('rejects unsupported types', () => {
    expect(budgetAttachmentError({ size: 10, type: 'application/x-msdownload' })).toMatch(/PDF/);
    expect(budgetAttachmentError({ size: 10, type: '' })).toMatch(/PDF/);
  });
});
