'use client';

import { Switch, Tooltip } from '@/components/ui';

interface SettingRowProps {
  readonly title: string;
  readonly description: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onChange: (value: boolean) => void;
}

export function SettingRow({ title, description, checked, disabled, onChange }: SettingRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-secondary px-3 py-2.5">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body-sm font-semibold text-fg-primary">{title}</span>
        <span className="text-micro leading-5 text-fg-tertiary">{description}</span>
      </span>
      <Tooltip content={checked ? 'فعال' : 'غیرفعال'}>
        <Switch
          checked={checked}
          disabled={disabled}
          locked={disabled}
          label={title}
          onCheckedChange={onChange}
        />
      </Tooltip>
    </div>
  );
}
