'use client';

import { IconButton, Popover } from '@/components/ui';
import { PaletteIcon } from '@/components/icons';
import { ThemePicker } from '@/components/layout/ThemePicker';

export function ThemeToggle({ placement = 'top' }: { readonly placement?: 'top' | 'bottom' }) {
  return (
    <Popover
      label="انتخاب پوسته"
      placement={placement}
      align="end"
      constrainToViewport
      panelClassName="min-w-0 p-3"
      trigger={<IconButton label="تنظیم نمایش" icon={<PaletteIcon size={21} />} size="lg" />}
    >
      <ThemePicker />
    </Popover>
  );
}
