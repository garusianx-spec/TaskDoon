import { cn } from '@/lib/cn';
import { formatFraction } from '@/lib/format';

export interface ProgressBarProps {
  readonly value: number;
  readonly max: number;
  readonly label: string;
  readonly tone?: 'brand' | 'done' | 'progress' | 'blocked';
  readonly showFraction?: boolean;
  readonly className?: string;
}

const TONES: Readonly<Record<NonNullable<ProgressBarProps['tone']>, string>> = {
  brand: 'bg-brand-solid',
  done: 'bg-status-done',
  progress: 'bg-status-progress',
  blocked: 'bg-status-blocked',
};

/** Checklist progress indicator — `۳/۵` with a matching track. */
export function ProgressBar({
  value,
  max,
  label,
  tone = 'brand',
  showFraction = true,
  className,
}: ProgressBarProps) {
  const safeMax = Math.max(max, 1);
  const percent = Math.min(100, Math.max(0, (value / safeMax) * 100));

  return (
    <span className={cn('flex w-full items-center gap-1.5', className)}>
      <span
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
        className="relative h-1.5 w-full min-w-10 flex-1 overflow-hidden rounded-full bg-sunken"
      >
        <span
          className={cn('absolute inset-y-0 start-0 rounded-full transition-[width] duration-300', TONES[tone])}
          style={{ width: `${percent}%` }}
        />
      </span>
      {showFraction && (
        <span className="numeric shrink-0 text-micro font-medium text-fg-tertiary">
          {formatFraction(value, max)}
        </span>
      )}
    </span>
  );
}
