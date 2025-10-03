// lib/utils/resource-id-generator.ts

/**
 * Resource ID Generator Utility
 *
 * Generates unique resource IDs with the following format:
 * [PREFIX]-[CATEGORY_CODE]-[INSTITUTION_CODE]-[SEQUENTIAL_NUMBER]
 *
 * Example: RES-LAB-JKKN-001, RES-LIB-JKKN-042
 */

/**
 * Generate a unique resource code
 *
 * @param categoryName - Name of the parent category
 * @param institutionName - Name of the institution
 * @param existingCount - Number of existing resources (for sequential numbering)
 * @returns Unique resource code
 */
export function generateResourceCode(
  categoryName: string,
  institutionName: string,
  existingCount: number = 0
): string {
  // Extract category code (first 3 letters, uppercase)
  const categoryCode = categoryName
    .replace(/[^a-zA-Z]/g, '') // Remove non-alphabetic characters
    .substring(0, 3)
    .toUpperCase()
    .padEnd(3, 'X'); // Pad with X if less than 3 characters

  // Extract institution code (first 4 letters, uppercase)
  const institutionCode = institutionName
    .replace(/[^a-zA-Z]/g, '') // Remove non-alphabetic characters
    .substring(0, 4)
    .toUpperCase()
    .padEnd(4, 'X'); // Pad with X if less than 4 characters

  // Generate sequential number (padded to 4 digits)
  const sequentialNumber = String(existingCount + 1).padStart(4, '0');

  // Combine all parts
  return `RES-${categoryCode}-${institutionCode}-${sequentialNumber}`;
}

/**
 * Generate a random resource code (fallback option)
 *
 * @param categoryCode - Short category code
 * @returns Random resource code
 */
export function generateRandomResourceCode(categoryCode: string = 'GEN'): string {
  const timestamp = Date.now().toString(36).toUpperCase(); // Base-36 timestamp
  const random = Math.random().toString(36).substring(2, 6).toUpperCase(); // Random string

  return `RES-${categoryCode}-${timestamp}-${random}`;
}

/**
 * Validate resource code format
 *
 * @param code - Resource code to validate
 * @returns true if valid, false otherwise
 */
export function isValidResourceCode(code: string): boolean {
  // Format: RES-XXX-XXXX-XXXX or similar variations
  const pattern = /^RES-[A-Z0-9]{3,}-[A-Z0-9]{3,}-[A-Z0-9]{4,}$/;
  return pattern.test(code);
}

/**
 * Parse resource code to extract components
 *
 * @param code - Resource code
 * @returns Object with parsed components
 */
export function parseResourceCode(code: string): {
  prefix: string;
  categoryCode: string;
  institutionCode: string;
  sequentialNumber: string;
} | null {
  const parts = code.split('-');

  if (parts.length !== 4) {
    return null;
  }

  return {
    prefix: parts[0],
    categoryCode: parts[1],
    institutionCode: parts[2],
    sequentialNumber: parts[3]
  };
}
