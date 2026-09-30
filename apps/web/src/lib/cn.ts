export type ClassValue = string | number | null | undefined | false | ClassValue[];

/**
 * Minimal class-name joiner. Deliberately not `tailwind-merge`: components in this codebase
 * expose explicit variant props instead of accepting arbitrary overriding classes, so
 * conflict resolution is never needed and the bundle stays dependency-free.
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
