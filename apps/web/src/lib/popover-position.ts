interface ConstrainedPopoverInput {
  readonly anchorLeft: number;
  readonly anchorRight: number;
  readonly panelWidth: number;
  readonly boundaryLeft: number;
  readonly boundaryRight: number;
  readonly align: 'start' | 'end' | 'center';
  readonly direction: 'ltr' | 'rtl';
}

/** Physical offset from the anchor, after logical alignment and clipping-boundary collision. */
export function constrainedPopoverPosition({
  anchorLeft, anchorRight, panelWidth, boundaryLeft, boundaryRight, align, direction,
}: ConstrainedPopoverInput): { readonly left: number; readonly maxWidth: number } {
  const maxWidth = Math.max(0, boundaryRight - boundaryLeft);
  const width = Math.min(panelWidth, maxWidth);
  const alignRight = (align === 'start' && direction === 'rtl') || (align === 'end' && direction === 'ltr');
  const desiredLeft = align === 'center'
    ? (anchorLeft + anchorRight - width) / 2
    : alignRight ? anchorRight - width : anchorLeft;
  const left = Math.max(boundaryLeft, Math.min(desiredLeft, boundaryRight - width));
  return { left: left - anchorLeft, maxWidth };
}

/** Flip toward available space; short scroll regions keep all controls reachable vertically. */
export function constrainedPopoverVerticalPosition({
  anchorTop, anchorBottom, panelHeight, boundaryTop, boundaryBottom, placement,
}: {
  readonly anchorTop: number;
  readonly anchorBottom: number;
  readonly panelHeight: number;
  readonly boundaryTop: number;
  readonly boundaryBottom: number;
  readonly placement: 'top' | 'bottom';
}): { readonly top: number; readonly maxHeight: number } {
  const gap = 8;
  const below = Math.max(0, boundaryBottom - anchorBottom - gap);
  const above = Math.max(0, anchorTop - boundaryTop - gap);
  const useAbove = placement === 'top'
    ? above >= panelHeight || above >= below
    : below < panelHeight && above > below;
  const maxHeight = Math.min(Math.max(0, boundaryBottom - boundaryTop), useAbove ? above : below);
  const height = Math.min(panelHeight, maxHeight);
  const desiredTop = useAbove ? anchorTop - gap - height : anchorBottom + gap;
  const top = Math.max(boundaryTop, Math.min(desiredTop, boundaryBottom - height));
  return { top: top - anchorTop, maxHeight };
}
