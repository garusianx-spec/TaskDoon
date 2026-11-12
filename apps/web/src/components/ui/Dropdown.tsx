'use client';

import { Popover, type PopoverProps } from '@/components/ui/Popover';

export type DropdownProps = Omit<PopoverProps, 'haspopup'>;

/** Menu popover with the same keyboard and focus handling as the anchored dialog. */
export function Dropdown(props: DropdownProps) {
  return <Popover {...props} haspopup="menu" />;
}
