import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsOptional, IsUUID, Matches, registerDecorator, ValidateIf, type ValidationOptions } from 'class-validator';
import { toLatinDigits } from '@taskin/text';

/** A real calendar date, `YYYY-MM-DD` (2025-02-30 is refused). */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Persian and Arabic digits become ASCII before validation (RFC §9). */
export const LatinDigits = () => Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? toLatinDigits(value.trim()) : value));

export function IsCalendarDate(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) =>
    registerDecorator({
      name: 'isCalendarDate',
      target: target.constructor,
      propertyName: String(propertyName),
      options: { message: `${String(propertyName)} must be a date as YYYY-MM-DD`, ...options },
      validator: { validate: (value: unknown) => isCalendarDate(value) },
    });
}

/** An optional date that may also be `null` (to clear it). */
export const OptionalNullableDate = () =>
  applyDecorators(
    IsOptional(),
    LatinDigits(),
    ValidateIf((_, value) => value !== null),
    IsCalendarDate(),
  );

/** An optional uuid that may also be `null`. */
export const OptionalNullableUuid = () =>
  applyDecorators(
    IsOptional(),
    ValidateIf((_, value) => value !== null),
    IsUUID(),
  );

/** `HH:mm`, 24-hour, ASCII digits after normalisation. */
export const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

export const OptionalNullableTime = () =>
  applyDecorators(
    IsOptional(),
    LatinDigits(),
    ValidateIf((_, value) => value !== null),
    Matches(TIME_OF_DAY, { message: 'must be HH:mm (24-hour)' }),
  );
