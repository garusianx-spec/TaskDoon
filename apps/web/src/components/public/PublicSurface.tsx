import type { ReactNode } from 'react';
import './public.css';

/** Public pages inherit the same resolved theme as the workspace and authentication. */
export function PublicSurface({
  children,
  className = '',
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return <div className={`public-surface ${className}`}>{children}</div>;
}
