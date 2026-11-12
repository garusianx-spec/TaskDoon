import { cn } from '@/lib/utils';

interface Strength {
  readonly score: 0 | 1 | 2 | 3 | 4;
  readonly label: string;
}

/** Length plus character-class variety; enough to steer people away from `12345678`. */
function measureStrength(password: string, minimumLength: number): Strength {
  if (!password) return { score: 0, label: '' };
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;
  let score = 0;
  if (password.length >= minimumLength) score += 1;
  if (password.length >= 12) score += 1;
  if (classes >= 2) score += 1;
  if (classes >= 3) score += 1;
  const clamped = Math.min(4, Math.max(1, score)) as Strength['score'];
  const labels: Readonly<Record<Strength['score'], string>> = {
    0: '',
    1: 'ضعیف',
    2: 'متوسط',
    3: 'خوب',
    4: 'قوی',
  };
  return { score: clamped, label: labels[clamped] };
}

const STRENGTH_TONE: Readonly<Record<Strength['score'], string>> = {
  0: 'bg-sunken',
  1: 'bg-status-blocked',
  2: 'bg-status-progress',
  3: 'bg-status-done',
  4: 'bg-status-done',
};

export function PasswordStrengthMeter({
  password,
  minimumLength,
}: {
  readonly password: string;
  readonly minimumLength: number;
}) {
  const strength = measureStrength(password, minimumLength);
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex flex-1 gap-1"
        role="meter"
        aria-label="قدرت رمز عبور جدید"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={strength.score}
        aria-valuetext={strength.label || 'وارد نشده'}
      >
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              step <= strength.score ? STRENGTH_TONE[strength.score] : 'bg-sunken',
            )}
          />
        ))}
      </div>
      <span className="w-10 text-micro font-medium text-fg-tertiary">{strength.label}</span>
    </div>
  );
}
