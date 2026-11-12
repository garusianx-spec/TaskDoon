import type { ReactNode } from 'react';
import './public.css';

/** A light brand surface without mutating the persisted workspace theme or the document. */
export function PublicSurface({
  children,
  className = '',
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={`public-surface ${className}`} data-theme="light" data-accent="indigo">
      {children}
    </div>
  );
}
