import { forwardRef, type SVGProps } from 'react';
import { cn } from '@/lib/cn';

export type IconVariant = 'linear' | 'twotone' | 'bold';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  /**
   * Iconsax drawing style.
   * `linear`  — every stroke at full weight (default, used across navigation and controls)
   * `twotone` — secondary geometry drops to 40% so the glyph reads as filled at small sizes
   * `bold`    — secondary geometry is filled rather than stroked (active nav states)
   */
  readonly variant?: IconVariant;
  /** Square edge length in px. Stroke weight stays optically uniform across sizes. */
  readonly size?: number;
  /** Decorative by default; pass a label to expose the glyph to assistive tech. */
  readonly label?: string;
}

export interface IconGeometry {
  /** Always drawn at full weight. */
  readonly primary: readonly string[];
  /** Dimmed in `twotone`, filled in `bold`. */
  readonly secondary?: readonly string[];
}

/**
 * All icons share one 24×24 grid, a 1.5 stroke, round caps and round joins, so mixing them in
 * a toolbar never produces uneven weight. Stroke scales inversely with `size` so a 16px icon
 * and a 24px icon look equally heavy.
 */
export function createIcon(displayName: string, geometry: IconGeometry) {
  const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(
    { variant = 'linear', size = 20, label, className, ...rest },
    ref,
  ) {
    // Rendered stroke = strokeWidth * (size / 24). Solving for a constant 1.5 CSS px keeps
    // a 16px icon and a 24px icon optically identical in the same toolbar.
    const strokeWidth = (1.5 * 24) / Math.max(size, 1);
    const secondaryOpacity = variant === 'twotone' ? 0.4 : 1;

    return (
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        strokeWidth={strokeWidth}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn('shrink-0', className)}
        aria-hidden={label ? undefined : true}
        role={label ? 'img' : undefined}
        aria-label={label}
        focusable="false"
        {...rest}
      >
        {geometry.secondary?.map((d, index) =>
          variant === 'bold' ? (
            <path key={`s${index}`} d={d} fill="currentColor" stroke="none" opacity={0.28} />
          ) : (
            <path key={`s${index}`} d={d} opacity={secondaryOpacity} />
          ),
        )}
        {geometry.primary.map((d, index) => (
          <path key={`p${index}`} d={d} />
        ))}
      </svg>
    );
  });

  Icon.displayName = displayName;
  return Icon;
}
