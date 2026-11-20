'use client';
import { forwardRef, useState } from 'react';
import { EyeIcon, EyeSlashIcon } from '@/components/icons';
import { Input, type InputProps } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
export type PasswordInputProps = Omit<InputProps, 'type' | 'iconEnd' | 'controlDir'>;
/** The control wrapper and input both run LTR; labels and feedback inherit page RTL. */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { className, disabled, label, ...props },
  ref,
) {
  const [visible, setVisible] = useState(false);
  return (
    <Input
      {...props}
      ref={ref}
      label={label}
      disabled={disabled}
      type={visible ? 'text' : 'password'}
      dir="ltr"
      controlDir="ltr"
      errorRole="alert"
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      className={cn('min-h-11 pe-16 text-left', className)}
      iconEnd={
        <button
          type="button"
          data-password-toggle
          aria-label={`${visible ? 'پنهان کردن' : 'نمایش'} ${label ?? 'رمز عبور'}`}
          aria-pressed={visible}
          disabled={disabled}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover disabled:cursor-not-allowed disabled:text-fg-disabled"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeSlashIcon size={19} /> : <EyeIcon size={19} />}
        </button>
      }
    />
  );
});
