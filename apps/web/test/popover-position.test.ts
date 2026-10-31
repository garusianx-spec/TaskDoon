import { describe, expect, it } from 'vitest';
import { constrainedPopoverPosition, constrainedPopoverVerticalPosition } from '../src/lib/popover-position';

describe('constrained popover positioning', () => {
  it('keeps an RTL calendar inside the mobile modal when the trigger is in its left column', () => {
    const position = constrainedPopoverPosition({
      anchorLeft: 20, anchorRight: 181, panelWidth: 352,
      boundaryLeft: 9, boundaryRight: 366, align: 'start', direction: 'rtl',
    });
    expect(position).toEqual({ left: -11, maxWidth: 357 });
    expect(20 + position.left).toBeGreaterThanOrEqual(9);
    expect(20 + position.left + 352).toBeLessThanOrEqual(366);
  });

  it('keeps the opposite RTL field anchored to its right edge when it fits', () => {
    expect(constrainedPopoverPosition({
      anchorLeft: 198, anchorRight: 359, panelWidth: 352,
      boundaryLeft: 9, boundaryRight: 366, align: 'start', direction: 'rtl',
    }).left).toBe(-189);
  });

  it('limits both width and offset to a narrower scrolling ancestor', () => {
    expect(constrainedPopoverPosition({
      anchorLeft: 200, anchorRight: 320, panelWidth: 352,
      boundaryLeft: 180, boundaryRight: 340, align: 'start', direction: 'rtl',
    })).toEqual({ left: -20, maxWidth: 160 });
  });

  it.each([
    ['ltr', 'start', 120], ['ltr', 'end', 160],
    ['rtl', 'start', 160], ['rtl', 'end', 120],
    ['ltr', 'center', 140], ['rtl', 'center', 140],
  ] as const)('preserves %s %s alignment when it fits', (direction, align, absoluteLeft) => {
    const position = constrainedPopoverPosition({
      anchorLeft: 120, anchorRight: 360, panelWidth: 200,
      boundaryLeft: 8, boundaryRight: 632, align, direction,
    });
    expect(120 + position.left).toBe(absoluteLeft);
  });
});

describe('constrained popover vertical placement', () => {
  it('flips above a field near the modal footer', () => {
    expect(constrainedPopoverVerticalPosition({
      anchorTop: 590, anchorBottom: 630, panelHeight: 430,
      boundaryTop: 140, boundaryBottom: 773, placement: 'bottom',
    })).toEqual({ top: -438, maxHeight: 442 });
  });

  it('keeps bottom placement when enough space is available', () => {
    expect(constrainedPopoverVerticalPosition({
      anchorTop: 100, anchorBottom: 140, panelHeight: 430,
      boundaryTop: 8, boundaryBottom: 892, placement: 'bottom',
    })).toEqual({ top: 48, maxHeight: 744 });
  });

  it('limits height to the larger side of a short modal', () => {
    expect(constrainedPopoverVerticalPosition({
      anchorTop: 300, anchorBottom: 340, panelHeight: 430,
      boundaryTop: 100, boundaryBottom: 500, placement: 'bottom',
    })).toEqual({ top: -200, maxHeight: 192 });
  });
});
