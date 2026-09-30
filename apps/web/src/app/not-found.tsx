import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
      <p className="numeric text-display font-extrabold text-fg-brand">۴۰۴</p>
      <h1 className="text-heading font-bold text-fg-primary">این صفحه پیدا نشد</h1>
      <p className="max-w-md text-body text-fg-tertiary">
        نشانی واردشده در فضای کاری شما وجود ندارد یا دسترسی آن برداشته شده است.
      </p>
      <Link
        href="/feed"
        className="rounded-lg bg-brand-solid px-4 py-2.5 text-body font-semibold text-fg-on-brand shadow-xs transition-colors hover:bg-brand-solid-hover"
      >
        بازگشت به میز کار
      </Link>
    </main>
  );
}
