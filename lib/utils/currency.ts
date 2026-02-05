/**
 * Currency Utility Functions
 *
 * CRITICAL: Financial data is stored in paisa (100 paisa = ₹1) as BIGINT
 * to prevent floating-point precision errors.
 *
 * ALWAYS use these helper functions when working with financial data.
 *
 * Example of the problem with DECIMAL/float:
 * ❌ 100.10 + 200.20 = 300.2999999999 (WRONG!)
 *
 * Example with paisa (integer):
 * ✅ 10010 + 20020 = 30030 paisa = ₹300.30 (CORRECT!)
 */

/**
 * Convert rupees to paisa for database storage
 *
 * @param rupees - Amount in rupees (e.g., 100.50)
 * @returns Amount in paisa as integer (e.g., 10050)
 *
 * @example
 * rupeesToPaisa(100.50) // Returns 10050
 * rupeesToPaisa(0.99)   // Returns 99
 * rupeesToPaisa(1)      // Returns 100
 */
export function rupeesToPaisa(rupees: number): number {
  return Math.round(rupees * 100);
}

/**
 * Convert paisa to rupees for display
 *
 * @param paisa - Amount in paisa as integer (e.g., 10050)
 * @returns Amount in rupees (e.g., 100.50)
 *
 * @example
 * paisaToRupees(10050) // Returns 100.50
 * paisaToRupees(99)    // Returns 0.99
 * paisaToRupees(100)   // Returns 1.00
 */
export function paisaToRupees(paisa: number): number {
  return paisa / 100;
}

/**
 * Format paisa as currency string for display
 *
 * @param paisa - Amount in paisa as integer (e.g., 10050)
 * @param options - Intl.NumberFormatOptions for formatting
 * @returns Formatted currency string (e.g., "₹100.50")
 *
 * @example
 * formatPaisaAsCurrency(10050) // Returns "₹100.50"
 * formatPaisaAsCurrency(99)    // Returns "₹0.99"
 * formatPaisaAsCurrency(0)     // Returns "₹0.00"
 */
export function formatPaisaAsCurrency(
  paisa: number,
  options?: Intl.NumberFormatOptions
): string {
  const rupees = paisaToRupees(paisa);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  }).format(rupees);
}

/**
 * Add multiple paisa amounts with exact precision
 *
 * @param amounts - Array of paisa amounts
 * @returns Sum of all amounts in paisa
 *
 * @example
 * addPaisa(10010, 20020) // Returns 30030 (₹300.30)
 * addPaisa(100, 200, 300) // Returns 600 (₹6.00)
 */
export function addPaisa(...amounts: number[]): number {
  return amounts.reduce((sum, amount) => sum + amount, 0);
}

/**
 * Subtract paisa amounts with exact precision
 *
 * @param minuend - Amount to subtract from
 * @param subtrahend - Amount to subtract
 * @returns Difference in paisa
 *
 * @example
 * subtractPaisa(30030, 10010) // Returns 20020 (₹200.20)
 */
export function subtractPaisa(minuend: number, subtrahend: number): number {
  return minuend - subtrahend;
}

/**
 * Multiply paisa amount by a factor
 *
 * @param paisa - Amount in paisa
 * @param factor - Multiplication factor
 * @returns Result in paisa
 *
 * @example
 * multiplyPaisa(10050, 2) // Returns 20100 (₹201.00)
 * multiplyPaisa(10050, 0.5) // Returns 5025 (₹50.25)
 */
export function multiplyPaisa(paisa: number, factor: number): number {
  return Math.round(paisa * factor);
}

/**
 * Calculate percentage of paisa amount
 *
 * @param paisa - Amount in paisa
 * @param percentage - Percentage as number (e.g., 10 for 10%)
 * @returns Result in paisa
 *
 * @example
 * percentageOfPaisa(10000, 10) // Returns 1000 (₹10.00 is 10% of ₹100.00)
 * percentageOfPaisa(10050, 5) // Returns 503 (₹5.03 is 5% of ₹100.50)
 */
export function percentageOfPaisa(paisa: number, percentage: number): number {
  return Math.round((paisa * percentage) / 100);
}

/**
 * Parse user input (string) to paisa
 * Handles various input formats and validates the amount
 *
 * @param input - User input string (e.g., "100.50", "100", ".50")
 * @returns Amount in paisa or null if invalid
 *
 * @example
 * parseRupeesInputToPaisa("100.50") // Returns 10050
 * parseRupeesInputToPaisa("100") // Returns 10000
 * parseRupeesInputToPaisa(".50") // Returns 50
 * parseRupeesInputToPaisa("abc") // Returns null
 */
export function parseRupeesInputToPaisa(input: string): number | null {
  // Remove currency symbols and whitespace
  const cleaned = input.replace(/[₹,\s]/g, '');

  // Try to parse as number
  const rupees = parseFloat(cleaned);

  // Validate
  if (isNaN(rupees) || rupees < 0) {
    return null;
  }

  return rupeesToPaisa(rupees);
}

/**
 * Validate that a paisa amount is valid and non-negative
 *
 * @param paisa - Amount to validate
 * @returns true if valid, false otherwise
 *
 * @example
 * isValidPaisa(10050) // Returns true
 * isValidPaisa(-100) // Returns false
 * isValidPaisa(NaN) // Returns false
 */
export function isValidPaisa(paisa: number): boolean {
  return !isNaN(paisa) && isFinite(paisa) && paisa >= 0;
}

/**
 * Type guard to check if a value is a valid paisa amount
 *
 * @param value - Value to check
 * @returns true if value is a valid paisa amount
 */
export function isPaisaAmount(value: unknown): value is number {
  return typeof value === 'number' && isValidPaisa(value);
}

// Export type for COPQ cost fields (for type safety)
export type PaisaAmount = number & { readonly __brand: 'Paisa' };

/**
 * Brand a number as a PaisaAmount for type safety
 * This is a compile-time only check
 *
 * @param paisa - Amount in paisa
 * @returns Branded paisa amount
 */
export function brandAsPaisa(paisa: number): PaisaAmount {
  if (!isValidPaisa(paisa)) {
    throw new Error(`Invalid paisa amount: ${paisa}`);
  }
  return paisa as PaisaAmount;
}

/**
 * Constants for common amounts
 */
export const PAISA = {
  ZERO: 0,
  ONE_RUPEE: 100,
  TEN_RUPEES: 1000,
  HUNDRED_RUPEES: 10000,
  THOUSAND_RUPEES: 100000,
} as const;

/**
 * Error class for currency operation errors
 */
export class CurrencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CurrencyError';
  }
}

/**
 * Safely convert paisa, throwing error if invalid
 *
 * @param paisa - Amount in paisa
 * @returns Amount in rupees
 * @throws CurrencyError if paisa is invalid
 */
export function safePaisaToRupees(paisa: number): number {
  if (!isValidPaisa(paisa)) {
    throw new CurrencyError(`Invalid paisa amount: ${paisa}`);
  }
  return paisaToRupees(paisa);
}

/**
 * Safely convert rupees, throwing error if invalid
 *
 * @param rupees - Amount in rupees
 * @returns Amount in paisa
 * @throws CurrencyError if rupees is invalid
 */
export function safeRupeesToPaisa(rupees: number): number {
  if (isNaN(rupees) || !isFinite(rupees) || rupees < 0) {
    throw new CurrencyError(`Invalid rupees amount: ${rupees}`);
  }
  return rupeesToPaisa(rupees);
}
