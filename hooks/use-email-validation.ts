import { useState, useCallback, useRef } from 'react';

interface EmailValidationResult {
  available: boolean;
  message: string;
  existingUser?: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    isActive: boolean;
    createdAt: string;
  } | null;
  suggestion?: string | null;
}

interface UseEmailValidationReturn {
  isChecking: boolean;
  validationResult: EmailValidationResult | null;
  validateEmail: (email: string) => void;
  clearValidation: () => void;
}

export function useEmailValidation(): UseEmailValidationReturn {
  const [isChecking, setIsChecking] = useState(false);
  const [validationResult, setValidationResult] =
    useState<EmailValidationResult | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const checkEmailAvailability = async (
    email: string
  ): Promise<EmailValidationResult> => {
    const response = await fetch(
      `/api/users/check-email?email=${encodeURIComponent(email)}`
    );
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to check email availability');
    }

    return data;
  };

  // Custom debounce function
  const debounce = (func: (...args: any[]) => void, delay: number) => {
    return (...args: any[]) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => func(...args), delay);
    };
  };

  // Validation function
  const performValidation = async (email: string) => {
    if (!email || email.length < 3) {
      setValidationResult(null);
      setIsChecking(false);
      return;
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setValidationResult(null);
      setIsChecking(false);
      return;
    }

    try {
      setIsChecking(true);
      const result = await checkEmailAvailability(email);
      setValidationResult(result);
    } catch (error) {
      console.error('Error validating email:', error);
      setValidationResult({
        available: false,
        message: 'Failed to validate email. Please try again.'
      });
    } finally {
      setIsChecking(false);
    }
  };

  // Debounced validation function to avoid too many API calls
  const debouncedValidate = useCallback(
    debounce(performValidation, 1000), // 1 second debounce
    []
  );

  const validateEmail = useCallback(
    (email: string) => {
      setValidationResult(null);
      debouncedValidate(email);
    },
    [debouncedValidate]
  );

  const clearValidation = useCallback(() => {
    setValidationResult(null);
    setIsChecking(false);
  }, []);

  return {
    isChecking,
    validationResult,
    validateEmail,
    clearValidation
  };
}
