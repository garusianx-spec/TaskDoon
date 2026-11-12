import { cn } from '@/lib/utils';

export function FormError({
  message,
  className,
}: {
  readonly message: string | null;
  readonly className?: string;
}) {
  if (!message) return null;
  return (
    <p role="alert" className={cn('text-body-sm text-status-blocked', className)}>
      {message}
    </p>
  );
}
