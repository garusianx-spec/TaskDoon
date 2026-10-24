/** The same trimmed 2–80 character boundary as PATCH /me. */
export function profileNameError(value: string): string | undefined {
  const length = [...value.trim()].length;
  if (length < 2) return 'نام نمایشی را با دست‌کم ۲ نویسه وارد کنید.';
  if (length > 80) return 'نام نمایشی باید حداکثر ۸۰ نویسه باشد.';
  return undefined;
}
