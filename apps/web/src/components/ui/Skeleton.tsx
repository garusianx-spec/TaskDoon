import { cn } from '@/lib/utils';

export interface SkeletonProps {
  readonly className?: string;
}

/** Decorative placeholder. Put loading status on the surrounding region. */
export function Skeleton({ className }: SkeletonProps) {
  return <div aria-hidden="true" className={cn('rounded-md bg-sunken motion-safe:animate-pulse', className)} />;
}
