'use client';

import type { LiveStore } from '@/store/live/live-store';
import { useSignInFlow } from '@/features/auth/hooks/useSignInFlow';
import { AdminPasswordStep, AdminSetupStep } from '@/features/auth/components/AdminSignInSteps';
import { OtpSignInStep, ResetPasswordStep } from '@/features/auth/components/SmsSignInSteps';
import { ForgotPasswordStep, PasswordSignInStep } from '@/features/auth/components/PasswordSignInSteps';
import { PhoneSignInStep, SignUpStep } from '@/features/auth/components/PhoneSignInSteps';

/**
 * Sign-in (RFC §5.2): the phone number is the account. Mobile number → SMS code → in, or, for a
 * new number, a name first. An account that has set a password may use phone and password
 * instead; a forgotten password is replaced with a code texted to the phone. Codes are typed in
 * any digit script.
 */
export function SignInScreen({
  store,
  adminPanel = false,
}: {
  readonly store: Pick<LiveStore, 'signedIn' | 'invited'>;
  readonly adminPanel?: boolean;
}) {
  const flow = useSignInFlow(store, adminPanel);
  const { step } = flow;

  switch (step.kind) {
    case 'admin-setup':
      return <AdminSetupStep flow={flow} step={step} />;
    case 'admin-password':
    case 'admin-recovery':
      return <AdminPasswordStep flow={flow} step={step} />;
    case 'password':
      return <PasswordSignInStep flow={flow} />;
    case 'forgot':
      return <ForgotPasswordStep flow={flow} />;
    case 'reset':
      return <ResetPasswordStep flow={flow} step={step} />;
    case 'code':
      return <OtpSignInStep flow={flow} step={step} />;
    case 'name':
      return <SignUpStep flow={flow} />;
    case 'phone':
      return <PhoneSignInStep flow={flow} />;
  }
}
