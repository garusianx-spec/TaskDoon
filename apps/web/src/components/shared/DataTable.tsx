import type { ReactNode,TableHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type DataTableProps = TableHTMLAttributes<HTMLTableElement>;

export function DataTable({ className, ...props }: DataTableProps) {
  return <table className={cn('w-full min-w-[640px] border-collapse text-start text-body-sm', className)} {...props} />;
}

/** Horizontal scrolling and a keyboard focus target for wide tables. */
export function TableFrame({ children, label }: { readonly children: ReactNode; readonly label: string }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}
