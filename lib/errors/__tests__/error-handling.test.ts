/**
 * Error Handling System Tests
 *
 * Tests for custom error classes and error utilities
 */

import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  DatabaseError,
  fromSupabaseError,
  isOperationalError,
} from '../app-errors';

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should create an operational error by default', () => {
      const error = new AppError('Test error', 'TEST_ERROR', 500);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(true);
      expect(error.name).toBe('AppError');
    });

    it('should create a non-operational error when specified', () => {
      const error = new AppError('Test error', 'TEST_ERROR', 500, false);
      expect(error.isOperational).toBe(false);
    });

    it('should capture stack trace', () => {
      const error = new AppError('Test error', 'TEST_ERROR');
      expect(error.stack).toBeDefined();
    });
  });

  describe('ValidationError', () => {
    it('should have correct properties', () => {
      const error = new ValidationError('Invalid input');
      expect(error.message).toBe('Invalid input');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.isOperational).toBe(true);
    });

    it('should support validation details', () => {
      const details = {
        email: ['Invalid format'],
        password: ['Too short', 'Missing special character'],
      };
      const error = new ValidationError('Validation failed', details);
      expect((error as any).details).toEqual(details);
    });
  });

  describe('AuthenticationError', () => {
    it('should have correct properties', () => {
      const error = new AuthenticationError();
      expect(error.message).toBe('Authentication required');
      expect(error.code).toBe('AUTH_ERROR');
      expect(error.statusCode).toBe(401);
    });

    it('should accept custom message', () => {
      const error = new AuthenticationError('Invalid credentials');
      expect(error.message).toBe('Invalid credentials');
    });
  });

  describe('AuthorizationError', () => {
    it('should have correct properties', () => {
      const error = new AuthorizationError();
      expect(error.message).toBe('Access denied');
      expect(error.code).toBe('FORBIDDEN');
      expect(error.statusCode).toBe(403);
    });
  });

  describe('NotFoundError', () => {
    it('should format message correctly', () => {
      const error = new NotFoundError('User');
      expect(error.message).toBe('User not found');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
    });
  });

  describe('ConflictError', () => {
    it('should have correct properties', () => {
      const error = new ConflictError('Resource already exists');
      expect(error.message).toBe('Resource already exists');
      expect(error.code).toBe('CONFLICT');
      expect(error.statusCode).toBe(409);
    });
  });

  describe('DatabaseError', () => {
    it('should be non-operational by default', () => {
      const error = new DatabaseError();
      expect(error.isOperational).toBe(false);
      expect(error.code).toBe('DB_ERROR');
      expect(error.statusCode).toBe(500);
    });

    it('should store original error', () => {
      const originalError = new Error('Connection failed');
      const error = new DatabaseError('Database error', originalError);
      expect((error as any).originalError).toBe(originalError);
    });
  });
});

describe('fromSupabaseError', () => {
  it('should convert PGRST116 to NotFoundError', () => {
    const supabaseError = { code: 'PGRST116', message: 'Not found' };
    const error = fromSupabaseError(supabaseError, 'User');
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.message).toBe('User not found');
  });

  it('should convert 23505 to ConflictError', () => {
    const supabaseError = { code: '23505', message: 'Duplicate key' };
    const error = fromSupabaseError(supabaseError, 'Email');
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.message).toContain('already exists');
  });

  it('should convert 23503 to ValidationError', () => {
    const supabaseError = { code: '23503', message: 'Foreign key violation' };
    const error = fromSupabaseError(supabaseError);
    expect(error).toBeInstanceOf(ValidationError);
  });

  it('should convert 42501 to AuthorizationError', () => {
    const supabaseError = { code: '42501', message: 'Permission denied' };
    const error = fromSupabaseError(supabaseError);
    expect(error).toBeInstanceOf(AuthorizationError);
  });

  it('should convert unknown errors to DatabaseError', () => {
    const supabaseError = { code: 'UNKNOWN', message: 'Something went wrong' };
    const error = fromSupabaseError(supabaseError);
    expect(error).toBeInstanceOf(DatabaseError);
  });
});

describe('isOperationalError', () => {
  it('should return true for operational errors', () => {
    const error = new ValidationError('Test');
    expect(isOperationalError(error)).toBe(true);
  });

  it('should return false for non-operational errors', () => {
    const error = new DatabaseError('Test');
    expect(isOperationalError(error)).toBe(false);
  });

  it('should return false for non-AppError errors', () => {
    const error = new Error('Test');
    expect(isOperationalError(error)).toBe(false);
  });
});
