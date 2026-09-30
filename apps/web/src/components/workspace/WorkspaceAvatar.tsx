import type { AvatarTone, Workspace } from '@taskin/contracts';
import { cn } from '@/lib/cn';

/**
 * Workspace badges: brand-solid for the accent tone; the other tones use the fixed tag
 * palette's tinted fill + ink pair, which clears AA where white-on-hue would not.
 */
/** Background and ink of each tone, also used for plain colour swatches. */
export const TONE_CLASSES: Readonly<Record<AvatarTone, string>> = {
  brand: 'bg-brand-solid text-fg-on-brand',
  teal: 'bg-tag-teal-subtle text-tag-teal-ink',
  violet: 'bg-tag-violet-subtle text-tag-violet-ink',
  amber: 'bg-tag-amber-subtle text-tag-amber-ink',
  rose: 'bg-tag-pink-subtle text-tag-pink-ink',
  slate: 'bg-tag-gray-subtle text-tag-gray-ink',
};

export const WORKSPACE_TONES: readonly AvatarTone[] = ['brand', 'teal', 'violet', 'amber', 'rose', 'slate'];

const SIZES = {
  sm: 'size-7 rounded-lg text-micro',
  md: 'size-11 rounded-xl text-body-sm',
  lg: 'size-14 rounded-2xl text-title',
} as const;

export interface WorkspaceAvatarProps {
  readonly workspace: Pick<Workspace, 'name' | 'initials' | 'tone' | 'iconUrl'>;
  readonly size?: keyof typeof SIZES;
  readonly className?: string;
}

/** Uploaded icon when there is one, otherwise the generated two-letter monogram. */
export function WorkspaceAvatar({ workspace, size = 'md', className }: WorkspaceAvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden font-bold',
        SIZES[size],
        !workspace.iconUrl && TONE_CLASSES[workspace.tone],
        className,
      )}
    >
      {workspace.iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local data URL, not a remote asset
        <img src={workspace.iconUrl} alt="" className="size-full object-cover" />
      ) : (
        workspace.initials
      )}
    </span>
  );
}
