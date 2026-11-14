import type { ReactNode } from 'react';
import type { CalendarSystem } from '@taskin/jalali';
import { cn } from '@/lib/utils';

interface CalendarDateTextProps {
  readonly system: CalendarSystem;
  readonly children: ReactNode;
  readonly className?: string;
}

/** Isolates calendar text inside RTL copy and keeps Gregorian digits in Latin form. */
export function CalendarDateText({ system, children, className }: CalendarDateTextProps) {
  const gregorian = system === 'gregorian';
  return (
    <bdi
      lang={gregorian ? 'en' : 'fa'}
      dir={gregorian ? 'ltr' : 'rtl'}
      className={cn(gregorian ? 'tabular-nums [font-feature-settings:normal]' : 'numeric', className)}
    >
      {children}
    </bdi>
  );
}
