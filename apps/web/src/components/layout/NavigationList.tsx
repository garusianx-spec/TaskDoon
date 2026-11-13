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
      <h2 id={id} className="px-1 text-caption font-semibold text-fg-secondary">
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
}

type NavigationRowProps = RowContent &
  (
    | { readonly href: string; readonly onClick?: never }
    | { readonly href?: never; readonly onClick: () => void; readonly danger?: boolean }
  );

export function NavigationRow(props: NavigationRowProps) {
  const { label, detail, Icon } = props;
  const danger = 'danger' in props && props.danger;
  const className = cn(
    'flex min-h-14 w-full items-center gap-3 px-3 py-2 text-start text-body-sm font-semibold transition-colors hover:bg-hover focus-visible:ring-inset',
    danger ? 'text-status-blocked' : 'text-fg-primary',
  );
  const content = (
    <>
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg',
          danger ? 'bg-status-blocked-subtle' : 'bg-brand-subtle text-fg-brand',
        )}
      >
        <Icon size={19} />
      </span>
      <span className="min-w-0 flex-1 break-words">
        {label}
        {detail && <span className="mt-0.5 block text-caption font-normal text-fg-secondary">{detail}</span>}
      </span>
      <ChevronForwardIcon size={17} className="shrink-0 text-fg-tertiary" />
    </>
  );
  return (
    <li>
      {props.href !== undefined ? (
        <Link href={props.href} className={className}>
          {content}
        </Link>
      ) : (
        <button type="button" className={className} aria-haspopup="dialog" onClick={props.onClick}>
          {content}
        </button>
      )}
    </li>
  );
}

export function SectionBackLink({ href, children }: { readonly href: string; readonly children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-lg px-1 text-body-sm font-medium text-fg-brand hover:underline"
    >
      <ChevronBackwardIcon size={16} />
      {children}
    </Link>
  );
}
