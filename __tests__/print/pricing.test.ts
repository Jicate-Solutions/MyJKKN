import { describe, it, expect } from 'vitest';
import { quotePrintJob, InvalidPrintJobError } from '@/lib/print/pricing';
import { summarisePages } from '@/lib/print/page-analysis';

const RATES = { monoPaisePerImpression: 200, colourPaisePerImpression: 1000 };

describe('quotePrintJob', () => {
  it('prices mono and colour pages at their own rates', () => {
    const q = quotePrintJob(
      summarisePages(['mono', 'mono', 'colour']),
      { copies: 1, duplex: false },
      RATES
    );
    expect(q.subtotal).toBe(200 * 2 + 1000);
  });

  it('multiplies by copies', () => {
    const q = quotePrintJob(
      summarisePages(['mono', 'colour']),
      { copies: 3, duplex: false },
      RATES
    );
    expect(q.monoImpressions).toBe(3);
    expect(q.colourImpressions).toBe(3);
    expect(q.subtotal).toBe(3 * 200 + 3 * 1000);
  });

  // The point of pricing per impression: duplex saves paper, not toner.
  it('charges the same for duplex but consumes half the sheets', () => {
    const pages = summarisePages(['mono', 'mono', 'mono', 'mono']);
    const simplex = quotePrintJob(pages, { copies: 1, duplex: false }, RATES);
    const duplex = quotePrintJob(pages, { copies: 1, duplex: true }, RATES);

    expect(duplex.subtotal).toBe(simplex.subtotal);
    expect(simplex.sheets).toBe(4);
    expect(duplex.sheets).toBe(2);
  });

  it('rounds an odd duplex page count up to a whole sheet', () => {
    const q = quotePrintJob(
      summarisePages(['mono', 'mono', 'mono']),
      { copies: 1, duplex: true },
      RATES
    );
    expect(q.sheets).toBe(2);
  });

  // A blank page costs the institution paper but must not cost the learner.
  it('does not bill a trailing blank page but still pulls paper for it', () => {
    const q = quotePrintJob(
      summarisePages(['mono', 'mono', 'blank']),
      { copies: 1, duplex: false },
      RATES
    );
    expect(q.subtotal).toBe(400);
    expect(q.sheets).toBe(3);
  });

  it('refuses a nonsense copy count', () => {
    const pages = summarisePages(['mono']);
    expect(() => quotePrintJob(pages, { copies: 0, duplex: false }, RATES)).toThrow(
      InvalidPrintJobError
    );
    expect(() => quotePrintJob(pages, { copies: 1.5, duplex: false }, RATES)).toThrow(
      InvalidPrintJobError
    );
  });

  it('refuses a fractional-paise rate', () => {
    expect(() =>
      quotePrintJob(summarisePages(['mono']), { copies: 1, duplex: false }, {
        monoPaisePerImpression: 2.5,
        colourPaisePerImpression: 1000,
      })
    ).toThrow(InvalidPrintJobError);
  });
});
