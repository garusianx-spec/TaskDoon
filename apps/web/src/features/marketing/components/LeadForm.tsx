'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { SiteSubmissionInput, SiteSubmissionKind } from '@taskin/contracts';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { leadFieldError } from '@/features/marketing/lib/lead-validation';

function focusResult(element: HTMLElement) {
  element.focus({ preventScroll: true });
  const header = document.querySelector('.marketing-header')?.getBoundingClientRect().height ?? 0;
  const label = element.id
    ? document.querySelector<HTMLLabelElement>('label[for="' + CSS.escape(element.id) + '"]')
    : element.closest('label');
  const top = Math.min(element.getBoundingClientRect().top, label?.getBoundingClientRect().top ?? Infinity);
  window.scrollTo({
    top: Math.max(0, window.scrollY + top - header - 16),
    behavior: 'instant',
  });
}

const FORM_LABEL: Record<SiteSubmissionKind, string> = {
  contact: 'ارسال پیام',
  collaboration: 'ارسال پیشنهاد همکاری',
  demo: 'ثبت درخواست نمایش محصول',
  application: 'ارسال درخواست همکاری شغلی',
};

export function LeadForm({ kind = 'contact', jobId }: { kind?: SiteSubmissionKind; jobId?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const submitting = useRef(false);
  const returning = useRef(false);
  const pendingFocus = useRef<HTMLElement | null>(null);
  const id = useId();
  useEffect(() => {
    if (success && successRef.current) focusResult(successRef.current);
    else if (returning.current && nameRef.current) {
      returning.current = false;
      focusResult(nameRef.current);
    }
  }, [success]);
  useEffect(() => {
    if (pendingFocus.current) {
      focusResult(pendingFocus.current);
      pendingFocus.current = null;
    }
  }, [fieldErrors]);
  useEffect(() => {
    if (error && errorRef.current) focusResult(errorRef.current);
  }, [error]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const errors: Record<string, string> = {};
    let first: HTMLElement | null = null;
    for (const field of Array.from(form.elements)) {
      if (
        !(
          field instanceof HTMLInputElement ||
          field instanceof HTMLTextAreaElement ||
          field instanceof HTMLSelectElement
        ) ||
        !field.name ||
        field.name === 'website'
      )
        continue;
      const message = leadFieldError(field);
      if (message) {
        errors[field.name] = message;
        first ??= field;
      }
    }
    setError('');
    pendingFocus.current = first;
    setFieldErrors(errors);
    if (first) return;
    const data = new FormData(form);
    const field = (name: string) => String(data.get(name) ?? '').trim();
    const payload: SiteSubmissionInput = {
      kind,
      fullName: field('fullName'),
      email: field('email') || undefined,
      phone: field('phone') || undefined,
      subject: field('subject') || undefined,
      message: field('message'),
      company: field('company') || undefined,
      teamSize: field('teamSize') || undefined,
      website: field('website'),
      consent: data.get('consent') === 'on',
      ...(jobId ? { jobId } : {}),
    };
    submitting.current = true;
    setError('');
    setBusy(true);
    try {
      const response = await fetch('/api/v1/public/site/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        if (response.status === 429)
          throw new Error('تعداد درخواست‌ها زیاد است. چند دقیقه دیگر دوباره تلاش کنید.');
        if (response.status === 400 || response.status === 422)
          throw new Error('اطلاعات فرم معتبر نیست. شماره تماس، ایمیل و متن پیام را بررسی کنید.');
        throw new Error('ثبت درخواست انجام نشد. کمی بعد دوباره تلاش کنید.');
      }
      setSuccess(true);
      form.reset();
    } catch (caught) {
      setError(
        caught instanceof TypeError
          ? 'ارتباط برقرار نشد. اطلاعات فرم حفظ شده است؛ دوباره تلاش کنید.'
          : caught instanceof Error
            ? caught.message
            : 'ارتباط با سرور برقرار نشد. دوباره تلاش کنید.',
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  if (success)
    return (
      <div className="marketing-form-success" role="status">
        <span className="marketing-success-icon" aria-hidden="true">
          ✓
        </span>
        <h3 ref={successRef} tabIndex={-1}>
          درخواست شما ثبت شد
        </h3>
        <p>اطلاعات شما برای بررسی در اختیار تیم تسک‌دون قرار گرفت.</p>
        <Button
          variant="secondary"
          onClick={() => {
            returning.current = true;
            setSuccess(false);
          }}
        >
          ارسال درخواست دیگر
        </Button>
      </div>
    );
  return (
    <form
      className="marketing-lead-form"
      noValidate
      onSubmit={submit}
      aria-label={FORM_LABEL[kind]}
      onChange={(event) => {
        const target = event.target;
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement
        )
          setFieldErrors((current) => {
            const next = { ...current };
            delete next[target.name];
            return next;
          });
      }}
    >
      <div className="marketing-form-grid">
        <Input
          label="نام و نام خانوادگی"
          name="fullName"
          ref={nameRef}
          error={fieldErrors.fullName}
          placeholder="مثلاً علی رضایی"
          autoComplete="name"
          className="min-h-[44px]"
          required
          minLength={2}
          maxLength={120}
        />
        <Input
          label="ایمیل"
          name="email"
          error={fieldErrors.email}
          type="email"
          placeholder="name@company.ir"
          autoComplete="email"
          dir="ltr"
          className="min-h-[44px]"
          maxLength={254}
          required
        />
        <Input
          label="شماره تماس"
          name="phone"
          error={fieldErrors.phone}
          hint="اختیاری — برای هماهنگی سریع‌تر"
          type="tel"
          placeholder="۰۹۱۲۳۴۵۶۷۸۹"
          autoComplete="tel"
          dir="ltr"
          className="min-h-[44px]"
          maxLength={32}
          pattern={String.raw`[+0-9۰-۹٠-٩\s\(\)\-]{7,32}`}
        />
        {kind === 'demo' || kind === 'collaboration' ? (
          <Input
            label="نام شرکت یا مجموعه"
            name="company"
            error={fieldErrors.company}
            placeholder="نام شرکت یا تیم شما"
            autoComplete="organization"
            className="min-h-[44px]"
            maxLength={200}
            required={kind === 'demo'}
          />
        ) : (
          <Input
            label="موضوع"
            name="subject"
            placeholder="موضوع پیام شما"
            className="min-h-[44px]"
            maxLength={200}
          />
        )}
        {kind === 'demo' && (
          <div className="marketing-form-field md:col-span-2">
            <label htmlFor={`${id}-team`} className="text-body-sm font-medium text-fg-secondary">
              تعداد اعضای تیم
            </label>
            <select
              id={`${id}-team`}
              name="teamSize"
              required
              defaultValue=""
              aria-invalid={fieldErrors.teamSize ? true : undefined}
              aria-describedby={fieldErrors.teamSize ? `${id}-team-error` : undefined}
              className={`min-h-[44px] w-full rounded-lg border bg-surface px-3.5 py-2 text-body font-normal text-fg-primary shadow-xs transition-colors focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                fieldErrors.teamSize ? 'border-error-500' : 'border-primary'
              }`}
            >
              <option value="" disabled>
                انتخاب کنید
              </option>
              <option value="1-10">۱ تا ۱۰ نفر</option>
              <option value="11-50">۱۱ تا ۵۰ نفر</option>
              <option value="51-200">۵۱ تا ۲۰۰ نفر</option>
              <option value="200+">بیش از ۲۰۰ نفر</option>
            </select>
            {fieldErrors.teamSize && (
              <p id={`${id}-team-error`} className="marketing-form-error" role="alert">
                {fieldErrors.teamSize}
              </p>
            )}
          </div>
        )}
      </div>
      <Textarea
        label={kind === 'application' ? 'درباره تجربه و مهارت‌های خود بنویسید' : 'پیام شما'}
        name="message"
        error={fieldErrors.message}
        placeholder="دربارهٔ اندازه تیم، روش فعلی پیگیری کارها و انتظارات خود از تسک‌دون بنویسید..."
        rows={5}
        required
        minLength={10}
        maxLength={10000}
        hint="حداقل ۱۰ نویسه؛ اطلاعات حساس مانند رمز عبور را ارسال نکنید."
      />
      <div className="marketing-honeypot" aria-hidden="true">
        <label htmlFor={`${id}-website`}>وب‌سایت</label>
        <input id={`${id}-website`} name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <label className="marketing-consent flex min-h-[44px] cursor-pointer items-start gap-3 py-1 text-body-sm leading-relaxed text-fg-secondary">
        <input
          type="checkbox"
          name="consent"
          required
          className="mt-1 size-5 shrink-0 accent-brand-600"
          aria-invalid={fieldErrors.consent ? true : undefined}
          aria-describedby={fieldErrors.consent ? `${id}-consent-error` : undefined}
        />
        <span>با ثبت و استفاده از اطلاعات این فرم برای بررسی و پیگیری درخواست خود موافقم.</span>
      </label>
      {fieldErrors.consent && (
        <p id={`${id}-consent-error`} className="marketing-form-error" role="alert">
          {fieldErrors.consent}
        </p>
      )}
      {error && (
        <p ref={errorRef} tabIndex={-1} className="marketing-form-error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" loading={busy} fullWidth className="min-h-[48px]">
        {FORM_LABEL[kind]}
      </Button>
      <p className="marketing-form-caption text-center text-xs text-fg-secondary">
        اطلاعات این فرم در سامانه تسک‌دون ذخیره می‌شود.
      </p>
    </form>
  );
}
