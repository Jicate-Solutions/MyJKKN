// lib/utils/api-errors.ts

import toast from "react-hot-toast";

export class ApiError extends Error {
    constructor(
      message: string,
      public status?: number,
      public code?: string
    ) {
      super(message);
      this.name = 'ApiError';
    }
  }
  
  export const handleApiError = (error: unknown): never => {
    if (error instanceof ApiError) {
      toast.error(error.message);
      throw error;
    }
  
    if (error instanceof Error) {
      toast.error(error.message);
      throw error;
    }
  
    const message = 'An unexpected error occurred';
    toast.error(message);
    throw new Error(message);
  };