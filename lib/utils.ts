import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combines multiple class names using clsx and tailwind-merge
 * @param inputs - Class names to combine
 * @returns Merged class names
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a date as a string in the format 'YYYY-MM-DD'.
 * @param date - The date to format
 * @returns The formatted date string
 */
export function formatDateToString(date: Date | null | undefined): string {
  if (!date) return '';
  return date.toISOString().split('T')[0];
}

/**
 * Converts a string to a Date object.
 * @param dateStr - The date string to convert
 * @returns The Date object or null if invalid
 */
export function stringToDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return !isNaN(date.getTime()) ? date : null;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unexpected error occurred';
}

export async function handleApiResponse(response: Response) {
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'An error occurred');
  }
  return response.json();
}

/**
 * Formats a number as currency in Indian Rupees
 * @param amount - The amount to format
 * @param options - Formatting options
 * @returns Formatted currency string
 */
export function formatCurrency(
  amount: number | undefined | null,
  options?: {
    showDecimals?: boolean;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  }
): string {
  if (amount === undefined || amount === null) return 'N/A';

  const defaultOptions = {
    showDecimals: true,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  };

  const finalOptions = { ...defaultOptions, ...options };

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: finalOptions.showDecimals ? finalOptions.minimumFractionDigits : 0,
    maximumFractionDigits: finalOptions.showDecimals ? finalOptions.maximumFractionDigits : 0
  }).format(amount);
}

/**
 * Formats a date string or Date object as a readable date
 * @param date - The date to format (string or Date)
 * @returns Formatted date string
 */
export function formatDate(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) {
    return 'Invalid Date';
  }

  return new Intl.DateTimeFormat('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(dateObj);
}
