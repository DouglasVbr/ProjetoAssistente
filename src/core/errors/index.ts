/**
 * Core Errors - Custom error classes for the application
 */

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public readonly field?: string, context?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, context);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} with id ${id} not found`, 'NOT_FOUND', 404, { resource, id });
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized', context?: Record<string, unknown>) {
    super(message, 'UNAUTHORIZED', 401, context);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden', context?: Record<string, unknown>) {
    super(message, 'FORBIDDEN', 403, context);
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONFLICT', 409, context);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded', public readonly retryAfter?: number, context?: Record<string, unknown>) {
    super(message, 'RATE_LIMIT', 429, context);
    this.name = 'RateLimitError';
  }
}

export class NetworkError extends AppError {
  constructor(message: string, public readonly originalError?: Error, context?: Record<string, unknown>) {
    super(message, 'NETWORK_ERROR', 503, { ...context, originalError: originalError?.message });
    this.name = 'NetworkError';
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, public readonly originalError?: Error, context?: Record<string, unknown>) {
    super(message, 'DATABASE_ERROR', 500, { ...context, originalError: originalError?.message });
    this.name = 'DatabaseError';
  }
}

export class AIServiceError extends AppError {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly originalError?: Error,
    context?: Record<string, unknown>
  ) {
    super(message, 'AI_SERVICE_ERROR', 502, { ...context, provider, originalError: originalError?.message });
    this.name = 'AIServiceError';
  }
}

export class VoiceRecognitionError extends AppError {
  constructor(message: string, public readonly originalError?: Error, context?: Record<string, unknown>) {
    super(message, 'VOICE_RECOGNITION_ERROR', 500, { ...context, originalError: originalError?.message });
    this.name = 'VoiceRecognitionError';
  }
}

export class VoiceSynthesisError extends AppError {
  constructor(message: string, public readonly originalError?: Error, context?: Record<string, unknown>) {
    super(message, 'VOICE_SYNTHESIS_ERROR', 500, { ...context, originalError: originalError?.message });
    this.name = 'VoiceSynthesisError';
  }
}

export class SyncError extends AppError {
  constructor(message: string, public readonly originalError?: Error, context?: Record<string, unknown>) {
    super(message, 'SYNC_ERROR', 500, { ...context, originalError: originalError?.message });
    this.name = 'SyncError';
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONFIGURATION_ERROR', 500, context);
    this.name = 'ConfigurationError';
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'An unknown error occurred';
}

export function getErrorCode(error: unknown): string {
  if (error instanceof AppError) return error.code;
  return 'UNKNOWN_ERROR';
}

export function handleError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  
  if (error instanceof Response) {
    return new AppError(
      `HTTP ${error.status}: ${error.statusText}`,
      'HTTP_ERROR',
      error.status
    );
  }
  
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return new NetworkError('Network request failed', error);
  }
  
  if (error instanceof DOMException) {
    if (error.name === 'AbortError') {
      return new AppError('Request was aborted', 'ABORTED', 499);
    }
    if (error.name === 'NotAllowedError') {
      return new ForbiddenError('Permission denied');
    }
  }
  
  return new AppError(getErrorMessage(error), getErrorCode(error));
}

export type Result<T, E = AppError> = 
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export async function tryCatch<T>(
  promise: Promise<T>,
  errorMapper?: (error: unknown) => AppError
): Promise<Result<T, AppError>> {
  try {
    const value = await promise;
    return ok(value);
  } catch (error) {
    return err(errorMapper ? errorMapper(error) : handleError(error));
  }
}