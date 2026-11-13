import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronBackwardIcon, ChevronForwardIcon, type IconProps } from '@/components/icons';
import { cn } from '@/lib/utils';

export function NavigationList({
  id,
  title,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="ps-1 text-caption font-semibold text-fg-tertiary">
        {title}
      </h2>
      <ul className="divide-y divide-secondary overflow-hidden rounded-xl border border-secondary bg-surface">
        {children}
      </ul>
    </section>
  );
}

interface RowContent {
  readonly label: string;
  readonly detail?: string;
  readonly Icon: (props: IconProps) => ReactNode;
  readonly iconTone?: string;
}

type NavigationRowProps = RowContent &
  (
    | {
        readonly href: string;
        readonly onClick?: never;
        readonly badge?: ReactNode;
        readonly action?: ReactNode;
      }
    | { readonly href?: never; readonly onClick: () => void; readonly danger?: boolean }
  );

export function NavigationRow(props: NavigationRowProps) {
  const { label, detail, Icon, iconTone } = props;
  const isLink = props.href !== undefined;
  const danger = 'danger' in props && props.danger;
  const className = cn(
    'group flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-2 text-start text-body font-medium transition-colors duration-150',
    'focus-visible:ring-inset focus-visible:ring-offset-0',
    danger
      ? 'text-status-blocked hover:bg-status-blocked-subtle active:bg-status-blocked-subtle'
      : 'text-fg-secondary hover:bg-hover hover:text-fg-primary active:bg-active',
  );
  const content = (
    <>
      <span
        className={cn(
          'flex shrink-0 items-center justify-center',
          iconTone ? cn('size-8 rounded-lg', iconTone) : 'size-5',
          !iconTone && !danger && 'text-fg-tertiary group-hover:text-fg-secondary',
        )}
      >
        <Icon size={20} />
      </span>
      <span className="min-w-0 flex-1 break-words">
        {label}
        {detail && <span className="mt-0.5 block text-caption font-normal text-fg-tertiary">{detail}</span>}
      </span>
      {isLink && (
        <>
          {props.badge}
          <ChevronForwardIcon size={16} className="shrink-0 text-fg-tertiary" />
        </>
      )}
    </>
  );
  return (
    <li className="flex items-stretch">
      {isLink ? (
        <Link href={props.href} className={className}>
          {content}
        </Link>
      ) : (
        <button type="button" className={className} aria-haspopup="dialog" onClick={props.onClick}>
          {content}
        </button>
      )}
      {isLink && props.action && <div className="flex shrink-0 items-center pe-2">{props.action}</div>}
    </li>
  );
}

export function SectionBackLink({ href, children }: { readonly href: string; readonly children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-lg px-1 text-body-sm font-medium text-fg-secondary transition-colors hover:bg-hover hover:text-fg-primary active:bg-active"
    >
      <ChevronBackwardIcon size={16} className="text-fg-tertiary" />
      {children}
    </Link>
  );
}
