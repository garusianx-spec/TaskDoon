'use client';

import { cloneElement, useId, useState, type ReactElement, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TooltipProps {
  readonly content: ReactNode;
  readonly children: ReactElement<{
    'aria-describedby'?: string;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
    onFocus?: () => void;
    onBlur?: () => void;
  }>;
  readonly placement?: 'top' | 'bottom' | 'start' | 'end';
  readonly className?: string;
}

/**
 * Hover/focus tooltip. Shown on keyboard focus as well as pointer hover, and wired through
 * `aria-describedby` so it is announced rather than merely painted.
 */
export function Tooltip({ content, children, placement = 'top', className }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const id = useId().replace(/:/g, '');
  const tooltipId = `tooltip-${id}`;

  const positions: Readonly<Record<NonNullable<TooltipProps['placement']>, string>> = {
    top: 'bottom-[calc(100%+0.5rem)] start-1/2 ltr:-translate-x-1/2 rtl:translate-x-1/2',
    bottom: 'top-[calc(100%+0.5rem)] start-1/2 ltr:-translate-x-1/2 rtl:translate-x-1/2',
    start: 'end-[calc(100%+0.5rem)] top-1/2 -translate-y-1/2',
    end: 'start-[calc(100%+0.5rem)] top-1/2 -translate-y-1/2',
  };

  return (
    <span className="relative inline-flex">
      {cloneElement(children, {
        'aria-describedby': visible ? tooltipId : undefined,
        onMouseEnter: () => setVisible(true),
        onMouseLeave: () => setVisible(false),
        onFocus: () => setVisible(true),
        onBlur: () => setVisible(false),
      })}
      {visible && (
        <span
          id={tooltipId}
          role="tooltip"
          className={cn(
            'pointer-events-none absolute z-popover w-max max-w-60 animate-fade-in rounded-lg bg-gray-900 px-2.5 py-1.5 text-micro font-medium text-white shadow-lg',
            positions[placement],
            className,
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
