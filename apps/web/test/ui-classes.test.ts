import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/utils';

describe('UI class composition', () => {
  it('merges Persian typography without discarding a text color', () => {
    expect(cn('text-body-sm text-fg-primary', 'text-caption')).toBe('text-fg-primary text-caption');
    expect(cn('text-title-sm text-fg-primary', 'text-fg-secondary')).toBe('text-title-sm text-fg-secondary');
  });

  it('merges logical spacing independently of its other edge and breakpoint', () => {
    expect(cn('ps-2 pe-3 sm:ps-3', { 'ps-4': true, 'pe-1': false })).toBe('pe-3 sm:ps-3 ps-4');
  });
});
