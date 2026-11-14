import { ArrowLeftIcon, ShieldIcon } from '@/components/icons';

export function TrustBadges() {
  return (
    <section aria-label="نمادهای اعتماد">
      <a
        className="inline-flex min-h-11 min-w-11 max-w-full items-center gap-3 rounded-lg border border-secondary bg-surface px-3 py-2 text-fg-secondary hover:bg-hover"
        href="https://trustseal.enamad.ir/?id=8460779&Code=Mz1009wLpLpP4iuT8MT16KyhWiAeLDSj"
        referrerPolicy="origin"
        target="_blank"
        rel="noopener"
      >
        <ShieldIcon size={22} className="shrink-0 text-fg-brand" />
        <span className="min-w-0">
          <span className="block text-body-sm font-semibold">نماد اعتماد الکترونیکی</span>
          <span className="block text-caption">استعلام در سامانهٔ اینماد (پنجرهٔ تازه)</span>
        </span>
        <ArrowLeftIcon size={16} className="shrink-0" />
      </a>
    </section>
  );
}
