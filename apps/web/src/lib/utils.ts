export type ClassValue = string | number | null | undefined | false | ClassValue[];

/**
 * Minimal zero-dependency class-name joiner.
 * Keeps Persian typography and direction-aware spacing clean without bundle bloat.
 */
export function cn(...values: ClassValue[]): string {
  const out: string[] = [];
  for (const value of values) {
    if (!value && value !== 0) continue;
    if (Array.isArray(value)) {
      const nested = cn(...value);
      if (nested) out.push(nested);
    } else {
      out.push(String(value));
    }
  }
  return out.join(' ');
}
