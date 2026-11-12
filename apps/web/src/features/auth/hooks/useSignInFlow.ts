'use client';

import { useEffect,useRef,useState,type FormEvent } from 'react';
import { normaliseIranMobile,toLatinDigits } from '@taskin/text';
import { toPersianDigits } from '@taskin/jalali';
import { session } from '@/features/auth/api/session';
import { ApiProblem } from '@/lib/api-client';
import { problemMessage } from '@/lib/api-problem';
import type { LiveStore } from '@/store/live/live-store';
import { challengeTiming } from '@/features/auth/lib/auth-input';
import type { ErrorTarget,Step } from '@/features/auth/types/sign-in';
import { MIN_PASSWORD } from '@/features/auth/lib/auth-input';

export function useSignInFlow(store: Pick<LiveStore, 'signedIn' | 'invited'>, adminPanel: boolean) {
  const [step, setStep] = useState<Step>({ kind: 'phone' });
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [feedback, setFeedback] = useState<{ readonly target: ErrorTarget; readonly message: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Signed out because the account was suspended: said once, above the first step. */
  const [suspended] = useState(() => session.endReason() === 'suspended');
  const [now, setNow] = useState(() => Date.now());
  const fieldRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef(false);

  const setError = (message: string | null, target: ErrorTarget = 'form') => {
    setFeedback(message ? { message, target } : null);
  };
  const errorFor = (target: ErrorTarget) => feedback?.target === target ? feedback.message : undefined;
  const formError = errorFor('form');

  const activeChallenge = 'challengeId' in step ? step.challengeId : null;
  useEffect(() => {
    fieldRef.current?.focus();
  }, [step.kind, activeChallenge]);

  useEffect(() => {
    if (step.kind !== 'code' && step.kind !== 'reset' && step.kind !== 'admin-password' && step.kind !== 'admin-recovery' && step.kind !== 'admin-setup') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [step.kind]);

  useEffect(() => {
    if ((step.kind === 'admin-password' || step.kind === 'admin-recovery' || step.kind === 'admin-setup') && now >= step.expiresAt) {
      setStep({ kind: 'phone' });
      setPassword('');
      setRepeat('');
      setCode('');
      setFeedback({ target: 'form', message: 'مهلت تأیید ورود تمام شد؛ کد پیامکی تازه‌ای بگیرید.' });
    }
  }, [now, step]);

  /** Another way in (or back): the typed number stays, the rest starts over. */
  const goTo = (next: Step) => {
    setError(null);
    setNotice(null);
    setCode('');
    setPassword('');
    setRepeat('');
    setStep(next);
  };

  const attempt = async (work: () => Promise<void>, deliveryError: 'form' | 'resend' = 'form') => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (failure) {
      const failureCode = failure instanceof ApiProblem ? failure.code : null;
      const verifyingSms = deliveryError !== 'resend' && (step.kind === 'code' || step.kind === 'reset');
      if (verifyingSms && (failureCode === 'OTP_EXPIRED' || failureCode === 'OTP_ATTEMPTS_EXCEEDED')) {
        const expiredAt = Date.now();
        setNow(expiredAt);
        setStep(previous => previous.kind === 'code' || previous.kind === 'reset'
          ? { ...previous, expiresAt: expiredAt, exhausted: failureCode === 'OTP_ATTEMPTS_EXCEEDED' }
          : previous);
      } else {
        setError(problemMessage(failure), verifyingSms && failureCode === 'OTP_INVALID' ? 'code' : deliveryError);
      }
    } finally {
      pendingRef.current = false;
      setBusy(false);
    }
  };

  const requestCode = (mobile: string) =>
    attempt(async () => {
      const challenge = await session.requestCode(mobile);
      setCode('');
      setNow(Date.now());
      setStep({ kind: 'code', phone: mobile, challengeId: challenge.challengeId, ...challengeTiming(challenge, Date.now()) });
    }, step.kind === 'code' ? 'resend' : 'form');

  const onPhone = (event: FormEvent) => {
    event.preventDefault();
    const mobile = normaliseIranMobile(phone);
    if (!mobile) {
      setError('شماره موبایل معتبر نیست؛ مثلاً ۰۹۱۲۱۲۳۴۵۶۷.', 'phone');
      return;
    }
    void requestCode(mobile);
  };

  const onCode = (event: FormEvent) => {
    event.preventDefault();
    if (step.kind !== 'code' || busy) return;
    if (Date.now() >= step.expiresAt) { setNow(Date.now()); return; }
    if (toLatinDigits(code).trim().length !== step.codeLength) { setError(`کد ${toPersianDigits(step.codeLength)} رقمی را کامل وارد کنید.`, 'code'); return; }
    void attempt(async () => {
      const result = await session.verifyCode(step.challengeId, toLatinDigits(code).trim());
      if ('signupToken' in result) {
        if (adminPanel) {
          goTo({ kind: 'phone' });
          setError('این شماره در تسک‌دون حساب ندارد.');
        } else setStep({ kind: 'name', signupToken: result.signupToken });
      } else if ('temporaryToken' in result) {
        setCode('');
        setPassword('');
        setNow(Date.now());
        setStep(result.status === 'admin_setup_required'
          ? { kind: 'admin-setup', temporaryToken: result.temporaryToken, expiresAt: Date.now() + result.expiresInSeconds * 1000, sent: false }
          : { kind: 'admin-password', temporaryToken: result.temporaryToken, expiresAt: Date.now() + result.expiresInSeconds * 1000 });
      } else await store.signedIn();
    });
  };

  const onAdminPassword = (event: FormEvent) => {
    event.preventDefault();
    if (step.kind !== 'admin-password' || busy || !password) return;
    void attempt(async () => {
      await session.completeAdminPassword(step.temporaryToken, password);
      goTo({ kind: 'phone' });
      await store.signedIn();
    });
  };

  const onAdminRecovery = (event: FormEvent) => {
    event.preventDefault();
    if (step.kind !== 'admin-recovery' || busy) return;
    if (!code.trim()) {
      setError('کد بازیابی ایمیل‌شده را وارد کنید.', 'code');
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError('رمز تازه دست‌کم ۸ نویسه، با حروف و عدد یا نماد باشد.', 'password');
      return;
    }
    if (password !== repeat) {
      setError('تکرار رمز عبور با خود آن یکی نیست.', 'repeat');
      return;
    }
    void attempt(async () => {
      await session.completeAdminRecovery(step.temporaryToken, code.trim(), password);
      goTo({ kind: 'phone' });
      setNotice('رمز تازه ذخیره شد. برای ورود، کد پیامکی تازه‌ای بگیرید.');
    });
  };

  const onName = (event: FormEvent) => {
    event.preventDefault();
    if (step.kind !== 'name') return;
    const fullName = name.trim();
    if (fullName.length < 2 || fullName.length > 80) {
      setError('نام و نام خانوادگی را کامل بنویسید.', 'name');
      return;
    }
    void attempt(async () => {
      await session.signUp(step.signupToken, fullName);
      await store.signedIn();
    });
  };

  const onPassword = (event: FormEvent) => {
    event.preventDefault();
    const mobile = normaliseIranMobile(phone);
    if (!mobile) {
      setError('شماره موبایل معتبر نیست؛ مثلاً ۰۹۱۲۱۲۳۴۵۶۷.', 'phone');
      return;
    }
    if (!password) {
      setError('رمز عبور را وارد کنید.', 'password');
      return;
    }
    void attempt(async () => {
      await session.passwordSignIn(mobile, password);
      await store.signedIn();
    });
  };

  const requestReset = (mobile: string) =>
    attempt(async () => {
      const challenge = await session.requestPasswordReset(mobile);
      setCode('');
      setNow(Date.now());
      setStep({ kind: 'reset', phone: mobile, challengeId: challenge.challengeId, ...challengeTiming(challenge, Date.now()) });
    }, step.kind === 'reset' ? 'resend' : 'form');

  const onForgot = (event: FormEvent) => {
    event.preventDefault();
    const mobile = normaliseIranMobile(phone);
    if (!mobile) {
      setError('شماره موبایل معتبر نیست؛ مثلاً ۰۹۱۲۱۲۳۴۵۶۷.', 'phone');
      return;
    }
    void requestReset(mobile);
  };

  const onReset = (event: FormEvent) => {
    event.preventDefault();
    if (step.kind !== 'reset' || busy) return;
    if (Date.now() >= step.expiresAt) { setNow(Date.now()); return; }
    if (toLatinDigits(code).trim().length !== step.codeLength) {
      setError(`کد ${toPersianDigits(step.codeLength)} رقمی پیامک‌شده را وارد کنید.`, 'code');
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(`رمز عبور تازه دست‌کم ${toPersianDigits(MIN_PASSWORD)} نویسه باشد، با حروف و عدد یا نماد.`, 'password');
      return;
    }
    if (password !== repeat) {
      setError('تکرار رمز عبور با خود آن یکی نیست.', 'repeat');
      return;
    }
    void attempt(async () => {
      await session.resetPassword(step.challengeId, toLatinDigits(code).trim(), password);
      // The recovery code is now consumed. A network failure during sign-in must not replay it.
      setPhone(step.phone);
      setCode('');
      setRepeat('');
      setStep({ kind: 'password' });
      setNotice('رمز عبور تازه ذخیره شد.');
      // Every session ended with the old password; the new one signs this device in.
      await session.passwordSignIn(step.phone, password);
      await store.signedIn();
    });
  };

  const onAdminSetup = (event: FormEvent) => {
    event.preventDefault();
    if (busy || step.kind !== 'admin-setup') return;
    if (!step.sent) {
      void attempt(async () => { await session.requestAdminSetup(step.temporaryToken); setStep({ ...step, sent: true }); });
      return;
    }
    if (password !== repeat) { setError('تکرار رمز عبور با خود آن یکی نیست.', 'repeat'); return; }
    void attempt(async () => {
      await session.completeAdminSetup(step.temporaryToken, code.trim(), password);
      goTo({ kind: 'phone' });
      setNotice('دسترسی مدیریت فعال شد. با کد پیامکی تازه و رمز مدیر وارد شوید.');
    });
  };

  const requestAdminRecovery = () => {
    if (step.kind !== 'admin-password') return;
    void attempt(async () => {
      await session.requestAdminRecovery(step.temporaryToken);
      goTo({ ...step, kind: 'admin-recovery' });
    });
  };

  return { step, phone, setPhone, code, setCode, name, setName, password, setPassword, repeat, setRepeat, notice, busy, suspended, now, fieldRef, setError, errorFor, formError, goTo, requestCode, onPhone, onCode, onAdminSetup, onAdminPassword, onAdminRecovery, requestAdminRecovery, onName, onPassword, requestReset, onForgot, onReset, invited: store.invited, adminPanel };
}

export type SignInFlow = ReturnType<typeof useSignInFlow>;
