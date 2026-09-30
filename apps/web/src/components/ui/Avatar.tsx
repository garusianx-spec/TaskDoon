import type { AvatarTone, PresenceState } from '@taskin/contracts';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@taskin/jalali';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface AvatarProps {
  readonly name: string;
  readonly initials: string;
  readonly tone?: AvatarTone;
  readonly size?: AvatarSize;
  readonly presence?: PresenceState;
  readonly className?: string;
  /** Group avatars are announced by the group, so members are hidden from AT. */
  readonly decorative?: boolean;
}

const SIZES: Readonly<Record<AvatarSize, string>> = {
  xs: 'size-6 text-[0.625rem]',
  sm: 'size-8 text-micro',
  md: 'size-10 text-caption',
  lg: 'size-12 text-body-sm',
  xl: 'size-16 text-title',
};

const RING_SIZES: Readonly<Record<AvatarSize, string>> = {
  xs: 'size-1.5 ring-2',
  sm: 'size-2 ring-2',
  md: 'size-2.5 ring-2',
  lg: 'size-3 ring-[3px]',
  xl: 'size-4 ring-4',
};

/**
 * Tones are drawn from the neutral + status ramps rather than the brand ramp so that member
 * avatars stay distinguishable from each other when the workspace accent changes.
 */
const TONES: Readonly<Record<AvatarTone, string>> = {
  brand: 'bg-brand-100 text-brand-700',
  teal: 'bg-status-done-subtle text-status-done',
  violet: 'bg-status-review-subtle text-status-review',
  amber: 'bg-status-progress-subtle text-status-progress',
  rose: 'bg-status-blocked-subtle text-status-blocked',
  slate: 'bg-sunken text-fg-secondary',
};

const PRESENCE_TONES: Readonly<Record<PresenceState, string>> = {
  online: 'bg-status-done',
  busy: 'bg-status-blocked',
  away: 'bg-status-progress',
  offline: 'bg-gray-400',
};

const PRESENCE_LABELS: Readonly<Record<PresenceState, string>> = {
  online: 'آنلاین',
  busy: 'مشغول',
  away: 'خارج از دسترس',
  offline: 'آفلاین',
};

export function Avatar({
  name,
  initials,
  tone = 'slate',
  size = 'md',
  presence,
  className,
  decorative = false,
}: AvatarProps) {
  return (
    <span
      className={cn('relative inline-flex shrink-0', className)}
      title={decorative ? undefined : name}
    >
      <span
        aria-hidden={decorative || undefined}
        role={decorative ? undefined : 'img'}
        aria-label={decorative ? undefined : name}
        className={cn(
          'inline-flex items-center justify-center rounded-full font-semibold ring-1 ring-inset ring-black/[0.04]',
          SIZES[size],
          TONES[tone],
        )}
      >
        {initials}
      </span>
      {presence && (
        <span
          className={cn(
            'absolute bottom-0 end-0 rounded-full ring-surface',
            RING_SIZES[size],
            PRESENCE_TONES[presence],
          )}
          role="status"
          aria-label={`${name} — ${PRESENCE_LABELS[presence]}`}
        />
      )}
    </span>
  );
}

export interface AvatarStackMember {
  readonly id: string;
  readonly fullName: string;
  readonly initials: string;
  readonly avatarTone: AvatarTone;
}

export interface AvatarStackProps {
  readonly members: readonly AvatarStackMember[];
  readonly max?: number;
  readonly size?: AvatarSize;
  readonly className?: string;
}

/**
 * Overlapping avatar stack. In RTL the stack reads right-to-left, so `flex-row-reverse` plus
 * a negative inline-margin produces the same "first member on top" effect as LTR.
 */
export function AvatarStack({ members, max = 3, size = 'sm', className }: AvatarStackProps) {
  const visible = members.slice(0, max);
  const overflow = members.length - visible.length;
  const names = members.map((member) => member.fullName).join('، ');

  return (
    <span
      className={cn('flex flex-row-reverse items-center', className)}
      role="group"
      aria-label={`مسئولان: ${names}`}
    >
      {overflow > 0 && (
        <span
          className={cn(
            'numeric -ms-1.5 inline-flex items-center justify-center rounded-full bg-sunken font-semibold text-fg-tertiary ring-2 ring-surface',
            SIZES[size],
          )}
          aria-hidden="true"
        >
          {`+${toPersianDigits(overflow)}`}
        </span>
      )}
      {visible.map((member, index) => (
        <Avatar
          key={member.id}
          name={member.fullName}
          initials={member.initials}
          tone={member.avatarTone}
          size={size}
          decorative
          className={cn(index > 0 || overflow > 0 ? '-ms-1.5' : '', 'ring-2 ring-surface rounded-full')}
        />
      ))}
    </span>
  );
}
