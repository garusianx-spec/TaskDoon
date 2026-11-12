export type SmsStep = {
  readonly kind: 'code' | 'reset';
  readonly phone: string;
  readonly challengeId: string;
  readonly codeLength: number;
  readonly resendAt: number;
  readonly expiresAt: number;
  readonly exhausted?: boolean;
};

export type Step =
  | { readonly kind: 'phone' }
  | SmsStep
  | { readonly kind: 'name'; readonly signupToken: string }
  | { readonly kind: 'admin-setup'; readonly temporaryToken: string; readonly expiresAt: number; readonly sent: boolean }
  | { readonly kind: 'admin-password'; readonly temporaryToken: string; readonly expiresAt: number }
  | { readonly kind: 'admin-recovery'; readonly temporaryToken: string; readonly expiresAt: number }
  | { readonly kind: 'password' }
  | { readonly kind: 'forgot' };

export type ErrorTarget = 'form' | 'phone' | 'code' | 'name' | 'password' | 'repeat' | 'resend';
