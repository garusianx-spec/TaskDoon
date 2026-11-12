'use client';

import { IconButton,Popover } from '@/components/ui';
import { PaletteIcon } from '@/components/icons';
import { ThemePicker } from '@/components/layout/ThemePicker';

export function ThemeToggle() {
  return (
    <Popover
      label="انتخاب پوسته"
      placement="top"
      align="start"
      panelClassName="min-w-0 p-3"
      trigger={<IconButton label="پوسته و رنگ سازمان" icon={<PaletteIcon size={21} />} size="lg" />}
    >
      <ThemePicker />
    </Popover>
  );
}
