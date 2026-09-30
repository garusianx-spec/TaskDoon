import { ValidationPipe, type ValidationError } from '@nestjs/common';
import type { FieldError } from '@taskin/contracts';
import { ApiError } from './api-error.js';

/** Flattens class-validator's tree into `field.path: message` pairs. */
export function flattenValidationErrors(errors: readonly ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.values(error.constraints ?? {}).map((message) => ({ field, message }));
    return [...own, ...flattenValidationErrors(error.children ?? [], field)];
  });
}

/**
 * Strict body validation: unknown properties are rejected (not silently dropped), payloads are
 * transformed into DTO instances, and every problem is reported at once.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    stopAtFirstError: false,
    validationError: { target: false, value: false },
    exceptionFactory: (errors) => ApiError.validation(flattenValidationErrors(errors)),
  });
}
