'use client';

import type { ReactNode } from 'react';
import type { AdminLoad } from '@/admin/use-admin-load';
import { Button } from '@/components/ui';
import { WarningIcon } from '@/components/icons';

export function PageHeader({ title, description, actions }: { readonly title: string; readonly description?: string; readonly actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-heading-sm font-bold text-fg-primary">{title}</h1>
        {description && <p className="text-body-sm text-fg-tertiary">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** One titled block of an admin screen. */
export function Panel({ title, actions, children, id }: { readonly title: string; readonly actions?: ReactNode; readonly children: ReactNode; readonly id?: string }) {
  const headingId = `${id ?? title.replace(/\s+/g, '-')}-title`;
  return (
    <section aria-labelledby={headingId} id={id} className="mb-6 rounded-xl border border-secondary bg-surface shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-secondary px-4 py-3">
        <h2 id={headingId} className="text-body font-semibold text-fg-primary">
          {title}
        </h2>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Loading, error (with retry) or the content of one admin load. */
export function Loaded<T>({ load, children, empty }: { readonly load: AdminLoad<T>; readonly children: (data: T) => ReactNode; readonly empty?: (data: T) => boolean }) {
  if (load.error) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg bg-sunken px-3 py-2 text-body-sm text-fg-secondary">
        <WarningIcon size={18} className="text-warning-600" />
        <span className="flex-1">{load.error}</span>
        <Button variant="secondary" size="sm" onClick={load.reload}>
          تلاش دوباره
        </Button>
      </div>
    );
  }
  if (load.data === null) {
    return <div role="progressbar" aria-label="بارگذاری" className="mx-auto my-6 size-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />;
  }
  if (empty?.(load.data)) return <p className="py-4 text-center text-body-sm text-fg-tertiary">موردی پیدا نشد.</p>;
  return <>{children(load.data)}</>;
}

export const TABLE = 'w-full min-w-[640px] border-collapse text-start text-body-sm';
export const TH = 'border-b border-secondary px-3 py-2 text-start text-caption font-semibold text-fg-tertiary';
export const TD = 'border-b border-secondary px-3 py-2.5 align-top text-fg-primary';

/** Horizontal scroll for wide tables on narrow screens. */
export function TableFrame({ children, label }: { readonly children: ReactNode; readonly label: string }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}

/** A label/value pair in a profile header. */
export function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-caption text-fg-tertiary">{label}</dt>
      <dd className="text-body-sm text-fg-primary">{children}</dd>
    </div>
  );
}
