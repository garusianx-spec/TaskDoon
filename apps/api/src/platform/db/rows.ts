/**
 * Mappers for rows of raw read-model queries (`tx.execute(sql…)`). The driver returns `timestamptz`
 * as PostgreSQL text (`2026-09-25 14:45:08.38+00`), `date` as `YYYY-MM-DD`, `bigint` and `count`
 * as strings, and JSON timestamps as ISO text with an offset; the API speaks ISO-8601 UTC.
 */

/** An instant as ISO-8601 UTC (`…Z`). */
export function iso(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  const normalised = value.includes('T') ? value : value.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00');
  return new Date(normalised).toISOString();
}

export function isoOrNull(value: string | Date | null | undefined): string | null {
  return value === null || value === undefined ? null : iso(value);
}

/** A `date` column as `YYYY-MM-DD`. */
export function isoDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

export function isoDateOrNull(value: string | Date | null | undefined): string | null {
  return value === null || value === undefined ? null : isoDate(value);
}

export function num(value: string | number | bigint | null | undefined): number {
  return value === null || value === undefined ? 0 : Number(value);
}
