const required: Record<string, string> = {
  fullName: 'نام و نام خانوادگی را وارد کنید.',
  email: 'ایمیل را وارد کنید.',
  company: 'نام شرکت یا مجموعه را وارد کنید.',
  teamSize: 'تعداد اعضای تیم را انتخاب کنید.',
  message: 'متن پیام را وارد کنید.',
  consent: 'برای ثبت درخواست، رضایت خود را مشخص کنید.',
};
export function leadFieldError(field: {
  name: string;
  value: string;
  required: boolean;
  validity: ValidityState;
}): string | undefined {
  const { name, value, validity } = field;
  if (validity.valueMissing || (field.required && !value.trim()))
    return required[name] ?? 'این بخش را تکمیل کنید.';
  if (name === 'fullName' && value.trim().length < 2) return 'نام باید حداقل ۲ نویسه باشد.';
  if (name === 'message' && value.trim().length < 10) return 'پیام باید حداقل ۱۰ نویسه باشد.';
  if (validity.typeMismatch) return 'ایمیل معتبر وارد کنید.';
  if (validity.patternMismatch) return 'شماره تماس معتبر وارد کنید.';
  if (validity.tooLong) return 'متن را کوتاه‌تر کنید.';
  if (validity.tooShort) return 'این بخش را کامل‌تر بنویسید.';
}
