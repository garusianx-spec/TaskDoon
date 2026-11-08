'use client';

import { useId, useState, type FormEvent } from 'react';
import type { SiteSubmissionInput, SiteSubmissionKind } from '@taskin/contracts';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';

const FORM_LABEL: Record<SiteSubmissionKind, string> = { contact: 'ارسال پیام', collaboration: 'ارسال پیشنهاد همکاری', demo: 'ثبت درخواست نمایش محصول', application: 'ارسال درخواست همکاری شغلی' };

export function LeadForm({ kind = 'contact', jobId }: { kind?: SiteSubmissionKind; jobId?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const id = useId();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const field = (name: string) => String(data.get(name) ?? '').trim();
    const payload: SiteSubmissionInput = {
      kind, fullName: field('fullName'), email: field('email') || undefined, phone: field('phone') || undefined,
      subject: field('subject') || undefined, message: field('message'), company: field('company') || undefined,
      teamSize: field('teamSize') || undefined, website: field('website'), consent: data.get('consent') === 'on',
      ...(jobId ? { jobId } : {}),
    };
    if (!payload.email && !payload.phone) { setError('ایمیل یا شماره تماس را وارد کنید.'); return; }
    if (payload.message.length < 10 || payload.fullName.length < 2 || !payload.consent) { setError('نام، متن پیام و رضایت به ثبت اطلاعات را بررسی کنید.'); return; }
    setError(''); setBusy(true);
    try {
      const response = await fetch('/api/v1/public/site/submissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) {
        if (response.status === 429) throw new Error('تعداد درخواست‌ها زیاد است. چند دقیقه دیگر دوباره تلاش کنید.');
        if (response.status === 400 || response.status === 422) throw new Error('اطلاعات فرم معتبر نیست. شماره تماس، ایمیل و متن پیام را بررسی کنید.');
        throw new Error('ثبت درخواست انجام نشد. کمی بعد دوباره تلاش کنید.');
      }
      setSuccess(true); form.reset();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'ارتباط با سرور برقرار نشد. دوباره تلاش کنید.'); }
    finally { setBusy(false); }
  }

  if (success) return <div className="marketing-form-success" role="status"><span className="marketing-success-icon" aria-hidden="true">✓</span><h3>درخواست شما ثبت شد</h3><p>اطلاعات شما برای بررسی در اختیار تیم تسک‌دون قرار گرفت.</p><Button variant="secondary" onClick={() => setSuccess(false)}>ارسال درخواست دیگر</Button></div>;
  return <form className="marketing-lead-form" onSubmit={submit} aria-label={FORM_LABEL[kind]}>
    <div className="marketing-form-grid">
      <Input label="نام و نام خانوادگی" name="fullName" autoComplete="name" required minLength={2} maxLength={120} />
      <Input label="ایمیل" name="email" type="email" autoComplete="email" dir="ltr" maxLength={254} required />
      <Input label="شماره تماس" name="phone" type="tel" autoComplete="tel" dir="ltr" maxLength={32} pattern={String.raw`[+0-9۰-۹٠-٩\s\(\)\-]{7,32}`} />
      {(kind === 'demo' || kind === 'collaboration') ? <Input label="نام شرکت یا مجموعه" name="company" autoComplete="organization" maxLength={200} required={kind === 'demo'} /> : <Input label="موضوع" name="subject" maxLength={200} />}
      {kind === 'demo' && <div className="marketing-form-field"><label htmlFor={`${id}-team`}>تعداد اعضای تیم</label><select id={`${id}-team`} name="teamSize" required defaultValue=""><option value="" disabled>انتخاب کنید</option><option value="1-10">۱ تا ۱۰ نفر</option><option value="11-50">۱۱ تا ۵۰ نفر</option><option value="51-200">۵۱ تا ۲۰۰ نفر</option><option value="200+">بیش از ۲۰۰ نفر</option></select></div>}
    </div>
    <Textarea label={kind === 'application' ? 'درباره تجربه و مهارت‌های خود بنویسید' : 'پیام شما'} name="message" rows={5} required minLength={10} maxLength={10000} hint="حداقل ۱۰ نویسه؛ اطلاعات حساس مانند رمز عبور را ارسال نکنید." />
    <div className="marketing-honeypot" aria-hidden="true"><label htmlFor={`${id}-website`}>وب‌سایت</label><input id={`${id}-website`} name="website" tabIndex={-1} autoComplete="off" /></div>
    <label className="marketing-consent"><input type="checkbox" name="consent" required /><span>با ثبت و استفاده از اطلاعات این فرم برای بررسی و پیگیری درخواست خود موافقم.</span></label>
    {error && <p role="alert" className="marketing-form-error">{error}</p>}
    <Button type="submit" size="lg" loading={busy} fullWidth>{FORM_LABEL[kind]}</Button>
    <p className="marketing-form-caption">اطلاعات این فرم در سامانه تسک‌دون ذخیره می‌شود.</p>
  </form>;
}
