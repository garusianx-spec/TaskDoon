'use client';

import { forwardRef, useId } from 'react';
import { Input, type InputProps } from '@/components/ui/Input';
import { PasswordInput as SharedPasswordInput, type PasswordInputProps } from '@/components/ui/PasswordInput';
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput(props, ref) {
    return <SharedPasswordInput maxLength={128} {...props} ref={ref} />;
  },
);
import { otpDigits } from '@/features/auth/lib/auth-input';

export function AuthFormError({ message }: { readonly message?: string }) {
  return message ? (
    <p role="alert" className="auth-error">
      {message}
    </p>
  ) : null;
}

/** Scoped feedback: the shared workspace input remains unchanged. */
export const AuthInput = forwardRef<HTMLInputElement, InputProps>(function AuthInput(
  { error, id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? `auth-${generatedId}`;
  const describedBy = [`${inputId}-error`, props.hint && `${inputId}-hint`].filter(Boolean).join(' ');
  return (
    <div className="auth-form-field">
      <Input
        {...props}
        ref={ref}
        id={inputId}
        {...(error ? { 'aria-invalid': true, 'aria-describedby': describedBy } : {})}
      />
      {error && (
        <p id={`${inputId}-error`} role="alert" className="auth-error">
          {error}
        </p>
      )}
    </div>
  );
});

type OtpProps = Omit<InputProps, 'onChange' | 'maxLength' | 'type'> & {
  readonly length: number;
  readonly onValueChange: (value: string) => void;
};
export const OtpInput = forwardRef<HTMLInputElement, OtpProps>(function OtpInput(
  { length, onValueChange, ...props },
  ref,
) {
  return (
    <AuthInput
      {...props}
      ref={ref}
      type="text"
      dir="ltr"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={length}
      className="auth-otp"
      spellCheck={false}
      autoCapitalize="off"
      onChange={(event) => onValueChange(otpDigits(event.target.value, length))}
      onPaste={(event) => {
        event.preventDefault();
        if (props.readOnly || props.disabled) return;
        onValueChange(otpDigits(event.clipboardData.getData('text'), length));
      }}
    />
  );
});
