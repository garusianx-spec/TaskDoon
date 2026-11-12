'use client';

import { useRef,type ReactNode } from 'react';
import { Button,type ButtonProps } from '@/components/ui';

export interface FileUploaderProps {
  readonly accept: string;
  readonly id?: string;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly size?: ButtonProps['size'];
  readonly icon?: ReactNode;
  readonly children: ReactNode;
  readonly onPick: (file: File) => void;
}

export function FileUploader({ accept, id, disabled = false, loading = false, size = 'xs', icon, children, onPick }: FileUploaderProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled || loading}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) onPick(file);
        }}
      />
      <Button size={size} variant="secondary" iconStart={icon} disabled={disabled} loading={loading} onClick={() => input.current?.click()}>
        {children}
      </Button>
    </>
  );
}
